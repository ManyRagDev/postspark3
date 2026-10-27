import { reviewExecutionConfigV3Schema, reviewDurableContextV3Schema } from "../shared/proposalReviewV8";
import { editorialContextV8 } from "./ai/workflows/editorialContextV8";
import { reviewExecutionConfigV2Schema, reviewDurableContextV2Schema } from "../shared/proposalReviewV7";
import { effectiveContentRequirements, type RequirementBrief } from "../shared/contentRequirements";
import { editorialContextV7 } from "./ai/workflows/editorialContextV7";
import { executionBriefSchema } from "../shared/generationRequest";
import { arsenalHash } from "../shared/arsenalContent";
import { proposalDeliverySchema } from "../shared/generationContracts";
import { inspectDesignElection } from "./designElectionEvidence";
import { reviewExecutionConfigV1Schema, reviewDurableContextV1Schema } from "../shared/proposalReview";
import {
  isPaidGenerationOperation,
  journalOperationWasLocal,
} from "./ai/workflows/generationJournalTrace";

type Row = Record<string, unknown>;
const row = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const nonempty = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
const metric = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
export type GenerationEvidenceInput = {
  request: Row;
  operations: Row[];
  /** Undefined skips the saved-post check; null means requested but absent. */
  post?: Row | null;
  reservation?: Row | null;
};

