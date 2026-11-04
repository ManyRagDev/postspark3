import { arsenalHash } from "@shared/arsenalContent";
import {
  proposalReviewResponseV10Schema,
  proposalReviewRecordV10Schema,
  type ReviewResponseV10,
} from "@shared/proposalReviewV10";
import type { ReviewFindingV7 } from "@shared/proposalReviewV7";
import type {
  GenerationIntent,
  ViableGenerationPlan,
} from "@shared/generationPlan";
import { normalizeReviewV9 } from "./proposalReviewPolicyV9";
import { buildSourceEvidenceV10 } from "./reviewEvidenceV10";
import { resolveSourceQuote } from "./sourceRepresentation";

function invalidReviewV10(
  rule: string,
  details: Record<string, unknown> = {}
): never {
  throw Object.assign(new Error("proposal_review_incomplete_evidence"), {
    violation: { rule, ...details },
  });
}

/** The two requirement inventories are distinct. Remove only a redundant intent
 * judgment whose status and complete destination evidence already exist there.
 * This never creates deliveries or promotes a semantic verdict. */
export function canonicalizeRequirementChecksV10(
  response: Pick<ReviewResponseV10, "requirementChecks" | "intentChecks">,
  legacyIds: readonly string[],
  intentIds: readonly string[]
) {
  const discardedFields: string[] = [],
    seen = new Set<string>();
  const requirementChecks = response.requirementChecks.filter(
    (check, index) => {
      const id = check.requirementId;
      if (seen.has(id))
        invalidReviewV10("duplicate_requirement_check", {
          path: `requirementChecks[${index}]`,
          requirementId: id,
        });
      seen.add(id);
      if (legacyIds.includes(id)) return true;
      if (!intentIds.includes(id))
        invalidReviewV10("unknown_requirement_id", {
          path: `requirementChecks[${index}].requirementId`,
          receivedId: id,
          expectedIds: legacyIds,
          intentIds,
        });
      const counterparts = response.intentChecks.filter(
        c => c.requirementId === id
      );
      if (counterparts.length !== 1)
        invalidReviewV10("intent_duplicate_without_unique_judgment", {
          requirementId: id,
          intentCheckCount: counterparts.length,
        });
      const counterpart = counterparts[0];
      const evidenceIds = Array.from(
        new Set(counterpart.deliveries.flatMap(d => d.unitIds))
      );
      if (
        check.status !== counterpart.status ||
        new Set(check.unitIds).size !== check.unitIds.length ||
        check.unitIds.length !== evidenceIds.length ||
        check.unitIds.some(id => !evidenceIds.includes(id))
      )
        invalidReviewV10("intent_duplicate_judgment_mismatch", {
          path: `requirementChecks[${index}]`,
          requirementId: id,
          receivedStatus: check.status,
          expectedStatus: counterpart.status,
          receivedUnitIds: check.unitIds,
          expectedUnitIds: evidenceIds,
        });
      discardedFields.push(
        `requirementChecks[${index}]:duplicate_of_intentChecks:${id}`
      );
      return false;
    }
  );
  const receivedIds = requirementChecks.map(c => c.requirementId);
  if (
    receivedIds.length !== legacyIds.length ||
    legacyIds.some(id => !receivedIds.includes(id))
  )
    invalidReviewV10("requirement_coverage", {
      path: "requirementChecks",
      expectedIds: legacyIds,
      receivedIds,
      missingIds: legacyIds.filter(id => !receivedIds.includes(id)),
    });
  return { requirementChecks, discardedFields };
}

