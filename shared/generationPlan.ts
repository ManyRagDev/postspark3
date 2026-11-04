import { z } from "zod";
import { arsenalHash } from "./arsenalContent";
import { completeDesignFields, completeDesignProvenanceSchema } from "./completeDesignGeneration";
import type { CompleteDesignOfferV1 } from "./completeDesignOffers";
import type { DesignFamilyRepertoire } from "./designRepertoire";
import type { ImageObligation } from "./generationContracts";
import { designHasPhotographicContent } from "./designSelection";
import { editorialIntentReadingSchema, type FrozenEditorialCatalog } from "./editorialIntent";

export function repertoireMeetsMedia(repertoire: DesignFamilyRepertoire, obligation: ImageObligation) {
  if (obligation.policy === "forbidden") return repertoire.slides.every(slide => slide.variants.some(card => !card.mediaSlots.length && !designHasPhotographicContent(card)));
  return !obligation.required || repertoire.slides.reduce((sum, slide) => sum + Math.max(...slide.variants.map(card => card.mediaSlots.length)), 0) >= Math.max(1, obligation.slotTargets);
}

const text = z.string().min(1).max(1600);
const id = z.string().min(1).max(120);
/** A planning inference is not a source fact or an explicit user instruction. */
export const generationIntentLegacySchema = z
  .object({
    version: z.literal(1),
    objective: text,
    tone: z
      .object({
        description: text,
        origin: z.enum(["explicit", "inferred"]),
        rationale: text,
      })
      .strict(),
    adaptation: z.enum(["literal", "controlled"]),
    requirements: z
      .array(
        z
          .object({
            id,
            description: text,
            /** Missing on historical receipts: those retain content-coverage semantics. */
            kind: z.enum(["content", "execution"]).optional(),
            surface: z.enum(["art", "caption", "either"]),
            origin: z.enum(["explicit", "inferred"]),
            requestQuote: z.string().max(2000).nullable(),
            itemCount: z.number().int().min(1).max(50).nullable(),
          })
          .strict()
      )
      .max(50),
    content: z
      .array(
        z
          .object({
            id,
            meaning: text,
            requirementIds: z.array(id).max(50),
            /** Empty means an editorial idea, never evidence for a factual claim. */
            sourceIds: z.array(id).max(30),
          })
          .strict()
      )
      .min(1)
      .max(60),
  })
  .strict();
// Keep the historical provider schema byte-for-byte reproducible on recovery.
export const generationIntentSchema = generationIntentLegacySchema.extend({ editorial: editorialIntentReadingSchema.optional() });
export const generationEditorialIntentSchema = generationIntentLegacySchema.extend({ editorial: editorialIntentReadingSchema });
export type GenerationIntent = z.infer<typeof generationIntentSchema>;

const comparableQuote = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim();

function expandExecutionQuote(quote: string, requestText: string): string {
  const source = comparableQuote(requestText);
  const excerpt = comparableQuote(quote);
  if (source.includes(excerpt)) return quote;
  const fragments = excerpt.split(/\[\s*(?:\.\.\.|…)\s*\]/).map(part => part.trim());
  if (fragments.length < 2 || fragments.some(part => !part)) return quote;
  const [first, ...remaining] = fragments;
  let start = source.indexOf(first);
  while (start >= 0) {
    let end = start + first.length;
    for (const part of remaining) {
      const offset = source.indexOf(part, end);
      if (offset < 0) return quote;
      end = offset + part.length;
      if (end - start > 2000) break;
    }
    if (end - start <= 2000) return source.slice(start, end);
    start = source.indexOf(first, end - 2000);
  }
  return quote;
}

export function normalizeGenerationIntent(
  intent: GenerationIntent,
  slideCount: number,
  factualSourceIds: ReadonlySet<string>,
  requestText: string
): GenerationIntent {
  return {
    ...intent,
    requirements: intent.requirements.map(requirement => {
      if (requirement.kind !== "execution") return requirement;
      const requestQuote = requirement.origin === "explicit" && requirement.requestQuote
        ? expandExecutionQuote(requirement.requestQuote, requestText)
        : requirement.requestQuote;
      // The admitted page count is a format constraint. Counts of material
      // items, including a list requested inside a carousel, remain validated.
      const pages = requestQuote?.trim().match(
        /^(?:carrossel\s+(?:de|com)\s+)?(?:exatamente\s+)?(\d+)\s+(?:slides?|lâminas?|páginas?|telas?)[.!]?$/i
      );
      const itemCount = slideCount > 1 &&
        requirement.itemCount === slideCount && Number(pages?.[1]) === slideCount
        ? null : requirement.itemCount;
      return { ...requirement, requestQuote, itemCount };
    }),
    content: intent.content.map(content => ({
      ...content,
      sourceIds: content.sourceIds.filter(id => factualSourceIds.has(id)),
    })),
  };
}

