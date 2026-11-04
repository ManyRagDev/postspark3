import { arsenalHash } from "../shared/arsenalContent";
import { generationIntentSchema, materialGenerationIntent } from "../shared/generationPlan";
import { executionBriefSchema } from "../shared/generationRequest";
import {
  reviewExecutionConfigV4Schema,
  reviewDurableContextV4Schema,
} from "../shared/proposalReviewV9";
import {
  reviewExecutionConfigV5Schema,
  reviewDurableContextV5Schema,
} from "../shared/proposalReviewV10";
import { editorialContextV9 } from "./ai/workflows/editorialContextV9";
import {
  buildReviewEvidenceAliases,
  reviewEvidenceAnchors,
} from "./ai/workflows/reviewEvidence";
import {
  buildSourceEvidenceV10,
  reviewTextUnitsV10,
} from "./ai/workflows/reviewEvidenceV10";
import { reviewTextUnitsV7 } from "./ai/workflows/proposalReviewPolicy";
import type { ProposalDelivery } from "../shared/generationContracts";
import type { ReviewCopy } from "./ai/workflows/proposalReview";

type Row = Record<string, any>;
const row = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const same = (a: unknown, b: unknown) => arsenalHash(a) === arsenalHash(b);
export const effectiveEvidenceProposalId = (proposal: {
  proposalId: string;
  attempt?: { id: string };
}) => proposal.attempt?.id ?? proposal.proposalId;
export const effectiveEvidenceOperationKey = (
  proposal: { proposalId: string; attempt?: { id: string } },
  canonical: string
) =>
  canonical.startsWith(`${proposal.proposalId}:`)
    ? `${effectiveEvidenceProposalId(proposal)}:${canonical.slice(proposal.proposalId.length + 1)}`
    : canonical;

