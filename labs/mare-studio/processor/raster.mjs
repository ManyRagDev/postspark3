// Render the same scene as the canvas preview, once per output frame.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { drawFrame } from "../dist/renderer.js";
import { assertComposition } from "../dist/composition-model.js";

const runtime = path.dirname(process.execPath);
const require = createRequire(path.join(runtime, "package.json"));
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
for (const [file, family] of [
  ["LiberationSans-Regular", "Arial"], ["LiberationSans-Bold", "Arial"],
  ["LiberationSerif-Regular", "Georgia"], ["LiberationSerif-Italic", "Georgia"],
]) GlobalFonts.registerFromPath(path.join(runtime, "fonts", file + ".ttf"), family);
const {clip, scene, images, frames} = JSON.parse(await fs.readFile("input.json", "utf8"));
const media = new Map();
if (clip.composition) {
  for (const layer of clip.composition.layers) {
    if (layer.type !== "image") continue;
    const file = Object.hasOwn(images, layer.src) && images[layer.src];
    if (!file) throw Error("Imagem ausente no projeto.");
    const bytes = await fs.readFile(file);
    const src = "data:image/png;base64," + bytes.toString("base64");
    if (!media.has(src)) media.set(src, await loadImage(bytes));
    layer.src = src;
  }
  assertComposition(clip.composition);
}
const canvas = createCanvas(540, 960);
const project = {clips: [clip], scene};
for (let f = 0; f < frames; f++) {
  drawFrame(canvas, project, f / 30, media);
  await fs.writeFile("frame-" + String(f + 1).padStart(5, "0") + ".jpg", canvas.toBuffer("image/jpeg", 94));
}