/** Execution constraints stay in the source context and media gate. The material
 * review links only content obligations to visible text units. Historical input
 * without classification is returned unchanged. */
export function materialGenerationIntent(intent?: GenerationIntent): GenerationIntent | undefined {
  if (!intent?.requirements.some(r => r.kind)) return intent;
  const requirements = intent.requirements.filter(r => r.kind !== "execution").map(({ kind: _kind, ...requirement }) => requirement);
  const ids = new Set(requirements.map(r => r.id));
  return { ...intent, requirements, content: intent.content.map(c => ({ ...c, requirementIds: c.requirementIds.filter(id => ids.has(id)) })) };
}

export const plannedPageSchema = z
  .object({
    slideIndex: z.number().int().min(0).max(9),
    componentId: z.string().uuid(),
    purpose: text,
    rhythm: z.enum([
      "opening",
      "reading",
      "list",
      "comparison",
      "image_commentary",
      "highlight",
      "synthesis",
    ]),
    assignments: z
      .array(
        z
          .object({
            fieldId: id,
            contentIds: z.array(id).max(60),
            /** Explicit independent items, not word-weight fragments of a paragraph. */
            itemCount: z.number().int().min(1).max(50).nullable(),
            instruction: text,
          })
          .strict()
      )
      .min(1)
      .max(40),
  })
  .strict();
export const viablePlanSchema = z
  .object({
    slot: z.number().int().min(0).max(2),
    status: z.literal("viable"),
    candidateId: z.string().uuid(),
    reason: completeDesignProvenanceSchema.shape.reason,
    editorialApproach: text,
    pages: z.array(plannedPageSchema).min(1).max(10),
    captionContentIds: z.array(id).max(60),
  })
  .strict();
export const insufficientPlanSchema = z
  .object({
    slot: z.number().int().min(0).max(2),
    status: z.literal("insufficient_fit"),
    reason: text,
    unmetRequirementIds: z.array(id).max(50),
  })
  .strict();
export const generationSlotPlanSchema = z.discriminatedUnion("status", [
  viablePlanSchema,
  insufficientPlanSchema,
]);
export type GenerationSlotPlan =
  | z.infer<typeof generationSlotPlanSchema>
  | {
      slot: number;
      status: "planning_failed";
      reason: string;
      unmetRequirementIds: string[];
    };
export type ViableGenerationPlan = z.infer<typeof viablePlanSchema>;
export const generationPlanResponseSchema = z
  .object({
    version: z.literal(1),
    slots: z.array(generationSlotPlanSchema).length(3),
  })
  .strict();

export interface GenerationPlanningReceipt {
  version: 1;
  intent: GenerationIntent;
  /** Frozen together with the extraction, not resolved again during generation. */
  editorialCatalog?: FrozenEditorialCatalog | null;
  /** One provider judgment per family; member scores below are projections. */
  familyElection?: {
    version: 1;
    candidates: Array<{ id: string; family: string; signature: string; profileHash: string; memberIds: string[] }>;
    ranking: Array<{ id: string; score: number; confidence: number }>;
    shortlistedIds: string[];
  };
  slots: GenerationSlotPlan[];
  /** Only viable slots have a concrete, hydrated sequence. */
  offers: Array<CompleteDesignOfferV1 | null>;
  catalogReceiptHash: string | null;
  candidates: Array<{ id: string; signature: string; profileHash: string }>;
  selectorIds: string[];
  ranking: Array<{ id: string; score: number; confidence: number }>;
  recoveryRepertoires: DesignFamilyRepertoire[][];
  hash: string;
}
export function sealGenerationPlanningReceipt(
  value: Omit<GenerationPlanningReceipt, "hash">
): GenerationPlanningReceipt {
  return { ...value, hash: arsenalHash(value) };
}

