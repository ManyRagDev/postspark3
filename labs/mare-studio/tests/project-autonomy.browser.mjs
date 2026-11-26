import { mockEditApi, ctaEditFixture } from "./lab-browser.mjs";
// MARE_REFERENCE_AD optionally exercises the original 26 s ad. No requests leave the browser.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { newLayer, newComposition } from "../dist/composition-model.js";
import { sourceClip } from "../dist/project-model.js";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const reference = process.env.MARE_REFERENCE_AD;
const cta =
  "Troque ‘Experimente agora’ por ‘Crie seu primeiro post’ e deixe a frase visível por mais um segundo";
function fixture() {
  const doc = newComposition();
  doc.layers = [newLayer("text", 2, { name: "Chamada", text: "Experimente agora", fontSize: 32 })];
  const c = { id: "cta", name: "Final", duration: 2, kind: "composition", document: doc };
  const p = {
    name: "Filme",
    compositions: [c],
    clips: [sourceClip(c, "final")],
    sound: { enabled: false, volume: 0 },
  };
  const header = Buffer.from(JSON.stringify({ project: p, assets: [], imageSizes: [] }));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return {
    name: "edicao.mare",
    mimeType: "application/octet-stream",
    buffer: Buffer.concat([Buffer.from("MARESTUDIO2\n"), length, header]),
  };
}
async function open(browser, file) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await ctx.newPage();
  const types = {
    ".js": "text/javascript",
    ".html": "text/html",
    ".json": "application/json",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
  };
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.abort();
    const resource = path.resolve(dist, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
    if (!resource.startsWith(dist)) return route.abort();
    try {
      await route.fulfill({
        body: await readFile(resource),
        contentType: types[path.extname(resource)] ?? "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  await page.goto("http://localhost/");
  await page.locator("#project-file").setInputFiles(file);
  await page.getByText("Projeto aberto.", { exact: true }).waitFor();
  return { ctx, page };
}
const state = page =>
  page.evaluate(async () => {
    const { projectEditor: e } = await import("./app.js");
    return e.inspect();
  });
async function ask(page, request) {
  await page.locator("#project-assistant").click();
  await page.locator("#project-request").fill(request);
  await page.locator("#assistant-plan").click();
  await page.locator("#assistant-apply:enabled").waitFor();
  assert(await page.locator("#assistant-frame").isVisible());
  await page.locator("#assistant-apply").click();
}
async function download(page, selector, file) {
  const pending = page.waitForEvent("download");
  await page.locator(selector).click();
  await (await pending).saveAs(file);
}
test(
  "pedido nativo, histórico, comparação manual, reabertura portátil e MP4",
  { timeout: 240000 },
  async t => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "mare-autonomia-"));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
    t.after(() => browser.close());
    const { page, ctx } = await open(browser, reference ?? fixture());
    await mockEditApi(page, text => text === cta ? [ctaEditFixture] : [{id:"cards.centerLast"}]);
    const before = await state(page);
    const inspectSources = page =>
      page.evaluate(async () => {
        const { projectEditor: e } = await import("./app.js");
        return e
          .inspect()
          .compositions.map(({ id }) => e.inspect({ compositionId: id }))
          .map(({ id, name, duration, background, layers }) => ({ id, name, duration, background, layers }));
      });
    const originalSources = await inspectSources(page);
    const baseline = path.join(temp, "original.mp4");
    if (reference) {
      const pending = page.waitForEvent("download");
      await page.evaluate(async () => {
        const { projectEditor: e } = await import("./app.js");
        const job = await e.invoke("export.video", {}, e.inspect().revision);
        try {
          while (true) {
            const status = e.job(job);
            if (status.state === "failed") throw Error(status.error);
            if (status.state === "ready") {
              const { downloadBlob } = await import("./engine.js");
              downloadBlob(status.result, "original.mp4");
              break;
            }
            await new Promise(done => setTimeout(done, 100));
          }
        } finally {
          e.release(job);
        }
      });
      await (await pending).saveAs(baseline);
    }

    // Drive the manual entry point and the native one from the same revision.
    await page.locator("#project-menu").click();
    await page.locator("#rename").click();
    await page.locator("#new-name").fill("Nome de teste");
    await page.locator("#apply-name").click();
    const manual = await state(page);
    await page.locator("#undo").click();
    const byCommand = await page.evaluate(async () => {
      const { projectEditor: e } = await import("./app.js");
      const proposal = e.prepare(e.inspect().revision, [{ id: "project.rename", name: "Nome de teste" }]);
      proposal.apply();
      return e.inspect();
    });
    for (const field of ["name", "clips", "compositions", "sound", "tracks"])
      assert.deepEqual(byCommand[field], manual[field]);
    await page.locator("#undo").click();
    if (reference) {
      await ask(page, "Faça os três cards entrarem em sequência e deixe o do meio por último");
      const ordered = await page.evaluate(async () => {
        const { projectEditor: e } = await import("./app.js");
        const c = e.inspect().compositions.find(c => c.name.startsWith("03"));
        const cards = e
          .inspect({ compositionId: c.id, time: 2.5 })
          .layers.filter(l => l.name.startsWith("Card"));
        return cards
          .map(l => [l.name, l.keys.opacity.find(k => k.value === 1).t])
          .sort((a, b) => a[1] - b[1])
          .map(x => x[0]);
      });
      assert.deepEqual(ordered, ["Card da esquerda", "Card da direita", "Card principal"]);
      await page.locator("#undo").click();
    }

    await ask(page, cta);
    assert.equal((await state(page)).duration, before.duration + 1);
    await page.locator("#undo").click();
    assert.deepEqual((await state(page)).compositions, before.compositions);
    await page.locator("#redo").click();
    await page.locator("#save").click();
    await page.locator("#project-menu").click();
    const file = path.join(temp, "editado.mare");
    await download(page, "#pack", file);
    await ctx.close();
    const { page: fresh } = await open(browser, file);
    const restored = await state(fresh);
    assert.equal(restored.duration, before.duration + 1);
    assert.deepEqual(
      restored.clips.map(c => [c.id, c.trim, c.duration, c.transitionIn]),
      before.clips.map((c, i) => [
        c.id,
        c.trim,
        c.duration + (i === before.clips.length - 1 ? 1 : 0),
        c.transitionIn,
      ])
    );
    const c = restored.compositions.find(c => c.layers?.some(l => l.text === "Crie seu primeiro post"));
    assert(c);
    const review = await fresh.evaluate(async c => {
      const { projectEditor: e } = await import("./app.js");
      return e
        .inspect({ compositionId: c.id, time: c.duration - 0.5 })
        .layers.find(l => l.text === "Crie seu primeiro post");
    }, c);
    const expectedSources = structuredClone(originalSources);
    const ending = expectedSources.find(item => item.id === c.id);
    const end = ending.duration++;
    for (const layer of ending.layers) {
      if (layer.end === end) layer.end++;
      if (layer.text === "Experimente agora") layer.text = "Crie seu primeiro post";
    }
    assert.deepEqual(await inspectSources(fresh), expectedSources);
    assert.equal(restored.projectId, before.projectId);
    if (reference) {
      const pixelsAndMedia = buffer => buffer.subarray(16 + buffer.readUInt32BE(12));
      assert.deepEqual(pixelsAndMedia(await readFile(file)), pixelsAndMedia(await readFile(reference)));
    }
    assert(review.active && review.pose.opacity === 1);
    await fresh.locator("#export").click();
    await fresh.locator("#render-video").click();
    await fresh.locator("#download-video").waitFor({ timeout: 180000 });
    const out = path.join(temp, "editado.mp4");
    await download(fresh, "#download-video", out);
    const streams = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,nb_frames,width,height",
        "-of",
        "json",
        out,
      ])
    ).streams;
    const video = streams.find(s => s.codec_type === "video");
    assert.equal(Number(video.nb_frames), Math.round(restored.duration * 30));
    assert.equal(video.width, 1080);
    assert.equal(video.height, 1920);
    if (reference) assert(streams.some(s => s.codec_type === "audio"));
    // The final second must sustain the rendered button and text, not a blank frame.
    const decode = time =>
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-ss",
        String(time),
        "-i",
        out,
        "-frames:v",
        "1",
        "-vf",
        "scale=135:240",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
      ]);
    const first = decode(before.duration - 0.2),
      last = decode(restored.duration - 0.2);
    assert.equal(last.length, 135 * 240 * 3);
    let diff = 0;
    for (let i = 0; i < last.length; i++) diff += Math.abs(first[i] - last[i]);
    assert(diff / last.length < 1.5);
    assert(Math.max(...last) - Math.min(...last) > 60);
    if (reference) {
      const decodePrefix = (file, opts, until) =>
        execFileSync("ffmpeg", ["-v", "error", "-i", file, "-t", String(until), ...opts, "-"], {
          maxBuffer: 32 * 1024 * 1024,
        });
      const pictures = ["-an", "-vf", "scale=54:96", "-pix_fmt", "rgb24", "-f", "rawvideo"];
      const startOfCTA = before.clips.at(-1).start;
      const a = decodePrefix(baseline, pictures, startOfCTA),
        b = decodePrefix(out, pictures, startOfCTA);
      assert.equal(a.length, b.length);
      for (let start = 0; start < a.length; start += 54 * 96 * 3) {
        let sum = 0;
        for (let j = start; j < start + 54 * 96 * 3; j++) sum += Math.abs(a[j] - b[j]);
        assert(sum / (54 * 96 * 3) < 3, "quadro anterior ao CTA mudou");
      }
      const audio = ["-vn", "-ac", "1", "-ar", "24000", "-f", "s16le"];
      const originalAudio = decodePrefix(baseline, audio, before.duration - 0.1),
        editedAudio = decodePrefix(out, audio, before.duration - 0.1);
      assert.equal(originalAudio.length, editedAudio.length);
      let squared = 0;
      for (let i = 0; i < editedAudio.length; i += 2)
        squared += ((editedAudio.readInt16LE(i) - originalAudio.readInt16LE(i)) / 32768) ** 2;
      assert(Math.sqrt(squared / (editedAudio.length / 2)) < 0.002, "mixagem anterior ao fecho mudou");
      if (process.env.MARE_ARTIFACT_DIR) {
        await copyFile(file, path.join(process.env.MARE_ARTIFACT_DIR, "PostSpark-CTA-27s.mare"));
        await copyFile(out, path.join(process.env.MARE_ARTIFACT_DIR, "PostSpark-CTA-27s.mp4"));
      }
    }
  }
);

