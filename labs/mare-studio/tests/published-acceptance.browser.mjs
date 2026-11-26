// Test the installed pages directly. A fresh browser context represents a second visit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const origin = process.env.MARE_PRIVATE_ORIGIN;
const resume = process.env.MARE_ACCEPT_RESUME;
const live = process.env.MARE_ACCEPT_DIRECTOR === "1";
const title = "Experimente agora",
  replacement = "Crie seu primeiro post";
async function open(browser) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(origin);
  await page.evaluate(async () => {
    window.editor = (await import("./app.js")).projectEditor;
  });
  return page;
}
async function state(page) {
  return page.evaluate(() => {
    const { clips, compositions, tracks, sound, duration, projectId } =
      editor.inspect();
    return {
      clips,
      tracks,
      sound,
      duration,
      projectId,
      compositions: compositions.map(c => {
        const { id, name, duration, uses, scene, background, layers } =
          editor.inspect({ compositionId: c.id });
        return { id, name, duration, uses, scene, background, layers };
      }),
    };
  });
}
async function invoke(page, id, args = {}) {
  return page.evaluate(
    ({ id, args }) => editor.invoke(id, args, editor.inspect().revision),
    { id, args }
  );
}
async function download(page, selector, file) {
  const pending = page.waitForEvent("download");
  await page.locator(selector).click();
  await (await pending).saveAs(file);
}
async function save(page, file) {
  await page.locator("#save").click();
  await page.locator("#project-menu").click();
  await download(page, "#pack", file);
}
async function render(page, file) {
  await page.locator("#export").click();
  await page.locator("#render-video").click();
  await page.locator("#download-video").waitFor({ timeout: 90000 });
  await download(page, "#download-video", file);
  await page.locator("#dialog").evaluate(d => d.close());
}
function verify(file, frames, width, height) {
  const [v] = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,nb_read_frames",
      "-of",
      "json",
      file,
    ])
  ).streams;
  assert.deepEqual(
    [Number(v.nb_read_frames), v.width, v.height],
    [frames, width, height]
  );
}
function pixels(file, time) {
  return execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(time),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale=108:192",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "-",
  ]);
}
function distance(a, b) {
  assert.equal(a.length, 108 * 192 * 3);
  assert.equal(b.length, a.length);
  return a.reduce((n, v, i) => n + Math.abs(v - b[i]), 0) / a.length;
}

