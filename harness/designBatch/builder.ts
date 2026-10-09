/** Offline authoring helpers. Pixels are local to a group until build(). */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { recreationRecipeSchema, type RecreationRecipe } from "../../shared/designRecreation";
import { emptyReferenceLayer, type ReferenceSceneLayer, type ReferenceFontAsset } from "../../shared/referenceReconstruction";
import type { MatrixTransform, DesignMatrix } from "../../shared/designMatrix";

export type LayerOptions = Partial<ReferenceSceneLayer> & { cornerRadiusPx?: number };
export type FieldOptions = { id: string; label?: string; kind?: "text" | "list"; layerIds: string[]; minScale?: number; prefix?: string };
export type RecipeOptions = { id?: string; title: string; width: number; height: number; background: string; originalHash?: string; preparedHash?: string; mimeType?: "image/png" | "image/jpeg" | "image/webp"; notes?: string[] };
export const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

/** Reuse already embedded open font files. No font request leaves this process. */
export function localFontPool(roots = ["artifacts/design-recreation", "/home/many/Downloads"]): Map<string, ReferenceFontAsset> {
  const pool = new Map<string, ReferenceFontAsset>();
  const walk = (root: string, depth: number) => {
    let entries;
    try { entries = readdirSync(root, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = join(root, entry.name);
      if (entry.isDirectory() && depth > 0 && !entry.name.startsWith(".")) walk(file, depth - 1);
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const data = JSON.parse(readFileSync(file, "utf8"));
        for (const font of data.scene?.fonts ?? []) {
          if (!font.dataUrl || !font.sha256 || !font.family) continue;
          const bytes = Buffer.from(font.dataUrl.split(",")[1], "base64");
          if (sha256(bytes) !== font.sha256) continue;
          const key = `${font.family}:${font.weight}`;
          if (!pool.has(key)) pool.set(key, structuredClone(font));
        }
      } catch { /* non-recipe JSON */ }
    }
  };
  roots.forEach(root => walk(root, 3));
  return pool;
}

export class RecipeBuilder {
  private layers: ReferenceSceneLayer[] = [];
  private styles: NonNullable<RecreationRecipe["adaptation"]>["layerStyles"] = [];
  private groups: DesignMatrix["groups"] = [];
  private fields: DesignMatrix["fields"] = [];
  private media: DesignMatrix["media"] = [];
  private context: { id: string; transform: MatrixTransform; members: DesignMatrix["groups"][number]["members"] } | null = null;
  constructor(public options: RecipeOptions, private fonts = localFontPool()) {}

