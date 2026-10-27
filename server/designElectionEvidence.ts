import { arsenalHash } from "../shared/arsenalContent";
import { catalogCoverageSchema, electionCandidatesSchema, electionClassificationSchema, electionDecisionSchema, electionDecisionV2Schema, assertCatalogCoverage, assertElectionCoverage } from "../shared/designElection";
import { describeCompactOffer } from "../shared/compactDesignProfile";
import { completeDesignOfferV1Schema } from "../shared/completeDesignOffers";

type Row = Record<string, unknown>;
const row = (x: unknown): Row => x && typeof x === "object" && !Array.isArray(x) ? x as Row : {};
const list = (x: unknown): unknown[] => Array.isArray(x) ? x : [];
const reasons: Record<string, string> = {
  draft_not_enabled: "Rascunho não habilitado neste modo.", archived: "Design arquivado.",
  superseded_authorship: "Existe uma revisão de autoria mais recente.",
  baseline_not_verified: "Design sem base técnica verificada.", aspect_ratio_mismatch: "Proporção incompatível com o pedido.",
  brand_color_mismatch: "As cores autoradas não atendem às cores exigidas.", brand_font_mismatch: "As fontes autoradas não atendem à fonte exigida.",
  not_a_static_source: "Variante de carrossel ou fonte sem papel estático.", index_missing: "Design cadastrado sem entrada no índice.",
  index_identity_mismatch: "O índice diverge da identidade ou versão cadastrada.", catalog_changed_during_read: "O catálogo mudou durante a conferência.",
  media_requirement_not_met: "Sequência não atende às exigências de imagem.", variant_content_mode_mismatch: "Variante para outro nível de intervenção no texto.",
  variant_source_unavailable: "A fonte desta variante não está disponível neste pedido.", variant_source_hash_mismatch: "Variante de outra revisão da fonte.",
  slide_role_not_requested: "Este papel de página não é necessário no pedido.", uniform_or_static_uses_source_only: "Este pedido usa somente o design de origem.",
  source_sequence_unavailable_or_media_incompatible: "A sequência da fonte está incompleta ou não atende às exigências de mídia.",
};
const explanation = (code: string) => code.startsWith("missing_exact_slide_role:")
  ? `Falta uma variante compatível para o papel ${code.split(":")[1]}.` : reasons[code] ?? code;

