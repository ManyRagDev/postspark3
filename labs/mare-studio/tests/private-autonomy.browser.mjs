import test from "node:test";
import JSZip from "jszip";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { openCheckout } from "./lab-browser.mjs";
const origin = process.env.MARE_PRIVATE_ORIGIN,
  sample = process.env.MARE_SPEECH_SAMPLE;
test(
  "processador privado analisa fala e pessoa, incorpora legendas e renderiza as transições no FilmCraft",
  { skip: !origin || !sample, timeout: 420000 },
  async t => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
    t.after(() => browser.close());
    const page = await openCheckout(browser, { origin, privateLab: true });
    page.on("console", msg => {
      if (msg.text().startsWith("Maré QA")) t.diagnostic(msg.text());
    });
    await page.locator("#first-video").setInputFiles(sample);
    await page.waitForFunction(() =>
      editor.inspect().clips.some(c => c.kind === "video" && c.assetId !== "coast" && c.assetId !== "tide")
    );
    const result = await page.evaluate(async () => {
      const e = window.editor,
        revision = () => e.inspect().revision;
      const apply = commands => e.prepare(revision(), commands).apply();
      const wait = async (op, args) => {
        const id = await e.invoke(op, args, revision());
        while (true) {
          const status = e.job(id);
          if (status.state === "failed") throw Error(op + ": " + status.error);
          if (status.state === "ready") return { id, value: status.result };
          await new Promise(r => setTimeout(r, 250));
        }
      };
      const clipId = e.inspect().clips[0].id;
      if (e.inspect().clips[0].duration > 6) apply([{ id: "clip.set", clipId, fields: { duration: 6 } }]);
      console.log("Maré QA iniciando análise");
      const analysis = await wait("speech.analyze", { clipId, language: "auto", speech: true, mask: true });
      if (!analysis.value.speech?.words.length || !analysis.value.matte?.id)
        throw Error("Análise sem palavras ou sem máscara");
      apply([
        { id: "montagem.gerarLegendas", clipId, analysisJob: analysis.id, style: "highlight" },
        { id: "montagem.estilizarVideoFalado", clipId, background: "solid", color: "#123456" },
      ]);
      const captions = (await wait("export.subtitles", {})).value;
      const { clip, cues } = e.inspect({ clipId });
      console.log("Maré QA", analysis.value.speech.words.length, "palavras", cues.length, "legendas");
      if (!clip.talk?.matte || !cues.length) throw Error("Edição falada ausente");
      // Inspect a native proposal, then reproduce it with the manual caption editor.
      const expected = e
        .prepare(revision(), [
          { id: "speech.caption", clipId, start: cues[0].start, text: "Legenda revisada" },
          { id: "montagem.gerarLegendas", clipId, style: "classic" },
        ])
        .inspect({ clipId });
      await e.invoke("view.selectClip", { clipId }, revision());
      document.querySelector("#edit-speech").click();
      const tab = document.querySelector('[data-pane="captions"]');
      tab.click();
      await new Promise(r => setTimeout(r, 0));
      const set = (selector, value) => {
        const el = document.querySelector(selector);
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set('[data-look="captions"]', "classic");
      await new Promise(r => setTimeout(r, 0));
      set('[data-cue="0"]', "Legenda revisada");
      await new Promise(r => setTimeout(r, 0));
      document.querySelector('[data-action="apply"]').click();
      const deadline = Date.now() + 8000;
      while (document.querySelector("#dialog").open && Date.now() < deadline)
        await new Promise(r => setTimeout(r, 25));
      const actual = e.inspect({ clipId });
      if (JSON.stringify(expected.clip.talk) !== JSON.stringify(actual.clip.talk))
        throw Error(
          "Legenda manual diverge em " +
            Object.keys(expected.clip.talk)
              .filter(k => JSON.stringify(expected.clip.talk[k]) !== JSON.stringify(actual.clip.talk[k]))
              .join(",") +
            " · " +
            (document.querySelector("#speech-status")?.innerText ?? "")
        );
      const types = e.options().transitions.filter(key => /film_burn|torn_paper/.test(key));
      const commands = [];
      for (const [i, type] of types.entries()) {
        const cid = "scene" + i,
          id = "plate" + i;
        commands.push(
          { id: "composition.create", compositionId: cid, name: type, duration: 0.8 },
          { id: "composition.background", compositionId: cid, color: i % 2 ? "#c09020" : "#203070" },
          { id: "composition.insert", compositionId: cid, clipId: id, time: clip.duration + i * 0.8 + 0.01 },
          { id: "transition.set", clipId: id, fromId: i ? "plate" + (i - 1) : clipId, type, frames: 12 }
        );
      }
      if (types.length !== 8) throw Error("Esperava oito transições privadas; recebidas " + types.length);
      apply(commands);
      const portable = (await wait("export.project", {})).value;
      await e.invoke("project.open", { file: new File([portable], "teste.mare") }, revision());
      if (!e.inspect({ clipId }).clip.talk.matte) throw Error("Mídia ausente na reabertura");
      const { base } = (await wait("export.server", { time: 1 })).value;
      const output = {};
      for (const name of ["final.mp4", "projects.zip", "preview.png"]) {
        const response = await fetch(base + name);
        if (!response.ok) throw Error(name + " " + response.status);
        const blob = await response.blob();
        if (blob.size < 512) throw Error(name + " vazio");
        output[name] = blob.size;
        if (name === "final.mp4") {
          const video = document.createElement("video");
          const url = URL.createObjectURL(blob);
          try {
            await new Promise((done, fail) => {
              video.onloadedmetadata = done;
              video.onerror = fail;
              video.src = url;
            });
            output.video = [video.videoWidth, video.videoHeight, video.duration];
          } finally {
            URL.revokeObjectURL(url);
          }
        }
      }
      return { base, output, types, subtitles: await captions.text(), duration: e.inspect().duration };
    });
    assert.match(result.subtitles, /-->/);
    assert.deepEqual(result.output.video.slice(0, 2), [540, 960]);
    assert(Math.abs(result.output.video[2] - result.duration) < 0.15);
    const zipUrl = new URL(result.base + "projects.zip", origin);
    assert.equal(zipUrl.origin, origin);
    const archive = await JSZip.loadAsync(await (await page.request.get(zipUrl.href)).body(), {
      checkCRC32: true,
    });
    for (const file of [
      "edit.fcproj",
      "montagem.mare",
      "preview.png",
      "final.mp4",
      "legendas.srt",
      "render.json",
    ])
      assert(archive.file(file), file);
    const report = JSON.parse(await archive.file("render.json").async("string"));
    assert.equal(report.fps, 30);
    assert.equal(report.audio, true);
    assert(Math.abs(report.frames / 30 - result.duration) <= 1 / 30);
    for (const type of result.types) {
      const prefix = "media/" + type + "-12/";
      assert.equal(
        Object.keys(archive.files).filter(name => name.startsWith(prefix) && name.endsWith(".webp")).length,
        12,
        type
      );
    }
    const packagedSrt = await archive.file("legendas.srt").async("string");
    assert.match(packagedSrt, /Legenda revisada/);
    if (process.env.MARE_ARTIFACT_DIR) {
      for (const [src, name] of [
        ["montagem.mare", "Mare-validacao-privada.mare"],
        ["final.mp4", "Mare-validacao-privada.mp4"],
      ]) {
        await writeFile(
          path.join(process.env.MARE_ARTIFACT_DIR, name),
          await archive.file(src).async("nodebuffer")
        );
      }
    }
    t.diagnostic(JSON.stringify(result.output));
  }
);

