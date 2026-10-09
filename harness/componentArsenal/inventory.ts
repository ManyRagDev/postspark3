import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { recreationRecipeSchema, type RecreationRecipe } from "../../shared/designRecreation";
import { OFFICIAL_FAMILIES_META } from "../../client/src/pages/CanvasLab/components/types";

export const SOURCE_MANIFESTS = [
  "artifacts/design-recreation/family-library-2026-10-01T02-59-27-361Z/manifest.json",
  "artifacts/design-recreation/representation-pilot-2026-10-01T14-34-42-871Z/manifest.json",
  "artifacts/design-recreation/quality-pilot-2026-10-01T14-56-36-703Z/manifest.json",
  "artifacts/component-arsenal/editor-extension-sources/manifest.json",
] as const;
export const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export type SourceRecord = {
  id: string; referenceId: string; category: string; title: string;
  manifestPath: string; recipePath: string; previewPath: string; fileHash: string;
  declaredHash: string | null; sourceApproval: string; sourceFormat: string;
  destination: "composition" | "media-reference" | "font-study";
};
export async function readCorpus(root = process.cwd()) {
  const records: SourceRecord[] = [];
  for (const manifestPath of SOURCE_MANIFESTS) {
    const base = path.dirname(manifestPath), manifest = JSON.parse(await fs.readFile(path.join(root, manifestPath), "utf8"));
    const items = manifest.items ?? (manifest.trials ?? manifest.cases).map((trial: any) => ({
      id: trial.id, title: trial.title, category: manifest.trials ? "representation" : "quality",
      status: manifest.trials ? "Derivação: aprovação pendente" : manifest.newApprovalStatus ?? "Revisão de qualidade: aprovação pendente",
      variants: [{ recipe: trial.recipe, preview: trial.render ?? trial.after, sha256: trial.recipeSha256, format: "original" }],
    }));
    for (const item of items) for (const variant of item.variants) {
      const recipePath = path.join(base, variant.recipe), previewPath = path.join(base, variant.preview);
      const bytes = await fs.readFile(path.join(root, recipePath)), fileHash = sha256(bytes);
      if (variant.sha256 && fileHash !== variant.sha256) throw new Error(`Hash divergente: ${recipePath}`);
      await fs.access(path.join(root, previewPath));
      const destination = item.id === "fonts" ? "font-study" : item.id.startsWith("cbb2") ? "media-reference" : "composition";
      records.push({ id: `${item.category}:${item.id}:${variant.format}`, referenceId: item.id, category: item.category,
        title: item.title, manifestPath, recipePath, previewPath, fileHash, declaredHash: variant.sha256 ?? null,
        sourceApproval: item.status, sourceFormat: variant.format, destination });
    }
  }
  return records;
}
export async function readSource(record: SourceRecord, root = process.cwd()) {
  const bytes = await fs.readFile(path.join(root, record.recipePath));
  if (sha256(bytes) !== record.fileHash) throw new Error(`Fonte mudou: ${record.recipePath}`);
  return { bytes, recipe: recreationRecipeSchema.parse(JSON.parse(bytes.toString("utf8"))) };
}
export function capabilities(recipe: RecreationRecipe) {
  const matrix = recipe.matrix!;
  return { fields: matrix.fields.map(f => ({ id: f.id, groupId: f.groupId, layers: f.layerIds,
    rotated: f.layerIds.some(id => recipe.scene.layers.find(l => l.id === id)?.rotationDeg),
    styles: [...new Set(f.layerIds.map(id => { const l = recipe.scene.layers.find(l => l.id === id)!; return `${l.fontFamily}:${l.fontWeight}:${l.fontSize}:${l.fill}`; }))],
  })), groups: matrix.groups.length, layers: recipe.scene.layers.length,
    mediaSlots: matrix.media.length, extrusionLayers: recipe.scene.layers.filter(l => l.extrusion).map(l => l.id),
    arcLayers: recipe.scene.layers.filter(l => l.kind === "arcText").map(l => l.id),
    fonts: recipe.scene.fonts.map(f => ({ family: f.family, weight: f.weight, sha256: f.sha256, license: f.license, hasBytes: !!f.dataUrl })),
    missingElements: recipe.missingElements,
  };
}
export function familyCoverage(records: SourceRecord[]) {
  return Object.entries(OFFICIAL_FAMILIES_META).map(([id, meta]) => ({ id, name: meta.name,
    recipeFamilyId: id === "cyber-glitch" ? "glitch-signal" : id,
    recipes: records.filter(r => ["native","editor-extension"].includes(r.category) && r.referenceId === (id === "cyber-glitch" ? "glitch-signal" : id)).map(r => r.recipePath),
    status: records.some(r => ["native","editor-extension"].includes(r.category) && r.referenceId === (id === "cyber-glitch" ? "glitch-signal" : id)) ? "source-recipes-present-awaiting-component-review" : "editor-preset-preserved-not-yet-extracted",
  }));
}