  /** Callback coordinates are local. Layer rotations are relative to group rotation. */
  group(id: string, label: string, transform: MatrixTransform, draw: (b: RecipeBuilder) => void): this {
    if (this.context) throw new Error("Nested groups are not supported by V3.");
    const group = { id, label, transform: { ...transform }, members: [] as DesignMatrix["groups"][number]["members"] };
    this.context = group;
    try { draw(this); } finally { this.context = null; }
    this.groups.push(group);
    return this;
  }
  private add(kind: ReferenceSceneLayer["kind"], id: string, opts: LayerOptions): this {
    if (this.layers.some(l => l.id === id)) throw new Error(`Duplicate layer ${id}`);
    const { cornerRadiusPx = 0, ...patch } = opts;
    const layer = { ...emptyReferenceLayer(kind, id), confidenceScore: 0.75, zIndex: this.layers.length, ...patch, id, kind };
    if (this.context) {
      const t = this.context.transform, radians = t.rotationDeg * Math.PI / 180;
      this.context.members.push({ layerId: id, x: layer.x, y: layer.y, rotationDeg: layer.rotationDeg });
      const x = layer.x, y = layer.y;
      layer.x = t.x + x * Math.cos(radians) - y * Math.sin(radians);
      layer.y = t.y + x * Math.sin(radians) + y * Math.cos(radians);
      layer.rotationDeg += t.rotationDeg;
    }
    this.layers.push(layer);
    this.styles.push({ layerId: id, cornerRadiusPx, fit: "preserve" });
    return this;
  }
  rect(id: string, opts: LayerOptions): this { return this.add("rect", id, opts); }
  text(id: string, opts: LayerOptions & { text: string; fontFamily: string }): this { return this.add("text", id, opts); }
  line(id: string, opts: LayerOptions & { points: number[] }): this { return this.add("line", id, opts); }
  polygon(id: string, opts: LayerOptions & { points: number[] }): this { return this.add("polygon", id, opts); }
  /** Call inside the owning group after drawing its text layers. */
  field(options: FieldOptions): this {
    if (!this.context) throw new Error("field() must be called inside group().");
    const layers = options.layerIds.map(id => {
      const l = this.layers.find(l => l.id === id);
      if (!l || l.kind !== "text" || !this.context!.members.some(m => m.layerId === id)) throw new Error(`Invalid field layer ${id}`);
      return l;
    });
    this.fields.push({ id: options.id, label: options.label ?? options.id, kind: options.kind ?? (layers.length > 1 ? "list" : "text"), groupId: this.context.id, layerIds: options.layerIds, baseFontSizes: layers.map(l => l.fontSize), minScale: options.minScale ?? 0.7, prefix: options.prefix ?? "" });
    return this;
  }
  /** Must reference a gray rect in this group. Original photography is never embedded. */
  mediaSlot(id: string, layerId: string, label = id): this {
    if (!this.context) throw new Error("mediaSlot() must be called inside group().");
    const layer = this.layers.find(l => l.id === layerId);
    if (!layer || layer.kind !== "rect") throw new Error(`Media ${id} needs a rect`);
    this.media.push({ id, label, groupId: this.context.id, layerId, fit: "cover", positionX: 0.5, positionY: 0.5, asset: null });
    return this;
  }
  build(): RecreationRecipe {
    const requested = [...new Set(this.layers.filter(l => l.kind === "text").map(l => `${l.fontFamily}:${l.fontWeight}`))];
    const fonts = requested.map(key => { const font = this.fonts.get(key); if (!font) throw new Error(`No local embedded font ${key}. Available: ${[...this.fonts.keys()].join(", ")}`); return structuredClone(font); });
    return recreationRecipeSchema.parse({
      format: "postspark.admin2.recipe", version: 3, id: this.options.id ?? randomUUID(), title: this.options.title, createdAt: new Date().toISOString(), model: "offline/manual-curation", provider: null, usage: { inputTokens: 0, outputTokens: 0 },
      scene: { schemaVersion: 2, source: { widthPx: this.options.width, heightPx: this.options.height, mimeType: this.options.mimeType ?? "image/jpeg", originalHash: this.options.originalHash ?? null, preparedHash: this.options.preparedHash ?? null }, artboard: { background: this.options.background }, layers: this.layers, fonts, warnings: [], decoderVersion: "manual-curation-batch-v1", rendererVersion: "admin2-konva-3" },
      missingElements: [], notes: ["Curadoria manual offline; original usado somente para comparação. Sem aprovação visual automática.", ...(this.options.notes ?? [])],
      adaptation: { parentRecipeId: null, layerStyles: this.styles }, matrix: { version: 1, groups: this.groups, fields: this.fields, media: this.media },
    });
  }
}

export type CompactSpec = {
  stem: string; title: string; background: string; width: number; height: number;
  sourcePath?: string; referencePath?: string; originalHash?: string; notes?: string[];
  layers: Array<LayerOptions & { id: string; kind: "rect" | "text" | "line" | "polygon"; groupId?: string; fieldId?: string; fieldLabel?: string; minScale?: number; prefix?: string; mediaId?: string }>;
  groups: Array<{ id: string; label: string; transform: MatrixTransform }>;
  missingElements?: RecreationRecipe["missingElements"];
};