/** JSON.parse silently accepts duplicate keys. A repeated verdict is ambiguous. */
export function decodeReviewV10(raw: string) {
  const invalid = (
    rule = "json_syntax",
    details: Record<string, unknown> = {}
  ): never => {
    throw Object.assign(new Error("proposal_review_response_invalid"), {
      violation: { rule, ...details },
    });
  };
  if (raw.length > 100000) invalid();
  const tokens =
    raw.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) ?? [];
  let i = 0;
  const walk = (depth = 0): void => {
    if (depth > 100) invalid();
    const token = tokens[i++];
    if (token === "{") {
      const keys = new Set<string>();
      if (tokens[i] === "}") {
        i++;
        return;
      }
      for (;;) {
        const key = JSON.parse(tokens[i++]);
        if (keys.has(key)) invalid("duplicate_json_key", { key });
        if (typeof key !== "string" || tokens[i++] !== ":") invalid();
        keys.add(key);
        walk(depth + 1);
        const separator = tokens[i++];
        if (separator === "}") break;
        if (separator !== ",") invalid();
      }
    } else if (token === "[") {
      if (tokens[i] === "]") {
        i++;
        return;
      }
      for (;;) {
        walk(depth + 1);
        const separator = tokens[i++];
        if (separator === "]") break;
        if (separator !== ",") invalid();
      }
    } else {
      if (token === undefined) invalid();
      JSON.parse(token);
    }
  };
  try {
    walk();
    if (i !== tokens.length) invalid();
    const parsed = proposalReviewResponseV10Schema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return invalid("response_schema", {
        issues: parsed.error.issues.slice(0, 12).map(issue => ({
          path: issue.path.join("."),
          code: issue.code,
          message: issue.message,
        })),
      });
    return {
      response: parsed.data,
      discarded: [] as string[],
    };
  } catch (error) {
    if ((error as { violation?: unknown })?.violation) throw error;
    return invalid("json_syntax", {
      detail: error instanceof Error ? error.message : "Invalid JSON",
    });
  }
}

