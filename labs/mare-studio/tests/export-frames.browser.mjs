// Run with node --test and a Playwright Chromium installation, ffmpeg and ffprobe.
// CHROMIUM_EXECUTABLE_PATH can select an existing browser.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-v", "error", ...args]);

async function assertCompatibleMp4(file) {
  const {streams} = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", file]));
  const [video, audio] = streams;
  assert.equal(video.codec_tag_string, "avc1");
  assert.match(video.profile, /Baseline/);
  assert.equal(video.pix_fmt, "yuv420p");
  assert.equal(audio.codec_name, "aac");
  assert.equal(audio.profile, "LC");
  const bytes = await readFile(file);
  assert.ok(bytes.indexOf("moov") >= 0 && bytes.indexOf("moov") < bytes.indexOf("mdat"));
}

function assertAudioWindows(file) {
  const pcm = ffmpeg("-i", file, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "f32le", "-");
  function peakAt(time) {
    let peak = 0;
    const from = Math.round(time * 48000);
    for (let i = from; i < from + 2400; i++) peak = Math.max(peak, Math.abs(pcm.readFloatLE(4 * i)));
    return peak;
  }
  assert.ok(peakAt(.15) < .01);
  assert.ok(peakAt(.6) > .05);
  assert.ok(peakAt(1.15) > .05);
  assert.ok(peakAt(1.65) < .01);
}

test("o MP4 preserva cada quadro numerado, inclusive no corte, e a entrada atrasada do som", async t => {
  const work = await mkdtemp(path.join(tmpdir(), "mare-frames-"));
  t.after(() => rm(work, {recursive: true, force: true}));
  const input = path.join(work, "origem.mp4"), output = path.join(work, "montagem.mp4");
  ffmpeg("-f", "lavfi", "-i", "nullsrc=s=96x160:r=30:d=2,geq=lum='24+mod(N*29,200)':cb=128:cr=128",
    "-itsoffset", "0.4", "-f", "lavfi", "-i", "sine=frequency=440:duration=1:sample_rate=48000",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", input);
  const source = await readFile(input);
  const clip = {id: "a", name: "Numerado", kind: "video", assetId: "source", trim: 0, duration: 1};
  const metadata = Buffer.from(JSON.stringify({
    project: {name: "Conferência", compositions: [], clips: [clip, {...clip, id: "b", trim: 1}],
      sound: {enabled: false, volume: 0, assetId: null}},
    assets: [{id: "source", type: "video/mp4", size: source.length}],
  }));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(metadata.length);

  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(() => browser.close());
  const page = await browser.newPage();
  const mime = {".js": "text/javascript", ".html": "text/html", ".json": "application/json",
    ".css": "text/css", ".svg": "image/svg+xml"};
  await page.route("http://localhost/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = path.resolve(dist, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(dist)) return route.abort();
    try {
      await route.fulfill({body: await readFile(file), contentType: mime[path.extname(file)] || "application/octet-stream"});
    } catch {
      await route.fulfill({status: 404});
    }
  });
  await page.goto("http://localhost");
  await page.locator("#project-file").setInputFiles({name: "teste.mare", mimeType: "application/octet-stream",
    buffer: Buffer.concat([Buffer.from("MARESTUDIO2\n"), length, metadata, source])});
  await page.getByText("Numerado", {exact: true}).first().waitFor();
  await page.locator("#export").click();
  await page.locator("#render-video").click();
  await page.locator("#download-video").waitFor({timeout: 60000});
  const downloading = page.waitForEvent("download");
  await page.locator("#download-video").click();
  await (await downloading).saveAs(output);
  await assertCompatibleMp4(output);

  const times = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries",
    "frame=best_effort_timestamp_time", "-of", "json", output])).frames;
  assert.equal(times.length, 60);
  const luminance = (file, x = 20) => ffmpeg("-i", file, "-an", "-vf", `crop=4:4:${x}:20,scale=1:1`,
    "-fps_mode", "passthrough", "-pix_fmt", "gray", "-f", "rawvideo", "-");
  const expected = luminance(input), actual = luminance(output);
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < 60; i++) {
    assert.ok(Math.abs(Number(times[i].best_effort_timestamp_time) - i / 30) < 1e-6, "tempo do quadro " + i);
    assert.ok(Math.abs(actual[i] - expected[i]) < 5, `imagem do quadro ${i}: origem=${expected[i]}, exportado=${actual[i]}, vizinhos=${expected[i-1]},${expected[i+1]}`);
  }
  assertAudioWindows(output);

  await page.locator("#dialog").evaluate(dialog => dialog.close());
  await page.locator("#export").click();
  await page.locator("#dialog details.export-options > summary").click();
  await page.locator("#realtime-video").click();
  await page.locator("#download-video").waitFor({timeout: 60000});
  const realtimeDownload = page.waitForEvent("download");
  await page.locator("#download-video").click();
  const realtime = path.join(work, "real-time.mp4");
  await (await realtimeDownload).saveAs(realtime);
  await assertCompatibleMp4(realtime);
  assertAudioWindows(realtime);

  // Reuse a single asset on both sides of the transition, in reverse trim order.
  // The incoming handle holds frame 0; the outgoing handle must hold frame 59.
  const transitionOutput = path.join(work, "transicao.mp4");
  const bytes = await page.evaluate(async packed => {
    const {unpackProject} = await import("./engine.js");
    const project = await unpackProject(new Blob([Uint8Array.from(packed)]));
    const [a,b] = project.clips;
    a.trim = 1;
    b.trim = 0;
    b.transitionIn = {from: a.id, type: "push_legacy", frames: 8};
    const {exportPreciseMP4} = await import("./precise-export.js");
    const blob = await exportPreciseMP4(project, {width: 96, height: 160, signal: new AbortController().signal});
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, [...Buffer.concat([Buffer.from("MARESTUDIO2\n"), length, metadata, source])]);
  await writeFile(transitionOutput, Buffer.from(bytes));
  for (const x of [20, 75]) {
    const values = luminance(transitionOutput, x);
    for (let i = 26; i < 34; i++) {
      const from = Math.min(59, i + 30), to = Math.max(0, i - 30);
      const sourceFrame = x + 2 < (i - 26) / 8 * 96 ? to : from;
      assert.ok(Math.abs(values[i] - expected[sourceFrame]) < 5, `transição x=${x}, quadro ${i}, fonte ${sourceFrame}, imagem ${values[i]}`);
    }
  }
});