test(
  "instalação privada · criação, ida e volta, arquivo portátil, CTA, desfazer e render",
  { skip: !origin, timeout: 360000 },
  async t => {
    const url = new URL(origin);
    assert.ok(
      url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
    );
    const dir =
      process.env.MARE_ACCEPT_OUTPUT ||
      (await mkdtemp(path.join(tmpdir(), "mare-aceite-")));
    await mkdir(dir, { recursive: true });
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    });
    t.after(() => browser.close());
    let page = await open(browser);
    const tools = await page.evaluate(() => editor.catalog().map(c => c.id));
    for (const id of ["export.server", "speech.analyze", "narration.generate"])
      assert.ok(tools.includes(id), id);
    assert.equal(await page.locator('meta[name="mare-director"]').count(), 1);
    await invoke(page, "project.new", { name: "Aceite Maré" });
    assert.equal((await state(page)).clips.length, 0);
    if (resume) {
      await page.locator("#project-file").setInputFiles(resume);
      await page.getByText("Projeto aberto.", { exact: true }).waitFor();
    } else {
      await page.locator("#project-assistant").click();
      if (live) {
        await page
          .getByText("Criar vídeo a partir do briefing", { exact: true })
          .click();
        await page
          .locator("#project-request")
          .fill(
            "Crie um vídeo tipográfico vertical de 6 segundos, com duas cenas de 90 quadros cada. Na primeira use somente o texto “Sua ideia”. Na segunda use somente o CTA literal “Experimente agora”. Texto claro em fundo escuro, legível até o fim. Use somente texto."
          );
        await page.locator("#director-seconds").fill("6");
        await page.locator("#director-cta").fill(title);
        let requests = 0;
        page.on("response", async response => {
          if (response.url() === new URL("/api/director", origin).href) {
            const n = ++requests;
            await writeFile(
              path.join(dir, "resposta-" + n + ".json"),
              await response.body()
            );
          }
        });
        await page.locator("#director-create").click();
        await page.waitForFunction(
          () => !document.querySelector("#director-create").disabled,
          null,
          {
            timeout: 180000,
          }
        );
        assert.ok(
          await page.locator("#assistant-apply").isEnabled(),
          await page.locator("#assistant-report").innerText()
        );
        await download(
          page,
          'a[download$=".mare"]',
          path.join(dir, "criacao.mare")
        );
        const trace = JSON.parse(
          await page.locator("#editorial-measurements").textContent()
        );
        assert.equal(
          trace.steps.filter(
            s => s.kind === "modelo" && s.status === "concluído"
          ).length,
          2
        );
        await writeFile(
          path.join(dir, "chamadas.json"),
          JSON.stringify(trace, null, 2)
        );
      } else {
        const commands = ["Sua ideia", title].flatMap((text, i) => {
          const compositionId = "s" + i,
            layerId = "titulo";
          return [
            {
              id: "composition.create",
              compositionId,
              name: "Cena " + (i + 1),
              duration: 3,
            },
            {
              id: "layer.add",
              compositionId,
              layerId,
              type: "text",
              fields: { name: text, text, fontSize: 42 },
            },
            {
              id: "composition.insert",
              compositionId,
              clipId: "c" + i,
              time: i * 3,
            },
          ];
        });
        await page.locator("#project-request").fill(JSON.stringify(commands));
        await page.locator("#assistant-plan").click();
      }
      await page.locator("#assistant-apply:enabled").click();
    }
    const initial = await state(page);
    assert.equal(initial.duration, 6);
    const first = initial.clips[0];
    await invoke(page, "view.selectClip", { clipId: first.id });
    await page.locator("#edit-scene").click();
    const source = initial.compositions.find(c => c.id === first.compositionId);
    const layer = source.layers.find(l => l.type === "text");
    await page
      .locator("[data-cp-select]")
      .filter({ hasText: layer.name })
      .first()
      .click();
    const input = page.locator('#inspector [data-cp-prop="text"]');
    await input.fill("Ideia em movimento");
    await input.press("Tab");
    await page.locator("#apply-and-return").click();
    const base = await state(page);
    assert.deepEqual(base.clips, initial.clips);
    assert.equal(
      base.compositions
        .find(c => c.id === source.id)
        .layers.find(l => l.id === layer.id).text,
      "Ideia em movimento"
    );
    const original = path.join(dir, "antes.mare"),
      oldVideo = path.join(dir, "antes.mp4"),
      movie = path.join(dir, "final.mp4");
    await save(page, original);
    await render(page, oldVideo);
    verify(oldVideo, 180, 1080, 1920);
    await page.context().close();
    page = await open(browser);
    await page.locator("#project-file").setInputFiles(original);
    await page.getByText("Projeto aberto.", { exact: true }).waitFor();
    assert.deepEqual(await state(page), base);
    await page.locator("#project-assistant").click();
    await page
      .locator("#project-request")
      .fill(
        "Troque ‘Experimente agora’ por ‘Crie seu primeiro post’ e deixe a frase visível por mais um segundo"
      );
    const editResponse = page.waitForResponse(r => r.url().endsWith("/api/director") && r.request().postDataJSON()?.stage === "edit", {timeout:135000});
    await page.locator("#assistant-plan").click();
    const proposed = await editResponse;
    assert.equal(proposed.status(),200, "A API do laboratório deve devolver uma proposta");
    const {output,model,usage} = await proposed.json();
    t.diagnostic(JSON.stringify({model,usage,operations:output.commands?.map(c => ({id:c.id,fields:Object.keys(c)}))}));
    try {
      await page.locator("#assistant-apply:enabled").click({timeout:12000});
    } catch (error) {
      throw new Error("Proposta indisponível: " + await page.locator("#assistant-report").textContent(), {cause:error});
    }
    const after = await state(page),
      finalId = after.clips.at(-1).compositionId;
    assert.equal(after.duration, 7);
    assert.equal(after.clips.at(-1).duration, base.clips.at(-1).duration + 1);
    assert.deepEqual(after.tracks, base.tracks);
    assert.deepEqual(after.sound, base.sound);
    assert.deepEqual(after.clips.slice(0, -1), base.clips.slice(0, -1));
    assert.deepEqual(
      after.compositions.filter(c => c.id !== finalId),
      base.compositions.filter(c => c.id !== finalId)
    );
    const edited = after.compositions
      .find(c => c.id === finalId)
      .layers.find(l => l.text === replacement);
    const previous = base.compositions
      .find(c => c.id === finalId)
      .layers.find(l => l.text === title);
    assert.equal(edited.end, previous.end + 1);
    assert.deepEqual(edited.keys, previous.keys);
    await page.locator("#undo").click();
    assert.deepEqual(await state(page), base);
    await page.locator("#redo").click();
    assert.deepEqual(await state(page), after);
    await save(page, path.join(dir, "final.mare"));
    await render(page, movie);
    verify(movie, 210, 1080, 1920);
    assert.ok(distance(pixels(oldVideo, 1.4), pixels(movie, 1.4)) < 2);
    assert.ok(distance(pixels(oldVideo, 5.8), pixels(movie, 5.8)) > 0.5);
    assert.ok(distance(pixels(movie, 5.8), pixels(movie, 6.8)) < 2);
    const jobId = await invoke(page, "export.server", { time: 6.5 });
    await page.waitForFunction(
      id => ["failed", "ready", "cancelled"].includes(editor.job(id).state),
      jobId,
      {
        timeout: 150000,
      }
    );
    const result = await page.evaluate(id => {
      const j = editor.job(id);
      if (j.state !== "ready") throw Error(j.error);
      return j.result.base;
    }, jobId);
    const response = await page.request.get(
      new URL(result + "final.mp4", url).href
    );
    assert.ok(response.ok());
    const serverMovie = path.join(dir, "servidor.mp4");
    await writeFile(serverMovie, await response.body());
    verify(serverMovie, 210, 540, 960);
    t.diagnostic(JSON.stringify({ live, frames: 210, serverFrames: 210, dir }));
  }
);
