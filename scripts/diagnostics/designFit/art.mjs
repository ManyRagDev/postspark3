import { createRequire } from "node:module";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";
const root = process.env.DESIGN_FIT_OUTPUT,
  worker = process.env.DESIGN_FIT_WORKER;
const req = createRequire(join(resolve(worker), "package.json"));
const { renderReviewScenes, closeReviewRenderer } = req(
  "./server/ai/workflows/proposalRenderer.ts"
);
const read = path => JSON.parse(readFileSync(path));
const art = join(root, "artes"),
  blind = join(root, "cego");
mkdirSync(art, { recursive: true });
mkdirSync(blind, { recursive: true });
const loadAssetBytes = async a => {
  const local = join(
    "artifacts/acervo82/full/acervo82-fidelidade-20261119/assets",
    a.sha256
  );
  const buf = readFileSync(
    existsSync(local) ? local : join(root, "assets", a.sha256)
  );
  assert.equal(createHash("sha256").update(buf).digest("hex"), a.sha256);
  return buf;
};
const index = [];
try {
  for (const n of [2, 7, 10]) {
    const versions = {};
    for (const arm of ["A", "B"]) {
      const final = join(root, "geracoes", n + "-" + arm, "final.json");
      if (!existsSync(final)) continue;
      const { snapshot } = read(final);
      const versionsBySlot = new Map();
      versions[arm] = versionsBySlot;
      for (const p of snapshot.proposals.filter(s => s.status === "ready")) {
        const prefix = n + "-" + arm + "-" + (p.slot + 1);
        const compositions = p.bundle.slides.map(s => s.composition);
        const images = [];
        if (!existsSync(join(art, prefix + ".png"))) {
          const renders = await renderReviewScenes({
            actor: "design-fit",
            compositions,
            definitions: [],
            loadAssetBytes,
          });
          for (const [i, scene] of renders.entries()) {
            const data = Buffer.from(scene.dataUri.split(",")[1], "base64");
            writeFileSync(join(art, prefix + "-p" + (i + 1) + ".png"), data);
            images.push(await loadImage(data));
          }
          const w = images[0].width,
            h = images[0].height;
          const cols = Math.min(images.length, 3),
            rows = Math.ceil(images.length / cols);
          const canvas = createCanvas(cols * w, rows * h);
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#eee";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (const [i, image] of images.entries())
            ctx.drawImage(
              image,
              (i % cols) * w,
              Math.floor(i / cols) * h,
              w,
              h
            );
          writeFileSync(
            join(art, prefix + ".png"),
            canvas.toBuffer("image/png")
          );
        }
        versionsBySlot.set(p.slot, {
          arm,
          slot: p.slot,
          family: p.bundle.family,
          prefix,
        });
      }
    }
    if (!versions.A || !versions.B) continue;
    const matches = [...versions.A.keys()]
      .filter(k => versions.B.has(k))
      .map(k => [versions.A.get(k), versions.B.get(k)]);
    // Also compare the first actual delivery when the first successful slots differ.
    const first = [...["A", "B"].map(a => [...versions[a].values()][0])];
    if (first.every(Boolean) && first[0].slot !== first[1].slot)
      matches.push(first);
    for (const [i, match] of matches.entries()) {
      const key = "caso-" + n + "-" + (i + 1);
      const ordered = (n + i) % 2 === 0 ? match : [...match].reverse();
      for (const [j, row] of ordered.entries())
        writeFileSync(
          join(blind, key + "-" + (j ? "Y" : "X") + ".png"),
          readFileSync(join(art, row.prefix + ".png"))
        );
      index.push({ key, sourceRound: n, X: ordered[0], Y: ordered[1] });
    }
  }
  writeFileSync(join(root, "origens.json"), JSON.stringify(index, null, 2));
  console.log(index.map(r => r.key));
} finally {
  await closeReviewRenderer();
}
