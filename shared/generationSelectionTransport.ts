import { arsenalHash } from "./arsenalContent";
import type { CompactOfferProfileV3 } from "./compactDesignProfile";
import type { completeDesignFields } from "./completeDesignGeneration";

export interface GenerationSelectionCandidate {
  candidateId: string;
  profile: CompactOfferProfileV3;
  suitability: {
    id: string;
    hash: string;
    score: number;
    confidence: number;
  } | null;
  fields: Record<string, ReturnType<typeof completeDesignFields>>;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const TEXT_REF = "$selectionText";
const LITERAL = "$selectionLiteral";
const VALUE_REF = "$selectionValue";
const minSharedTextBytes = 80;
const utf8 = new TextEncoder();

export const generationSelectionTransportLegend =
  "Selection catalog transport v1: candidates retain their family common/variant hierarchy. " +
  'An object {"$selectionText":"tN"} means the exact text stored at sharedTexts.tN, in the same original position and with the same meaning and authority. ' +
  "Each candidate.fields maps componentId to a fieldContracts key; resolve that contract for its real field IDs, sources, kinds, required flags and cardinalities. " +
  "References share identical data only: they do not merge capacities, change field ownership or add requirements. Arrays retain their order. " +
  "All other profile values are literal. $selectionLiteral escapes an original object whose keys resemble a reference. " +
  "canonicalHash identifies the complete original catalog for audit; it is not a writing field. Apply profileLegend after resolving references.";

export interface GenerationSelectionCatalogTransportV1 {
  encoding: "selection_catalog_v1";
  legend: string;
  canonicalHash: string;
  sharedTexts: Record<string, string>;
  fieldContracts: Record<string, ReturnType<typeof completeDesignFields>>;
  candidates: Array<{
    candidateId: string;
    profile: Json;
    suitability: GenerationSelectionCandidate["suitability"];
    fields: Record<string, string>;
  }>;
}

export interface GenerationSelectionCatalogTransportV2 extends Omit<GenerationSelectionCatalogTransportV1, "encoding"> {
  encoding: "selection_catalog_v2";
  sharedValues: Record<string, Json>;
}
export type GenerationSelectionCatalogTransport = GenerationSelectionCatalogTransportV1 | GenerationSelectionCatalogTransportV2;

const own = (object: object, key: string) =>
  Object.prototype.hasOwnProperty.call(object, key);
const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Wire-only factoring. No catalog semantics, provenance or wording are filtered. */
export function encodeGenerationSelectionCatalog(
  catalog: GenerationSelectionCandidate[],
  encoding: 1 | 2 = 1
): GenerationSelectionCatalogTransport {
  // Match the existing JSON transport: absent optional properties stay absent.
  const canonical = jsonCopy(catalog);
  const counts = new Map<string, number>();
  const count = (value: Json): void => {
    if (typeof value === "string") {
      if (utf8.encode(value).length >= minSharedTextBytes)
        counts.set(value, (counts.get(value) ?? 0) + 1);
    } else if (Array.isArray(value)) value.forEach(count);
    else if (value && typeof value === "object")
      Object.values(value).forEach(count);
  };
  canonical.forEach(candidate => count(candidate.profile as unknown as Json));
  const sharedTexts: Record<string, string> = {};
  const textIds = new Map<string, string>();
  for (const [value, occurrences] of Array.from(counts)) {
    if (occurrences < 2) continue;
    const id = `t${textIds.size}`;
    textIds.set(value, id);
    sharedTexts[id] = value;
  }
  const encodeObject = (value: { [key: string]: Json }): Json =>
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encode(item)])
    );
  const encode = (value: Json): Json => {
    if (typeof value === "string") {
      const id = textIds.get(value);
      return id === undefined ? value : { [TEXT_REF]: id };
    }
    if (Array.isArray(value)) return value.map(encode);
    if (!value || typeof value !== "object") return value;
    const encoded = encodeObject(value);
    // A literal object can never be mistaken for one of our transport tags.
    return own(value, TEXT_REF) || own(value, LITERAL) || encoding === 2 && own(value, VALUE_REF)
      ? { [LITERAL]: encoded }
      : encoded;
  };
  const fieldContracts: GenerationSelectionCatalogTransportV1["fieldContracts"] =
    {};
  const contractIds = new Map<string, string>();
  const candidates = canonical.map(candidate => ({
    candidateId: candidate.candidateId,
    profile: encode(candidate.profile as unknown as Json),
    suitability: candidate.suitability,
    fields: Object.fromEntries(
      Object.entries(candidate.fields).map(([componentId, fields]) => {
        const hash = arsenalHash(fields);
        let id = contractIds.get(hash);
        if (id === undefined) {
          id = `f${contractIds.size}`;
          contractIds.set(hash, id);
          fieldContracts[id] = fields;
        }
        return [componentId, id];
      })
    ),
  }));
  const transport: GenerationSelectionCatalogTransportV1 = {
    encoding: "selection_catalog_v1",
    legend: generationSelectionTransportLegend,
    canonicalHash: arsenalHash(canonical),
    sharedTexts,
    fieldContracts,
    candidates,
  };
  if (encoding === 1) return transport;
  // Factor exact structured values too; every original relationship is retained.
  const occurrences = new Map<string, number>();
  const eligible = (value: Json) => value && typeof value === "object" &&
    !own(value, TEXT_REF) && !own(value, LITERAL) && utf8.encode(JSON.stringify(value)).length >= 180;
  const countValues = (value: Json): void => {
    if (eligible(value)) {
      const key = JSON.stringify(value);
      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    }
    if (Array.isArray(value)) value.forEach(countValues);
    else if (value && typeof value === "object") Object.values(value).forEach(countValues);
  };
  candidates.forEach(c => countValues(c.profile));
  const sharedValues: Record<string, Json> = {}, ids = new Map<string, string>();
  const factorChildren = (value: Json): Json => Array.isArray(value) ? value.map(factor)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, factor(v)])) : value;
  const factor = (value: Json): Json => {
    // Preserve the literal object's root: its tag-like keys are user data.
    if (value && !Array.isArray(value) && typeof value === "object" && own(value, LITERAL))
      return { [LITERAL]: factorChildren(value[LITERAL]) };
    const key = eligible(value) ? JSON.stringify(value) : "";
    if ((occurrences.get(key) ?? 0) > 1) {
      let id = ids.get(key);
      if (!id) { id = `s${ids.size}`; ids.set(key, id); sharedValues[id] = factorChildren(value); }
      return { [VALUE_REF]: id };
    }
    return factorChildren(value);
  };
  return { ...transport, encoding: "selection_catalog_v2", sharedValues,
    legend: `${transport.legend.replace("All other profile values are literal.", "Other profile values are literal except for the structured references described below.")} Structured catalog v2: {"${VALUE_REF}":"sN"} resolves to the exact object or array at sharedValues.sN, recursively. Preserve its original position, field ownership and authority.`,
    candidates: candidates.map(c => ({ ...c, profile: factor(c.profile) })),
  };
}