test(
  "API interna cria uma peça editável de um projeto vazio, renderiza e continua após abrir o arquivo",
  { timeout: 120000 },
  async t => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
    t.after(() => browser.close());
    const { page } = await open(browser, fixture());
    const result = await page.evaluate(async () => {
      const { projectEditor: e } = await import("./app.js");
      const invoke = (id, args = {}) => e.invoke(id, args, e.inspect().revision);
      const wait = async id => {
        while (true) {
          const job = e.job(id);
          if (job.state === "ready") {
            e.release(id);
            return job.result;
          }
          if (job.state === "failed") throw Error(job.error);
          await new Promise(done => setTimeout(done, 30));
        }
      };
      await invoke("project.new", { name: "Do briefing ao arquivo" });
      const commands = [
        { id: "composition.create", compositionId: "final", duration: 2, name: "Chamada final" },
        {
          id: "layer.add",
          compositionId: "final",
          layerId: "title",
          type: "text",
          fields: { text: "Experimente agora" },
        },
        {
          id: "key.set",
          compositionId: "final",
          layerId: "title",
          channel: "opacity",
          time: 0,
          value: 0,
          ease: "linear",
        },
        {
          id: "key.set",
          compositionId: "final",
          layerId: "title",
          channel: "opacity",
          time: 0.4,
          value: 1,
          ease: "out",
        },
        { id: "composition.insert", compositionId: "final", clipId: "outro", time: 0 },
        { id: "sound.set", asset: "builtin/sound", volume: 0.25, enabled: true },
      ];
      e.prepare(e.inspect().revision, commands).apply();
      const id = e.inspect().projectId;
      const portable = await wait(await invoke("export.project"));
      await invoke("project.open", { file: new File([portable], "reabrir.mare") });
      if (id !== e.inspect().projectId) throw Error("O arquivo perdeu a identidade do projeto.");
      const edit = await e.plan(
        "Troque ‘Experimente agora’ por ‘Crie seu primeiro post’ e deixe a frase visível por mais um segundo"
      );
      edit.proposal.apply();
      const end = e.inspect({ compositionId: "final", layerId: "title", time: 2.8 }).layers[0];
      const png = await wait(await invoke("preview.frame", { clipId: "outro", time: 2.8 }));
      const mp4 = await wait(await invoke("export.video"));
      await invoke("history.undo");
      const undone = e.inspect().duration;
      await invoke("history.redo");
      return {
        duration: e.inspect().duration,
        undone,
        text: end.text,
        opacity: end.pose.opacity,
        image: png.type,
        video: mp4.type,
        bytes: mp4.size,
      };
    });
    assert.equal(result.duration, 3);
    assert.equal(result.undone, 2);
    assert.equal(result.text, "Crie seu primeiro post");
    assert.equal(result.opacity, 1);
    assert.equal(result.image, "image/png");
    assert.match(result.video, /video\/mp4/);
    assert(result.bytes > 1000);
  }
);