/** Alternate compact JSON format: all layer coordinates/rotations are absolute. */
export function recipeFromSpec(spec: CompactSpec, fonts = localFontPool()): RecreationRecipe {
  spec=structuredClone(spec);
  const expanded: string[]=[];
  spec.layers=spec.layers.flatMap(layer=>{
    if(layer.kind !== "text" || !layer.fieldId || !layer.text?.includes("\n")) return [layer];
    expanded.push(layer.id);
    const lines=layer.text.split(/\r?\n/),r=(layer.rotationDeg ?? 0)*Math.PI/180,lineHeight=(layer.fontSize ?? 24)*(layer.lineHeight ?? 1.15);
    return lines.map((text,index)=>({...layer,id:index===0 ? layer.id : `${layer.id.slice(0,70)}-line-${index+1}`,text:text || " ",
      fieldId:text.trim() ? layer.fieldId : undefined,opacity:text.trim() ? layer.opacity ?? 1 : 0,
      x:(layer.x ?? 0)-index*lineHeight*Math.sin(r),y:(layer.y ?? 0)+index*lineHeight*Math.cos(r),height:Math.max(lineHeight,1)}));
  });
  if(expanded.length) spec.notes=[...(spec.notes ?? []),`Campos multiline convertidos em listas de camadas por linha para permitir compilação no-op: ${expanded.join(", ")}.`];
  for (const layer of spec.layers) if(layer.groupId && !spec.groups.some(g=>g.id===layer.groupId)) throw new Error(`Layer ${layer.id} references missing group ${layer.groupId}`);
  const reference = spec.sourcePath ?? spec.referencePath;
  const referenceBytes=reference ? readFileSync(reference) : null;
  const mimeType=referenceBytes?.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : referenceBytes?.subarray(0,4).toString()==="RIFF" && referenceBytes?.subarray(8,12).toString()==="WEBP" ? "image/webp" : "image/jpeg";
  const b = new RecipeBuilder({ title: spec.title, width: spec.width, height: spec.height, background: spec.background, mimeType, originalHash: spec.originalHash ?? (referenceBytes ? sha256(referenceBytes) : undefined), notes: spec.notes }, fonts);
  const draw = (entry: CompactSpec["layers"][number], transform?: MatrixTransform) => {
    const { groupId, fieldId, fieldLabel, minScale, prefix, mediaId, kind, id, ...opts } = entry;
    if (transform) {
      const dx = (opts.x ?? 0) - transform.x, dy = (opts.y ?? 0) - transform.y, r = -transform.rotationDeg * Math.PI / 180;
      opts.x = dx * Math.cos(r) - dy * Math.sin(r);
      opts.y = dx * Math.sin(r) + dy * Math.cos(r);
      opts.rotationDeg = (opts.rotationDeg ?? 0) - transform.rotationDeg;
    }
    if (kind === "text") b.text(id, opts as LayerOptions & {text:string;fontFamily:string});
    else if (kind === "rect") b.rect(id, opts);
    else if (kind === "line") b.line(id, opts as LayerOptions & {points:number[]});
    else b.polygon(id, opts as LayerOptions & {points:number[]});
  };
  spec.layers.filter(l => !l.groupId).forEach(l => draw(l));
  for (const group of spec.groups) b.group(group.id, group.label, group.transform, () => {
    const layers = spec.layers.filter(l => l.groupId === group.id);
    layers.forEach(l => draw(l, group.transform));
    for (const fieldId of new Set(layers.map(l => l.fieldId).filter(Boolean))) {
      const bound = layers.filter(l => l.fieldId === fieldId), first = bound[0];
      b.field({ id: fieldId!, label: first.fieldLabel ?? fieldId, layerIds: bound.map(l => l.id), minScale: first.minScale, prefix: first.prefix });
    }
    layers.filter(l => l.mediaId).forEach(l => b.mediaSlot(l.mediaId!, l.id, l.role ?? l.mediaId));
  });
  const result = b.build();
  // Preserve author's absolute stacking order, independent of group iteration order.
  result.scene.layers.forEach(l => { l.zIndex = spec.layers.findIndex(s => s.id === l.id); });
  result.missingElements = spec.missingElements ?? [];
  return recreationRecipeSchema.parse(result);
}
