import { compactGenerationIntentSchema, legacyAutomaticGenerationIntentSchema, projectCompactGenerationIntent } from "../shared/compactGenerationIntent";
import {familyTie, PROPOSAL_SELECTION_POLICY, proposalSelectionHistory} from "../shared/familyNeutrality";
import { arsenalHash } from "../shared/arsenalContent";
import { z } from "zod";
import { readPreparationResult, preparationExpectationSchema } from "../shared/generationPreparationReceipt";
import {
  componentCardV1Schema,
  componentDefinitionV1Schema,
  compactComponentCard,
} from "../shared/componentAssembly";
import {
  catalogCoverageSchema,
  assertCatalogCoverage,
} from "../shared/designElection";
import {
  describeDesignFamilyRepertoire,
  describeConciseDesignFamilyRepertoire,
  describeCoverOnlyDesignFamilyRepertoire,
} from "../shared/compactDesignProfile";
import {
  resolveDesignFamilyRepertoires,
  materializeDesignFamilyOffer,
} from "../shared/designRepertoire";
import {
  generationEditorialIntentSchema,
  generationIntentLegacySchema,
  normalizeGenerationIntent,
  generationPlanResponseSchema,
  generationSlotPlanSchema,
  validateGenerationPlan,
  validateGenerationIntent,
  repertoireMeetsMedia,
  type GenerationPlanningReceipt,
} from "../shared/generationPlan";
import { imageObligationSchema } from "../shared/generationContracts";
import { readGenerationVisualRequirements, repertoireMeetsVisualRequirements } from "../shared/generationVisualRequirements";
import { designHasPhotographicContent } from "../shared/designSelection";
import { catalogScopeHash } from "./designCatalog/catalogCoverage";
import { journalOperationWasLocal } from "./ai/workflows/generationJournalTrace";
import { combineEditorialDesignProfile, discardUnattributedEditorialSignals, editorialRequestEvidence, frozenEditorialCatalogSchema, validateEditorialIntent, type FrozenEditorialCatalog } from "../shared/editorialIntent";
import { buildFamilySelectionCandidates, familyAssessmentProfile } from "../shared/designFamilySelection";
import { FAMILY_RETRIEVAL_POLICY as retrievalPolicy } from "../shared/familyRetrieval";
import { assertFamilyRetrieval, familySearchQuery, familyVisualQuery, semanticFamilyQuery } from "./designCatalog/familyRetrieval";
import { planFamilyRecovery, FAMILY_RECOVERY_REASON } from "../shared/familyRecovery";
import { inspectFamilyPlanFit } from "./designCatalog/familyPlanFit";
import { buildHeuristicGenerationPlan, deliveryProposalReserves, distinctProposalRecovery } from "./ai/workflows/heuristicPlanBuilder";
import { deliveryRecoveryReadKeys } from "../shared/generationPlan";

type Row = Record<string, any>;
const row = (v: unknown): Row =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const same = (a: unknown, b: unknown) => arsenalHash(a) === arsenalHash(b);
const sameCard = (a: ReturnType<typeof compactComponentCard>, b: ReturnType<typeof compactComponentCard>) =>
  same({ ...a, fontFamilies: [...a.fontFamilies].sort() }, { ...b, fontFamilies: [...b.fontFamilies].sort() });
const sameIds = (a: string[], b: string[]) =>
  new Set(a).size === a.length &&
  new Set(b).size === b.length &&
  same([...a].sort(), [...b].sort());
const clean = (value: unknown) => {
  const { __generationTrace, ...result } = row(value);
  return row(readPreparationResult(result));
};

/** Reconstructs the repertoire from the frozen cards, never from today's catalog.
 * Receipt integrity establishes recorded participation, not semantic suitability. */
