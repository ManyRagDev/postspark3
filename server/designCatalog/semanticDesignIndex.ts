import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { arsenalHash } from "@shared/arsenalContent";
import { neutralSourceText } from "@shared/familyNeutrality";
import type { ComponentCardV1 } from "@shared/componentAssembly";
import type { FrozenEditorialCatalog } from "@shared/editorialIntent";
import type { EmbeddingEngine, EmbeddingMetadata } from "../ai/editorialAffinity/embeddingEngine";

export const SEMANTIC_PROFILE_VERSION = "compact-design-en-v1";
export const SEMANTIC_MODEL = Object.freeze({
  modelId: "Xenova/multilingual-e5-small",
  revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
  dimensions: 384, dtype: "q8", maxTokens: 512,
  queryPrefix: "query: ", referencePrefix: "passage: ",
});
export const semanticTextHash = (text: string) => createHash("sha256").update(text).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/;
export interface SemanticEnglishProfile {
  sourceId: string;
  /** Exact compact descriptor projection; geometry changes alone need no retranslation. */
  sourceTextHash: string;
  textEn: string;
}
export interface SemanticCalibration {
  version: string;
  provenance: string;
  grandMean: number;
  queries: string[];
}
export interface SemanticIndexDocument extends SemanticEnglishProfile {
  sourceHash: string;
  profileHash: string;
  vector: number[];
  meanAffinity: number;
  genericExcess: number;
  rowHash: string;
}
export interface SemanticDesignIndex {
  version: 1;
  catalogRevision: string;
  editorialHash: string | null;
  profileVersion: typeof SEMANTIC_PROFILE_VERSION;
  model: Readonly<EmbeddingMetadata>;
  calibration: { version: string; hash: string; count: number; grandMean: number; provenance: string };
  documents: SemanticIndexDocument[];
  hash: string;
}
export function assertSemanticModel(model: Readonly<EmbeddingMetadata>) {
  if (Object.entries(SEMANTIC_MODEL).some(([key, value]) => model[key as keyof EmbeddingMetadata] !== value))
    throw new Error("semantic_design_model_mismatch");
}
export function assertSemanticVector(vector: readonly number[]) {
  if (vector.length !== 384 || vector.some(v => !Number.isFinite(v)) || Math.abs(Math.hypot(...vector) - 1) > 0.001)
    throw new Error("semantic_design_vector_invalid");
}
export async function embedCompactSemanticText(engine: EmbeddingEngine, text: string, kind: "query" | "reference", signal?: AbortSignal) {
  assertSemanticModel(engine.metadata);
  if (!text.trim() || text.length > 4000) throw new Error("semantic_design_text_invalid");
  // One compact E5 input, preserving the evaluated pooling/prefix contract. No
  // chunk averaging and no silent truncation of user requirements.
  const output = await engine.embed([text.normalize("NFC").trim()], {kind, overflow: "reject", signal});
  if (output.vectors.length !== 1 || output.inputs.length !== 1 || output.inputs[0].truncated)
    throw new Error("semantic_design_vector_invalid");
  const vector = Array.from(output.vectors[0]);
  assertSemanticVector(vector);
  return vector;
}
export async function readSemanticEnglishProfiles(path?: string): Promise<SemanticEnglishProfile[]> {
  const value = JSON.parse(await readFile(path ?? new URL("./data/semanticProfiles.json", import.meta.url), "utf8"));
  if (value.version !== SEMANTIC_PROFILE_VERSION || !Array.isArray(value.profiles)) throw new Error("semantic_design_profiles_invalid");
  return value.profiles;
}
export async function readSemanticCalibration(): Promise<SemanticCalibration> {
  return JSON.parse(await readFile(new URL("./data/semanticCalibration.json", import.meta.url), "utf8"));
}
export function semanticSourceDescriptor(card: ComponentCardV1, catalog: FrozenEditorialCatalog | null) {
  return {sourceId: card.id, sourceHash: card.hash, sourceTextHash: arsenalHash(neutralSourceText(card, catalog))};
}
export function validateSemanticDesignIndex(index: SemanticDesignIndex): SemanticDesignIndex {
  const { hash, ...basis } = index;
  assertSemanticModel(index.model);
  if (index.version !== 1 || index.profileVersion !== SEMANTIC_PROFILE_VERSION || !/^\d+$/.test(index.catalogRevision) ||
      hash !== arsenalHash(basis) || !hashPattern.test(index.model.fingerprint) ||
      !hashPattern.test(index.calibration.hash) || index.calibration.count !== 80 ||
      !Number.isFinite(index.calibration.grandMean) || Math.abs(index.calibration.grandMean) > 1 ||
      new Set(index.documents.map(d => d.sourceId)).size !== index.documents.length || !index.documents.length)
    throw new Error("semantic_design_index_invalid");
  for (const document of index.documents) {
    const { rowHash, ...row } = document;
    assertSemanticVector(row.vector);
    if (!hashPattern.test(row.sourceHash) || !hashPattern.test(row.sourceTextHash) ||
        row.profileHash !== semanticTextHash(row.textEn) || rowHash !== arsenalHash(row) ||
        !Number.isFinite(row.meanAffinity) || Math.abs(row.meanAffinity) > 1 ||
        Math.abs(row.genericExcess - Math.max(0, row.meanAffinity - index.calibration.grandMean)) > 1e-12)
      throw new Error("semantic_design_index_invalid");
  }
  return index;
}
/** Offline publication only. Requests embed a query, never catalogue documents. */
export async function buildSemanticDesignIndex(args: {
  revision: string;
  cards: ComponentCardV1[];
  catalog: FrozenEditorialCatalog | null;
  engine: EmbeddingEngine;
  profiles: SemanticEnglishProfile[];
  calibration: SemanticCalibration;
  previous?: SemanticDesignIndex;
}): Promise<SemanticDesignIndex> {
  assertSemanticModel(args.engine.metadata);
  const calibration = args.calibration;
  if (calibration.queries.length !== 80 || !calibration.version || !Number.isFinite(calibration.grandMean))
    throw new Error("semantic_design_calibration_invalid");
  const calibrationHash = arsenalHash(calibration);
  const profiles = new Map(args.profiles.map(p => [`${p.sourceId}:${p.sourceTextHash}`, p]));
  if (profiles.size !== args.profiles.length) throw new Error("semantic_design_profiles_invalid");
  const previous = args.previous ? validateSemanticDesignIndex(args.previous) : undefined;
  const compatiblePrevious = previous?.model.fingerprint === args.engine.metadata.fingerprint && previous.calibration.hash === calibrationHash;
  const cached = new Map(compatiblePrevious ? previous.documents.map(d => [d.profileHash, d]) : []);
  let calibrationVectors: number[][] | undefined;
  const documents: SemanticIndexDocument[] = [];
  const roots = args.cards.filter(c => c.completeDesign && !c.completeDesign.designGuidance?.carouselVariant).sort((a,b) => a.id.localeCompare(b.id));
  for (const card of roots) {
    const source = semanticSourceDescriptor(card, args.catalog);
    const profile = profiles.get(`${source.sourceId}:${source.sourceTextHash}`);
    if (!profile?.textEn.trim() || profile.textEn.length > 1800) throw new Error(`semantic_design_english_profile_missing:${source.sourceId}`);
    const textEn = profile.textEn.normalize("NFC").trim();
    const profileHash = semanticTextHash(textEn);
    let encoded = cached.get(profileHash);
    if (!encoded) {
      const vector = await embedCompactSemanticText(args.engine, textEn, "reference");
      if (!calibrationVectors) {
        calibrationVectors = [];
        for (const query of calibration.queries) calibrationVectors.push(await embedCompactSemanticText(args.engine, query, "query"));
      }
      const meanAffinity = calibrationVectors.reduce((total, query) => total + query.reduce((sum, v, i) => sum + v * vector[i], 0), 0) / calibrationVectors.length;
      encoded = { vector, meanAffinity } as SemanticIndexDocument;
    }
    const row = {...source, textEn, profileHash, vector: encoded.vector, meanAffinity: encoded.meanAffinity,
      genericExcess: Math.max(0, encoded.meanAffinity - calibration.grandMean)};
    documents.push({...row, rowHash: arsenalHash(row)});
  }
  const basis = {version: 1 as const, catalogRevision: args.revision, editorialHash: args.catalog?.hash ?? null,
    profileVersion: SEMANTIC_PROFILE_VERSION as typeof SEMANTIC_PROFILE_VERSION, model: args.engine.metadata,
    calibration: {version: calibration.version, hash: calibrationHash, count: calibration.queries.length, grandMean: calibration.grandMean, provenance: calibration.provenance}, documents};
  return validateSemanticDesignIndex({...basis, hash: arsenalHash(basis)});
}

export async function prepareSemanticCatalogIndex(revision: string, options: {
  engine?: EmbeddingEngine; profiles?: SemanticEnglishProfile[]; previous?: SemanticDesignIndex;
} = {}) {
  const [{readCatalogSnapshot}, {readEditorialCatalog}, {searchEngine}] = await Promise.all([
    import("./versionedCatalog"), import("./editorialCatalog"), import("./familySearchIndex"),
  ]);
  const {componentCardV1Schema} = await import("@shared/componentAssembly");
  const [snapshot, catalog, engine, profiles, calibration] = await Promise.all([
    readCatalogSnapshot(revision), readEditorialCatalog(revision), options.engine ?? searchEngine(),
    options.profiles ?? readSemanticEnglishProfiles(), readSemanticCalibration(),
  ]);
  const cards = snapshot.rows.filter(r => ["approved", "draft"].includes(r.design_components.status))
    .map(r => componentCardV1Schema.parse(r.card));
  return buildSemanticDesignIndex({revision, cards, catalog, engine, profiles, calibration, previous: options.previous});
}
