import { createHash } from "node:crypto";
import { recreationRecipeSchema } from "../../shared/designRecreation";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  arsenalImportSchema,
  type ArsenalImport,
} from "../../shared/arsenalCatalog";
import {
  ARSENAL_COMPILER,
  type PieceDefinitionV2,
  type ResolvedVariantDefinitionV2,
} from "../../shared/designArsenal";
import { verifyArsenalAsset } from "../../server/designCatalog/arsenalAssets";

export const CONVERTER_VERSION = "recipe-v3-arsenal-v2-v1";
const uuid = (seed: string) => {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
/** Explicit conservative role map. Unknown roles/capabilities require authorship.
 * The output is a NEW DRAFT and never inherits approval of the source rendering. */
const sources: Record<string, string> = {
  headline: "headline",
  title: "headline",
  titulo: "headline",
  "titulo-principal": "headline",
  body: "body",
  support: "body",
  subtext: "body",
  apoio: "body",
  subtitle: "body",
  cta: "callToAction",
  "cta-copy": "callToAction",
  "cta-texto": "callToAction",
  label: "label",
  eyebrow: "eyebrow",
  items: "items",
  list: "items",
};
export async function convertRecipeBytes(
  bytes: Buffer,
  target?: "1:1" | "5:6" | "9:16",
  curatorialSourceId?: string
) {
  const sourceFileHash = createHash("sha256").update(bytes).digest("hex"),
    r = recreationRecipeSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (r.version !== 3 || !r.matrix)
    throw new Error("Receita sem matriz V3; requer autoria de bindings");
  const original = structuredClone(r),
    sourceRecipeHash = arsenalHash(r);
  if (r.scene.layers.some(l => l.kind === "arcText" || l.extrusion))
    throw new Error(
      "arcText/extrusion requer capacidade gráfica futura ou autoria explícita"
    );
  const ratio = r.scene.source.widthPx / r.scene.source.heightPx,
    aspectRatio =
      target ??
      (Math.abs(ratio - 1) < 0.01
        ? "1:1"
        : Math.abs(ratio - 9 / 16) < 0.01
          ? "9:16"
          : "5:6");
  const width = 1080,
    height = aspectRatio === "1:1" ? 1080 : aspectRatio === "5:6" ? 1296 : 1920;
  const scale = Math.min(
      width / r.scene.source.widthPx,
      height / r.scene.source.heightPx
    ),
    dx = (width - r.scene.source.widthPx * scale) / 2,
    dy = (height - r.scene.source.heightPx * scale) / 2;
  const assetFiles: Array<{
    manifest: ArsenalImport["definition"]["assets"][number];
    bytes: Buffer;
    sourceFamily: string;
    sourceUrl: string | null;
  }> = [];
  for (const f of r.scene.fonts) {
    if (!f.dataUrl) throw new Error(`Bytes da fonte ausentes: ${f.family}`);
    const raw = Buffer.from(f.dataUrl.split(",")[1], "base64"),
      a = await verifyArsenalAsset(raw, {
        weight: f.weight,
        license: f.license,
      });
    if (a.manifest.sha256 !== f.sha256)
      throw new Error("Hash original da fonte divergente");
    assetFiles.push({
      ...a,
      bytes: raw,
      sourceFamily: f.family,
      sourceUrl: f.sourceUrl,
    });
  }
  const pieces: Record<string, PieceDefinitionV2> = {},
    layers = structuredClone(r.scene.layers),
    bindings: ResolvedVariantDefinitionV2["bindings"] = [],
    relations: ResolvedVariantDefinitionV2["relations"] = [];
  const bound = new Set<string>(),
    merged = new Set<string>(),
    roles = new Map<string, string>(),
    notes: string[] = [];
  if (
    /^(paper|photo|window)-(paper|ribbons|window)-requested$/.test(
      curatorialSourceId ?? ""
    )
  ) {
    const eyebrow = layers.find(l => l.id === "eyebrow");
    if (eyebrow) {
      r.matrix.fields.push({
        id: "eyebrow",
        label: "Chamada superior",
        kind: "text",
        groupId: "composition",
        layerIds: [eyebrow.id],
        baseFontSizes: [eyebrow.fontSize],
        minScale: 1,
        prefix: "",
      });
      notes.push(
        "Chamada de demonstração substituída por binding eyebrow; aprovação da derivação pendente."
      );
    }
  }
  for (const field of r.matrix.fields) {
    const source = sources[field.id];
    if (!source)
      throw new Error(`Papel semântico exige curadoria: ${field.id}`);
    const members = field.layerIds.map(id => layers.find(l => l.id === id)!);
    if (members.some(l => !l || l.kind !== "text"))
      throw new Error(`Campo inválido: ${field.id}`);
    if (
      members.some(l => l.rotationDeg !== 0) ||
      members.some(
        l =>
          l.fontFamily !== members[0].fontFamily ||
          l.fontSize !== members[0].fontSize ||
          l.fill !== members[0].fill
      )
    )
      throw new Error(
        `Campo com geometria/estilos múltiplos exige autoria: ${field.id}`
      );
    const first = members[0],
      x = Math.min(...members.map(l => l.x)),
      y = Math.min(...members.map(l => l.y)),
      right = Math.max(...members.map(l => l.x + l.width)),
      bottom = Math.max(...members.map(l => l.y + l.height));
    first.x = x;
    first.y = y;
    first.width = right - x;
    first.height = bottom - y;
    for (const l of members.slice(1)) merged.add(l.id);
    bound.add(first.id);
    roles.set(first.id, source);
    first.text = null;
    bindings.push({
      id: field.id,
      label: field.label,
      kind: source === "items" ? "list" : "text",
      source: source as any,
      required: source === "headline",
      targetIds: [first.id],
      cardinality: source === "items" ? { min: 1, max: 6 } : null,
      prefix: field.prefix,
      gap: 12 * scale,
    });
    relations.push({
      id: `fit-${field.id}`,
      kind: "textFit",
      version: 1,
      enabled: true,
      inputs: [],
      outputs: [
        {
          targetId: first.id,
          properties: ["x", "width", "height", "fontSize"],
        },
      ],
      parameters: {
        anchor: first.align === "center" ? "center" : "left",
        maxWidth: first.width * scale,
        maxHeight: first.height * scale,
        minFontSize: first.fontSize * scale * field.minScale,
      },
    });
    if (members.length > 1)
      notes.push(
        `${field.id}: linhas fundidas em uma unidade semântica; prévia própria obrigatória.`
      );
  }
  if (!bindings.some(b => b.source === "headline"))
    throw new Error("Papel headline ausente");
  for (const m of r.matrix.media) {
    bound.add(m.layerId);
    roles.set(m.layerId, "media.primary");
    bindings.push({
      id: m.id,
      label: m.label,
      source: "media.primary",
      kind: "media",
      required: true,
      targetIds: [m.layerId],
      cardinality: null,
      prefix: "",
      gap: 0,
    });
  }
  if (
    layers.some(
      l =>
        l.kind === "text" &&
        !bound.has(l.id) &&
        !merged.has(l.id) &&
        l.text?.trim()
    )
  )
    throw new Error(
      "Texto de referência não classificado; requer autoria de binding ou ornamentação"
    );
  const instances: ResolvedVariantDefinitionV2["instances"] = [];
  // Fixed source geometry, with group-local coordinates derived explicitly. No inferred flow/surface relations.
  const groups = r.matrix.groups.map(g => ({
    id: g.id,
    label: g.label,
    parentId: null,
    zIndex: Math.min(
      ...g.members.map(m => layers.find(l => l.id === m.layerId)?.zIndex ?? 0)
    ),
    x: g.transform.x * scale + dx,
    y: g.transform.y * scale + dy,
    width: width,
    height: height,
    rotation: g.transform.rotationDeg,
    opacity: 1,
    scale: 1,
  }));
  for (const l of layers) {
    if (merged.has(l.id)) continue;
    const g = r.matrix.groups.find(g =>
        g.members.some(m => m.layerId === l.id)
      ),
      angle = ((g?.transform.rotationDeg ?? 0) * Math.PI) / 180;
    const lx = l.x - (g?.transform.x ?? 0),
      ly = l.y - (g?.transform.y ?? 0);
    const a = assetFiles.find(
      a => a.sourceFamily === l.fontFamily && a.manifest.weight === l.fontWeight
    )?.manifest;
    if (l.kind === "text" && !a)
      throw new Error(`Fonte verificável ausente: ${l.id}`);
    const piece: PieceDefinitionV2 = {
      kind:
        roles.get(l.id) === "media.primary"
          ? "media"
          : (l.kind as PieceDefinitionV2["kind"]),
      fill: l.fill,
      stroke: l.strokeColor,
      strokeWidth: l.strokeWidth * scale,
      cornerRadius:
        (r.adaptation?.layerStyles?.find(s => s.layerId === l.id)
          ?.cornerRadiusPx ?? 0) * scale,
      points: l.points.map(n => n * scale),
      fontFamily: a?.family ?? "Arial",
      fontAssetId: a?.id ?? null,
      fontSize: l.fontSize * scale,
      fontWeight: l.fontWeight,
      align: l.align,
      lineHeight: l.lineHeight,
      letterSpacing: l.letterSpacing * scale,
      fixedText: null,
    };
    const hash = arsenalHash(piece);
    pieces[hash] = piece;
    instances.push({
      id: l.id,
      pieceHash: hash,
      parentId: g?.id ?? null,
      zIndex: l.zIndex,
      x: (lx * Math.cos(angle) + ly * Math.sin(angle)) * scale + (g ? 0 : dx),
      y: (-lx * Math.sin(angle) + ly * Math.cos(angle)) * scale + (g ? 0 : dy),
      width: Math.max(1, l.width * scale),
      height: Math.max(1, l.height * scale),
      rotation: l.rotationDeg - (g?.transform.rotationDeg ?? 0),
      opacity: l.opacity,
    });
  }
  const variant: ResolvedVariantDefinitionV2 = {
    variantKey: `${aspectRatio.replace(":", "x")}-${sourceFileHash.slice(0, 12)}`,
    aspectRatio,
    compilerVersion: ARSENAL_COMPILER,
    artboard: { width, height, background: r.scene.artboard.background },
    instances,
    groups,
    bindings,
    relations,
    assetIds: assetFiles.map(a => a.manifest.id),
    capabilities: [
      "text",
      "rect",
      "line",
      "polygon",
      "media",
      "groups",
      "relations",
    ],
    intentionalOverlaps: [],
    limitations: [
      "Derivação candidata; revisão visual e aprovação por variante obrigatórias.",
      "Geometria V3 preservada; não foram inferidas relações de fluxo/superfície.",
    ],
  };
  if (Math.abs(ratio - width / height) > 0.001)
    notes.push(
      "Origem em outro formato: projeção uniforme centralizada; nova variante, sem herança de aprovação."
    );
  const p = arsenalImportSchema.parse({
    format: "postspark.arsenal.import",
    version: 1,
    blueprintId: uuid(`arsenal:${r.id}:${aspectRatio}`),
    definition: {
      schemaVersion: 2,
      compilerVersion: ARSENAL_COMPILER,
      name: r.title,
      description: `Composição derivada da receita curada ${r.id}; ${bindings.map(b => b.source).join(", ")}.`,
      tags: [],
      intentions: bindings.some(b => b.kind === "list")
        ? ["list"]
        : ["headline-body"],
      variants: [variant],
      assets: assetFiles.map(a => a.manifest),
      provenance: {
        sourceFileHash,
        sourceRecipeHash,
        converterVersion: CONVERTER_VERSION,
        notes,
      },
    },
    pieces,
  });
  return { package: p, assetFiles, source: original };
}