export function normalizeReviewV10(
  options: Omit<Parameters<typeof normalizeReviewV9>[0], "response"> & {
    response: ReviewResponseV10;
    generationIntent?: GenerationIntent;
    narrativePlan?: ViableGenerationPlan;
  }
) {
  const { response, units, context } = options;
  const evidenceInventory = buildSourceEvidenceV10(context);
  const invalid = invalidReviewV10;
  const canonical = canonicalizeRequirementChecksV10(
    response,
    context.requirements.map(r => r.id),
    options.generationIntent?.requirements.map(r => r.id) ?? []
  );
  const expectedSlides = options.copy.slides.map((_, i) => i);
  if (
    response.reviewedSlides.length !== expectedSlides.length ||
    new Set(response.reviewedSlides).size !== expectedSlides.length ||
    response.reviewedSlides.some(i => !expectedSlides.includes(i))
  )
    invalid("slide_coverage", {
      path: "reviewedSlides",
      expectedSlides,
      receivedSlides: response.reviewedSlides,
    });
  const evidence = (ids: string[]) => {
    if (new Set(ids).size !== ids.length) invalid("duplicate_evidence_id");
    return ids.map(
      id =>
        evidenceInventory.find(e => e.id === id) ??
        invalid("unknown_evidence_id", { evidenceId: id })
    );
  };
  const unit = (id: string) =>
    units.find(u => u.id === id) ?? invalid("unknown_unit_id", { unitId: id });
  if (
    response.unitChecks.length !== units.length ||
    new Set(response.unitChecks.map(c => c.unitId)).size !== units.length
  )
    invalid("unit_coverage", {
      path: "unitChecks",
      expectedUnitIds: units.map(u => u.id),
      receivedUnitIds: response.unitChecks.map(c => c.unitId),
    });
  const claims = response.unitChecks.flatMap(check => {
    const target = unit(check.unitId);
    const refs = evidence(check.evidenceIds);
    if (!check.meaning.trim() || !check.explanation.trim())
      invalid("missing_semantic_assessment", { unitId: target.id });
    if (check.verdict === "editorial") {
      if (!check.editorialBasis || refs.length)
        invalid("editorial_basis_inconsistent", { unitId: target.id });
      return [];
    }
    if (check.editorialBasis !== null)
      invalid("factual_editorial_basis_inconsistent", { unitId: target.id });
    if (
      check.verdict === "supported" &&
      (!refs.length || refs.some(e => e.kind !== "content"))
    )
      invalid("guidance_used_as_fact", { unitId: target.id });
    return [
      {
        id: `claim_${target.id}`,
        unitId: target.id,
        observed: target.text.slice(0, 4000),
        sources: refs.map(({ sourceId, start, end }) => ({
          sourceId,
          start,
          end,
        })),
        status: check.verdict,
        explanation: check.explanation,
      },
    ];
  });
  const findings: ReviewFindingV7[] = response.findings.map(
    (f, findingIndex) => {
      const target = f.unitId ? unit(f.unitId) : null;
      const refs = evidence(f.evidenceIds);
      if (
        (f.category === "aesthetic" && f.consequence !== "none") ||
        ([
          "unsupported_claim",
          "factual_contradiction",
          "entity_changed",
          "fact_omission",
          "explicit_requirement",
          "visible_text_loss",
          "media_missing",
        ].includes(f.category) &&
          f.consequence === "none")
      )
        invalid("category_consequence_inconsistent", {
          path: `findings[${findingIndex}]`,
          category: f.category,
          consequence: f.consequence,
          unitId: f.unitId,
        });
      if (!target && (f.slideIndex === null || !f.observedInImage.trim()))
        invalid("missing_visual_target");
      if (
        target &&
        ((f.slideIndex !== null && f.slideIndex !== target.slideIndex) ||
          f.observedInImage)
      )
        invalid("divergent_unit_target", { unitId: target.id });
      if (
        f.category === "unsupported_claim" &&
        (f.consequence === "none" ||
          (target &&
            ["editorial", "supported"].includes(
              response.unitChecks.find(c => c.unitId === target.id)?.verdict ??
                ""
            )))
      )
        invalid("factual_judgment_inconsistent", {
          path: `findings[${findingIndex}]`,
          unitId: target?.id,
          verdict: response.unitChecks.find(c => c.unitId === target?.id)
            ?.verdict,
          category: f.category,
        });
      if (
        ["factual_contradiction", "entity_changed", "fact_omission"].includes(
          f.category
        ) &&
        refs.some(e => e.kind !== "content")
      )
        invalid("guidance_used_as_fact");
      // The complete set remains in the V10 record; the first reference projects to
      // the legacy finding for repair targeting without asking the model to quote it.
      const source = refs[0];
      return {
        category: f.category,
        unitId: target?.id ?? null,
        slideIndex: target?.slideIndex ?? f.slideIndex ?? 0,
        fieldId: target?.fieldId ?? null,
        scope: target?.scope ?? "art",
        observed: target?.text.slice(0, 4000) ?? f.observedInImage,
        expected: f.expected,
        sourceId: source?.sourceId ?? null,
        sourceQuote: source?.text ?? "",
        explanation: f.explanation,
        consequence: f.consequence,
        certainty: f.certainty,
        effect: "advisory",
      };
    }
  );
  const intentRequirements = options.generationIntent?.requirements ?? [];
  const nativeRequirementTargets: Array<{
    slideIndex: number;
    fieldId: string;
  }> = [];
  if (
    response.intentChecks.length !== intentRequirements.length ||
    new Set(response.intentChecks.map(c => c.requirementId)).size !==
      intentRequirements.length
  )
    invalid("intent_requirement_coverage", {
      path: "intentChecks",
      expectedIds: intentRequirements.map(r => r.id),
      receivedIds: response.intentChecks.map(c => c.requirementId),
    });
  const intentChecks = response.intentChecks.map(check => {
    const requirement =
      intentRequirements.find(r => r.id === check.requirementId) ??
      invalid("unknown_intent_requirement");
    if (
      new Set(check.deliveries.map(d => d.contentId)).size !==
      check.deliveries.length
    )
      invalid("duplicate_content_delivery");
    const deliveries = check.deliveries.filter(delivery => {
      const content = options.generationIntent!.content.find(
        c => c.id === delivery.contentId
      );
      if (!content?.requirementIds.includes(requirement.id))
        invalid("unknown_requirement_content", {
          contentId: delivery.contentId,
        });
      if (new Set(delivery.unitIds).size !== delivery.unitIds.length)
        invalid("duplicate_delivery_unit");
      return delivery.unitIds.every(id => {
        const target = unit(id);
        return (
          (requirement.surface === "either" ||
            target.scope === requirement.surface) &&
          (target.scope === "caption" || target.visibleAliases.length > 0)
        );
      });
    });
    const incomplete =
      !deliveries.length ||
      (requirement.itemCount !== null &&
        deliveries.length < requirement.itemCount);
    const status =
      check.status === "uncertain"
        ? ("uncertain" as const)
        : incomplete
          ? ("missing" as const)
          : check.status;
    const explanation =
      status !== check.status
        ? `O requisito pede ${requirement.itemCount ?? "conteúdo"} em ${requirement.surface}; foram identificados ${deliveries.length} itens no destino válido.`
        : check.explanation;
    if (status !== "met") {
      const fallbackTarget = units.find(
        u =>
          (requirement.surface === "either" ||
            u.scope === requirement.surface) &&
          (u.scope === "caption" || u.visibleAliases.length > 0)
      );
      const explicit = requirement.origin === "explicit";
      const source = explicit
        ? context.sources.find(
            s =>
              requirement.requestQuote &&
              resolveSourceQuote(s.text, requirement.requestQuote).length > 0
          )
        : undefined;
      if (explicit && !source)
        invalid("unattributed_intent_requirement", {
          requirementId: requirement.id,
        });
      const missingContentIds = new Set(
        options
          .generationIntent!.content.filter(
            c =>
              c.requirementIds.includes(requirement.id) &&
              !deliveries.some(d => d.contentId === c.id)
          )
          .map(c => c.id)
      );
      const addresses: Array<{
        slideIndex: number;
        fieldId: string;
        scope: "art" | "caption";
      }> =
        explicit && options.narrativePlan
          ? options.narrativePlan.pages.flatMap(page =>
              page.assignments
                .filter(
                  a =>
                    requirement.surface !== "caption" &&
                    a.contentIds.some(id => missingContentIds.has(id))
                )
                .map(a => ({
                  slideIndex: page.slideIndex,
                  fieldId: a.fieldId,
                  scope: "art" as const,
                }))
            )
          : [];
      if (
        explicit &&
        requirement.surface !== "art" &&
        options.narrativePlan?.captionContentIds.some(id =>
          missingContentIds.has(id)
        )
      )
        addresses.push({
          slideIndex: 0,
          fieldId: "$caption",
          scope: "caption",
        });
      const unique = Array.from(
        new Map(
          addresses.map(a => [`${a.scope}:${a.slideIndex}:${a.fieldId}`, a])
        ).values()
      );
      const targets = unique.length
        ? unique
        : fallbackTarget
          ? [
              {
                slideIndex: fallbackTarget.slideIndex ?? 0,
                fieldId: fallbackTarget.fieldId,
                scope: fallbackTarget.scope,
              },
            ]
          : explicit && requirement.surface === "caption"
            ? [
                {
                  slideIndex: 0,
                  fieldId: "$caption",
                  scope: "caption" as const,
                },
              ]
            : explicit
              ? options.copy.slides
                  .flatMap((s, slideIndex) =>
                    s.values.slice(0, 1).map(v => ({
                      slideIndex,
                      fieldId: v.fieldId,
                      scope: "art" as const,
                    }))
                  )
                  .slice(0, 1)
              : [];
      for (const address of targets) {
        if (
          address.scope === "art" &&
          !options.copy.slides[address.slideIndex]?.values.some(
            v => v.fieldId === address.fieldId
          )
        )
          invalid("unknown_planned_requirement_target");
        const target = units.find(
          u =>
            u.scope === address.scope &&
            (u.slideIndex ?? 0) === address.slideIndex &&
            u.fieldId === address.fieldId
        );
        if (explicit)
          nativeRequirementTargets.push({
            slideIndex: address.slideIndex,
            fieldId: address.fieldId,
          });
        findings.push({
          category: explicit ? "explicit_requirement" : "aesthetic",
          unitId: target?.id ?? null,
          scope: address.scope,
          slideIndex: address.slideIndex,
          fieldId: address.fieldId,
          observed: target?.text.slice(0, 4000) ?? "",
          expected: requirement.description,
          sourceId: source?.id ?? null,
          sourceQuote: source ? requirement.requestQuote! : "",
          explanation,
          consequence: explicit ? "explicit_requirement" : "none",
          certainty: status === "uncertain" ? "uncertain" : "established",
          effect: explicit ? "blocking" : "advisory",
        });
      }
    }
    return { ...check, deliveries, status, explanation };
  });
  if (
    new Set(response.sequenceAssessment.promises.map(p => p.unitId)).size !==
    response.sequenceAssessment.promises.length
  )
    invalid("duplicate_promise");
  const promises = response.sequenceAssessment.promises.map(p => {
    const target = unit(p.unitId);
    const itemKeys = new Set<string>();
    for (const item of p.deliveredItems) {
      if (new Set(item.unitIds).size !== item.unitIds.length)
        invalid("duplicate_delivery_unit");
      const key = arsenalHash([
        item.meaning.trim().toLocaleLowerCase(),
        [...item.unitIds].sort(),
      ]);
      if (itemKeys.has(key)) invalid("duplicate_delivered_item");
      itemKeys.add(key);
      for (const id of item.unitIds) {
        const delivered = unit(id);
        if (target.scope === "art" && delivered.scope !== "art")
          invalid("caption_does_not_fulfill_art_promise", {
            unitId: target.id,
          });
        if (delivered.scope === "art" && !delivered.visibleAliases.length)
          invalid("invisible_promise_delivery", { unitId: id });
      }
    }
    const status =
      p.expectedCount !== null && p.expectedCount > p.deliveredItems.length
        ? ("missing" as const)
        : p.status;
    if (status !== "fulfilled")
      findings.push({
        category: "narrative_gap",
        unitId: target.id,
        scope: target.scope,
        slideIndex: target.slideIndex ?? 0,
        fieldId: target.fieldId,
        observed: target.text.slice(0, 4000),
        expected:
          p.expectedCount !== null
            ? `Entregar os ${p.expectedCount} itens prometidos no destino da promessa, ou ajustar a promessa ao conteúdo efetivamente entregue.`
            : "Entregar a promessa ou ajustar seu alcance ao conteúdo efetivamente apresentado.",
        sourceId: null,
        sourceQuote: "",
        explanation:
          status !== p.status
            ? `A peça promete ${p.expectedCount} itens e a revisão identificou ${p.deliveredItems.length} entregues.`
            : p.explanation,
        consequence: "meaning_loss",
        certainty: status === "uncertain" ? "uncertain" : "established",
        effect: "blocking",
      });
    return { ...p, status };
  });
  const sequenceAssessment = {
    ...response.sequenceAssessment,
    promises,
    status: promises.some(p => p.status === "uncertain")
      ? ("uncertain" as const)
      : promises.some(p => p.status === "missing")
        ? ("material_gap" as const)
        : response.sequenceAssessment.status,
  };
  if (
    sequenceAssessment.status !== "coherent" &&
    !findings.some(
      f =>
        (f.category === "narrative_gap" ||
          f.category === "narrative_structure") &&
        f.consequence !== "none"
    )
  )
    invalid("sequence_gap_without_material_target");
  const normalized = normalizeReviewV9({
    ...options,
    discardedFields: [...options.discardedFields, ...canonical.discardedFields],
    nativeRequirementTargets,
    response: {
      outcome:
        sequenceAssessment.status === "uncertain"
          ? "inconclusive"
          : response.outcome,
      limitation:
        sequenceAssessment.status === "uncertain"
          ? response.limitation || "proposal_review_semantic_inconclusive"
          : response.limitation,
      reviewedSlides: response.reviewedSlides,
      checkedTextUnits: response.unitChecks.map(c => c.unitId),
      requirementChecks: canonical.requirementChecks,
      messageAssessment: response.messageAssessment,
      findings,
      factualAudit: {
        units: response.unitChecks.map(c => ({
          unitId: c.unitId,
          classification:
            c.verdict === "editorial"
              ? ("non_factual" as const)
              : ("factual" as const),
          claimIds: c.verdict === "editorial" ? [] : [`claim_${c.unitId}`],
        })),
        claims,
      },
    },
  });
  return proposalReviewRecordV10Schema.parse({
    ...normalized,
    policyVersion: 10,
    evidenceInventory,
    unitChecks: response.unitChecks,
    intentRequirements,
    intentChecks,
    findingEvidence: response.findings.map((f, findingIndex) => ({
      findingIndex,
      evidenceIds: f.evidenceIds,
    })),
    sequenceAssessment,
  });
}
