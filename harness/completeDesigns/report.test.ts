import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createCanvas } from "@napi-rs/canvas";
import { afterEach, describe, expect, it } from "vitest";
import { conversionFixture } from "../componentArsenal/conversion.fixture";
import { sha256 } from "../componentArsenal/inventory";
import { copyDesignReferences, completeDesignReviewHtml } from "./report";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "postspark-original-evidence-"));
  directories.push(directory);
  const canvas = createCanvas(64, 80), context = canvas.getContext("2d");
  context.fillStyle = "#EF4370"; context.fillRect(0, 0, 64, 80);
  const original = canvas.toBuffer("image/png");
  context.fillStyle = "#222222"; context.fillRect(0, 0, 64, 80);
  const historical = canvas.toBuffer("image/png");
  const sourcePath = path.join(directory, "fonts"), previewPath = path.join(directory, "historical.png");
  await fs.writeFile(sourcePath, original); await fs.writeFile(previewPath, historical);
  const { record, recipe } = conversionFixture();
  recipe.scene.source.originalHash = sha256(original); record.previewPath = previewPath;
  return { directory, record, recipe, original, historical, sourcePath };
}
describe("whole-design source evidence", () => {
  it("copies real original bytes by identity independently of recipe/hash/historical preview and detects MIME without extension", async () => {
    const f = await fixture();
    const references = await copyDesignReferences(f.record, f.recipe, f.directory, { candidatePath: f.sourcePath });
    expect(references.originalStatus).toBe("verified");
    expect(references.original).toMatchObject({ sha256: sha256(f.original), fileName: "fonts", mimeType: "image/png", width: 64, height: 80 });
    expect(references.original!.relativePath).toBe(`references/originals/${sha256(f.original)}.png`);
    expect(references.historicalPreview!.sha256).toBe(sha256(f.historical));
    expect(references.historicalPreview!.sha256).not.toBe(references.original!.sha256);
    expect(references.original!.sha256).not.toBe(f.record.fileHash);
    expect(await fs.readFile(path.join(f.directory, references.original!.relativePath))).toEqual(f.original);
    expect(await fs.readFile(path.join(f.directory, references.historicalPreview!.relativePath))).toEqual(f.historical);
    expect(JSON.stringify(references)).not.toContain(f.directory);
    const html = completeDesignReviewHtml([{ title: "<Original>", status: "draft", references, previews: [] }]);
    expect(html).toContain("Original — bytes verificados");
    expect(html).toContain("Reconstrução histórica da receita — não é o original");
    expect(html).toContain("&lt;Original&gt;");
    expect(html).not.toContain(`src="${f.sourcePath}"`);
  });
  it("refuses a mismatched original instead of relabelling the historical preview", async () => {
    const f = await fixture();
    await expect(copyDesignReferences(f.record, f.recipe, f.directory, { candidatePath: f.record.previewPath })).rejects.toThrow("divergem do hash");
    await expect(fs.access(path.join(f.directory, "references/originals"))).rejects.toThrow();
  });
  it("shows missing original evidence explicitly while keeping the historical preview available", async () => {
    const f = await fixture();
    const references = await copyDesignReferences(f.record, f.recipe, f.directory, { root: f.directory, inventoryPath: "missing.json" });
    expect(references.originalStatus).toBe("unavailable");
    expect(references.original).toBeUndefined();
    expect(references.historicalPreview?.sha256).toBe(sha256(f.historical));
    expect(completeDesignReviewHtml([{ title: "Draft", status: "draft", references }])).toContain("fidelidade ao original não verificada");
  });
  it("resolves original inventory by image hash and preserves two distinct reference identities", async () => {
    const f = await fixture();
    const inventoryPath = path.join(f.directory, "original-inventory.json");
    await fs.writeFile(inventoryPath, JSON.stringify({ images: [{ sha256: sha256(f.original), sourcePath: f.sourcePath }] }));
    const references = await copyDesignReferences(f.record, f.recipe, f.directory, { inventoryPath });
    expect(references.originalStatus).toBe("verified");
    expect(references.original?.sha256).toBe(sha256(f.original));
    expect(references.historicalPreview?.sha256).toBe(sha256(f.historical));
  });
});
