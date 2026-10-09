import { z } from "zod";

const finite = z.number().finite();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const referenceArcSchema = z.object({
  centerX: finite,
  centerY: finite,
  radius: z.number().finite().positive(),
  startAngleDeg: finite,
  clockwise: z.boolean(),
}).strict();

export const referenceExtrusionSchema = z.object({
  color,
  offsetX: finite,
  offsetY: finite,
  steps: z.number().int().min(1).max(80),
}).strict();

export const referenceLayerSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["text", "arcText", "rect", "line", "polygon"]),
  role: z.string().min(1).max(80),
  zIndex: z.number().int().min(-1000).max(1000),
  x: finite,
  y: finite,
  width: finite,
  height: finite,
  text: z.string().max(1200).nullable(),
  fontFamily: z.string().min(1).max(120).nullable(),
  fontWeight: z.number().int().min(100).max(900),
  fontSize: z.number().finite().min(1).max(2000),
  lineHeight: z.number().finite().min(0.5).max(3),
  letterSpacing: z.number().finite().min(-50).max(100),
  align: z.enum(["left", "center", "right"]),
  fill: color,
  strokeColor: color.nullable(),
  strokeWidth: z.number().finite().min(0).max(100),
  rotationDeg: z.number().finite().min(-360).max(360),
  opacity: z.number().finite().min(0).max(1),
  points: z.array(finite).max(200),
  arc: referenceArcSchema.nullable(),
  extrusion: referenceExtrusionSchema.nullable(),
  confidenceScore: z.number().finite().min(0).max(1),
  provenance: z.enum(["multimodal", "geometry", "curator"]),
  support: z.enum(["supported", "unknown", "unsupported"]),
  uncertainty: z.string().max(240).nullable(),
}).strict();

export const referenceFontAssetSchema = z.object({
  family: z.string().min(1).max(120),
  weight: z.number().int().min(100).max(900),
  sourceUrl: z.string().max(1000).nullable(),
  mimeType: z.enum(["font/woff2", "font/woff", "font/ttf", "font/otf"]).nullable(),
  dataUrl: z.string().nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  license: z.enum(["open-source", "curator-provided", "unknown"]),
}).strict();

export const referenceSceneSchema = z.object({
  schemaVersion: z.literal(2),
  source: z.object({
    widthPx: z.number().int().min(64).max(8000),
    heightPx: z.number().int().min(64).max(8000),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    preparedHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    originalHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  }).strict(),
  artboard: z.object({ background: color }).strict(),
  layers: z.array(referenceLayerSchema).max(100),
  fonts: z.array(referenceFontAssetSchema).max(16),
  warnings: z.array(z.string().max(240)).max(40),
  decoderVersion: z.string().min(1).max(80),
  rendererVersion: z.string().min(1).max(80),
}).strict();

export type ReferenceSceneLayer = z.infer<typeof referenceLayerSchema>;
export type ReferenceFontAsset = z.infer<typeof referenceFontAssetSchema>;
export type ReferenceReconstructionSpecV2 = z.infer<typeof referenceSceneSchema>;

export const REFERENCE_RENDERER_VERSION = "reference-konva-v2";
export const REFERENCE_DECODER_VERSION = "design-dna-v2";

export function emptyReferenceLayer(kind: ReferenceSceneLayer["kind"], id: string): ReferenceSceneLayer {
  return {
    id, kind, role: kind === "text" || kind === "arcText" ? "annotation" : "decoration", zIndex: 0,
    x: 0, y: 0, width: 100, height: 30, text: kind === "text" || kind === "arcText" ? "Novo texto" : null,
    fontFamily: kind === "text" || kind === "arcText" ? "Arial" : null,
    fontWeight: 400, fontSize: 24, lineHeight: 1.15, letterSpacing: 0, align: "left",
    fill: "#222222", strokeColor: null, strokeWidth: 0, rotationDeg: 0, opacity: 1,
    points: kind === "line" ? [0, 0, 100, 0] : kind === "polygon" ? [0, 0, 100, 0, 100, 30, 0, 30] : [],
    arc: kind === "arcText" ? { centerX: 150, centerY: 150, radius: 100, startAngleDeg: -120, clockwise: true } : null,
    extrusion: null, confidenceScore: 0, provenance: "curator", support: "supported", uncertainty: null,
  };
}

export function referenceSceneIssues(scene: ReferenceReconstructionSpecV2): string[] {
  const issues = referenceSceneSchema.safeParse(scene);
  const result = issues.success ? [] : issues.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
  const ids = new Set<string>();
  for (const layer of scene.layers) {
    if (ids.has(layer.id)) result.push(`${layer.role}: ID de camada duplicado.`);
    ids.add(layer.id);
    if (layer.width < 0 || layer.height < 0) result.push(`${layer.role}: dimensões negativas.`);
    if ((layer.kind === "text" || layer.kind === "arcText") && !layer.text) result.push(`${layer.role}: texto sem transcrição.`);
    if (layer.kind === "arcText" && !layer.arc) result.push(`${layer.role}: texto em arco sem geometria.`);
    if ((layer.kind === "line" || layer.kind === "polygon") && layer.points.length < 4) result.push(`${layer.role}: caminho sem pontos suficientes.`);
    if (layer.support !== "supported") result.push(`${layer.role}: ${layer.support === "unsupported" ? "primitiva não suportada" : "ainda não confirmado"}.`);
    if (layer.uncertainty) result.push(`${layer.role}: ${layer.uncertainty}`);
    if (layer.x < -scene.source.widthPx || layer.y < -scene.source.heightPx || layer.x > 2 * scene.source.widthPx || layer.y > 2 * scene.source.heightPx) {
      result.push(`${layer.role}: posição muito distante da prancheta.`);
    }
  }
  if (scene.layers.length === 0) result.push("A receita não contém camadas.");
  return result;
}