export function inspectPlannedDesignElection(request: Row, operations: Row[]) {
  const prepared = row(request.prepared),
    input = row(request.input),
    planning = row(prepared.planning) as GenerationPlanningReceipt;
  const config = row(request.generation_config ?? request.generationConfig);
  const editorialEnabled = config.editorialIntentVersion === 1;
  let editorialCatalog: FrozenEditorialCatalog | null = null;
  const issues: string[] = [];
  const completed = (key: string) => {
    const op = operations.find(o => o.operation_key === key);
    return op?.state === "completed" ? clean(op.result) : null;
  };
  const selectionInput = completed("prepare:selection_input");
  const neutrality=selectionInput?.familyNeutrality;
  const automatic = selectionInput?.automaticSemanticVersion === 1;
  const compactAutomatic = automatic && selectionInput?.compactIntentVersion === 1;
  const distinctProposals = neutrality?.proposalSelectionVersion === PROPOSAL_SELECTION_POLICY.version;
  const recent = completed("prepare:recent_selections");
  const proposalHistory = distinctProposals ? proposalSelectionHistory(list(recent?.selections), recent?.parentSelection) : list(recent?.selections);
  const familyRanking = selectionInput?.familyRankingVersion === 1;
  const boundedRetrieval = selectionInput?.familyRetrievalVersion === 1;
  const recoveryEnabled = selectionInput?.familyRecoveryVersion === 1;
  const familyElection = row(row(planning).familyElection);
  const catalog = completed("prepare:catalog"),
    parsedCoverage = catalogCoverageSchema.safeParse(catalog?.coverage);
  const coverage = parsedCoverage.success ? parsedCoverage.data : null;
  let repertoires: ReturnType<typeof resolveDesignFamilyRepertoires> = [];
  let familyCandidates: ReturnType<typeof buildFamilySelectionCandidates> = [];
  const familyScores = new Map<string, { score: number; confidence: number }>();
  const slots: Row[] = [],
    scores = new Map<string, { score: number; confidence: number }>();
  const scoringBatches: Row[] = [];
  const check = (condition: unknown, code: string) => {
    if (!condition) issues.push(code);
  };
  const profileHash = (repertoire: ReturnType<typeof resolveDesignFamilyRepertoires>[number]) => {
    if (editorialEnabled) {
      const profile = selectionInput?.shortlistProfileEncoding === "repertoire_pages_v1"
        ? describeConciseDesignFamilyRepertoire(repertoire)
        : describeCoverOnlyDesignFamilyRepertoire(repertoire);
      return arsenalHash(combineEditorialDesignProfile(profile, editorialCatalog, repertoire.sourceId, repertoire.sourceHash));
    }
    const recorded = planning.candidates.find(c => c.id === repertoire.defaultOffer.offerId)?.profileHash;
    const accepted = [
      arsenalHash(describeDesignFamilyRepertoire(repertoire)),
      arsenalHash(describeConciseDesignFamilyRepertoire(repertoire)),
      arsenalHash(describeCoverOnlyDesignFamilyRepertoire(repertoire)),
    ];
    return recorded && accepted.includes(recorded) ? recorded : accepted[0];
  };
  if (!prepared.planning) {
    const interrupted = operations.filter(o => ["prepare:intent", "prepare:selection"].includes(String(o.operation_key)) && o.state !== "completed");
    return { status: "incomplete" as const, complete: false, stage: "selection", message: "A preparação da estratégia 2 não concluiu um plano. O catálogo e as operações registrados continuam disponíveis para diagnóstico.",
      registeredDesigns: [], candidates: [], slots: [], issues: ["planning_not_completed", ...interrupted.map(o => `operation_${o.state}:${o.operation_key}`)],
      preparation: { strategyVersion: 2, pendingOperationKeys: interrupted.map(o => o.operation_key), catalogReceiptHash: coverage?.receiptHash ?? null } };
  }
  try {
    check(automatic === Boolean(config.taskRouting), "automatic_policy_pin_mismatch");
    check(automatic ? neutrality?.creativeFlexibility === 1 : neutrality?.creativeFlexibility === undefined, "creative_flexibility_unpinned");
    check(selectionInput?.familyRankingVersion === undefined || familyRanking, "family_ranking_protocol_unsupported");
    check(selectionInput?.familyRetrievalVersion === undefined || boundedRetrieval, "family_retrieval_protocol_unsupported");
    check(selectionInput?.familyRecoveryVersion === undefined || recoveryEnabled && boundedRetrieval, "family_recovery_protocol_unsupported");
    check(familyRanking ? familyElection.version === (recoveryEnabled ? 3 : boundedRetrieval ? 2 : 1) : !Object.hasOwn(planning, "familyElection"), "family_ranking_protocol_mismatch");
    check(recoveryEnabled || familyElection.recovery === undefined, "family_recovery_unpinned");
    check(config.editorialIntentVersion === undefined || editorialEnabled, "editorial_protocol_unsupported");
    if (editorialEnabled) {
      if (!selectionInput || !Object.prototype.hasOwnProperty.call(selectionInput, "editorialCatalog") ||
          !Object.prototype.hasOwnProperty.call(planning, "editorialCatalog"))
        throw new Error("editorial_catalog_receipt_missing");
      editorialCatalog = selectionInput.editorialCatalog === null ? null : frozenEditorialCatalogSchema.parse(selectionInput.editorialCatalog);
      const plannedCatalog = planning.editorialCatalog === null ? null : frozenEditorialCatalogSchema.parse(planning.editorialCatalog);
      check(same(editorialCatalog, plannedCatalog), "editorial_catalog_receipt_mismatch");
      const catalogRevision = request.catalog_revision ?? request.catalogRevision;
      check(!editorialCatalog || catalogRevision == null || editorialCatalog.catalogRevision === String(catalogRevision), "editorial_catalog_revision_mismatch");
    } else {
      check(!Object.prototype.hasOwnProperty.call(planning, "editorialCatalog") &&
        !Object.prototype.hasOwnProperty.call(row(selectionInput), "editorialCatalog"), "editorial_protocol_unpinned");
    }
    if (config.preparationBudget) for (const key of ["prepare:intent", "prepare:selection"]) {
      const operation = operations.find(o => o.operation_key === key);
      if (!operation || operation.state !== "completed") continue;
      if (key === "prepare:selection" && journalOperationWasLocal(operation.result)) continue;
      const result = row(operation.result), marker = row(result.__preparationReceipt);
      const expectation = preparationExpectationSchema.safeParse(operation.expectation);
      check(marker.version === 1 && expectation.success &&
        arsenalHash(marker.expectation) === arsenalHash(operation.expectation) &&
        expectation.data.configurationHash === config.configurationHash &&
        expectation.data.model === (automatic ? config.taskRouting[key === "prepare:intent" ? "intent" : "copy"].model : config.model) && result.model === expectation.data.model &&
        typeof result.id === "string" && result.id.length > 0,
        `preparation_receipt_identity_mismatch:${key}`);
      if (editorialEnabled && key === "prepare:intent") {
        const schema = z.toJSONSchema(automatic ? compactAutomatic ? compactGenerationIntentSchema : legacyAutomaticGenerationIntentSchema : generationEditorialIntentSchema);
        delete schema.$schema;
        check(expectation.success && expectation.data.responseFormatHash === arsenalHash({
          type: "json_schema", json_schema: { name: "generation_intent_v1", strict: true, schema },
        }), "editorial_intent_schema_mismatch");
      }
    }
    check(
      prepared.preparationVersion === 6 && prepared.reviewPolicyVersion === 10,
      "planning_protocol_mismatch"
    );
    check(
      prepared.carouselCaptionPolicy === selectionInput?.carouselCaptionPolicy,
      "carousel_caption_policy_mismatch"
    );
    const { hash, ...basis } = planning;
    check(
      hash === arsenalHash(basis) && planning.version === 1,
      "planning_receipt_hash_mismatch"
    );
    const cards = list(catalog?.cards).map(c => componentCardV1Schema.parse(c));
    if (!coverage) throw new Error("catalog_receipt_missing_or_invalid");
    assertCatalogCoverage(coverage, cards);
    check(
      planning.catalogReceiptHash === coverage.receiptHash,
      "planning_catalog_receipt_mismatch"
    );
    check(
      cards.every(c =>
        coverage.indexed.some(
          i =>
            i.id === c.id && i.hash === c.hash && i.cardHash === arsenalHash(c)
        )
      ),
      "catalog_card_content_mismatch"
    );
    const intentSchema = editorialEnabled && !automatic ? generationEditorialIntentSchema : generationIntentLegacySchema;
    const intent = intentSchema.parse(planning.intent);
    const brief = row(prepared.executionBrief ?? input.executionBrief),
      context = row(prepared.editorialContext);
    check(
      coverage.scopeHash ===
        catalogScopeHash({
          aspectRatio: input.aspectRatio,
          postMode: input.postMode,
          slideCount: input.postMode === "static" ? 1 : (input.slideCount ?? 5),
          experimental: Boolean(
            request.experimental ?? input.includeDraftDesigns
          ),
          text: prepared.contextContent,
          brandColors: automatic ? undefined : brief.brandInput?.brandColors,
          brandFonts: !automatic && brief.brandInput?.fontHint
            ? [brief.brandInput.fontHint]
            : [],
        }),
      "catalog_request_scope_mismatch"
    );
    const requestText = [
      input.content,
      brief.rawInput,
      brief.notes,
      brief.callToAction,
      ...list(brief.contentRequirements).map(r => r.value),
      ...list(brief.slides).map(s => s.rawText),
      ...list(brief.mustInclude),
      ...list(brief.mustKeep),
    ]
      .filter(Boolean)
      .join("\n");
    if(selectionInput?.preservedPhoto){
      const url=selectionInput.preservedPhoto.url;
      const imageOperations=operations.filter(op=>op.state==='completed'&&/:image:\d+:/.test(String(op.operation_key)));
      check(same(prepared.preservedPhoto,selectionInput.preservedPhoto)&&imageOperations.every(op=>row(op.result).url===url), 'preserved_source_photo_mismatch');
    }
    const factualSources = new Set<string>(
      list(context.sources)
        .filter(
          s =>
            s.origin !== "requirement" &&
            !String(s.origin).startsWith("piece_") &&
            !list(context.guidanceRanges).some(
              r =>
                r.sourceId === s.id && r.start === 0 && r.end >= s.text.length
            )
        )
        .map(s => s.id)
    );
    const providerIntent = automatic ? (compactAutomatic ? compactGenerationIntentSchema : legacyAutomaticGenerationIntentSchema).parse(completed("prepare:intent")) : intentSchema.parse(completed("prepare:intent"));
    const slideCount = input.postMode === "static" ? 1 : (input.slideCount ?? 5);
    const editorialEvidence = editorialRequestEvidence({ content: input.content, tone: input.tone, executionBrief: brief });
    const projectedIntent = compactAutomatic
      ? projectCompactGenerationIntent(providerIntent as z.infer<typeof compactGenerationIntentSchema>, {
        adaptation: brief.interventionLevel === "visual_only" ? "literal" : "controlled", factualSourceIds: factualSources,
      })
      : automatic ? (({semanticQuery:_query,...rest})=>rest)(providerIntent as z.infer<typeof legacyAutomaticGenerationIntentSchema>)
      : providerIntent as z.infer<typeof generationIntentLegacySchema>;
    const normalizedIntent = normalizeGenerationIntent(projectedIntent, slideCount, factualSources, requestText, (neutrality?.planningVersion ?? 0) >= 2);
    if (normalizedIntent.editorial && selectionInput?.editorialQuotePolicy === 1)
      normalizedIntent.editorial = discardUnattributedEditorialSignals(normalizedIntent.editorial, editorialCatalog, editorialEvidence);
    check(
      same(normalizedIntent, intent),
      "intent_operation_mismatch"
    );
    check(
      validateGenerationIntent(intent, requestText, factualSources).length ===
        0,
      "intent_source_or_requirement_mismatch"
    );
    if (editorialEnabled && !automatic) {
      const editorial = generationEditorialIntentSchema.parse(intent).editorial;
      check(validateEditorialIntent(editorial, editorialCatalog, editorialEvidence).length === 0, "editorial_intent_evidence_mismatch");
    }
    check(
      intent.adaptation ===
        (brief.interventionLevel === "visual_only" ? "literal" : "controlled"),
      "intent_adaptation_mismatch"
    );
    const obligation = imageObligationSchema.parse(prepared.imageObligation);
    const visualRequirements = selectionInput?.visualRequirementsVersion === 1
      ? readGenerationVisualRequirements(brief.rawInput ?? input.content)
      : undefined;
    if (visualRequirements || planning.visualRequirements)
      check(same(visualRequirements, planning.visualRequirements), "visual_requirements_mismatch");
    repertoires = resolveDesignFamilyRepertoires(cards, {
      slideCount: input.postMode === "static" ? 1 : (input.slideCount ?? 5),
      contentMode: intent.adaptation === "literal" ? "literal" : "compose",
      instructions: requestText,
    }).filter(r => repertoireMeetsMedia(r, obligation) && repertoireMeetsVisualRequirements(r, visualRequirements));
    const expectedCandidates = repertoires.map(r => ({
      id: r.defaultOffer.offerId,
      signature: r.signature,
      profileHash: profileHash(r),
    }));
    check(
      same(expectedCandidates, planning.candidates),
      "planning_candidates_reconstruction_mismatch"
    );
    if (familyRanking) {
      familyCandidates = buildFamilySelectionCandidates(repertoires, editorialCatalog, Boolean(neutrality), automatic);
      check(same(familyCandidates.map(candidate => ({
        id: candidate.id, family: candidate.family, signature: candidate.signature,
        profileHash: arsenalHash(candidate.profile),
        memberIds: candidate.repertoires.map(r => r.defaultOffer.offerId),
      })), familyElection.candidates), "family_candidates_reconstruction_mismatch");
    }
    check(
      sameIds(
        planning.selectorIds,
        Array.from(new Set(planning.selectorIds))
      ) &&
        planning.selectorIds.every(id =>
          repertoires.some(r => r.defaultOffer.offerId === id)
        ),
      "selector_ids_invalid"
    );
    for (const op of operations.filter(o =>
      String(o.operation_key).startsWith("prepare:design-shortlist:")
    )) {
      const result = row(op.result),
        context = row(result.assessmentContext),
        answers = row(result.answers),
        ids = list(context.questionIds),
        hashes = row(context.designHashes),
        profiles = row(context.profileHashes);
      const valid =
        op.state === "completed" &&
        context.version === 1 &&
        context.profileVersion === (familyRanking ? neutrality ? 5 : 4 : 3) &&
        typeof context.requestHash === "string" &&
        String(op.operation_key).endsWith(`:${context.requestHash}`) &&
        ids.length > 0 &&
        sameIds(ids, Object.keys(answers)) &&
        sameIds(ids, Object.keys(hashes)) &&
        sameIds(ids, Object.keys(profiles)) &&
        ids.every(id => {
          const repertoire = repertoires.find(
              r => r.defaultOffer.offerId === id
            ),
            answer = row(answers[id]);
          const family = familyRanking ? familyCandidates.find(candidate => candidate.id === id) : null;
          const identityMatches = familyRanking
            ? family && family.signature === hashes[id] && arsenalHash(familyAssessmentProfile(family.profile)) === profiles[id]
            : repertoire && repertoire.defaultOffer.signature === hashes[id] && profileHash(repertoire) === profiles[id];
          return (
            identityMatches &&
            Number.isFinite(answer.score) &&
            answer.score >= 0 &&
            answer.score <= 4 &&
            Number.isFinite(answer.confidence) &&
            answer.confidence >= 0 &&
            answer.confidence <= 1
          );
        });
      check(valid, `scoring_receipt_invalid:${op.operation_key}`);
      if (familyRanking) {
        // A retained provider payload must show the same family question as its
        // receipt; a member profile cannot be relabelled as a family judgment.
        for (const call of list(row(result.__generationTrace).calls))
          for (const message of list(call.messages)) {
            const questions = row(row(message).questions);
            if (!Object.hasOwn(row(message), "questions")) continue;
            if (boundedRetrieval) check(Buffer.byteLength(JSON.stringify(message)) === context.requestBytes,
              `family_scoring_actual_bytes_mismatch:${op.operation_key}`);
            check(sameIds(Object.keys(questions), ids) && ids.every(id => {
              const family = familyCandidates.find(candidate => candidate.id === id);
              return family && same(row(questions[id]).instructions?.design, family.profile.version === 5 ? familyAssessmentProfile(family.profile) : family.profile);
            }), `family_scoring_actual_payload_mismatch:${op.operation_key}`);
          }
      }
      if (valid)
        for (const id of ids) {
          const assessed = familyRanking ? familyScores : scores;
          check(!assessed.has(id), `duplicate_scoring_receipt:${id}`);
          assessed.set(id, {
            score: answers[id].score,
            confidence: answers[id].confidence,
          });
        }
      scoringBatches.push({
        operationKey: op.operation_key,
        state: op.state,
        questionIds: ids,
        identitiesVerified: valid,
      });
    }
    if (familyRanking) {
      let assessedIds = familyCandidates.map(candidate => candidate.id);
      if (boundedRetrieval) {
        const receipt = familyElection.retrieval, recorded = completed("prepare:family_retrieval");
        const visual = row(prepared.visualPreference);
        const visualQuery = familyVisualQuery(visual, selectionInput?.familyVisualQueryVersion === 2 ? requestText : "", Boolean(neutrality));
        assertFamilyRetrieval(recorded as any, familyCandidates, automatic ? semanticFamilyQuery(intent, visualQuery, (providerIntent as z.infer<typeof compactGenerationIntentSchema>).semanticQuery) : familySearchQuery(intent, editorialCatalog, visualQuery));
        const { expanded, transport, ...basis } = receipt ?? {};
        const { expanded: _expanded, transport: _transport, ...frozen } = recorded ?? {};
        const stableRetrieval = (value: Row) => automatic && value.semanticRetrieval ? { ...value, semanticRetrieval: Object.fromEntries(Object.entries(value.semanticRetrieval).filter(([key]) => key !== "technicalFit")) } : value;
        check(same(stableRetrieval(basis), stableRetrieval(frozen)) && typeof expanded === "boolean", "family_retrieval_receipt_mismatch");
        if (automatic) check(String(request.catalog_revision ?? request.catalogRevision) === receipt.semanticRetrieval?.catalogRevision, "semantic_catalog_revision_mismatch");
        check(same(recorded?.neutrality,neutrality), "family_neutrality_pin_mismatch");
        const pinnedIndex = selectionInput?.familyRetrievalIndex;
        check(automatic || !receipt.indexHash || pinnedIndex?.hash === receipt.indexHash && pinnedIndex?.modelFingerprint === receipt.modelFingerprint, "family_retrieval_index_mismatch");
        assessedIds = [...receipt.initialIds, ...(expanded ? receipt.additionalIds : [])];
        const byteCounts = operations.filter(o => String(o.operation_key).startsWith("prepare:design-shortlist:")).map(o => row(row(o.result).assessmentContext).requestBytes);
        check(byteCounts.every(b => Number.isInteger(b) && b > 0 && b <= retrievalPolicy.maxRequestBytes) &&
          byteCounts.length <= retrievalPolicy.maxBatches && byteCounts.reduce((sum, b) => sum + b, 0) <= retrievalPolicy.maxTotalRequestBytes &&
          same(transport, { batches: byteCounts.length, bytes: byteCounts.reduce((sum, b) => sum + b, 0), largestRequestBytes: Math.max(0, ...byteCounts) }), "family_retrieval_transport_mismatch");
      }
      check(sameIds(Array.from(familyScores.keys()), assessedIds), "family_scoring_coverage_incomplete");
      const ranking = list(familyElection.ranking), shortlistedIds = list(familyElection.shortlistedIds);
      check(sameIds(ranking.map(r => r.id), assessedIds) && ranking.every(r =>
        same(familyScores.get(r.id), { score: r.score, confidence: r.confidence }) && (!automatic || r.score100 === Math.round(r.score * 2500) / 100)), "family_ranking_mismatch");
      check(sameIds(shortlistedIds, Array.from(new Set(shortlistedIds))) &&
        shortlistedIds.every(id => familyCandidates.some(candidate => candidate.id === id)), "family_shortlist_ids_invalid");
      const acceptable = Array.from(familyScores.values()).filter(r => automatic || !boundedRetrieval || r.score >= 2);
      const minimum = Math.min(12, acceptable.length);
      const perProposalMedia = list(prepared.perProposalImageObligations);
      const permitsMediaRestoration = obligation.required ||
        (perProposalMedia.some(item => item.required === true) && perProposalMedia.some(item => item.policy === "forbidden"));
      if (automatic) {
        check(familyElection.recovery === undefined, "automatic_historical_recovery_mismatch");
        const receipt = familyElection.retrieval;
        if (recoveryEnabled && receipt.additionalIds.length) {
          const initialScores = ranking.filter(r => receipt.initialIds.includes(r.id));
          const fit = inspectFamilyPlanFit({automatic: true, neutrality, families: familyCandidates, ids: receipt.initialIds,
            scores: initialScores, intent, imageObligation: obligation, requestedPhotoMix: false, slideCount, recentSelections: proposalHistory});
          const recordedFit = receipt.semanticRetrieval?.technicalFit;
          check(recordedFit && sameIds(recordedFit.checkedFamilyIds, receipt.initialIds) &&
            same({viableSlots: recordedFit.viableSlots, planHash: recordedFit.planHash}, fit) &&
            receipt.expanded === (fit.viableSlots.length < 3), "automatic_technical_expansion_mismatch");
        } else check(receipt.expanded === false, "automatic_unjustified_expansion");
      }
      let recoveredIds: string[] = [];
      if (recoveryEnabled && !automatic) {
        const expected = planFamilyRecovery(ranking, ids => inspectFamilyPlanFit({
          neutrality, families: familyCandidates, ids, scores: ranking, intent, imageObligation: obligation,
          requestedPhotoMix: perProposalMedia.some(item => item.required === true) && perProposalMedia.some(item => item.policy === "forbidden"),
          slideCount, recentSelections: proposalHistory,
        }), neutrality ? id=>familyTie(neutrality.seed,familyCandidates.find(f=>f.id===id)!.family) : undefined);
        check(same(expected, familyElection.recovery), "family_recovery_local_evidence_mismatch");
        recoveredIds = expected.recoveredIds;
        check([...expected.normalIds, ...recoveredIds].every(id => shortlistedIds.includes(id)), "family_recovery_shortlist_mismatch");
      }
      check(shortlistedIds.length <= Math.min((permitsMediaRestoration ? 14 : 12) + recoveredIds.length, familyCandidates.length), "family_shortlist_unjustified_extension");
      const effectiveScore = (score: { score: number; confidence: number }) => score.score * (0.5 + 0.5 * score.confidence);
      const cutoff = acceptable.map(effectiveScore).sort((a, b) => b - a)[minimum - 1];
      check(shortlistedIds.length >= minimum && shortlistedIds.length <= Math.min(14 + recoveredIds.length, familyCandidates.length) &&
        (automatic || !boundedRetrieval || shortlistedIds.every(id => (familyScores.get(id)?.score ?? 0) >= 2 || recoveredIds.includes(id))) &&
        ranking.filter(r => shortlistedIds.includes(r.id) && effectiveScore(r) >= cutoff).length >= minimum &&
        ranking.filter(r => (automatic || !boundedRetrieval || r.score >= 2) && effectiveScore(r) > cutoff).every(r => shortlistedIds.includes(r.id)), "family_shortlist_suitability_coverage_mismatch");
      const expanded = familyCandidates.filter(candidate => automatic ? familyScores.has(candidate.id) : shortlistedIds.includes(candidate.id)).flatMap(candidate => candidate.repertoires.map(r => r.defaultOffer.offerId));
      check(sameIds(expanded, planning.selectorIds), "family_shortlist_expansion_mismatch");
      for (const candidate of familyCandidates) {
        const score = familyScores.get(candidate.id);
        if (score) for (const repertoire of candidate.repertoires) scores.set(repertoire.defaultOffer.offerId, score);
      }
      check(sameIds(planning.ranking.map(r => r.id), boundedRetrieval ? Array.from(scores.keys()) : expectedCandidates.map(c => c.id)) &&
        planning.ranking.every(r => same(scores.get(r.id), { score: r.score, confidence: r.confidence })), "planning_family_score_projection_mismatch");
    } else if (repertoires.length > 12 || (editorialEnabled && repertoires.length > 0)) {
      check(
        sameIds(
          Array.from(scores.keys()),
          expectedCandidates.map(c => c.id)
        ),
        "scoring_coverage_incomplete"
      );
      check(
        sameIds(
          planning.ranking.map(r => r.id),
          expectedCandidates.map(c => c.id)
        ) &&
          planning.ranking.every(r =>
            same(scores.get(r.id), { score: r.score, confidence: r.confidence })
          ),
        "planning_ranking_mismatch"
      );
      // Recorded readers used raw suitability; current shortlist weights it by
      // confidence. Both are reconstructed from the frozen provider judgments.
      const coversTop = (score: (r: { score: number; confidence: number }) => number) => {
        const cutoff = Array.from(scores.values()).map(score).sort((a, b) => b - a)[11];
        return planning.ranking.filter(r => score(r) > cutoff).every(r => planning.selectorIds.includes(r.id));
      };
      check(
        repertoires.length <= 12
          ? sameIds(planning.selectorIds, expectedCandidates.map(c => c.id))
          : planning.selectorIds.length >= 12 &&
          planning.selectorIds.length <= 14 &&
          (coversTop(r => r.score) || coversTop(r => r.score * (0.5 + 0.5 * r.confidence))),
        "selector_suitability_coverage_mismatch"
      );
    } else
      check(
        !scoringBatches.length &&
          !planning.ranking.length &&
          sameIds(
            planning.selectorIds,
            expectedCandidates.map(c => c.id)
          ),
        "direct_selection_coverage_mismatch"
      );
    const selection = planning.selectorIds.length
      ? generationPlanResponseSchema.parse(completed("prepare:selection"))
      : null;
    check(planning.proposalSelectionVersion === neutrality?.proposalSelectionVersion, "proposal_selection_pin_mismatch");
    check(Boolean(planning.deliveryReserves) === Boolean(neutrality?.deliveryRecoveryVersion) &&
      (planning.firstDeliveryReviewRecovery === 1) === (neutrality?.deliveryRecoveryVersion === 2), "delivery_recovery_pin_mismatch");
    if (distinctProposals) {
      const perProposalMedia = list(prepared.perProposalImageObligations);
      const selectedFamilies = planning.offers.flatMap(offer => offer ? [offer.family] : []);
      const deliveredFamilies = list(request.proposals).filter(p => p.status === "ready").map(p => row(p.bundle).family);
      check(new Set(selectedFamilies).size === selectedFamilies.length && new Set(deliveredFamilies).size === deliveredFamilies.length, "proposal_family_repeated");
      check(!recent?.parentSelection || recent.parentSelection.requestId === input.generationParentRequestId, "proposal_history_parent_mismatch");
      const planInput = {
        familyFirst: true, neutrality, intent, imageObligation: obligation, slideCount, recentSelections: proposalHistory,
        requestedPhotoMix: perProposalMedia.some(item => item.required === true) && perProposalMedia.some(item => item.policy === "forbidden"),
        eligible: repertoires.filter(r => planning.selectorIds.includes(r.defaultOffer.offerId)),
        shortlist: { cards: [], evaluated: planning.ranking.map(r => ({ ...r, hash: "" })), batches: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
      };
      if (selection) check(same(selection, buildHeuristicGenerationPlan(planInput)), "proposal_selection_replay_mismatch");
      check(same(planning.recoveryRepertoires, distinctProposalRecovery(planInput, planning.offers)), "proposal_recovery_replay_mismatch");
      if (planning.deliveryReserves) check(same(planning.deliveryReserves, deliveryProposalReserves({ ...planInput, eligible: repertoires }, planning.offers)), "delivery_reserves_replay_mismatch");
    }
    check(
      planning.slots.length === 3 &&
        planning.offers.length === 3 &&
        planning.recoveryRepertoires.length === 3 &&
        list(prepared.selectedDefinitions).length === 3,
      "planning_slot_count_mismatch"
    );
    const selectionTrace = row(
      operations.find(o => o.operation_key === "prepare:selection")?.result
    ).__generationTrace;
    // When full traces are retained, independently compare the actual payload too.
    for (const call of list(row(selectionTrace).calls))
      for (const message of list(call.messages).filter(
        m => m.role === "user"
      )) {
        const text =
          typeof message.content === "string"
            ? message.content
            : list(message.content)
                .filter(c => c.type === "text")
                .map(c => c.text)
                .join("");
        let payload: Row;
        try {
          payload = JSON.parse(text);
        } catch {
          continue;
        }
        if (!Array.isArray(payload.catalog)) continue;
        check(
          sameIds(
            payload.catalog.map((c: Row) => c.candidateId),
            planning.selectorIds
          ) &&
            payload.catalog.every((c: Row) =>
              expectedCandidates.some(
                p =>
                  p.id === c.candidateId &&
                  p.profileHash === arsenalHash(c.profile)
              )
            ),
          "selector_actual_payload_mismatch"
        );
      }
    for (let slot = 0; slot < 3; slot++) {
      const plan = planning.slots[slot],
        offer = planning.offers[slot],
        chosen = selection?.slots.find(s => s.slot === slot),
        definitions = list(prepared.selectedDefinitions[slot]);
      check(plan?.slot === slot, `planning_slot_identity:${slot}`);
      const recovery = list(planning.recoveryRepertoires[slot]);
      check(
        recovery.length <= 2 &&
          new Set(recovery.map(r => r.defaultOffer.offerId)).size ===
            recovery.length &&
          recovery.every(
            r =>
              planning.selectorIds.includes(r.defaultOffer.offerId) &&
              repertoires.some(original => same(original, r))
          ),
        `recovery_repertoire_mismatch:${slot}`
      );
      const materialize = (p: Row) => {
        const r = repertoires.find(
          r => r.defaultOffer.offerId === p.candidateId
        );
        if (!r || !planning.selectorIds.includes(p.candidateId))
          throw new Error(`plan_candidate_not_offered:${slot}`);
        return materializeDesignFamilyOffer(
          r,
          list(p.pages).map(page => page.componentId)
        );
      };
      const mediaValid = (o: ReturnType<typeof materialize>) => {
        const image = imageObligationSchema.parse(
            list(prepared.perProposalImageObligations)[slot] ?? obligation
          ),
          count = o.slides.reduce(
            (sum, s) => sum + s.card.mediaSlots.length,
            0
          );
        return (
          (!image.required || count >= Math.max(1, image.slotTargets)) &&
          (image.policy !== "forbidden" ||
            (!count &&
              !o.slides.some(s => designHasPhotographicContent(s.card))))
        );
      };
      if (plan.status === "viable") {
        // The user-facing reason is a canonical projection of the frozen
        // recovery receipt. Every other selector field must still match exactly.
        const chosenId = chosen?.status === "viable" ? chosen.candidateId : null;
        const recovered = recoveryEnabled && familyCandidates.some(f => list(familyElection.recovery?.recoveredIds).includes(f.id) && f.repertoires.some(r => r.defaultOffer.offerId === chosenId));
        check(same(recovered ? { ...chosen, reason: distinctProposals ? `${chosen!.reason} ${FAMILY_RECOVERY_REASON}` : FAMILY_RECOVERY_REASON } : chosen, plan), `selection_plan_mismatch:${slot}`);
        const materialized = materialize(plan);
        check(
          same(offer, materialized) &&
            validateGenerationPlan(plan, materialized, intent).length === 0 &&
            mediaValid(materialized),
          `materialized_plan_mismatch:${slot}`
        );
        check(
          definitions.length === materialized.slides.length &&
            definitions.every((d, i) => {
              const parsed = componentDefinitionV1Schema.parse(d);
              return (
                parsed.id === materialized.slides[i].componentId &&
                parsed.hash === materialized.slides[i].componentHash &&
                sameCard(compactComponentCard(parsed), materialized.slides[i].card)
              );
            }),
          `planned_definitions_mismatch:${slot}`
        );
      } else {
        check(
          offer === null && !definitions.length && !recovery.length,
          `nonviable_slot_has_composition:${slot}`
        );
        if (plan.status === "insufficient_fit")
          check(
            !selection || same(plan, chosen),
            `insufficient_fit_not_recorded:${slot}`
          );
        else if (plan.status === "planning_failed") {
          check(
            chosen?.status === "viable",
            `planning_failure_not_model_plan:${slot}`
          );
          if (chosen?.status === "viable") {
            let violates = true;
            try {
              const o = materialize(chosen);
              violates =
                validateGenerationPlan(chosen, o, intent).length > 0 ||
                !mediaValid(o);
            } catch {
              /* Unknown candidate/component is itself a planning violation. */
            }
            check(
              violates,
              `planning_failure_without_contract_violation:${slot}`
            );
          }
        } else check(false, `planning_status_unknown:${slot}`);
      }
      const proposal = list(request.proposals).find(p => p.slot === slot);
      const recoveryKey = proposal && planning.deliveryReserves ? deliveryRecoveryReadKeys(proposal.attempt?.index ?? 0)
        .map(key => `${proposal.proposalId}:${key}`).find(key => operations.some(operation => operation.operation_key === key)) : undefined;
      const deliveryRecovery = recoveryKey ? completed(recoveryKey) : null;
      let finalOffer = offer,
        finalPlan: unknown = plan;
      if (proposal?.status === "ready") {
        check(plan.status === "viable" || Boolean(deliveryRecovery && plan.status === "insufficient_fit"), `ready_from_nonviable_slot:${slot}`);
        const attempt = row(proposal.attempt),
          index = attempt.index ?? 0;
        check(
          attempt.id === undefined ||
            attempt.id ===
              `${proposal.proposalId}${index ? `-fb${index}` : ""}`,
          `attempt_identity_mismatch:${slot}`
        );
        if (deliveryRecovery) {
          const parsed = generationSlotPlanSchema.safeParse(deliveryRecovery.plan);
          const reserve = planning.deliveryReserves![slot].find(candidate => same(candidate.plan, deliveryRecovery.plan));
          const original = plan.status === "viable" && same(plan, deliveryRecovery.plan) && offer;
          const allowedMode = (deliveryRecovery.mode === "reuse_text" && reserve && deliveryRecovery.copy) ||
            (deliveryRecovery.mode === "repair_text" && original && deliveryRecovery.copy) ||
            // copy is adaptation context for write_for_design, not a reused delivery.
            (deliveryRecovery.mode === "write_for_design" && (reserve || original));
          const repertoire = repertoires.find(r => r.defaultOffer.offerId === deliveryRecovery.plan?.candidateId);
          check(parsed.success && parsed.data.status === "viable" && allowedMode && repertoire, `delivery_recovery_invalid:${slot}`);
          if (parsed.success && parsed.data.status === "viable" && repertoire && (reserve || original)) {
            const recoveryPlan = parsed.data;
            finalPlan = recoveryPlan;
            finalOffer = materializeDesignFamilyOffer(repertoire, recoveryPlan.pages.map(page => page.componentId));
            check(recoveryPlan.slot === slot && validateGenerationPlan(recoveryPlan, finalOffer, intent).length === 0 && mediaValid(finalOffer)
              && (!reserve || finalOffer.family === reserve.family && same(finalOffer.slides.map(slide => slide.componentHash), reserve.componentHashes)), `delivery_recovery_contract_mismatch:${slot}`);
          }
        } else if (index > 0) {
          const replan = completed(
              `${proposal.proposalId}:template_replan:${slot}:${index}`
            ),
            parsed = generationSlotPlanSchema.safeParse(replan?.slotPlan),
            repertoire = recovery[index - 1];
          check(
            parsed.success &&
              parsed.data.status === "viable" &&
              Boolean(repertoire),
            `fallback_plan_missing:${slot}`
          );
          if (parsed.success && parsed.data.status === "viable" && repertoire) {
            finalPlan = parsed.data;
            finalOffer = materializeDesignFamilyOffer(
              repertoire,
              parsed.data.pages.map(p => p.componentId)
            );
            check(
              parsed.data.slot === slot &&
                parsed.data.candidateId === repertoire.defaultOffer.offerId &&
                validateGenerationPlan(parsed.data, finalOffer, intent)
                  .length === 0 &&
                mediaValid(finalOffer),
              `fallback_plan_invalid:${slot}`
            );
          }
        }
        const delivered = list(row(proposal.bundle).slides);
        check(
          finalOffer &&
            row(proposal.bundle).family === finalOffer.family &&
            delivered.length === finalOffer.slides.length &&
            delivered.every((s, i) => {
              const pin = finalOffer!.slides[i],
                origin = row(row(row(s.composition).origin).componentAssembly);
              return (
                same(origin.componentIds, [pin.componentId]) &&
                same(origin.componentHashes, [pin.componentHash]) &&
                s.role === pin.role
              );
            }),
          `final_sequence_mismatch:${slot}`
        );
      }
      if (proposal && plan.status !== "viable" && !(plan.status === "insufficient_fit" && planning.deliveryReserves?.[slot]?.length && proposal.attempt?.index === 1)) {
        check(
          proposal.status === "failed" &&
            row(proposal.failure).code ===
              (plan.status === "insufficient_fit"
                ? "selection_insufficient_fit"
                : "planning_response_invalid"),
          `nonviable_failure_mismatch:${slot}`
        );
        check(
          !operations.some(
            o =>
              String(o.operation_key).startsWith(`${proposal.proposalId}:`) ||
              String(o.operation_key).startsWith(`${proposal.proposalId}-fb`)
          ),
          `nonviable_slot_has_generation_effect:${slot}`
        );
      }
      slots.push({
        slot,
        planningStatus: plan.status,
        reason: plan.reason,
        candidateId: plan.status === "viable" ? plan.candidateId : null,
        status: proposal?.status ?? "not_started",
        proposalId: proposal?.proposalId ?? null,
        attempt: proposal?.attempt,
        finalCandidateId:
          row(finalPlan).status === "viable"
            ? row(finalPlan).candidateId
            : null,
        finalOfferId: finalOffer?.offerId ?? null,
        finalFamily: finalOffer?.family ?? null,
        finalPlan,
        failureCode: row(proposal?.failure).code ?? null,
      });
    }
  } catch (error) {
    issues.push(
      error instanceof Error ? error.message : "planning_evidence_invalid"
    );
  }
  const complete = !issues.length;
  return {
    status: complete ? "verified" : "incomplete",
    complete,
    selectionProfileVersion: 3,
    stage: "planning",
    catalogReceiptHash: coverage?.receiptHash ?? null,
    consistency: coverage?.consistency ?? null,
    capturedAt: coverage?.capturedAt ?? null,
    registered: coverage?.entries.length ?? 0,
    indexed: coverage?.indexed.length ?? 0,
    eligibleOffers: repertoires.length,
    evaluated: familyRanking ? familyScores.size : scores.size,
    selectorOptions: list(planning.selectorIds).length,
    method: automatic && boundedRetrieval ? "semantic_retrieval_then_scored_families" : boundedRetrieval ? "hybrid_retrieval_then_scored_families" : familyRanking ? "scored_family_batches" : repertoires.length > 12 || (editorialEnabled && repertoires.length > 0) ? "scored_batches" : "all_sent_to_selector",
    ...(familyRanking ? {
      assessmentUnit: "family" as const,
      eligibleFamilies: familyCandidates.length,
      evaluatedFamilies: familyScores.size,
      shortlistedFamilies: list(familyElection.shortlistedIds).length,
      ...(boundedRetrieval ? { retrieval: familyElection.retrieval } : {}),
      ...(recoveryEnabled ? { recovery: familyElection.recovery } : {}),
      familyCandidates: familyCandidates.map(candidate => ({
        id: candidate.id, family: candidate.family, signature: candidate.signature,
        profileHash: arsenalHash(candidate.profile), memberIds: candidate.repertoires.map(r => r.defaultOffer.offerId),
        score: familyScores.get(candidate.id)?.score ?? null, confidence: familyScores.get(candidate.id)?.confidence ?? null,
        shortlisted: list(familyElection.shortlistedIds).includes(candidate.id),
        ...(recoveryEnabled ? { recovered: list(familyElection.recovery?.recoveredIds).includes(candidate.id) } : {}),
        ...(boundedRetrieval ? { assessmentState: familyScores.has(candidate.id) ? "evaluated" : "not_evaluated" } : {}),
      })),
    } : {}),
    selectorEvidence:
      "pinned_planning_receipt_with_optional_payload_crosscheck",
    registeredDesigns: (coverage?.entries ?? []).map(e => ({
      ...e,
      offerIds: repertoires
        .filter(r => r.slides.some(s => s.variants.some(c => c.id === e.id)))
        .map(r => r.defaultOffer.offerId),
      explanations: e.reasons,
    })),
    candidates: repertoires.map(r => {
      const score = scores.get(r.defaultOffer.offerId),
        selected = slots.filter(s => s.candidateId === r.defaultOffer.offerId),
        final = slots.filter(
          s => s.finalCandidateId === r.defaultOffer.offerId
        );
      return {
        offerId: r.defaultOffer.offerId,
        sourceId: r.sourceId,
        signature: r.signature,
        family: r.family,
        profileVersion: 3,
        profileHash: profileHash(r),
        score: score?.score ?? null,
        confidence: score?.confidence ?? null,
        ...(familyRanking ? { scoreOrigin: "family" as const, familyCandidateId: familyCandidates.find(candidate => candidate.repertoires.some(member => member.defaultOffer.offerId === r.defaultOffer.offerId))?.id ?? null } : {}),
        evaluated: score
          ? true
          : !familyRanking && !editorialEnabled && repertoires.length <= 12
            ? "direct_selection_without_score"
            : null,
        sentToSelector: list(planning.selectorIds).includes(
          r.defaultOffer.offerId
        ),
        outcome: !complete
          ? "coverage_invalid"
          : final.length
            ? selected.length
              ? "selected"
              : "selected_on_recovery"
            : selected.length
              ? "selected_then_replanned"
              : list(planning.selectorIds).includes(r.defaultOffer.offerId)
                ? "not_selected"
                : "not_shortlisted",
        outcomeVerified: complete,
        generatedPosts: slots
          .filter(s => selected.includes(s) || final.includes(s))
          .map(s => ({
            ...s,
            selectedInitially: selected.includes(s),
            selectedFinally: final.includes(s),
          })),
      };
    }),
    slots,
    scoringBatches,
    issues,
  };
}
