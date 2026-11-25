import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { montageSrt, validateTalk } from "../dist/speech-model.js";
import { decodeMask, drawSpeakingVideo } from "../dist/speech-visual.js";

const spec = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
if (spec.clips) {
  for (const clip of spec.clips) if (clip.talk) validateTalk(clip.talk);
  const srt = montageSrt(spec.clips);
  if (srt) await fs.writeFile("legendas.srt", srt, "utf8");
} else {
  await renderFootage(spec);
}

function launch(executable, args, stdio) {
  const child = spawn(executable, args, {stdio});
  let errors = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", data => { errors = (errors + data).slice(-1600); });
  const exit = once(child, "close").then(([code]) => {
    if (code) throw Error(errors || "O processador de vídeo foi interrompido.");
  });
  // The process can fail while its partner is still streaming a frame.
  exit.catch(() => {});
  return {child, exit};
}

async function* rawFrames(stream, size) {
  const frame = Buffer.allocUnsafe(size);
  let filled = 0;
  for await (const chunk of stream) {
    let start = 0;
    while (start < chunk.length) {
      const copied = chunk.copy(frame, filled, start, start + size - filled);
      filled += copied;
      start += copied;
      if (filled === size) {
        yield frame;
        filled = 0;
      }
    }
  }
  if (filled) throw Error("O último quadro veio incompleto.");
}

async function renderFootage({clip, source, mask, image, frames, start, portrait, ffmpeg, output}) {
  validateTalk(clip.talk);
  const runtime = path.dirname(process.execPath);
  const require = createRequire(path.join(runtime, "package.json"));
  const {createCanvas, loadImage, GlobalFonts} = require("@napi-rs/canvas");
  for (const font of ["Regular", "Bold"]) {
    GlobalFonts.registerFromPath(path.join(runtime, "fonts", `LiberationSans-${font}.ttf`), "Arial");
  }
  const matte = mask ? await decodeMask(new Blob([await fs.readFile(mask)])) : null;
  const background = image ? await loadImage(await fs.readFile(image)) : null;
  const width = 540, height = 960, fps = 30;
  const picture = createCanvas(width, height);
  const sourceContext = picture.getContext("2d", {alpha: false});
  const pixels = sourceContext.createImageData(width, height);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", {alpha: false});
  const common = ["-hide_banner", "-v", "error", "-nostdin"];
  const seek = ["-threads", "2", "-ss", String(start), "-protocol_whitelist", "file,pipe", "-i", source];
  const decode = launch(ffmpeg, [...common, "-filter_threads", "1", ...seek, "-map", "0:v:0", "-an", "-sn", "-dn",
    "-vf", `fps=30:start_time=0,${portrait},tpad=stop_mode=clone:stop_duration=0.15`,
    "-threads", "1", "-pix_fmt", "rgba", "-frames:v", String(frames), "-f", "rawvideo", "pipe:1"],
    ["ignore", "pipe", "pipe"]);
  const encode = launch(ffmpeg, [...common, "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`,
    "-r", String(fps), "-i", "pipe:0", ...seek, "-map", "0:v:0", "-map", "1:a:0?", "-t", String(frames / fps),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-g", "30", "-bf", "0",
    "-c:a", "aac", "-b:a", "160k", "-threads", "2", "-movflags", "+faststart", output],
    ["pipe", "ignore", "pipe"]);
  encode.child.stdin.on("error", () => {});
  let count = 0;
  try {
    for await (const frame of rawFrames(decode.child.stdout, pixels.data.length)) {
      pixels.data.set(frame);
      sourceContext.putImageData(pixels, 0, 0);
      drawSpeakingVideo(context, picture, width, height, clip, start + count / fps, matte, background);
      await new Promise((resolve, reject) => encode.child.stdin.write(canvas.data(), error => error ? reject(error) : resolve()));
      count++;
    }
    encode.child.stdin.end();
    await Promise.all([decode.exit, encode.exit]);
    if (count !== frames) throw Error(`Esperados ${frames} quadros, recebidos ${count}.`);
  } finally {
    decode.child.kill();
    encode.child.kill();
  }
}
