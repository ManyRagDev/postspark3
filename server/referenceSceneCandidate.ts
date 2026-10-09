import { createHash } from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { z } from "zod";
import {
  REFERENCE_DECODER_VERSION,
  REFERENCE_RENDERER_VERSION,
  referenceSceneIssues,
  type ReferenceReconstructionSpecV2,
} from "@shared/referenceReconstruction";
import type { ReferenceOcrResult } from "./referenceOcr";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const finite = z.number().finite();
const rawLayerSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["text", "arcText", "rect", "line", "polygon"]),
  role: z.string().min(1).max(80),
  zIndex: z.number().int().min(-1000).max(1000),
  x: finite, y: finite, width: finite, height: finite,
  text: z.string().max(1200).nullable(),
  fontFamily: z.string().max(120).nullable(),
  fontWeight: z.number().int().min(100).max(900),
  fontSize: z.number().min(1).max(2000),
  lineHeight: z.number().min(0.5).max(3),
  letterSpacing: z.number().min(-50).max(100),
  align: z.enum(["left", "center", "right"]),
  fill: hex,
  strokeColor: hex.nullable(),
  strokeWidth: z.number().min(0).max(100),
  rotationDeg: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1),
  points: z.array(finite).max(200),
  arc: z.object({
    centerX: finite, centerY: finite, radius: z.number().positive(),
    startAngleDeg: finite, clockwise: z.boolean(),
  }).strict().nullable(),
  extrusion: z.object({
    color: hex, offsetX: finite, offsetY: finite, steps: z.number().int().min(1).max(80),
  }).strict().nullable(),
  confidenceScore: z.number().min(0).max(1),
  uncertainty: z.string().max(240).nullable(),
}).strict();

export const rawSceneSchema = z.object({
  background: hex,
  layers: z.array(rawLayerSchema).max(100),
}).strict();

const colorSchema = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
const numberSchema = { type: "number" };
const arcSchema = {
  type: "object",
  properties: {
    centerX: numberSchema, centerY: numberSchema, radius: { type: "number", exclusiveMinimum: 0 },
    startAngleDeg: numberSchema, clockwise: { type: "boolean" },
  },
  required: ["centerX", "centerY", "radius", "startAngleDeg", "clockwise"],
  additionalProperties: false,
};
const extrusionSchema = {
  type: "object",
  properties: {
    color: colorSchema, offsetX: numberSchema, offsetY: numberSchema,
    steps: { type: "integer", minimum: 1, maximum: 80 },
  },
  required: ["color", "offsetX", "offsetY", "steps"],
  additionalProperties: false,
};
const layerProperties = {
  id: { type: "string", maxLength: 80 },
  kind: { type: "string", enum: ["text", "arcText", "rect", "line", "polygon"] },
  role: { type: "string", maxLength: 80 },
  zIndex: { type: "integer", minimum: -1000, maximum: 1000 },
  x: numberSchema, y: numberSchema, width: numberSchema, height: numberSchema,
  text: { anyOf: [{ type: "string", maxLength: 1200 }, { type: "null" }] },
  fontFamily: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
  fontWeight: { type: "integer", minimum: 100, maximum: 900 },
  fontSize: { type: "number", minimum: 1, maximum: 2000 },
  lineHeight: { type: "number", minimum: 0.5, maximum: 3 },
  letterSpacing: { type: "number", minimum: -50, maximum: 100 },
  align: { type: "string", enum: ["left", "center", "right"] },
  fill: colorSchema,
  strokeColor: { anyOf: [colorSchema, { type: "null" }] },
  strokeWidth: { type: "number", minimum: 0, maximum: 100 },
  rotationDeg: { type: "number", minimum: -360, maximum: 360 },
  opacity: { type: "number", minimum: 0, maximum: 1 },
  points: { type: "array", items: numberSchema, maxItems: 200 },
  arc: { anyOf: [arcSchema, { type: "null" }] },
  extrusion: { anyOf: [extrusionSchema, { type: "null" }] },
  confidenceScore: { type: "number", minimum: 0, maximum: 1 },
  uncertainty: { anyOf: [{ type: "string", maxLength: 240 }, { type: "null" }] },
};

export const SCENE_CANDIDATE_JSON_SCHEMA = {
  type: "object",
  properties: {
    background: colorSchema,
    layers: {
      type: "array", maxItems: 100,
      items: {
        type: "object", properties: layerProperties,
        required: Object.keys(layerProperties), additionalProperties: false,
      },
    },
  },
  required: ["background", "layers"],
  additionalProperties: false,
};