/** Checks V9/V10 durable source/visible-unit contracts. It does not judge semantics. */
export function inspectModernReviewEvidence(
  request: Row,
  operations: Row[],
  proposal: Extract<ProposalDelivery, { status: "ready" }>,
  check: (code: string, passed: boolean) => void
) {
  const prepared = row(request.prepared),
    policy = prepared.reviewPolicyVersion,
    modern = policy === 10;
  const config = (
    modern ? reviewExecutionConfigV5Schema : reviewExecutionConfigV4Schema
  ).safeParse(prepared.reviewExecutionConfig);
  check(
    "review_execution_config_pinned",
    config.success &&
      (() => {
        const { configurationHash, ...value } = config.data;
        return (
          configurationHash === arsenalHash(value) &&
          prepared.preparationVersion === (modern ? 6 : 5)
        );
      })()
  );
  const index = proposal.attempt?.index ?? 0,
    effectiveId = effectiveEvidenceProposalId(proposal);
  check(
    "attempt_identity_pinned",
    effectiveId === `${proposal.proposalId}${index ? `-fb${index}` : ""}`
  );
  let sourceContext: ReturnType<typeof editorialContextV9> | undefined;
  try {
    const original = row(request.input),
      raw = prepared.executionBrief ?? original.executionBrief;
    sourceContext = editorialContextV9({
      prompt: original.content,
      platform: original.platform,
      postMode: original.postMode,
      tone: original.tone,
      projectSnapshot: original.projectSnapshot,
      projectDossier:
        original.projectDossier ??
        (original.projectId ? prepared.contextContent : undefined),
      contextContent: prepared.contextContent,
      sourceReferences: prepared.sourceReferences,
      executionBrief: raw ? executionBriefSchema.parse(raw) : undefined,
    });
    check(
      "source_context_matches_prepared_input",
      sourceContext.hash === prepared.editorialContextHash &&
        same(sourceContext, prepared.editorialContext)
    );
  } catch {
    check("source_context_matches_prepared_input", false);
  }
  if (!modern) {
    const offer = index
      ? list(list(prepared.alternativeOffers)[proposal.slot])[index - 1]
      : list(prepared.selectedOffers)[proposal.slot];
    check(
      "curated_offer_identity",
      Boolean(
        offer &&
          list(offer.slides).length === proposal.bundle.slides.length &&
          proposal.bundle.slides.every((s, i) => {
            const pin = offer.slides[i],
              origin = s.composition.origin.componentAssembly;
            return (
              origin?.componentIds[0] === pin.componentId &&
              origin?.componentHashes[0] === pin.componentHash
            );
          })
      )
    );
  }
  const byKey = new Map(operations.map(o => [o.operation_key, o]));
  const effects = operations.filter(
    o =>
      String(o.operation_key).startsWith(`${effectiveId}:review:`) ||
      String(o.operation_key).startsWith(
        `${effectiveId}:review_evidence_repair:`
      )
  );
  const siblings = operations.filter(
    o =>
      String(o.operation_key).startsWith(`${proposal.proposalId}:`) ||
      new RegExp(`^${proposal.proposalId}-fb[1-3]:`).test(
        String(o.operation_key)
      )
  );
  check(
    "review_effect_budget",
    effects.length <= 3 &&
      effects.filter(o => String(o.operation_key).includes(":review:initial:"))
        .length <= 1 &&
      effects.filter(o => String(o.operation_key).includes(":review:recheck:"))
        .length <= 1 &&
      siblings.filter(o =>
        String(o.operation_key).includes(":review_evidence_repair:")
      ).length <= 1
  );
  if (modern)
    check(
      "proposal_recovery_budgets",
      siblings.filter(o => String(o.operation_key).endsWith(":copy_recovery"))
        .length <= 1 &&
        siblings.filter(o =>
          String(o.operation_key).includes(":review_correction:")
        ).length <= 1
    );
  const finalCopy: ReviewCopy = {
    caption: proposal.bundle.caption,
    hashtags: proposal.bundle.hashtags,
    slides: proposal.bundle.slides.map(s => ({
      mediaPrompts: [],
      values:
        s.composition.content.schemaVersion === 3
          ? s.composition.content.blocks.flatMap<{
              fieldId: string;
              value: string | string[];
            }>(b =>
              b.type === "list"
                ? [{ fieldId: b.id, value: b.items.map(i => i.text) }]
                : b.type === "text"
                  ? [{ fieldId: b.id, value: b.text }]
                  : []
            )
          : [],
    })),
  };
  const finalAliases = buildReviewEvidenceAliases(
    reviewEvidenceAnchors(
      finalCopy,
      proposal.bundle.slides.map(s => s.composition)
    )
  );
  const finalUnits = (modern ? reviewTextUnitsV10 : reviewTextUnitsV7)(
    finalCopy,
    finalAliases
  );
  // V10 IDs are native addresses; V9 used input order. Neither field ordering
  // nor JSONB ordering changes the meaning of the final delivered inventory.
  const comparableUnits = (units: typeof finalUnits) =>
    units
      .map(({ id, ...unit }) => ({
        ...unit,
        ...(modern ? { id } : {}),
        visibleAliases: unit.visibleAliases.slice().sort(),
      }))
      .sort((a, b) =>
        arsenalHash([
          a.scope,
          a.slideIndex,
          a.fieldId,
          a.itemIndex,
        ]).localeCompare(
          arsenalHash([b.scope, b.slideIndex, b.fieldId, b.itemIndex])
        )
      );
  let firstProfile: string | undefined;
  for (const review of proposal.reviews ?? []) {
    check("review_policy_matches_preparation", review.policyVersion === policy);
    if (review.policyVersion !== 9 && review.policyVersion !== 10) continue;
    for (const key of review.operationKeys) {
      const op = byKey.get(effectiveEvidenceOperationKey(proposal, key));
      const parsed = (
        modern ? reviewDurableContextV5Schema : reviewDurableContextV4Schema
      ).safeParse(row(op?.result).__proposalReview);
      const { transport: _transport, ...expectation } = row(op?.expectation);
      check(
        "review_receipt_context_pinned",
        parsed.success &&
          config.success &&
          parsed.data.configurationHash === config.data.configurationHash &&
          parsed.data.requestId === request.id &&
          parsed.data.proposalId === proposal.proposalId &&
          parsed.data.revision === proposal.revision &&
          parsed.data.round === review.round &&
          parsed.data.inputHash === review.inputHash &&
          parsed.data.sourceContextHash === prepared.editorialContextHash &&
          parsed.data.renderHashes.length === proposal.bundle.slides.length &&
          parsed.data.renderHashes.every((r, i) => r.slideIndex === i) &&
          same(expectation, parsed.data)
      );
      if (!parsed.success) continue;
      const ctx = parsed.data,
        inventory = ctx.anchorInventory;
      check(
        "review_evidence_alias_integrity",
        new Set(inventory.map(a => a.alias)).size === inventory.length &&
          new Set(inventory.map(a => a.anchorId)).size === inventory.length &&
          Object.keys(ctx.aliasMap).length === inventory.length &&
          inventory.every(
            ({ alias, anchorId, ...anchor }) =>
              ctx.aliasMap[alias] === anchorId &&
              arsenalHash(anchor) === anchorId &&
              arsenalHash(anchor.quote) === anchor.textHash
          )
      );
      check(
        "review_text_units_complete",
        new Set(ctx.textUnitInventory.map(u => u.id)).size ===
          ctx.textUnitInventory.length &&
          review.checkedTextUnits.length === ctx.textUnitInventory.length &&
          ctx.textUnitInventory.every(
            u =>
              u.textHash === arsenalHash(u.text) &&
              review.checkedTextUnits.includes(u.id) &&
              u.visibleAliases.every(a => Boolean(ctx.aliasMap[a]))
          )
      );
      check(
        "review_requirements_complete",
        Boolean(
          sourceContext &&
            review.requirementChecks.length ===
              sourceContext.requirements.length &&
            sourceContext.requirements.every(r =>
              review.requirementChecks.some(
                c =>
                  c.requirementId === r.id &&
                  (review.status !== "passed" || c.status === "met") &&
                  c.unitIds.every(id =>
                    ctx.textUnitInventory.some(
                      u =>
                        u.id === id &&
                        (r.scope === "either" || u.scope === r.scope)
                    )
                  )
              )
            )
        )
      );
      if (review === proposal.reviews?.at(-1))
        check(
          "final_review_matches_delivered_text",
          same(
            comparableUnits(ctx.textUnitInventory),
            comparableUnits(finalUnits)
          ) &&
            same(ctx.anchorInventory, finalAliases.inventory) &&
            same(ctx.aliasMap, finalAliases.aliasMap)
        );
      if (modern && review.policyVersion === 10 && ctx.policyVersion === 10) {
        check(
          "review_source_evidence_matches_context",
          Boolean(
            sourceContext &&
              same(
                ctx.evidenceInventory,
                buildSourceEvidenceV10(sourceContext)
              ) &&
              same(review.evidenceInventory, ctx.evidenceInventory)
          )
        );
        check(
          "review_intent_matches_plan",
          same(
            review.intentRequirements,
            materialGenerationIntent(generationIntentSchema.parse(row(prepared.planning).intent))?.requirements
          )
        );
        check(
          "review_intent_content_links",
          review.intentChecks.every(c =>
            c.deliveries.every(d =>
              list(row(row(prepared.planning).intent).content).some(
                content =>
                  content.id === d.contentId &&
                  list(content.requirementIds).includes(c.requirementId)
              )
            )
          )
        );
      }
      firstProfile ??= ctx.profile;
      check("review_profile_unchanged", ctx.profile === firstProfile);
    }
  }
}
