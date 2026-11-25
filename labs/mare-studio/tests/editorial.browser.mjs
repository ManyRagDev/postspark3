// Default case is offline. Live mode is opt-in, with an existing lab and a supplied input pack.
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { chromium } from "playwright-core";
import { openCheckout } from "./lab-browser.mjs";

const cta = "Experimente agora";
const followup =
  "Troque ‘Experimente agora’ por ‘Crie seu primeiro post’ e deixe a frase visível por mais um segundo";
const probe = file =>
  JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-of", "json", file]));
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-v", "error", ...args]);

async function inputs(dir) {
  if (process.env.MARE_EDITORIAL_PACK) {
    const zip = await JSZip.loadAsync(await readFile(process.env.MARE_EDITORIAL_PACK));
    const brief = JSON.parse(await zip.file("briefing.json").async("string"));
    const manifest = JSON.parse(await zip.file("materiais.json").async("string"));
    return {
      brief: brief.pedido,
      seconds: brief.duracao_s,
      files: await Promise.all(
        manifest.map(async a => ({
          name: path.basename(a.arquivo),
          mimeType: a.tipo,
          buffer: await zip.file(a.arquivo).async("nodebuffer"),
        }))
      ),
    };
  }
  ffmpeg("-f", "lavfi", "-i", "color=c=purple:s=120x120", "-frames:v", "1", path.join(dir, "card.png"));
  ffmpeg(
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=96x160:r=30:d=2",
    "-c:v",
    "libvpx-vp9",
    path.join(dir, "editor.webm")
  );
  ffmpeg("-f", "lavfi", "-i", "sine=frequency=420:duration=1", path.join(dir, "trilha.wav"));
  const files = await Promise.all(
    [
      ["card.png", "image/png"],
      ["editor.webm", "video/webm"],
      ["trilha.wav", "audio/wav"],
    ].map(async ([name, mimeType]) => ({
      name,
      mimeType,
      buffer: await readFile(path.join(dir, name)),
    }))
  );
  return {
    brief: "Abra com o card, demonstre o editor e termine com a chamada final. Use a trilha.",
    seconds: 3,
    files,
  };
}

function fixture({ stage, context, previews }) {
  const text = {
    kind: "text",
    index: 0,
    x: 270,
    y: 680,
    width: 480,
    height: 130,
    size: 44,
    color: "#ffffff",
    enterFrame: 2,
    animation: "rise",
  };
  let output;
  if (stage === "script") {
    assert.equal(previews.length, 4);
    assert.deepEqual(
      previews.slice(1).map(p => p.time),
      context.assets[1].samples
    );
    assert.ok(previews.every(p => Buffer.from(p.jpeg, "base64")[0] === 255));
    output = {
      title: "Filme de teste",
      music: "a3",
      shots: [
        {
          name: "Gancho",
          frames: 30,
          copy: ["Sua ideia"],
          images: ["a1"],
          video: null,
          evidence: "Card roxo.",
        },
        {
          name: "Demonstração",
          frames: 30,
          copy: [],
          images: [],
          video: "a2",
          evidence: "Gravação.",
        },
        {
          name: "Chamada final",
          frames: 30,
          copy: [cta],
          images: [],
          video: null,
          evidence: "Convite final.",
        },
      ],
    };
  } else {
    assert.deepEqual(previews, []);
    assert.equal(context.script.shots.length, 3);
    output = {
      volume: 0.4,
      shots: [
        {
          background: "#223344",
          layers: [
            {
              kind: "image",
              index: 0,
              x: 270,
              y: 320,
              width: 420,
              height: 420,
              enterFrame: 0,
              animation: "fade",
            },
            text,
          ],
        },
        { trimFrame: 10 },
        { background: "#473344", layers: [text] },
      ],
    };
  }
  return { model: "resposta de teste", usage: { cost: null }, output };
}

async function download(page, label, file) {
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: label, exact: true }).click();
  await (await pending).saveAs(file);
}

