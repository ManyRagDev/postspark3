// Run with node --test and a Playwright Chromium installation, ffmpeg and ffprobe.
// CHROMIUM_EXECUTABLE_PATH can select an existing browser.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const ffmpeg = (...args) => execFileSync("ffmpeg", ["-v", "error", ...args]);

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

  const times = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries",
    "frame=best_effort_timestamp_time", "-of", "json", output])).frames;
  assert.equal(times.length, 60);
  const luminance = file => ffmpeg("-i", file, "-an", "-vf", "crop=4:4:20:20,scale=1:1",
    "-fps_mode", "passthrough", "-pix_fmt", "gray", "-f", "rawvideo", "-");
  const expected = luminance(input), actual = luminance(output);
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < 60; i++) {
    assert.ok(Math.abs(Number(times[i].best_effort_timestamp_time) - i / 30) < 1e-6, "tempo do quadro " + i);
    assert.ok(Math.abs(actual[i] - expected[i]) < 5, "imagem do quadro " + i);
  }
  const pcm = ffmpeg("-i", output, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "f32le", "-");
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
});