/** Used by verification/audit; generation still validates against canonical V3. */
export function decodeGenerationSelectionCatalog(
  transport: GenerationSelectionCatalogTransport
): GenerationSelectionCandidate[] {
  if (transport.encoding !== "selection_catalog_v1" && transport.encoding !== "selection_catalog_v2")
    throw new Error("selection_catalog_encoding_unsupported");
  const decodeObject = (value: { [key: string]: Json }): Json =>
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, decode(item)])
    );
  const resolving = new Set<string>();
  const decode = (value: Json): Json => {
    if (Array.isArray(value)) return value.map(decode);
    if (!value || typeof value !== "object") return value;
    if (own(value, LITERAL)) {
      const literal = value[LITERAL];
      if (
        Object.keys(value).length !== 1 ||
        !literal ||
        typeof literal !== "object" ||
        Array.isArray(literal)
      )
        throw new Error("selection_catalog_literal_invalid");
      return decodeObject(literal);
    }
    if (own(value, TEXT_REF)) {
      const id = value[TEXT_REF];
      if (
        Object.keys(value).length !== 1 ||
        typeof id !== "string" ||
        !own(transport.sharedTexts, id)
      )
        throw new Error("selection_catalog_text_reference_invalid");
      return transport.sharedTexts[id];
    }
    if (transport.encoding === "selection_catalog_v2" && own(value, VALUE_REF)) {
      const id = value[VALUE_REF];
      if (Object.keys(value).length !== 1 || typeof id !== "string" || !own(transport.sharedValues, id) || resolving.has(id))
        throw new Error("selection_catalog_value_reference_invalid");
      resolving.add(id);
      try { return decode(transport.sharedValues[id]); } finally { resolving.delete(id); }
    }
    return decodeObject(value);
  };
  const catalog = transport.candidates.map(candidate => ({
    candidateId: candidate.candidateId,
    profile: decode(candidate.profile) as unknown as CompactOfferProfileV3,
    suitability: candidate.suitability,
    fields: Object.fromEntries(
      Object.entries(candidate.fields).map(([componentId, id]) => {
        if (!own(transport.fieldContracts, id))
          throw new Error("selection_catalog_field_reference_invalid");
        return [componentId, jsonCopy(transport.fieldContracts[id])];
      })
    ),
  }));
  if (arsenalHash(catalog) !== transport.canonicalHash)
    throw new Error("selection_catalog_hash_mismatch");
  return catalog;
}
