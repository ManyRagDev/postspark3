import { z } from "zod";
import { arsenalHash } from "./arsenalContent";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const intentId = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/);
export const editorialIntentDefinitionSchema = z.object({
  id: intentId,
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(800),
}).strict();
export const editorialCatalogDocumentSchema = z.object({
  version: z.literal(1),
  intents: z.array(editorialIntentDefinitionSchema).max(500),
  designs: z.array(z.object({
    sourceId: z.string().uuid(), sourceHash: hash,
    intentIds: z.array(intentId).min(1).max(50),
    rationale: z.string().min(1).max(1200),
  }).strict()).max(2000),
}).strict().superRefine((value, ctx) => {
  const ids = new Set(value.intents.map(i => i.id));
  if (ids.size !== value.intents.length || new Set(value.designs.map(d => d.sourceId)).size !== value.designs.length)
    ctx.addIssue({ code: "custom", message: "Duplicate editorial identity" });
  for (const design of value.designs)
    if (new Set(design.intentIds).size !== design.intentIds.length || design.intentIds.some(id => !ids.has(id)))
      ctx.addIssue({ code: "custom", message: "Unknown or duplicate design intention" });
});
export type EditorialCatalogDocument = z.infer<typeof editorialCatalogDocumentSchema>;
export function canonicalizeEditorialCatalogDocument(value: EditorialCatalogDocument): EditorialCatalogDocument {
  const parsed = editorialCatalogDocumentSchema.parse(value);
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return { ...parsed,
    intents: [...parsed.intents].sort((a, b) => compare(a.id, b.id)),
    designs: parsed.designs.map(d => ({ ...d, intentIds: [...d.intentIds].sort(compare) })).sort((a, b) => compare(a.sourceId, b.sourceId)),
  };
}
export const editorialCatalogHash = (value: EditorialCatalogDocument) => arsenalHash(canonicalizeEditorialCatalogDocument(value));
export const frozenEditorialCatalogSchema = z.object({
  version: z.literal(1), catalogRevision: z.string().regex(/^[1-9]\d*$/),
  revision: z.string().uuid(), hash,
  document: editorialCatalogDocumentSchema,
}).strict().superRefine((value, ctx) => {
  if (value.hash !== editorialCatalogHash(value.document))
    ctx.addIssue({ code: "custom", message: "Editorial catalog hash mismatch" });
});
export type FrozenEditorialCatalog = z.infer<typeof frozenEditorialCatalogSchema>;

/** Sparse by design: absence means unspecified, never prohibition or low quality. */
export const editorialIntentReadingSchema = z.object({
  version: z.literal(1),
  signals: z.array(z.object({
    intentId,
    state: z.enum(["requested", "suggested", "forbidden"]),
    origin: z.enum(["explicit", "inferred"]),
    clarity: z.enum(["clear", "indicative"]),
    requestQuote: z.string().min(1).max(2000).nullable(),
    rationale: z.string().min(1).max(800),
  }).strict()).max(50),
}).strict();
export type EditorialIntentReading = z.infer<typeof editorialIntentReadingSchema>;

/** Evidence comes from this request, never from a retrieved site's instructions. */
export function editorialRequestEvidence(input: { content: string; tone?: string; executionBrief?: {
  rawInput?: string; notes?: string; callToAction?: string; tone?: string; audience?: string; objective?: string;
  contentRequirements?: Array<{ value: string }>; slides?: Array<{ rawText: string }>;
  mustInclude?: string[]; mustKeep?: string[]; forbiddenTerms?: string[];
} }): string {
  const brief = input.executionBrief;
  return [input.content, input.tone, brief?.rawInput, brief?.notes, brief?.callToAction, brief?.tone,
    brief?.audience, brief?.objective, ...(brief?.contentRequirements?.map(r => r.value) ?? []),
    ...(brief?.slides?.map(s => s.rawText) ?? []), ...(brief?.mustInclude ?? []), ...(brief?.mustKeep ?? []),
    ...(brief?.forbiddenTerms ?? []),
  ].filter(Boolean).join("\n");
}

export function validateEditorialIntent(reading: EditorialIntentReading, catalog: FrozenEditorialCatalog | null, requestText: string): string[] {
  const ids = new Set(catalog?.document.intents.map(i => i.id) ?? []);
  const seen = new Set<string>();
  const quote = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
  const problems: string[] = [];
  for (const signal of reading.signals) {
    if (!ids.has(signal.intentId)) problems.push(`unknown_editorial_intent:${signal.intentId}`);
    if (seen.has(signal.intentId)) problems.push(`duplicate_editorial_intent:${signal.intentId}`);
    seen.add(signal.intentId);
    if (signal.origin === "explicit" && (!signal.requestQuote || !quote(signal.requestQuote) || !quote(requestText).includes(quote(signal.requestQuote))))
      problems.push(`editorial_quote:${signal.intentId}`);
    if (signal.origin === "inferred" && (signal.state !== "suggested" || signal.clarity !== "indicative" || signal.requestQuote !== null))
      problems.push(`editorial_inference:${signal.intentId}`);
    if (signal.state === "forbidden" && (signal.origin !== "explicit" || signal.clarity !== "clear"))
      problems.push(`editorial_prohibition:${signal.intentId}`);
  }
  return problems;
}

export const editorialDesignProfileSchema = z.object({
  catalogHash: hash,
  intents: z.array(editorialIntentDefinitionSchema),
  rationale: z.string().min(1).max(1200),
}).strict();

/** Capability is positive affinity, not a claim that every matching post uses it. */
export function combineEditorialDesignProfile<T extends object>(profile: T, catalog: FrozenEditorialCatalog | null, sourceId: string, sourceHash: string): T & { editorial?: z.infer<typeof editorialDesignProfileSchema> } {
  const design = catalog?.document.designs.find(d => d.sourceId === sourceId && d.sourceHash === sourceHash);
  if (!catalog || !design) return profile;
  const ids = new Set(design.intentIds);
  return { ...profile, editorial: {
    catalogHash: catalog.hash,
    intents: catalog.document.intents.filter(i => ids.has(i.id)),
    rationale: design.rationale,
  } };
}

export const editorialIntentInstructions = "Classifique também a intencionalidade editorial usando SOMENTE os IDs e definições de editorialVocabulary. Retorne editorial={version:1,signals:[...]}. Registre apenas o que encontrar: requested para pedido explícito, suggested para possibilidade contextual e forbidden apenas para proibição explícita. origin=explicit exige requestQuote literal do pedido; origin=inferred exige state=suggested, clarity=indicative e requestQuote=null. clarity=clear indica leitura inequívoca, indicative indica sinal parcial; não é probabilidade calibrada. Intenções omitidas estão não especificadas e são neutras. Um pedido curto pode ser claro sobre comparação ou pontos negativos e deixar todo o resto aberto. Não deduza proibição pela ausência, tema, tamanho do prompt ou perfil do usuário; não force uma família. Proibições são específicas: 'sem comparação' não significa 'sem crítica'. Se o vocabulário estiver vazio, retorne signals=[]. Esses sinais não criam requirements nem fatos adicionais.";

export const editorialSelectionGuidance = "Compare os sinais editoriais com as capacidades documentadas de cada design. requested favorece compatibilidade; suggested é preferência leve; ausente é neutro. forbidden restringe a abordagem pedida, não elimina automaticamente um layout que também suporta outras intenções. Não obrigue um pedido a usar todas as capacidades do design. Clareza é qualitativa, não probabilidade. Preserve os requisitos explícitos e a estrutura/capacidade real.";
