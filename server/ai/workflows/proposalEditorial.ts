import { z } from "zod";
import type { ProposalExecutionInput } from "./proposalGraph";
import type { ProposalReviewFinding } from "@shared/proposalReview";
import { narrativeSlideRole } from "@shared/carouselNarrative";

/** Kept in the paid copy response/journal, not a second post document. */
const editorialPlanV1Schema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["compose", "literal"]),
    centralMessage: z.string().min(1).max(1500),
    facts: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            sourceQuote: z.string().min(1).max(1500),
            meaning: z
              .string()
              .min(1)
              .max(1000)
              .describe(
                "Uma afirmação factual atômica; não reunir diferenciais independentes em um mesmo fato."
              ),
          })
          .strict()
      )
      .max(16),
    protectedEntities: z
      .array(
        z
          .object({
            value: z.string().min(1).max(200),
            sourceQuote: z.string().min(1).max(1500),
          })
          .strict()
      )
      .max(20),
    slides: z
      .array(
        z
          .object({
            slideIndex: z.number().int().min(0).max(9),
            purpose: z.string().min(1).max(1000),
            factIds: z.array(z.string().min(1).max(80)).max(16),
          })
          .strict()
      )
      .min(1)
      .max(10),
  })
  .strict();
export const narrativeEditorialPlanSchema = editorialPlanV1Schema.extend({
  version: z.literal(2),
  mode: z.literal("compose"),
  slides: z
    .array(
      z
        .object({
          slideIndex: z.number().int().min(0).max(9),
          role: z.enum(["cover", "development", "closing"]),
          purpose: z.string().min(1).max(1000),
          factIds: z.array(z.string().min(1).max(80)).max(16),
          readerTakeaway: z.string().min(1).max(1000),
          bridgeFromPrevious: z.string().max(1000),
        })
        .strict()
    )
    .min(2)
    .max(10),
});
/** Completed V1 journals stay readable; fresh composed carousels use V2. */
export const editorialPlanSchema = z.discriminatedUnion("version", [
  editorialPlanV1Schema,
  narrativeEditorialPlanSchema,
]);
export type EditorialPlan = z.infer<typeof editorialPlanSchema>;
export interface EditorialCopy {
  caption: string;
  hashtags: string[];
  editorialPlan?: EditorialPlan;
  slides: Array<{
    values: Array<{ fieldId: string; value: string | string[] }>;
  }>;
}
export function editorialSources(input: ProposalExecutionInput): string[] {
  return [
    input.executionBrief?.rawInput,
    input.executionBrief?.notes,
    input.prompt,
    input.contextContent,
    ...(input.sourceReferences ?? []).map(s => s.facts),
    ...(input.executionBrief?.mustKeep ?? []),
    ...(input.executionBrief?.mustInclude ?? []),
  ].filter((s): s is string => Boolean(s?.trim()));
}
const normalize = (text: string) =>
  text.normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
export const editorialSlideText = (copy: EditorialCopy, index: number) =>
  copy.slides[index]?.values
    .flatMap(row => (Array.isArray(row.value) ? row.value : [row.value]))
    .join("\n") ?? "";

/** Conservative spelling anchors, not inferred facts or a named-entity classifier. */
export function protectedEditorialEntities(
  input: ProposalExecutionInput,
  plan?: EditorialPlan
): string[] {
  const sources = editorialSources(input);
  return Array.from(
    new Set([
      ...sources.flatMap(
        source => source.match(/\b[A-Z][a-z]+(?:[A-Z][a-zA-Z0-9]+)+\b/g) ?? []
      ),
      ...(plan?.protectedEntities ?? [])
        .filter(
          entity =>
            entity.sourceQuote.includes(entity.value) &&
            sources.some(source => source.includes(entity.sourceQuote))
        )
        .map(entity => entity.value),
    ])
  ).slice(0, 20);
}

