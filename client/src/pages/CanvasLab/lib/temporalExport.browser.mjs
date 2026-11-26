import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";

test("CanvasLab exporta cada imagem pelo timestamp, reutilizando a mídia para o áudio e as camadas", async t => {
  const dir = await mkdtemp(path.join(tmpdir(), "canvas-post-frames-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, "source.mp4"),
    output = path.join(dir, "slide.mp4");
  const ffmpeg = (...args) => execFileSync("ffmpeg", ["-v", "error", ...args]);
  ffmpeg(
    "-f",
    "lavfi",
    "-i",
    "nullsrc=s=96x160:r=30:d=2,geq=lum='24+mod(N*29,200)':cb=128:cr=128",
    "-itsoffset",
    "0.4",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1:sample_rate=48000",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    input
  );
  const bytes = await readFile(input);
  const js = (
    await build({
      entryPoints: ["client/src/pages/CanvasLab/lib/temporalExport.js"],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "temporal",
      alias: { "@shared": path.resolve("shared") },
    })
  ).outputFiles[0].contents;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  let fullReads = 0;
  await page.route("http://localhost/**", async route => {
    switch (new URL(route.request().url()).pathname) {
      case "/":
        return route.fulfill({
          contentType: "text/html",
          body: '<script src="/render.js"></script>',
        });
      case "/render.js":
        return route.fulfill({
          contentType: "text/javascript",
          body: Buffer.from(js),
        });
      case "/source.mp4": {
        const range = /^bytes=(\d+)-(\d*)$/.exec(
          route.request().headers().range || ""
        );
        if (!range) {
          fullReads++;
          return route.fulfill({ contentType: "video/mp4", body: bytes });
        }
        const start = Number(range[1]),
          end = range[2] ? Number(range[2]) : bytes.length - 1;
        return route.fulfill({
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
          },
          body: bytes.subarray(start, end + 1),
        });
      }
      default:
        return route.abort();
    }
  });
  await page.goto("http://localhost/");
  const data = await page.evaluate(async () => {
    const clips = await Promise.all(
      [0, 1].map(async i => {
        const video = document.createElement("video");
        video.src = "/source.mp4";
        await new Promise((ok, fail) => {
          video.onloadeddata = ok;
          video.onerror = fail;
        });
        const canvas = Object.assign(document.createElement("canvas"), {
          width: 96,
          height: 160,
        });
        return {
          video,
          canvas,
          source: {
            kind: "video",
            assetId: "one",
            start: i,
            trimIn: i,
            trimOut: i + 1,
          },
        };
      })
    );
    const frame = Object.assign(document.createElement("canvas"), {
      width: 96,
      height: 160,
    });
    const ctx = frame.getContext("2d");
    const blob = await temporal.exportTemporalSlide(clips, () => {
      ctx.clearRect(0, 0, 96, 160);
      for (const clip of clips) ctx.drawImage(clip.canvas, 0, 0);
      return frame;
    });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await writeFile(output, Buffer.from(data));
  const luminance = file =>
    ffmpeg(
      "-i",
      file,
      "-an",
      "-vf",
      "crop=4:4:20:20,scale=1:1",
      "-fps_mode",
      "passthrough",
      "-pix_fmt",
      "gray",
      "-f",
      "rawvideo",
      "-"
    );
  const expected = luminance(input);
  function assertMovie(file, composite) {
    const actual = luminance(file);
    const pts = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "frame=best_effort_timestamp_time",
        "-of",
        "json",
        file,
      ])
    ).frames;
    assert.equal(pts.length, 60);
    for (let i = 0; i < 60; i++)
      assert.ok(
        Math.abs(Number(pts[i].best_effort_timestamp_time) - i / 30) < 1e-6,
        "PTS " + i
      );
    assert.equal(actual.length, 60);
    for (let i = 0; i < 60; i++)
      assert.ok(
        Math.abs(actual[i] - composite(expected[i])) < 5,
        `quadro ${i}: origem ${expected[i]}, exportado ${actual[i]}, anterior ${expected[i - 1]}`
      );
    const pcm = ffmpeg(
      "-i",
      file,
      "-map",
      "0:a",
      "-af",
      "apad",
      "-t",
      "2",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-f",
      "f32le",
      "-"
    );
    for (const [time, audible] of [
      [0.1, false],
      [0.65, true],
      [1.15, true],
      [1.7, false],
    ]) {
      const samples = Array.from({ length: 1200 }, (_, i) =>
        Math.abs(pcm.readFloatLE(4 * (Math.round(time * 48000) + i)))
      );
      assert.equal(Math.max(...samples) > 0.04, audible, `áudio em ${time}s`);
    }
  }
  assertMovie(output, v => v);
  assert.equal(
    fullReads,
    1,
    "uma leitura do arquivo autorizado para as duas camadas e suas faixas de áudio"
  );
  // The worker embeds the actual Konva stage and feeds its PNG sequence to FFmpeg.
  // Run node scripts/build-review-renderer.mjs first to build that browser entry.
  await t.test(
    "worker preserva quadros e o atraso de áudio dentro da mídia",
    async () => {
      if (
        process.env.CHROMIUM_EXECUTABLE_PATH &&
        !process.env.REVIEW_CHROMIUM_EXECUTABLE_PATH
      )
        process.env.REVIEW_CHROMIUM_EXECUTABLE_PATH =
          process.env.CHROMIUM_EXECUTABLE_PATH;
      const { tsImport } = await import("tsx/esm/api");
      const { renderMareSlide } = await tsImport(
        "../../../../../server/mareRender.ts",
        import.meta.url
      );
      const { INITIAL_POST } = await tsImport(
        "../components/types.ts",
        import.meta.url
      );
      const post = structuredClone(INITIAL_POST);
      const id = "74136ca1-3f78-4dee-b297-d39bcc2917db";
      Object.assign(post, {
        currentSlideIndex: 0,
        bgImage: "",
        logoUrl: "",
        overlayOpacity: 0,
        fontFamily: "Arial",
        subtextFontFamily: "Arial",
      });
      post.slides = [
        {
          ...post.slides[0],
          id: "numbered",
          headline: "",
          subtext: "",
          bgImage: "",
          temporalMedia: { __background__: { kind: "video", assetId: id } },
        },
      ];
      const workerFile = path.join(dir, "worker.mp4");
      const movie = await renderMareSlide(
        post,
        new Map([[id, { bytes, duration: 2, mime: "video/mp4" }]]),
        async () => {
          throw Error("imagem inesperada");
        }
      );
      await writeFile(workerFile, movie);
      // CanvasPostStage paints native background media at 80% over #120D0A.
      assertMovie(workerFile, v => 0.8 * v + 0.2 * 14);
    }
  );
});