export function makeReferenceScene(input: {
  raw: z.infer<typeof rawSceneSchema>;
  imageBytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
}): ReferenceReconstructionSpecV2 {
  return {
    schemaVersion: 2,
    source: {
      widthPx: input.width, heightPx: input.height, mimeType: input.mimeType,
      preparedHash: createHash("sha256").update(input.imageBytes).digest("hex"),
      originalHash: null,
    },
    artboard: { background: input.raw.background },
    layers: input.raw.layers.map(layer => ({
      ...layer,
      provenance: "multimodal" as const,
      support: layer.uncertainty ? "unknown" as const : "supported" as const,
    })),
    fonts: [],
    warnings: [],
    decoderVersion: REFERENCE_DECODER_VERSION,
    rendererVersion: REFERENCE_RENDERER_VERSION,
  };
}

function rgb(hexValue: string): [number, number, number] {
  return [1, 3, 5].map(index => Number.parseInt(hexValue.slice(index, index + 2), 16)) as [number, number, number];
}

export async function measureReferenceScene(imageBytes: Buffer, scene: ReferenceReconstructionSpecV2, ocr?: ReferenceOcrResult): Promise<{
  status: "plausible" | "needs_review" | "invalid";
  issues: string[];
  uncoveredForegroundRatio: number;
  backgroundDelta: number;
}> {
  const issues = referenceSceneIssues(scene);
  const image = await loadImage(imageBytes);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  const background = rgb(scene.artboard.background);
  let foreground = 0;
  let uncovered = 0;
  let cornerDelta = 0;
  let corners = 0;
  const stride = Math.max(3, Math.round(Math.min(image.width, image.height) / 140));
  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const index = (y * image.width + x) * 4;
      const delta = (Math.abs(pixels[index] - background[0]) + Math.abs(pixels[index + 1] - background[1]) + Math.abs(pixels[index + 2] - background[2])) / 765;
      if ((x < image.width * 0.06 || x > image.width * 0.94) && (y < image.height * 0.06 || y > image.height * 0.94)) {
        cornerDelta += delta;
        corners += 1;
      }
      if (delta < 0.18) continue;
      foreground += 1;
      if (!scene.layers.some(layer => {
        const margin = Math.max(4, layer.strokeWidth + Math.abs(layer.extrusion?.offsetX ?? 0) + Math.abs(layer.extrusion?.offsetY ?? 0));
        return x >= layer.x - margin && x <= layer.x + layer.width + margin && y >= layer.y - margin && y <= layer.y + layer.height + margin;
      })) uncovered += 1;
    }
  }
  const uncoveredForegroundRatio = foreground ? uncovered / foreground : 0;
  const backgroundDelta = corners ? cornerDelta / corners : 0;
  if (uncoveredForegroundRatio > 0.12) issues.push(`${Math.round(uncoveredForegroundRatio * 100)}% dos pixels de primeiro plano ficam fora das camadas descritas.`);
  if (backgroundDelta > 0.16) issues.push("A cor de fundo proposta diverge das margens da referência.");
  if (ocr?.status === "completed") {
    for (const line of ocr.lines.filter(item => item.confidence >= 0.65 && item.text.length >= 3)) {
      const matchingLayer = scene.layers.find(layer => {
        if (layer.kind !== "text" && layer.kind !== "arcText") return false;
        const left = Math.max(line.box.x, layer.x);
        const top = Math.max(line.box.y, layer.y);
        const right = Math.min(line.box.x + line.box.width, layer.x + layer.width);
        const bottom = Math.min(line.box.y + line.box.height, layer.y + layer.height);
        return Math.max(0, right - left) * Math.max(0, bottom - top) >= line.box.width * line.box.height * 0.3;
      });
      if (!matchingLayer) issues.push(`OCR encontrou texto sem camada correspondente em (${Math.round(line.box.x)}, ${Math.round(line.box.y)}): “${line.text.slice(0, 60)}”.`);
    }
  } else if (ocr?.warning) {
    issues.push(ocr.warning.slice(0, 200));
  }
  for (const layer of scene.layers) {
    if (layer.kind === "text" && layer.role.toLowerCase().includes("headline") && !layer.text?.includes("\n") && layer.height > image.height * 0.4) {
      issues.push(`${layer.role}: um bloco alto sem quebras explícitas pode esconder linhas independentes.`);
    }
  }
  return {
    status: issues.some(issue => issue.includes("duplicado") || issue.includes("sem")) ? "invalid" : issues.length ? "needs_review" : "plausible",
    issues,
    uncoveredForegroundRatio: Number(uncoveredForegroundRatio.toFixed(3)),
    backgroundDelta: Number(backgroundDelta.toFixed(3)),
  };
}