/** Checks documented structure. Approximate text capacity never becomes a hard gate. */
export function validateGenerationPlan(
  plan: ViableGenerationPlan,
  offer: CompleteDesignOfferV1,
  intent: GenerationIntent
): string[] {
  const problems: string[] = [];
  const contents = new Set(intent.content.map(c => c.id));
  const used = new Map<string, Set<"art" | "caption">>();
  const use = (contentId: string, surface: "art" | "caption") => {
    if (!contents.has(contentId)) problems.push(`unknown_content:${contentId}`);
    used.set(
      contentId,
      new Set([...Array.from(used.get(contentId) ?? []), surface])
    );
  };
  if (plan.pages.length !== offer.slides.length) problems.push("page_count");
  plan.pages.forEach((page, index) => {
    const slide = offer.slides[index];
    if (
      !slide ||
      page.slideIndex !== index ||
      page.componentId !== slide.componentId
    ) {
      problems.push(`page_identity:${index}`);
      return;
    }
    const fields = completeDesignFields(slide.card);
    const assigned = new Set<string>();
    for (const assignment of page.assignments) {
      const field = fields.find(f => f.id === assignment.fieldId);
      if (!field || assigned.has(assignment.fieldId)) {
        problems.push(`field_identity:${index}:${assignment.fieldId}`);
        continue;
      }
      assigned.add(field.id);
      assignment.contentIds.forEach(c => use(c, "art"));
      if (
        field.kind === "list" &&
        assignment.itemCount !== null &&
        field.cardinality &&
        (assignment.itemCount < field.cardinality.min ||
          assignment.itemCount > field.cardinality.max)
      )
        problems.push(`list_cardinality:${index}:${field.id}`);
      const independent = new Set(
        assignment.contentIds.filter(id =>
          intent.content
            .find(c => c.id === id)
            ?.requirementIds.some(r =>
              intent.requirements.some(
                requirement =>
                  requirement.id === r && requirement.itemCount !== null
              )
            )
        )
      ).size;
      if (
        field.kind === "list" &&
        ((field.cardinality && independent > field.cardinality.max) ||
          (assignment.itemCount !== null && independent > assignment.itemCount))
      )
        problems.push(`independent_items_exceed_slots:${index}:${field.id}`);
      // One text field can hold enumerated prose. Only a native list promises fixed independent slots.
    }
    for (const field of fields.filter(f => f.required))
      if (!assigned.has(field.id))
        problems.push(`required_field:${index}:${field.id}`);
  });
  plan.captionContentIds.forEach(c => use(c, "caption"));
  for (const requirement of intent.requirements.filter(
    r => r.origin === "explicit" && r.kind !== "execution"
  )) {
    const content = intent.content.filter(c =>
      c.requirementIds.includes(requirement.id)
    );
    const covered = content.filter(c =>
      requirement.surface === "either"
        ? used.has(c.id)
        : used.get(c.id)?.has(requirement.surface)
    );
    if (!covered.length)
      problems.push(`uncovered_requirement:${requirement.id}`);
    if (
      requirement.itemCount !== null &&
      covered.length !== requirement.itemCount
    )
      problems.push(`required_item_count:${requirement.id}`);
  }
  return problems;
}

export function validateGenerationIntent(
  intent: GenerationIntent,
  requestText: string,
  sourceIds: Set<string>
): string[] {
  const problems: string[] = [];
  const ids = intent.requirements.map(r => r.id),
    contents = intent.content.map(c => c.id);
  if (
    new Set(ids).size !== ids.length ||
    new Set(contents).size !== contents.length
  )
    problems.push("duplicate_id");
  for (const requirement of intent.requirements) {
    if (requirement.kind === "execution" && requirement.itemCount !== null)
      problems.push(`execution_item_count:${requirement.id}`);
    if (requirement.origin === "explicit" && requirement.kind !== "execution" && !intent.content.some(c => c.requirementIds.includes(requirement.id)))
      problems.push(`unmapped_requirement:${requirement.id}`);
    if (
      requirement.origin === "explicit" &&
      (!requirement.requestQuote ||
        !comparableQuote(requestText).includes(comparableQuote(requirement.requestQuote)))
    )
      problems.push(`unattributed_requirement:${requirement.id}`);
  }
  for (const content of intent.content) {
    if (content.requirementIds.some(id => !ids.includes(id)))
      problems.push(`unknown_requirement:${content.id}`);
    if (content.sourceIds.some(id => !sourceIds.has(id)))
      problems.push(`unknown_source:${content.id}`);
  }
  return problems;
}