/** Pure persisted-data audit. No I/O, generation, repair or rendering. */
export function inspectGenerationEvidence(input: GenerationEvidenceInput) {
  const request = input.request;
  const checks: { code: string; scope: string; passed: boolean }[] = [];
  const check = (code: string, passed: boolean, scope = "request") =>
    checks.push({ code, scope, passed });
  const operations = input.operations;
  const operationByKey = new Map(operations.map(op => [op.operation_key, op]));
  const completed = (key: string) =>
    operationByKey.get(key)?.state === "completed";
  const providerCalls = (key: string) => {
    const metadata = row(
      row(operationByKey.get(key)?.result).__generationTrace
    );
    return metadata.version === 1 ? list(metadata.calls).map(row) : [];
  };
  const providerLinked = (key: string) => {
    const result = row(operationByKey.get(key)?.result);
    const calls = providerCalls(key);
    return (
      completed(key) &&
      (calls.length
        ? calls.every(
            call =>
              nonempty(call.providerId) &&
              nonempty(call.effectiveModel) &&
              call.effectiveModelReported !== false
          )
        : nonempty(result.id) && nonempty(result.model))
    );
  };
  check("terminal_completed", request.status === "completed");
  check("operation_keys_unique", operationByKey.size === operations.length);
  check(
    "no_unresolved_operations",
    operations.length > 0 && operations.every(op => op.state === "completed")
  );
  check("selection_persisted", completed("prepare:selection"));
  const rawProposals = list(request.proposals);
  const slots = rawProposals.map(v => row(v).slot);
  check(
    "three_ready_slots",
    rawProposals.length === 3 &&
      [0, 1, 2].every(slot => slots.filter(v => v === slot).length === 1) &&
      rawProposals.every(v => row(v).status === "ready")
  );
  const ids = rawProposals.map(v => row(v).proposalId);
  check("proposal_ids_unique", ids.every(nonempty) && new Set(ids).size === 3);
  const prepared = row(request.prepared);
  const designElection = inspectDesignElection(request, operations);
  if (designElection.status !== "legacy_unverified") check("design_election_coverage_complete", designElection.complete);
  const pinned = reviewExecutionConfigV1Schema.safeParse(prepared.reviewExecutionConfig);
  const proposals = rawProposals.map(raw => {
    const source = row(raw),
      scope = `slot:${source.slot}`;
    const parsed = proposalDeliverySchema.safeParse(raw);
    check(
      "canonical_delivery",
      parsed.success && parsed.data.status === "ready",
      scope
    );
    if (!parsed.success || parsed.data.status !== "ready")
      return { slot: source.slot, status: source.status, canonical: false };
    const proposal = parsed.data,
      { bundle } = proposal;
    check("request_identity", proposal.runId === request.id, scope);
    const review = proposal.reviews?.at(-1);
    check(
      "all_slides_review_passed",
      Boolean(
        review &&
          review.status === "passed" &&
          review.reviewedSlides.length === bundle.slides.length &&
          new Set(review.reviewedSlides).size === bundle.slides.length &&
          bundle.slides.every((_s, i) => review.reviewedSlides.includes(i))
      ),
      scope
    );
    check(
      "copy_provider_result_persisted",
      providerLinked(`${proposal.proposalId}:copy`),
      scope
    );
    for (const review of proposal.reviews ?? [])
      check(
        "review_provider_result_persisted",
        (review.policyVersion === 5 || review.policyVersion === 6 || review.policyVersion === 7) ? review.operationKeys[0] === `${proposal.proposalId}:review:${review.round}:${review.inputHash}` && review.operationKeys.every((key,index) => (index === 0 || key.startsWith(`${proposal.proposalId}:review_evidence_repair:${review.round}:`)) && providerLinked(key)) : providerLinked(`${proposal.proposalId}:review:${review.round}:${review.inputHash}`),
        scope
      );
    if (proposal.reviews?.some(r => r.policyVersion === 5 || r.policyVersion === 6 || r.policyVersion === 7)) {
      const effects = operations.filter(o=>String(o.operation_key).startsWith(`${proposal.proposalId}:review:`) || String(o.operation_key).startsWith(`${proposal.proposalId}:review_evidence_repair:`));
      check("review_effect_budget",effects.length <= 3 && effects.filter(o=>String(o.operation_key).includes(":review_evidence_repair:")).length <= 1 && effects.filter(o=>String(o.operation_key).includes(":review:initial:")).length <= 1 && effects.filter(o=>String(o.operation_key).includes(":review:recheck:")).length <= 1,scope);
      const offer = row(list(prepared.selectedOffers)[proposal.slot]);
      check("curated_offer_identity",((prepared.preparationVersion === 2 && (prepared.reviewPolicyVersion === 5 || prepared.reviewPolicyVersion === 6)) || (prepared.preparationVersion === 3 && prepared.reviewPolicyVersion === 7) || (prepared.preparationVersion === 4 && prepared.reviewPolicyVersion === 8)) && list(offer.slides).length === bundle.slides.length && bundle.slides.every((s,i)=>{const pin=row(list(offer.slides)[i]),origin=s.composition.origin.componentAssembly;return origin?.componentIds[0] === pin.componentId && origin?.componentHashes[0] === pin.componentHash;}),scope);
    }
    if (proposal.reviews?.some(r => r.policyVersion === 6)) {
      const configValid = pinned.success && (() => {
        const {configurationHash,...data}=pinned.data;
        return configurationHash === arsenalHash(data);
      })();
      check("review_execution_config_pinned",configValid && prepared.reviewPolicyVersion === 6,scope);
      let firstProfile: string | undefined;
      for(const review of proposal.reviews.filter(r=>r.policyVersion===6)) {
        if(review.policyVersion!==6) continue;
        for(const key of review.operationKeys) {
          const ctx = reviewDurableContextV1Schema.safeParse(row(operationByKey.get(key)?.result).__proposalReview);
          const valid = ctx.success && pinned.success && ctx.data.configurationHash===pinned.data.configurationHash && ctx.data.requestId===request.id && ctx.data.proposalId===proposal.proposalId && ctx.data.revision===proposal.revision && ctx.data.round===review.round && ctx.data.inputHash===review.inputHash && ctx.data.renderHashes.length===bundle.slides.length && ctx.data.renderHashes.every((r,i)=>r.slideIndex===i);
          check("review_receipt_context_pinned",Boolean(valid),scope);
          if(ctx.success) {
            const inventory=ctx.data.anchorInventory;
            check("review_evidence_alias_integrity", new Set(inventory.map(a=>a.alias)).size===inventory.length && new Set(inventory.map(a=>a.anchorId)).size===inventory.length && Object.keys(ctx.data.aliasMap).length===inventory.length && inventory.every(({alias,anchorId,...anchor})=>ctx.data.aliasMap[alias]===anchorId && arsenalHash(anchor)===anchorId && arsenalHash(anchor.quote)===anchor.textHash),scope);
            firstProfile ??= ctx.data.profile;
            check("review_profile_unchanged",ctx.data.profile===firstProfile,scope);
          }
        }
      }
    }
    if (proposal.reviews?.some(r=>r.policyVersion===7||r.policyVersion===8)) {
      const modern=prepared.reviewPolicyVersion===8;
      const config=(modern?reviewExecutionConfigV3Schema:reviewExecutionConfigV2Schema).safeParse(prepared.reviewExecutionConfig);
      check("review_execution_config_pinned",config.success && (()=>{const {configurationHash,...data}=config.data;return configurationHash===arsenalHash(data)&&(modern?prepared.preparationVersion===4&&prepared.reviewPolicyVersion===8:prepared.preparationVersion===3&&prepared.reviewPolicyVersion===7);})(),scope);
      const requirements=prepared.editorialContext ? (prepared.editorialContext as ReturnType<typeof editorialContextV7>).requirements : effectiveContentRequirements(prepared.executionBrief as RequirementBrief|undefined);
      const original=row(request.input);
      const rawBrief=prepared.executionBrief??original.executionBrief;
      const brief=rawBrief?executionBriefSchema.safeParse(rawBrief):undefined;
      if(nonempty(original.content))check("source_context_matches_prepared_input",(!brief||brief.success)&&(modern?editorialContextV8:editorialContextV7)({prompt:original.content, platform:original.platform as string, postMode:original.postMode as "static"|"carousel", tone:original.tone as string|undefined, projectSnapshot:original.projectSnapshot as any, projectDossier:(original.projectDossier ?? (original.projectId ? prepared.contextContent : undefined)) as string|undefined, contextContent:typeof prepared.contextContent==="string"?prepared.contextContent:undefined,executionBrief:brief?.success?brief.data:undefined}, config.success && config.data.policyVersion===7 ? config.data.editorialGuidanceVersion : undefined).hash===prepared.editorialContextHash,scope);
      let firstProfile:string|undefined;
      for(const review of proposal.reviews.filter(r=>r.policyVersion===7||r.policyVersion===8)) {
        if(review.policyVersion!==7&&review.policyVersion!==8)continue;
        for(const key of review.operationKeys) {
          const context=(modern?reviewDurableContextV3Schema:reviewDurableContextV2Schema).safeParse(row(operationByKey.get(key)?.result).__proposalReview);
          check("review_receipt_context_pinned",context.success&&config.success&&context.data.configurationHash===config.data.configurationHash&&context.data.requestId===request.id&&context.data.proposalId===proposal.proposalId&&context.data.revision===proposal.revision&&context.data.round===review.round&&context.data.inputHash===review.inputHash&&context.data.sourceContextHash===prepared.editorialContextHash&&context.data.renderHashes.length===bundle.slides.length&&context.data.renderHashes.every((r,i)=>r.slideIndex===i),scope);
          if(!context.success)continue;
          const ctx=context.data,inventory=ctx.anchorInventory;
          check("review_evidence_alias_integrity",new Set(inventory.map(a=>a.alias)).size===inventory.length&&new Set(inventory.map(a=>a.anchorId)).size===inventory.length&&Object.keys(ctx.aliasMap).length===inventory.length&&inventory.every(({alias,anchorId,...anchor})=>ctx.aliasMap[alias]===anchorId&&arsenalHash(anchor)===anchorId&&arsenalHash(anchor.quote)===anchor.textHash),scope);
          check("review_text_units_complete",new Set(ctx.textUnitInventory.map(u=>u.id)).size===ctx.textUnitInventory.length&&review.checkedTextUnits.length===ctx.textUnitInventory.length&&ctx.textUnitInventory.every(u=>u.textHash===arsenalHash(u.text)&&review.checkedTextUnits.includes(u.id)&&u.visibleAliases.every(a=>Boolean(ctx.aliasMap[a]))),scope);
          check("review_requirements_complete",review.requirementChecks.length===requirements.length&&requirements.every(r=>review.requirementChecks.some(c=>c.requirementId===r.id&&c.status==="met"&&c.unitIds.every(id=>ctx.textUnitInventory.some(u=>u.id===id&&(r.scope==="either"||u.scope===r.scope))))),scope);
          firstProfile??=ctx.profile;check("review_profile_unchanged",ctx.profile===firstProfile,scope);
        }
      }
    }
    const obligation = row(
      list(prepared.perProposalImageObligations)[proposal.slot] ??
        prepared.imageObligation
    );
    const media = bundle.slides.flatMap((slide, slideIndex) =>
      (slide.composition.base.mediaSlots ?? []).map(slot => {
        const value = slide.composition.media[slot.id];
        const filled = nonempty(value?.url);
        const owned =
          filled &&
          new RegExp(
            `^/api/post-media/${request.owner_id}/[a-f0-9]{64}$`,
            "i"
          ).test(value.url!);
        const mediaScope = `${scope}:slide:${slideIndex}:media:${slot.id}`;
        if (slot.deferred) {
          check("required_media_private", Boolean(owned), mediaScope);
          const key = `${proposal.proposalId}:image:${slideIndex}:${slot.id}`;
          check(
            "media_operation_persisted",
            completed(key) &&
              row(operationByKey.get(key)?.result).url === value?.url,
            mediaScope
          );
        }
        return {
          slideIndex,
          slotId: slot.id,
          required: Boolean(slot.deferred),
          filled,
          private: Boolean(owned),
        };
      })
    );
    if (obligation.required === true || obligation.policy === "required")
      check(
        "image_obligation_filled",
        media.some(m => m.filled && m.private),
        scope
      );
    return {
      slot: proposal.slot,
      proposalId: proposal.proposalId,
      status: proposal.status,
      canonical: true,
      family: bundle.family,
      slides: bundle.slides.map(slide => ({
        id: slide.id,
        role: slide.role,
        aspectRatio: slide.composition.effectiveAspectRatio,
        compositionHash: arsenalHash(slide.composition),
      })),
      review: review
        ? {
            status: review.status,
            round: review.round,
            inputHash: review.inputHash,
            reviewedSlides: review.reviewedSlides,
            findings: review.findings.length,
          }
        : null,
      media,
    };
  });
  const billing = {
    mode: request.billing_mode,
    ledger: request.billing_ledger,
    reserved: request.billing_reserved,
    debited: request.billing_debited,
    settledAt: request.billing_settled_at,
    reservationStatus: input.reservation?.status ?? null,
  };
  const readyCount = rawProposals.filter(p => row(p).status === "ready").length;
  check(
    "billing_terminal_settled",
    nonempty(request.billing_settled_at) && request.billing_error == null
  );
  check(
    "canonical_billing_mode",
    ["reserved", "unlimited"].includes(String(request.billing_mode))
  );
  if (request.billing_mode === "reserved") {
    const expected =
      readyCount === 0
        ? 0
        : Number(request.billing_preparation) +
          readyCount * Number(request.billing_per_proposal);
    check(
      "billing_pricing_persisted",
      Number.isInteger(request.billing_preparation) &&
        Number.isInteger(request.billing_per_proposal) &&
        Number.isInteger(request.billing_reserved)
    );
    const reservation = input.reservation;
    check(
      "billing_linked_reservation",
      Boolean(
        reservation &&
          reservation.id === request.billing_reservation_id &&
          reservation.user_uuid === request.owner_id
      )
    );
    // Upgrade to an unlimited plan before settlement releases the original hold.
    const released =
      request.billing_debited === 0 && reservation?.status === "refunded";
    check(
      "billing_amount_matches_deliveries",
      released ||
        (request.billing_debited === expected &&
          expected <= Number(request.billing_reserved))
    );
    check(
      "billing_reservation_terminal",
      Boolean(
        reservation &&
          (released ||
            (reservation.status === "committed" &&
              reservation.amount === request.billing_debited))
      )
    );
  } else if (request.billing_mode === "unlimited")
    check("unlimited_zero_debit", request.billing_debited === 0);
  let savedPost: Row | undefined;
  if (input.post !== undefined) {
    const post = input.post,
      model = row(post?.canvas_model),
      provenance = row(model.completeDesign);
    const proposal = rawProposals
      .map(p => proposalDeliverySchema.safeParse(p))
      .find(
        p =>
          p.success &&
          p.data.status === "ready" &&
          p.data.slot === provenance.slot
      );
    const bundle =
      proposal?.success && proposal.data.status === "ready"
        ? proposal.data.bundle
        : undefined;
    check(
      "saved_post_same_owner",
      Boolean(post && post.user_uuid === request.owner_id),
      "saved-post"
    );
    check(
      "saved_document_identity",
      Boolean(
        bundle &&
          provenance.runId === request.id &&
          provenance.traceId === request.id &&
          model.id === `cd-${request.id}-${bundle.slot}` &&
          model.modelVersion === 2
      ),
      "saved-post"
    );
    const savedSlides = list(model.slides).map(row);
    const sameCompositions = Boolean(
      bundle &&
        savedSlides.length === bundle.slides.length &&
        savedSlides.every(
          (slide, i) =>
            slide.id === bundle.slides[i].id &&
            arsenalHash(slide.composition) ===
              arsenalHash(bundle.slides[i].composition)
        )
    );
    check("saved_compositions_match_delivery", sameCompositions, "saved-post");
    const sameAspect = Boolean(
      bundle &&
        model.aspectRatio ===
          bundle.slides[0]?.composition.effectiveAspectRatio &&
        savedSlides.every(
          (slide, i) =>
            row(slide.composition).effectiveAspectRatio ===
            bundle.slides[i]?.composition.effectiveAspectRatio
        )
    );
    check("saved_aspect_matches_delivery", sameAspect, "saved-post");
    savedPost = {
      id: post?.id ?? null,
      slot: provenance.slot,
      aspectRatio: model.aspectRatio,
      compositionsMatch: sameCompositions,
      aspectMatches: sameAspect,
    };
  }
  const paidOperations = operations.filter(
    op =>
      isPaidGenerationOperation(String(op.operation_key)) &&
      !journalOperationWasLocal(op.result)
  );
  const missingProviderIds = paidOperations
    .filter(op => !providerLinked(String(op.operation_key)))
    .map(op => op.operation_key);
  return {
    schemaVersion: 1,
    verification: "persisted-generation-data-only",
    passed: checks.every(c => c.passed),
    requestId: request.id,
    status: request.status,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    checks,
    designElection,
    proposals,
    billing,
    savedPost,
    operations: operations.map(op => {
      const result = row(op.result);
      return {
        key: op.operation_key,
        state: op.state,
        providerId: nonempty(result.id) ? result.id : null,
        model: nonempty(result.model) ? result.model : null,
        providerCalls: providerCalls(String(op.operation_key)).map(call => ({
          providerId: nonempty(call.providerId) ? call.providerId : null,
          model:
            nonempty(call.effectiveModel) &&
            call.effectiveModelReported !== false
              ? call.effectiveModel
              : null,
          promptTokens: metric(call.promptTokens),
          completionTokens: metric(call.completionTokens),
          totalTokens: metric(call.totalTokens),
          costSource: ["provider", "estimate"].includes(String(call.costSource))
            ? call.costSource
            : "unknown",
          estimatedCostUsd: metric(call.estimatedCostUsd),
        })),
        resultHash: op.result == null ? null : arsenalHash(op.result),
      };
    }),
    providerEvidence: {
      complete: missingProviderIds.length === 0,
      missingOperationKeys: missingProviderIds,
    },
    limitations: [
      "Read-only database snapshot; no browser interaction, rendering, generation, media fetching or authentication flow was exercised.",
      "Persisted review decisions and operation results are checked; provider receipts and actual visible pixels are not independently replayed.",
      "Historical normalized results can lack provider IDs. Durable call metadata is checked when present, including every attempt; providerEvidence reports missing links separately.",
      "Saved-post equality, when requested, expects unchanged delivered compositions. Intentional edits or format changes are reported as mismatches.",
      "Request, operations and optional post/reservation are separate reads; rerun against a stable terminal request if concurrent writes occur.",
    ],
  };
}

export function parseGenerationEvidenceArgs(args: string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i],
      value = args[i + 1];
    if (
      !["--id", "--post-id", "--output"].includes(name) ||
      !value ||
      value.startsWith("--") ||
      values.has(name)
    )
      throw new Error(
        "Use --id UUID [--post-id INTEGER] [--output evidence.json]"
      );
    values.set(name, value);
  }
  const id = values.get("--id");
  if (
    !id ||
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id)
  )
    throw new Error("--id must identify one existing generation UUID");
  const postId = values.get("--post-id");
  if (
    postId &&
    (!/^[1-9]\d*$/.test(postId) || !Number.isSafeInteger(Number(postId)))
  )
    throw new Error("--post-id must be a positive safe integer");
  return {
    id,
    postId: postId ? Number(postId) : undefined,
    output:
      values.get("--output") ?? `/tmp/postspark-generation-${id}-evidence.json`,
  };
}