/** Source quotations establish provenance only; the reviewer must still check semantic coverage. */
export function validateEditorialPlan(
  copy: EditorialCopy,
  input: ProposalExecutionInput
): string[] {
  if (!copy.editorialPlan) return [];
  const plan = copy.editorialPlan,
    sources = editorialSources(input),
    errors: string[] = [];
  const literal = input.executionBrief?.interventionLevel === "visual_only";
  if (plan.mode !== (literal ? "literal" : "compose"))
    errors.push("editorial_plan_intervention_mismatch");
  if (
    plan.slides.length !== copy.slides.length ||
    new Set(plan.slides.map(s => s.slideIndex)).size !== copy.slides.length ||
    plan.slides.some(s => s.slideIndex >= copy.slides.length)
  )
    errors.push("editorial_plan_slide_coverage");
  const ids = new Set(plan.facts.map(f => f.id));
  if (ids.size !== plan.facts.length)
    errors.push("editorial_plan_duplicate_fact");
  if (!literal && sources.length && !plan.facts.length)
    errors.push("editorial_plan_facts_required");
  for (const fact of plan.facts) {
    if (!sources.some(source => source.includes(fact.sourceQuote)))
      errors.push(`editorial_plan_unbacked_fact:${fact.id}`);
    if (!plan.slides.some(slide => slide.factIds.includes(fact.id)))
      errors.push(`editorial_plan_unassigned_fact:${fact.id}`);
  }
  if (plan.slides.some(slide => slide.factIds.some(id => !ids.has(id))))
    errors.push("editorial_plan_unknown_fact");
  for (const entity of plan.protectedEntities)
    if (
      !entity.sourceQuote.includes(entity.value) ||
      !sources.some(source => source.includes(entity.sourceQuote))
    )
      errors.push("editorial_plan_unbacked_entity");
  if (
    !literal &&
    copy.slides.length > 1 &&
    new Set(plan.slides.map(s => normalize(s.purpose))).size !==
      copy.slides.length
  )
    errors.push("editorial_plan_repeated_purpose");
  if (plan.version === 2) {
    if (literal) errors.push("editorial_plan_narrative_in_literal");
    const ordered = [...plan.slides].sort(
      (a, b) => a.slideIndex - b.slideIndex
    );
    for (const slide of ordered) {
      if (
        slide.role !== narrativeSlideRole(slide.slideIndex, copy.slides.length)
      )
        errors.push(`editorial_plan_narrative_role:${slide.slideIndex}`);
      if (
        slide.slideIndex === 0
          ? Boolean(slide.bridgeFromPrevious.trim())
          : !slide.bridgeFromPrevious.trim()
      )
        errors.push(`editorial_plan_narrative_bridge:${slide.slideIndex}`);
      if (!slide.readerTakeaway.trim())
        errors.push(`editorial_plan_narrative_takeaway:${slide.slideIndex}`);
    }
    if (
      new Set(ordered.map(s => normalize(s.readerTakeaway))).size !==
      ordered.length
    )
      errors.push("editorial_plan_repeated_takeaway");
  }
  return errors;
}

/** Detect a changed spelling such as BizuMiner -> Bizu Miner independently of the model. */
export function entitySpellingFindings(
  copy: EditorialCopy,
  input: ProposalExecutionInput
): ProposalReviewFinding[] {
  if (input.executionBrief?.interventionLevel === "visual_only") return [];
  const findings: ProposalReviewFinding[] = [];
  for (const entity of protectedEditorialEntities(input, copy.editorialPlan)) {
    const letters = entity.replace(/\s/g, "");
    if (!letters) continue;
    const escaped = Array.from(letters)
      .map(char => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s*");
    const variant = new RegExp(
      `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
      "giu"
    );
    const surfaces = copy.slides.flatMap((slide, slideIndex) =>
      slide.values.map(row => ({ ...row, slideIndex }))
    );
    if (copy.slides.length)
      surfaces.push({
        fieldId: "$caption",
        value: copy.caption,
        slideIndex: 0,
      });
    surfaces.forEach(row => {
      const { slideIndex } = row;
      const values = Array.isArray(row.value) ? row.value : [row.value];
      if (
        values.some(value =>
          Array.from(value.matchAll(variant)).some(
            match => normalize(match[0]) !== normalize(entity)
          )
        )
      )
        findings.push({
          category: "entity_changed",
          slideIndex,
          fieldId: row.fieldId,
          observed: values.join("\n"),
          expected: entity,
          sourceQuote: entity,
          explanation: `Nome fornecido alterado na copy: preservar ${entity} sem inserir separadores.`,
          action: "none",
        });
    });
  }
  return findings.slice(0, 20);
}

/** A semantic finding is source-grounded, never an authority to apply arbitrary model text. */
export function groundsEditorialFinding(
  finding: ProposalReviewFinding,
  copy: EditorialCopy,
  input: ProposalExecutionInput
): boolean {
  if (
    input.executionBrief?.interventionLevel === "visual_only" ||
    finding.action !== "none"
  )
    return false;
  if (
    ![
      "entity_changed",
      "fact_omission",
      "narrative_gap",
      "unsupported_claim",
    ].includes(finding.category)
  )
    return false;
  if (
    !finding.sourceQuote.trim() ||
    !editorialSources(input).some(source =>
      source.includes(finding.sourceQuote)
    )
  )
    return false;
  const slide = copy.slides[finding.slideIndex];
  if (!slide) return false;
  const value =
    finding.fieldId === "$caption"
      ? copy.caption
      : finding.fieldId
        ? slide.values.find(row => row.fieldId === finding.fieldId)?.value
        : editorialSlideText(copy, finding.slideIndex);
  const actual = Array.isArray(value) ? value.join("\n") : value;
  if (actual === undefined || actual !== finding.observed) return false;
  if (finding.category === "entity_changed") {
    // The provider may describe a missing word in a protected multiword name,
    // not just a spacing variant. Ground the canonical name in the authored plan
    // and literal source; never authorize changing a field already containing it.
    const containsName = (text: string, entity: string) => {
      const escaped = normalize(entity).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(
        `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
        "u"
      ).test(normalize(text));
    };
    const protectedName = protectedEditorialEntities(
      input,
      copy.editorialPlan
    ).some(
      entity =>
        containsName(finding.sourceQuote, entity) &&
        containsName(finding.expected, entity) &&
        !containsName(actual, entity)
    );
    return (
      protectedName ||
      entitySpellingFindings(copy, input).some(
        candidate =>
          candidate.slideIndex === finding.slideIndex &&
          candidate.fieldId === finding.fieldId &&
          candidate.sourceQuote === finding.sourceQuote &&
          !containsName(actual, candidate.expected)
      )
    );
  }
  if (finding.category === "narrative_gap" && copy.slides.length < 2)
    return false;
  // A literal already visible cannot be described as missing. Paraphrase coverage is
  // still judged by the full-sequence reviewer rather than lexical overlap heuristics.
  if (
    finding.category === "fact_omission" &&
    normalize(
      copy.slides.map((_s, i) => editorialSlideText(copy, i)).join("\n")
    ).includes(normalize(finding.sourceQuote))
  )
    return false;
  return true;
}