/** Read only persisted receipts. Never reconstruct past availability from today's catalog. */
export function inspectDesignElection(request: Row, operations: Row[]) {
  const completed = (key: string) => {
    const op = operations.find(o => o.operation_key === `prepare:${key}`);
    if (op?.state !== "completed") return null;
    const { __generationTrace, ...data } = row(op.result);
    return data;
  };
  const catalog = completed("catalog");
  const prepared = row(request.prepared);
  const audited = catalog?.version === 1 || Boolean(prepared.electionReceipt) || operations.some(o => String(o.operation_key).startsWith("prepare:election_"));
  if (!audited) return { status: "legacy_unverified", complete: false, stage: "legacy", message: "Esta rodada não possui recibo de cobertura; não é possível afirmar que todo o catálogo participou.", registeredDesigns: [], candidates: [], issues: [], historicalChoices:list(prepared.selectedOffers).map((value,slot)=>({slot,offerId:row(value).offerId,family:row(value).family,signature:row(value).signature})) };
  const parsedCatalog = catalogCoverageSchema.safeParse(catalog?.coverage);
  const parsedCandidates = electionCandidatesSchema.safeParse(completed("election_candidates"));
  const parsedClassification = electionClassificationSchema.safeParse(completed("election_classification"));
  const decisionValue=completed("election_decision");
  const parsedDecision = (row(decisionValue).version === 2 ? electionDecisionV2Schema : electionDecisionSchema).safeParse(decisionValue);
  const c = parsedCatalog.success ? parsedCatalog.data : null;
  const candidates = parsedCandidates.success ? parsedCandidates.data : null;
  const classification = parsedClassification.success ? parsedClassification.data : null;
  const decision = parsedDecision.success ? parsedDecision.data : null;
  const issues: string[] = c?.issues.map(i => `${i.code}${i.id ? `:${i.id}` : ""}`) ?? ["catalog_receipt_missing_or_invalid"];
  const compact = catalog?.selectionProfileVersion === 2;
  if (compact !== Boolean(candidates?.selectionProfiles)) issues.push("selection_profile_protocol_mismatch");
  if (compact && candidates?.selectionProfiles) {
    const cards = new Map(list(catalog?.cards).map(v => [String(row(v).id), row(v)]));
    for (const p of candidates.selectionProfiles) {
      try {
        const offer = candidates.offers.find(o => o.offerId === p.offerId)!;
        const reconstructed = completeDesignOfferV1Schema.parse({
          version: 1, offerId: offer.offerId, sourceId: offer.sourceId, sourceHash: cards.get(offer.sourceId)?.hash,
          family: offer.family, signature: offer.signature, contentMode: p.profile.contentMode, visualMode: p.profile.visualMode,
          slides: offer.slides.map(s => ({ slideIndex: s.slideIndex, role: s.role, componentId: s.id, componentHash: s.hash, card: cards.get(s.id) })),
        });
        const signature = arsenalHash({ version: 1, sourceId: reconstructed.sourceId, sourceHash: reconstructed.sourceHash,
          contentMode: reconstructed.contentMode, visualMode: reconstructed.visualMode,
          slides: reconstructed.slides.map(({ slideIndex, role, componentId, componentHash }) => ({ slideIndex, role, componentId, componentHash })),
        });
        if (signature !== offer.signature) throw new Error("profile_offer_signature_mismatch");
        if (arsenalHash(describeCompactOffer(reconstructed)) !== p.hash) throw new Error("profile_mismatch");
      } catch { issues.push(`selection_profile_source_mismatch:${p.offerId}`); }
    }
    if (decision && classification) {
      const actual = row(completed("selection")).profileContext;
      const expected = { version: 2, profileHashes: Object.fromEntries(classification.selectorIds.map(id => [id, candidates.selectionProfiles!.find(p => p.offerId === id)?.hash])) };
      if (arsenalHash(actual) !== arsenalHash(expected)) issues.push("selector_profile_receipt_mismatch");
    }
  }
  issues.push(...(classification?.issues ?? []));
  let complete = false;
  if (c) {
    try {
      const cards = list(catalog?.cards).map(v => row(v)).map(v => ({ id: String(v.id), hash: String(v.hash) }));
      assertCatalogCoverage(c, cards);
      if (candidates && classification) {
        assertElectionCoverage(c, candidates, classification, decision ?? undefined);
        if (decision) {
          const selectedOffers = list(prepared.selectedOffers).map(row);
          if (prepared.electionReceipt && (arsenalHash(prepared.electionReceipt) !== arsenalHash(decision) || decision.choices.some(choice => selectedOffers[choice.slot]?.offerId !== choice.chosenOfferId))) throw new Error("prepared_election_mismatch");
          complete = true;
        }
      }
    } catch { issues.push("coverage_identity_or_participation_mismatch"); }
  }
  if (!candidates) issues.push("candidate_receipt_missing_or_invalid");
  if (!classification) issues.push("classification_receipt_missing_or_invalid");
  if (!decision) issues.push("decision_receipt_missing_or_invalid");
  const choices = decision?.choices ?? [];
  const rawProposals = list(request.proposals).map(row);
  const receivedScores = new Map<string,{score:number;confidence:number;operationKey:string}>();
  const scoringBatches = operations.filter(o=>String(o.operation_key).startsWith('prepare:design-shortlist:')).map(op=>{
    const result=row(op.result),context=row(result.assessmentContext),answers=row(result.answers);
    const ids=list(context.questionIds).map(String),hashes=row(context.designHashes);
    const profileHashes = row(context.profileHashes);
    const profilesValid = !compact || (context.profileVersion === 2 && arsenalHash(Object.keys(profileHashes).sort()) === arsenalHash([...ids].sort()) &&
      ids.every(id => candidates?.selectionProfiles?.some(p => p.offerId === id && p.hash === profileHashes[id])));
    const valid=profilesValid&&op.state==='completed'&&context.version===1&&typeof context.requestHash==='string'&&String(op.operation_key).endsWith(`:${context.requestHash}`)&&ids.length>0&&new Set(ids).size===ids.length&&
      arsenalHash([...ids].sort())===arsenalHash(Object.keys(answers).sort())&&ids.every(id=>{
        const answer=row(answers[id]);
        return candidates?.offers.some(o=>o.offerId===id&&o.signature===hashes[id])&&typeof answer.score==='number'&&answer.score>=0&&answer.score<=4&&typeof answer.confidence==='number'&&answer.confidence>=0&&answer.confidence<=1;
      });
    if(valid)for(const id of ids){const answer=row(answers[id]);if(receivedScores.has(id))issues.push(`duplicate_scoring_receipt:${id}`);receivedScores.set(id,{score:answer.score as number,confidence:answer.confidence as number,operationKey:String(op.operation_key)});}
    return {operationKey:op.operation_key,state:op.state,questionIds:ids,identitiesVerified:valid};
  });
  if(classification?.method==='scored_batches') {
    for(const key of classification.operationKeys) if(!scoringBatches.some(b=>b.operationKey===`prepare:${key}`&&b.identitiesVerified))issues.push(`scoring_receipt_missing_or_invalid:${key}`);
    for(const expected of classification.evaluated) {
      const received=receivedScores.get(expected.id);
      if(!received||received.score!==expected.score||received.confidence!==expected.confidence||!classification.operationKeys.some(k=>received.operationKey===`prepare:${k}`))issues.push(`score_receipt_mismatch:${expected.id}`);
    }
  }
  const candidateRows = (candidates?.offers ?? []).map(offer => {
    const score = classification?.evaluated.find(e => e.id === offer.offerId) ?? receivedScores.get(offer.offerId);
    const selected = choices.filter(choice => choice.chosenOfferId === offer.offerId);
    const original = choices.filter(choice => choice.originalOfferId === offer.offerId);
    const shortlisted = classification?.shortlistIds.includes(offer.offerId) ?? null;
    const sentToSelector = classification?.selectorIds.includes(offer.offerId) ?? null;
    const outcome = !classification ? "evaluation_incomplete" : !decision ? "selection_pending" : !complete || issues.length ? "coverage_invalid" : selected.length ? "selected" : original.length ? "selected_then_substituted" : sentToSelector ? "not_selected" : shortlisted ? "replaced_to_preserve_media_requirement" : "not_shortlisted";
    return { ...offer, score: score?.score ?? null, confidence: score?.confidence ?? null,
      ...(compact ? { profileVersion: 2, profileHash: candidates?.selectionProfiles?.find(p => p.offerId === offer.offerId)?.hash ?? null,
        ranking: classification?.ranking?.find(r => r.id === offer.offerId) ?? null } : {}),
      evaluated: score ? true : classification?.method === "all_sent_to_selector" ? "direct_selection_without_score" : null,
      shortlistPosition: shortlisted ? classification!.shortlistIds.indexOf(offer.offerId) + 1 : null,
      sentToSelector, outcome, outcomeVerified:complete && !issues.length,
      selectionReasons: original.map(choice => ({ slot:choice.slot,reason:choice.reason,chosenOfferId:choice.chosenOfferId,substitutionReason:choice.substitutionReason })),
      generatedPosts: selected.map(choice => {
        const proposal = rawProposals.find(p => p.slot === choice.slot);
        const lastReview = row(list(proposal?.reviews).at(-1));
        return { slot:choice.slot, proposalId:proposal?.proposalId ?? null, status:proposal?.status ?? "not_started", reviewStatus:lastReview.status ?? null,
          failureCode:row(proposal?.failure).code ?? null,
          reviewFindings:list(lastReview.findings).map(f => ({ category:row(f).category, consequence:row(f).consequence, effect:row(f).effect })) };
      }),
    };
  });
  return { status: complete && !issues.length ? "verified" : "incomplete", complete: complete && !issues.length,
    selectionProfileVersion: compact ? 2 : 1,
    stage: !c ? "catalog" : !candidates ? "eligibility" : !classification ? "classification" : !decision ? "selection" : "decision",
    catalogReceiptHash:c?.receiptHash ?? null, consistency:c?.consistency ?? null, capturedAt:c?.capturedAt ?? null,
    registered: c?.entries.length ?? 0, indexed: c?.indexed.length ?? 0, eligibleOffers: candidates?.offers.length ?? 0,
    evaluated: classification?.evaluated.length ?? receivedScores.size, selectorOptions:classification?.selectorIds.length ?? 0, method:classification?.method ?? null,
    registeredDesigns:(c?.entries ?? []).map(entry => {
      const candidate = candidates?.cards.find(card => card.id === entry.id);
      const codes = [...entry.reasons, ...(candidate?.reasons ?? [])];
      return { ...entry, offerIds:candidate?.offerIds ?? [], reasons:codes, explanations:codes.map(explanation) };
    }), candidates:candidateRows, scoringBatches, issues,
  };
}