test(
  "uma tomada Eleven Flash é reproduzível e continua editável depois de reabrir",
  { skip: !origin || process.env.MARE_VALIDATE_TTS !== "1", timeout: 90000 },
  async t => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
    t.after(() => browser.close());
    const page = await openCheckout(browser, { origin, privateLab: true });
    const result = await page.evaluate(async () => {
      const e = window.editor,
        revision = () => e.inspect().revision;
      const wait = async id => {
        for (;;) {
          const job = e.job(id);
          if (job.state === "ready") return job.result;
          if (job.state !== "running") throw Error(job.error || job.state);
          await new Promise(r => setTimeout(r, 200));
        }
      };
      const take = {
        text: "Teste de voz do Maré",
        model: "elevenlabs/eleven-flash-v2.5",
        voice: Object.keys(e.options().narration.voices)[0],
      };
      const voice = await wait(await e.invoke("narration.generate", take, revision()));
      const asset = await e.attach(voice, "audio");
      e.prepare(revision(), [{ id: "narration.place", ...take, asset, start: 0 }]).apply();
      const portable = await wait(await e.invoke("export.project", {}, revision()));
      await e.invoke("project.open", { file: new File([portable], "narracao.mare") }, revision());
      const c = e
        .inspect()
        .tracks.flatMap(t => t.clips)
        .find(c => c.narration?.text === take.text);
      return { duration: c.duration, size: voice.size, model: c.narration.model };
    });
    assert(result.duration > 0.25 && result.size > 512);
    t.diagnostic(JSON.stringify(result));
  }
);
