import type { VariableContentContract } from "./variableContent";
import { z } from "zod";
import {
  arsenalAssetSchema,
  arsenalPieceSchema,
  pinnedCandidateV2Schema,
  catalogBundleV2Schema,
  type CatalogBundleV2,
  type PinnedCandidateV2,
  type ArsenalAsset,
  type PieceDefinitionV2,
} from "./designArsenal";
import {
  arsenalHash,
  designContentGenerationSchema,
  readContentSource,
  contentCoverageIssues,
  type DesignContent,
} from "./arsenalContent";

/** Backend-resolved offer. Only the compact card goes to the language model. */
export const arsenalOfferSchema = z
  .object({
    candidate: pinnedCandidateV2Schema,
    name: z.string().min(1).max(160),
    description: z.string().max(800),
    pieces: z.record(z.string().regex(/^[a-f0-9]{64}$/), arsenalPieceSchema),
    assets: z.array(arsenalAssetSchema).max(20),
  })
  .strict();
export type ArsenalOffer = z.infer<typeof arsenalOfferSchema>;

export const arsenalCopySchema = z
  .object({
    content: designContentGenerationSchema,
    designCandidateId: z.string().min(1),
    tone: z.string().min(1),
    imagePrompt: z.string(),
    backgroundColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    textColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    accentColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    layout: z.enum(["centered", "left-aligned", "split", "minimal"]),
    aspectRatio: z.enum(["1:1", "4:5", "5:6", "9:16"]),
    copyAngle: z
      .object({
        type: z.enum([
          "dor",
          "beneficio",
          "objecao",
          "autoridade",
          "escassez",
          "storytelling",
          "mito_vs_verdade",
        ]),
        label: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type ArsenalCopy = z.infer<typeof arsenalCopySchema>;

export function arsenalCard(offer: ArsenalOffer) {
  const { candidate: c } = offer;
  return {
    candidateId: c.candidateId,
    name: offer.name,
    description: offer.description,
    aspectRatio: c.variant.aspectRatio,
    fields: c.variant.bindings.map(b => ({
      source: b.source,
      required: b.required,
      cardinality: b.cardinality,
    })),
    limitations: c.variant.limitations,
  };
}

/** Both server selection and browser attempts apply the same content contract. */
export function arsenalCompatibility(
  candidate: PinnedCandidateV2,
  content: DesignContent,
  aspectRatio: CatalogBundleV2["targetAspectRatio"],
  hasMedia = false
): string[] {
  const issues: string[] = [];
  const v = candidate.variant;
  const capabilities = new Set([
    "text",
    "rect",
    "line",
    "polygon",
    "media",
    "groups",
    "relations",
  ]);
  if (v.capabilities.some(cap => !capabilities.has(cap)))
    issues.push("unsupported_capability");
  if (v.aspectRatio !== aspectRatio) issues.push("unsupported_format");
  // Until a reviewed no-media alternative has its own variant, every media
  // element needs an actual image. Optional empty boxes are not finished posts.
  if (v.bindings.some(b => b.kind === "media" && b.targetIds.some(id => !v.mediaSlots?.some(slot => slot.id === id && slot.deferred))) && !hasMedia)
    issues.push("missing_media");
  issues.push(...contentCoverageIssues(content, v.bindings));
  for (const b of v.bindings) {
    if (b.source === "media.primary") continue;
    const value = readContentSource(content, b.source);
    if (
      b.required &&
      !(Array.isArray(value) ? value.length : value.trim().length)
    )
      issues.push(`required_content:${b.source}`);
    if (
      b.kind === "list" &&
      b.cardinality &&
      Array.isArray(value) &&
      (value.length < b.cardinality.min || value.length > b.cardinality.max)
    )
      issues.push(`cardinality:${b.source}`);
  }
  return issues;
}

export function createArsenalBundle(input: {
  offers: ArsenalOffer[];
  copy: ArsenalCopy;
  traceId: string;
  runId: string;
  slot: number;
  usedCandidateIds: string[];
  contentContract?: VariableContentContract;
}): CatalogBundleV2 {
  const { copy } = input;
  const compatible = input.offers.filter(
    o =>
      arsenalCompatibility(o.candidate, copy.content, copy.aspectRatio)
        .length === 0
  );
  compatible.sort(
    (a, b) =>
      Number(b.candidate.candidateId === copy.designCandidateId) -
        Number(a.candidate.candidateId === copy.designCandidateId) ||
      Number(input.usedCandidateIds.includes(a.candidate.candidateId)) -
        Number(input.usedCandidateIds.includes(b.candidate.candidateId))
  );
  const selected =
    copy.designCandidateId === "none" ? [] : compatible.slice(0, 3);
  while (true) {
    const pieces: Record<string, PieceDefinitionV2> = {};
    const assets = new Map<string, ArsenalAsset>();
    for (const offer of selected) {
      for (const i of offer.candidate.variant.instances)
        pieces[i.pieceHash] = offer.pieces[i.pieceHash];
      for (const id of offer.candidate.variant.assetIds) {
        const asset = offer.assets.find(a => a.id === id);
        if (asset) assets.set(id, asset);
      }
    }
    const bundle: CatalogBundleV2 = {
      schemaVersion: 2,
      traceId: input.traceId,
      runId: input.runId,
      slot: input.slot,
      content: copy.content,
      contentContract: input.contentContract,
      userContentHash: arsenalHash(copy.content),
      targetAspectRatio: copy.aspectRatio,
      selection: !selected.length
        ? "none"
        : selected[0].candidate.candidateId === copy.designCandidateId
          ? "llm"
          : "ranked_fallback",
      candidates: selected.map(o => o.candidate),
      pieces,
      assets: Array.from(assets.values()),
    };
    if (
      assets.size <= 20 &&
      new TextEncoder().encode(JSON.stringify(bundle)).byteLength <= 512 * 1024
    )
      return catalogBundleV2Schema.parse(bundle);
    if (!selected.length) throw new Error("bundle_too_large");
    selected.pop();
  }
}

export const arsenalCompilationReportSchema = z
  .object({
    traceId: z.string().uuid(),
    runId: z.string().uuid(),
    slot: z.number().int().min(0).max(2),
    materializationId: z.string().uuid(),
    userContentHash: z.string().regex(/^[a-f0-9]{64}$/),
    selectedCandidateId: z.string().max(240).nullable(),
    status: z.enum(["applied", "adapted", "fallback", "needs_adjustment"]),
    durationMs: z.number().min(0).max(300000),
    attempts: z
      .array(
        z
          .object({
            candidateId: z.string().max(240),
            policy: z.enum(["normal", "adapt"]),
            reasons: z.array(z.string().max(160)).max(16),
            durationMs: z.number().min(0).max(300000),
          })
          .strict()
      )
      .max(6),
  })
  .strict();
export type ArsenalCompilationReport = z.infer<
  typeof arsenalCompilationReportSchema
>;
