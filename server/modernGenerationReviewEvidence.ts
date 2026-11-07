import { decodeReviewExceptionsV10, normalizeReviewExceptionsV10 } from "./ai/workflows/proposalReviewExceptionsPolicyV10";
import { decodeReviewV10 } from "./ai/workflows/proposalReviewPolicyV10";
import { normalizeAutomaticReviewResponse, normalizeAutomaticReviewResponseV3, visualLossCorrectionUnitIdsV3, visualLossCorrectionMarkersV3, isAutomaticReviewNormalizationMarker } from "./ai/workflows/automaticReviewProtocol";
import { extractTextContent } from "./ai/llmJson";
import { arsenalHash } from "../shared/arsenalContent";
import { firstDeliveryReviewSlot, generationIntentSchema, materialGenerationIntent, type GenerationPlanningReceipt } from "../shared/generationPlan";
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
  const firstDelivery = firstDeliveryReviewSlot(prepared.planning as GenerationPlanningReceipt | undefined) === proposal.slot;
  const repairs = siblings.filter(o => String(o.operation_key).includes(":review_evidence_repair:"));
  const repairRounds = repairs.map(o => String(o.operation_key).split(":")[2]);
  check(
    "review_effect_budget",
    effects.length <= (firstDelivery ? 4 : 3) &&
      effects.filter(o => String(o.operation_key).includes(":review:initial:"))
        .length <= 1 &&
      effects.filter(o => String(o.operation_key).includes(":review:recheck:"))
        .length <= 1 &&
      repairs.length <= (firstDelivery ? new Set(repairRounds).size : 1)
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
    const exceptions=config.success && "automaticReviewVersion" in config.data && config.data.automaticReviewVersion===4;
    check("review_protocol_matches_config", exceptions === ("automaticReviewVersion" in review && review.automaticReviewVersion===4));
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
      if ("automaticReviewVersion" in review) {
        check("review_source_evidence_matches_context", Boolean(sourceContext && ctx.policyVersion===10 && same(ctx.evidenceInventory,buildSourceEvidenceV10(sourceContext)) && same(review.evidenceInventory,ctx.evidenceInventory)));
        if(key===review.operationKeys.at(-1)){
          let consistent=false;
          try{if(exceptions && sourceContext && ctx.policyVersion===10){
            const raw=decodeReviewExceptionsV10(extractTextContent(row(op?.result).choices?.[0]?.message?.content));
            const aliases=buildReviewEvidenceAliases(ctx.anchorInventory.map(({alias:_alias,...anchor})=>anchor));
            const normalized=normalizeReviewExceptionsV10({response:raw,units:ctx.textUnitInventory,evidenceInventory:ctx.evidenceInventory,context:sourceContext,aliases,
              slideCount:ctx.renderHashes.length,round:review.round,inputHash:review.inputHash,operationKeys:review.operationKeys});
            consistent=same(normalized,review);
          }}catch{/* A malformed/missing receipt cannot certify a declared inspection. */}
          check("review_exception_record_matches_receipt",consistent);
        }
        if(review===proposal.reviews?.at(-1))check("final_review_matches_delivered_text",same(comparableUnits(ctx.textUnitInventory),comparableUnits(finalUnits))&&same(ctx.anchorInventory,finalAliases.inventory)&&same(ctx.aliasMap,finalAliases.aliasMap));
        firstProfile??=ctx.profile;check("review_profile_unchanged",ctx.profile===firstProfile);
        continue;
      }
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
        if (key === review.operationKeys.at(-1)) {
          const markers = review.discardedFields.filter(isAutomaticReviewNormalizationMarker);
          const automaticVersion = config.success && "automaticReviewVersion" in config.data ? config.data.automaticReviewVersion : undefined;
          const automaticV2 = automaticVersion === 2 || automaticVersion === 3;
          if (automaticV2 || markers.length) {
            let consistent = false;
            try {
              if (automaticV2 && sourceContext) {
                const decoded = decodeReviewV10(extractTextContent(row(op?.result).choices?.[0]?.message?.content));
                const local = (automaticVersion === 3 ? normalizeAutomaticReviewResponseV3 : normalizeAutomaticReviewResponse)(decoded.response, {
                  generationIntent: materialGenerationIntent(generationIntentSchema.parse(row(prepared.planning).intent)),
                  units: ctx.textUnitInventory,
                  contextRequirementIds: sourceContext.requirements.map(r => r.id),
                });
                const visualIds = automaticVersion === 3 ? visualLossCorrectionUnitIdsV3(local.response) : [];
                const visualMarkers = visualIds.length && review.status === "correction_required" ? visualLossCorrectionMarkersV3(local.response, visualIds) : [];
                consistent = same(markers, [...local.discardedFields, ...visualMarkers]) && same(local.response.unitChecks, review.unitChecks) &&
                  (automaticVersion !== 3 || local.response.findings.every(raw => review.findings.some(f =>
                    f.unitId === raw.unitId && f.category === raw.category && f.consequence === (raw.category === "contrast" ? "none" : raw.consequence) &&
                    f.certainty === raw.certainty && f.expected === raw.expected && f.explanation === raw.explanation))) &&
                  (!visualMarkers.length || (visualIds.every(id => review.findings.some(f => f.unitId === id && f.category === "visible_text_loss" && f.certainty === "established" && f.effect === "blocking")) &&
                    !review.findings.some(f => f.unitId && visualIds.includes(f.unitId) && f.category === "unsupported_claim" && f.certainty === "uncertain")));
              }
            } catch { /* Missing or altered raw receipts cannot prove normalization. */ }
            check("review_local_normalization_matches_receipt", consistent);
          }
        }

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