export const editorialInstructions = [
  "Na mesma resposta de copy, produza editorialPlan na versão indicada pelo contrato (version=2 para carrossel compose; version=1 para estático e literal): mensagem central específica; fatos essenciais com sourceQuote literal verificável e meaning; nomes/entidades protegidos com grafia da fonte; propósito e factIds de cada slide.",
  "Cada facts[].id representa UMA afirmação atômica verificável na fonte. Separe serviço/ação, frequência e consequência quando forem afirmações independentes: 'verificamos promoções' e 'acompanhamos preços diariamente' são dois fatos, não um rótulo genérico de economia. sourceQuote é o trecho literal que sustenta cada afirmação. Não una vários diferenciais no mesmo factId nem dilua um em outro.",
  "Em compose, todos os diferenciais essenciais precisam aparecer na arte, não apenas na legenda. Conecte problema, mecanismo/diferencial e consequência útil: cada slide avança uma ideia. Não troque explicações por rótulos genéricos como 'Melhor valor', 'Grandes lojas' ou 'Saiba mais' quando a fonte permite dizer o que acontece e por quê.",
  "O plano deve caber no conjunto das caixas, sem sacrificar fatos para caber: distribua a explicação entre slides/campos. Preserve nomes canônicos, números, ressalvas e qualificadores. Não acrescente garantias universais ou resultados não informados. Legenda complementa a arte; não oculta a ausência do diferencial nos slides.",
  "Em visual_only use mode=literal: plano apenas descreve a distribuição do texto-fonte, nunca autoriza criar gancho, conclusão, CTA, entidades ou palavras novas. Nos demais casos use mode=compose.",
].join("\n");

/** Correct only an unambiguous spacing variant of a source-backed entity.
 * Copy receipts, captions, arrays, plan and media remain untouched. */
export function canonicalizeEditorialNames<T extends EditorialCopy>(copy: T, input: ProposalExecutionInput) {
  if (input.executionBrief?.interventionLevel === "visual_only") return { copy, patches: [] };
  const sources = editorialSources(input);
  const entities = protectedEditorialEntities(input, copy.editorialPlan);
  const patches: Array<{slideIndex:number; fieldId:string; itemIndex:number|null; before:string; after:string}> = [];
  const candidates = entities.filter(entity => {
    const letters = entity.replace(/\s/g, "");
    if (!letters || entities.filter(e => e.replace(/\s/g, "").toLowerCase() === letters.toLowerCase()).length !== 1) return false;
    const escaped = Array.from(letters).map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
    // Conflicting source spelling disables this local shortcut.
    return sources.every(source => Array.from(source.matchAll(pattern)).every(m => m[0] === entity));
  });
  const next = { ...copy, slides: copy.slides.map((slide, slideIndex) => ({ ...slide, values: slide.values.map(row => {
    const patch = (value:string, itemIndex:number|null) => {
      let after = value;
      for (const entity of candidates) {
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${Array.from(entity.replace(/\s/g, "")).map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*")}(?![\\p{L}\\p{N}])`, "giu");
        after = after.replace(pattern, match => /\s/.test(match) && match.replace(/\s/g, "").toLowerCase() === entity.replace(/\s/g, "").toLowerCase() ? (match === match.toUpperCase() ? entity.toUpperCase() : entity) : match);
      }
      if (after !== value) patches.push({slideIndex,fieldId:row.fieldId,itemIndex,before:value,after});
      return after;
    };
    return {...row,value:Array.isArray(row.value) ? row.value.map((v,i) => patch(v,i)) : patch(row.value,null)};
  }) })) } as T;
  return { copy: patches.length ? next : copy, patches };
}