test(
  "briefing, duas respostas, prévia audiovisual, undo e CTA em outro navegador",
  { timeout: 480000 },
  async t => {
    const temp = await mkdtemp(path.join(tmpdir(), "mare-editorial-"));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const dir = process.env.MARE_EDITORIAL_OUTPUT || temp;
    await mkdir(dir, { recursive: true });
    const { brief, seconds, files } = await inputs(temp);
    const live = process.env.MARE_EDITORIAL_LIVE;
    const replay = process.env.MARE_EDITORIAL_REPLAY;
    if (live && replay) throw Error("Selecione execução ao vivo ou reprodução.");
    if (!live && !replay && process.env.MARE_EDITORIAL_PACK)
      throw Error("Informe as respostas do experimento.");
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    });
    t.after(() => browser.close());
    const page = live ? await browser.newPage() : await openCheckout(browser);
    if (live) await page.goto(live);
    else
      await page.evaluate(() => {
        const m = document.createElement("meta");
        m.name = "mare-director";
        document.head.append(m);
      });
    const calls = [];
    const provider = [];
    await page.route("**/api/director", async route => {
      const payload = route.request().postDataJSON();
      assert.equal(payload.stage, ["script", "direction"][calls.length]);
      calls.push(payload.stage);
      const file = payload.stage + ".json";
      let result;
      if (live && payload.stage === "script" && process.env.MARE_EDITORIAL_SAVED_SCRIPT) {
        result = JSON.parse(await readFile(process.env.MARE_EDITORIAL_SAVED_SCRIPT));
      } else if (live) {
        const started = performance.now();
        const response = await route.fetch({ timeout: 150000, maxRetries: 0 });
        result = await response.json();
        assert.ok(response.ok(), result.message);
        result.providerRoundTripMs = Math.round(performance.now() - started);
        await writeFile(path.join(dir, file), JSON.stringify(result, null, 2));
      } else if (replay) result = JSON.parse(await readFile(path.join(replay, file)));
      else result = fixture(payload);
      const reused = Boolean(
        replay || (payload.stage === "script" && process.env.MARE_EDITORIAL_SAVED_SCRIPT)
      );
      provider.push({
        stage: payload.stage,
        source: reused ? "resposta gravada" : live ? "chamada real" : "resposta de teste",
        model: result.model,
        originalCostUSD: result.usage?.cost ?? null,
        originalRoundTripMs: result.providerRoundTripMs ?? null,
      });
      await route.fulfill({ json: result });
    });
    await page.evaluate(async () => {
      const { projectEditor: e } = await import("./app.js");
      await e.invoke("project.new", { name: "Teste" }, e.inspect().revision);
    });
    await page.locator("#project-assistant").click();
    await page.getByText("Criar vídeo a partir do briefing", { exact: true }).click();
    await page.locator("#project-request").fill(brief);
    await page.locator("#director-seconds").fill(String(seconds));
    await page.locator("#director-cta").fill(cta);
    await page.locator("#director-files").setInputFiles(files);
    await page.locator("#director-create").click();
    await page.waitForFunction(
      () => !document.querySelector("#director-create").disabled,
      {},
      { timeout: 360000 }
    );
    const status = await page.locator("#assistant-report").innerText();
    assert.ok(await page.locator("#assistant-apply").isEnabled(), status);
    assert.deepEqual(calls, ["script", "direction"]);
    const trace = JSON.parse(await page.locator("#editorial-measurements").textContent());
    const script = JSON.parse(await page.locator("#editorial-script").textContent());
    assert.equal(trace.steps.filter(s => s.kind === "modelo").length, 2);
    if (process.env.MARE_EDITORIAL_OUTPUT)
      await writeFile(
        path.join(dir, "medidas.json"),
        JSON.stringify(
          {
            execucao: live ? "modelo real" : replay ? "reprodução" : "respostas de teste",
            provider,
            trace,
            script,
          },
          null,
          2
        )
      );
    const state = async p => p.evaluate(async () => (await import("./app.js")).projectEditor.inspect());
    assert.equal((await state(page)).clips.length, 0);
    const movie = path.join(dir, "Primeiro-corte.mp4"),
      portable = path.join(dir, "Primeiro-corte.mare");
    await download(page, "Baixar MP4", movie);
    await download(page, "Baixar projeto", portable);
    const streams = probe(movie).streams;
    assert.equal(Number(streams.find(s => s.codec_type === "video").nb_read_frames), seconds * 30);
    assert.ok(streams.some(s => s.codec_type === "audio"));
    const audio = ffmpeg("-i", movie, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-");
    assert.ok(
      audio.some((_, i) => i % 2 === 0 && Math.abs(audio.readInt16LE(i)) > 64),
      "trilha audível"
    );
    if (!live && !replay) {
      await page.route("**/api/director/review", async route => {
        const body = route.request().postDataBuffer();
        const length = body.readUInt32BE(0);
        const manifest = JSON.parse(body.subarray(4, 4 + length));
        assert.ok(body.subarray(4 + length).equals(await readFile(movie)));
        const last = manifest.clips.at(-1),
          title = last.layers.find(l => l.text === cta);
        await route.fulfill({
          json: {
            model: "revisor de teste",
            usage: { cost: null },
            output: {
              assessment: "Ampliar o CTA.",
              corrections: [
                {
                  at: 2.7,
                  reason: "Texto pequeno no encerramento.",
                  clipId: last.id,
                  layerId: title.id,
                  set: { fontSize: 52 },
                },
              ],
            },
          },
        });
      });
      await page.getByRole("button", { name: /Enviar prévia com áudio/ }).click();
      await page.getByRole("link", { name: "Baixar projeto revisado", exact: true }).waitFor();
      assert.equal((await state(page)).clips.length, 0);
    }
    await page.locator("#assistant-apply").click();
    const first = await state(page);
    if (!live && !replay) {
      const size = await page.evaluate(async () => {
        const { projectEditor: e } = await import("./app.js"),
          c = e.inspect().clips.at(-1);
        return e.inspect({ compositionId: c.compositionId }).layers.find(l => l.text === "Experimente agora")
          .fontSize;
      });
      assert.equal(size, 52);
    }
    assert.equal(Math.round(first.duration * 30), seconds * 30);
    assert.ok(first.sound.enabled && first.clips.some(c => c.kind === "video"));
    assert.ok(first.compositions.some(c => c.layers.some(l => l.type === "image")));
    const mediaHashes = async p =>
      p.evaluate(async () => {
        const e = (await import("./app.js")).projectEditor;
        const { readVideoBlob } = await import("./engine.js");
        const state = e.inspect();
        return await Promise.all(
          [...state.clips.filter(c => c.kind === "video"), state.sound].map(async c => {
            const blob = await readVideoBlob(c.assetId);
            return Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))
            );
          })
        );
      });
    const originalHashes = await mediaHashes(page);
    await page.evaluate(async () => {
      const e = (await import("./app.js")).projectEditor;
      await e.invoke("history.undo", {}, e.inspect().revision);
    });
    assert.equal((await state(page)).clips.length, 0);
    await page.context().close();
    const fresh = await openCheckout(browser);
    await fresh.locator("#project-file").setInputFiles(portable);
    await fresh.getByText("Projeto aberto.", { exact: true }).waitFor();
    const before = await state(fresh);
    // Portable import assigns new local storage handles. Compare the actual media bytes.
    const cuts = s => s.clips.map(({ assetId, ...c }) => c);
    assert.deepEqual(cuts(before), cuts(first));
    assert.deepEqual(await mediaHashes(fresh), originalHashes);
    async function sources() {
      return fresh.evaluate(async () => {
        const e = (await import("./app.js")).projectEditor;
        return e.inspect().compositions.map(c => e.inspect({ compositionId: c.id }).layers);
      });
    }
    const layers = await sources();
    await fresh.locator("#project-assistant").click();
    await fresh.locator("#project-request").fill(followup);
    await fresh.locator("#assistant-plan").click();
    await fresh.locator("#assistant-apply:enabled").click();
    const after = await state(fresh);
    assert.equal(Math.round(after.duration * 30), (seconds + 1) * 30);
    assert.deepEqual(after.clips.slice(0, -1), before.clips.slice(0, -1));
    assert.deepEqual(after.sound, before.sound);
    assert.deepEqual(after.tracks, before.tracks);
    const edited = await sources();
    const final = before.compositions.findIndex(c => c.id === before.clips.at(-1).compositionId);
    for (const [i, group] of edited.entries()) {
      if (i !== final) assert.deepEqual(group, layers[i]);
      else
        for (const [j, l] of group.entries()) {
          const original = layers[i][j];
          assert.equal(l.text, original.text === cta ? "Crie seu primeiro post" : original.text);
          assert.deepEqual(l.keys, original.keys);
          if (original.text === cta) assert.equal(Math.round((l.end - original.end) * 30), 30);
        }
    }
    for (const format of ["project", "video"]) {
      await fresh.locator("#project-assistant").click();
      await fresh.locator("#project-request").fill(JSON.stringify([{ id: "export." + format }]));
      await fresh.locator("#assistant-plan").click();
      await fresh.locator("#assistant-apply:enabled").click();
      await download(
        fresh,
        "Baixar resultado",
        path.join(dir, "CTA-revisado." + (format === "video" ? "mp4" : "mare"))
      );
      await fresh.locator("#dialog").evaluate(dialog => dialog.close());
    }
    const revised = path.join(dir, "CTA-revisado.mp4");
    assert.equal(
      Number(probe(revised).streams.find(s => s.codec_type === "video").nb_read_frames),
      (seconds + 1) * 30
    );
    const picture = (file, time) =>
      ffmpeg(
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
        "-"
      );
    const distance = (a, b) => {
      assert.equal(a.length, 108 * 192 * 3);
      assert.equal(a.length, b.length);
      return a.reduce((n, v, i) => n + Math.abs(v - b[i]), 0) / a.length;
    };
    for (const c of before.clips.slice(0, -1)) {
      const t = c.start + c.duration / 2;
      assert.ok(
        distance(picture(movie, t), picture(revised, t)) < 2,
        "O trecho anterior ao CTA mudou: " + c.name
      );
    }
    assert.ok(
      distance(picture(movie, seconds - 0.15), picture(revised, seconds - 0.15)) > 0.5,
      "A frase precisa mudar no render."
    );
    assert.ok(
      distance(picture(revised, seconds - 0.15), picture(revised, seconds + 0.85)) < 2,
      "O CTA deve durar até o novo fim."
    );
  }
);