test("Animação preserva o mesmo documento ao editar um texto no inspetor ou por comando", async t => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  t.after(() => browser.close());
  const { page } = await open(browser, fixture());
  await page.locator("#edit-scene").click();
  await page.locator("[data-cp-select]").filter({ hasText: "Chamada" }).click();
  const input = page.locator('#inspector [data-cp-prop="text"]');
  await input.fill("Edição manual");
  await input.press("Tab");
  const layers = () =>
    page.evaluate(async () => {
      const { projectEditor: e } = await import("./app.js");
      return e.inspect({ compositionId: "cta" }).layers;
    });
  const manual = await layers();
  assert.equal(manual[0].text, "Edição manual");
  await page.locator("#undo").click();
  assert.equal((await layers())[0].text, "Experimente agora");
  await page.evaluate(async layerId => {
    const { projectEditor: e } = await import("./app.js");
    e.prepare(e.inspect().revision, [
      { id: "layer.set", compositionId: "cta", layerId, fields: { text: "Edição manual" } },
    ]).apply();
  }, manual[0].id);
  assert.deepEqual(await layers(), manual);
  await page.locator("#apply-and-return").click();
  assert.deepEqual(await layers(), manual);
  await page.locator("#undo").click();
  assert.equal((await layers())[0].text, "Experimente agora");
});
