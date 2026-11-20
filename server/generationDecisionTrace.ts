import { arsenalHash } from "../shared/arsenalContent";
import { inspectDesignElection } from "./designElectionEvidence";
import { DECISION_TRACE_STAGES } from "../shared/generationDecisionTrace";
import { readPreparationResult } from "../shared/generationPreparationReceipt";

type Row = Record<string, any>;
const row = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const list = (value: unknown): Row[] =>
  Array.isArray(value) ? value.map(row) : [];
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const clean = (value: unknown) => {
  const { __generationTrace: _trace, ...data } = row(value);
  return row(readPreparationResult(data));
};

export interface DecisionTraceSource {
  request: Row;
  operations: Row[];
  events?: Row[];
}

/** Only captured data is used. The current catalog and provider are never queried. */
export function inspectGenerationDecisionTrace(source: DecisionTraceSource) {
  const { request, operations } = source;
  const prepared = row(request.prepared),
    planning = row(prepared.planning),
    input = row(request.input);
  const election = row(inspectDesignElection(request, operations));
  const selectionInput = clean(
    operations.find(op => op.operation_key === "prepare:selection_input")
      ?.result
  );
  const familyElection = row(planning.familyElection);
  const retrieval = row(familyElection.retrieval);
  const proposals = list(request.proposals);
  const issues: Array<{ code: string; target: string; detail: string }> = [];
  const issue = (code: string, target: string, detail: string) =>
    issues.push({ code, target, detail });
  const observationReceipts = operations
    .filter(op => row(op.result).kind === "review_observation_v1")
    .map(op => {
      const data = row(row(op.result).data),
        review = row(data.review);
      const valid =
        op.state === "completed" &&
        data.requestId === request.id &&
        op.operation_key ===
          `${data.proposalId}:review_observation:${review.round}:${review.inputHash}:candidate`;
      if (!valid)
        issue(
          "review_observation_receipt_mismatch",
          String(op.operation_key),
          "A identidade ou o estado do recibo diverge da observação."
        );
      return { operationKey: op.operation_key, valid, data };
    });

  const events = new Map<string, Row>();
  const observedEvents: Row[] = [
    ...(source.events ?? []),
    ...observationReceipts
      .filter(receipt => receipt.valid)
      .map(receipt => ({
        stage: "review_verdict_observed",
        data: receipt.data,
        operationKey: receipt.operationKey,
      })),
    ...operations.flatMap(op =>
      list(row(row(op.result).__generationTrace).events).map(event => ({
        ...event,
        operationKey: op.operation_key,
      }))
    ),
  ];
  for (const event of observedEvents) {
    if (!(DECISION_TRACE_STAGES as readonly string[]).includes(event.stage))
      continue;
    // Parent/local/journal copies are one observation, not extra evaluations.
    const key = arsenalHash({ stage: event.stage, data: event.data });
    const old = events.get(key);
    events.set(key, {
      ...old,
      ...event,
      operationKey: event.operationKey ?? old?.operationKey ?? null,
    });
  }
  const selectionObservations = Array.from(events.values())
    .filter(event => event.stage === "selection_slot_observed")
    .map(
      (event): Row => ({
        ...row(event.data),
        at: event.at,
        operationKey: event.operationKey,
      })
    );
  const reviewObservations = Array.from(events.values())
    .filter(event => event.stage === "review_verdict_observed")
    .map(
      (event): Row => ({
        ...row(event.data),
        at: event.at,
        source: "before_delivery_normalization" as const,
      })
    );
  const recoveryObservations = Array.from(events.values())
    .filter(event => event.stage === "recovery_candidate_observed")
    .map(
      (event): Row => ({
        ...row(event.data),
        at: event.at,
        operationKey: event.operationKey,
      })
    );
  const recoveryDecisions = operations
    .filter(op =>
      /(?:delivery_recovery:|template_replan:)/.test(String(op.operation_key))
    )
    .map(op => {
      const result = clean(op.result),
        plan = row(result.plan ?? result.slotPlan);
      return {
        operationKey: op.operation_key,
        state: op.state,
        mode: result.mode ?? null,
        candidateId: plan.candidateId ?? null,
        slot: plan.slot ?? null,
        reason: plan.reason ?? null,
        componentIds: list(plan.pages).map(page => page.componentId),
      };
    });

  const assessments = operations
    .filter(op =>
      String(op.operation_key).startsWith("prepare:design-shortlist:")
    )
    .map(op => {
      const result = clean(op.result),
        context = row(result.assessmentContext);
      const expectedIds = strings(context.questionIds),
        answers = row(result.answers);
      const expected = new Set(expectedIds);
      const scores = Object.entries(answers).map(([id, value]) => {
        const answer = row(value),
          score = finite(answer.score),
          confidence = finite(answer.confidence);
        const family = list(familyElection.candidates).find(
          candidate => candidate.id === id
        );
        const candidate = list(election.candidates).find(
          candidate => candidate.offerId === id
        );
        const identityHash = family?.signature ?? candidate?.signature;
        const known = Boolean(family || candidate);
        const valid =
          op.state === "completed" &&
          expected.has(id) &&
          known &&
          score !== null &&
          score >= 0 &&
          score <= 4 &&
          confidence !== null &&
          confidence >= 0 &&
          confidence <= 1 &&
          row(context.designHashes)[id] === identityHash;
        if (!valid)
          issue(
            "score_identity_or_value_invalid",
            id,
            String(op.operation_key)
          );
        return {
          targetId: id,
          targetType: family ? "family" : candidate ? "offer" : "unknown",
          family: family?.family ?? candidate?.family ?? null,
          memberIds: strings(family?.memberIds),
          score,
          scale: [0, 4],
          confidence,
          identityHash: row(context.designHashes)[id] ?? null,
          valid,
          explanation:
            typeof answer.explanation === "string"
              ? answer.explanation
              : typeof answer.reason === "string"
                ? answer.reason
                : null,
        };
      });
      for (const id of expectedIds)
        if (!Object.hasOwn(answers, id))
          issue("assessment_answer_missing", id, String(op.operation_key));
      if (new Set(expectedIds).size !== expectedIds.length)
        issue(
          "assessment_target_duplicated",
          String(op.operation_key),
          "O lote repete um alvo."
        );
      return {
        operationKey: op.operation_key,
        state: op.state,
        expectedIds,
        criteria: row(context).criteria ?? null,
        assessmentTask: context.assessmentTask ?? null,
        assessmentStateHash: context.assessmentStateHash ?? null,
        model: result.model ?? null,
        requestHash: context.requestHash ?? null,
        scores,
        verified: list(election.scoringBatches).some(
          batch =>
            batch.operationKey === op.operation_key &&
            batch.identitiesVerified === true
        ),
      };
    });
  const scoredIds = assessments.flatMap(batch =>
    batch.scores.filter(score => score.valid).map(score => score.targetId)
  );
  for (const id of Array.from(new Set(scoredIds)))
    if (scoredIds.filter(value => value === id).length > 1)
      issue(
        "assessment_target_scored_twice",
        id,
        "Mais de um parecer registrado para o mesmo alvo."
      );

  const familyRows = list(election.familyCandidates).map(
    (family): Row => ({
      ...family,
      retrieved: !Object.keys(retrieval).length
        ? null
        : [
            ...strings(retrieval.initialIds),
            ...(retrieval.expanded ? strings(retrieval.additionalIds) : []),
          ].includes(family.id),
      retrievalRanking:
        list(row(retrieval.semanticRetrieval).rankings).find(
          rank => rank.id === family.id
        ) ?? null,
      assessments: assessments.flatMap(batch =>
        batch.scores
          .filter(score => score.targetId === family.id)
          .map(score => ({ ...score, operationKey: batch.operationKey }))
      ),
    })
  );

  const candidates = list(election.candidates).map(
    (candidate): Row & { decisions: Row[] } => {
      const family = familyRows.find(
        family =>
          family.id === candidate.familyCandidateId ||
          strings(family.memberIds).includes(candidate.offerId)
      );
      return {
        ...candidate,
        scoreOrigin:
          candidate.score == null
            ? "not_scored"
            : family
              ? "family_projection"
              : "offer_assessment",
        scoreTargetId:
          candidate.score == null ? null : (family?.id ?? candidate.offerId),
        familyRetrieved: family?.retrieved ?? null,
        decisions: selectionObservations.flatMap(observation =>
          list(observation.candidates)
            .filter(entry => entry.candidateId === candidate.offerId)
            .map(entry => ({
              ...entry,
              slot: observation.slot,
              policy: observation.policy,
              seed: observation.seed,
              operationKey: observation.operationKey,
            }))
        ),
      };
    }
  );

  const rawReviews = operations
    .filter(op =>
      /:review(?::|_evidence_repair:)/.test(String(op.operation_key))
    )
    .map(op => {
      const result = row(op.result),
        context = row(result.__proposalReview),
        choice = row(list(result.choices)[0]);
      const content = row(choice.message).content;
      let response: Row | null = null;
      try {
        const text =
          typeof content === "string"
            ? content
            : list(content)
                .filter(part => part.type === "text")
                .map(part => part.text)
                .join("\n");
        response = row(JSON.parse(text));
      } catch {
        /* Missing/truncated/invalid is explicit, never an approval. */
      }
      return {
        operationKey: op.operation_key,
        state: op.state,
        providerId: result.id ?? null,
        model: result.model ?? null,
        proposalId: context.proposalId ?? null,
        round: context.round ?? null,
        inputHash: context.inputHash ?? null,
        configurationHash: context.configurationHash ?? null,
        receiptMatchesRequest: context.requestId === request.id,
        responseStatus: response?.status ?? response?.outcome ?? null,
        finishReason: choice.finish_reason ?? null,
        responseHash: response ? arsenalHash(response) : null,
        reviewedSlides: response?.reviewedSlides ?? [],
        limitation: response?.limitation ?? null,
        findings: response?.findings ?? [],
        available: response !== null,
        interpretation:
          "raw_provider_response_not_a_validated_verdict" as const,
      };
    });

  const generatedPosts = proposals.map(proposal => {
    const effectiveId = row(proposal.attempt).id ?? proposal.proposalId;
    const observed = reviewObservations.filter(
      observation => observation.proposalId === effectiveId
    );
    const stored = list(proposal.reviews);
    for (const observation of observed) {
      const original = row(observation.review),
        current = stored.find(
          review =>
            review.inputHash === original.inputHash &&
            review.round === original.round
        );
      if (!current)
        issue(
          "observed_review_absent_from_delivery",
          String(effectiveId),
          String(original.status)
        );
      else if (arsenalHash(current) !== arsenalHash(original))
        issue(
          "review_changed_before_delivery",
          String(effectiveId),
          `${original.status} → ${current.status}`
        );
    }
    const last = row(observed.at(-1)?.review),
      storedLast = row(stored.at(-1));
    const lenient = list(proposal.diagnostics).find(
      diagnostic => diagnostic.code === "review_lenient_delivery"
    );
    if (lenient && !observed.length)
      issue(
        "historical_lenient_review_unobserved",
        String(effectiveId),
        "O diagnóstico registra entrega leniente; o parecer anterior à entrega não foi capturado."
      );
    return {
      slot: proposal.slot,
      proposalId: proposal.proposalId,
      effectiveProposalId: effectiveId,
      family: row(proposal.bundle).family ?? observed.at(-1)?.family ?? null,
      status: proposal.status,
      failure: proposal.failure ?? null,
      errorReason: proposal.errorReason ?? null,
      diagnostics: proposal.diagnostics ?? [],
      reviewerOutcome: last.status ?? null,
      storedReviewOutcome: storedLast.status ?? null,
      reviewEvidence: observed.length
        ? "captured_before_delivery"
        : "historical_capture_missing",
      approvalBasis:
        last.status === "passed"
          ? "O parecer capturado passou pelas regras do revisor; isto não comprova ausência de defeitos."
          : last.status === "correction_required"
            ? "O parecer capturado solicitou correção; consultar achados e decisão efetiva de entrega."
            : last.status === "inconclusive"
              ? "A inspeção não produziu conclusão válida; consultar limitação."
              : "Não há observação do parecer antes da entrega; consultar os recibos brutos sem presumir aprovação.",
      reviews: observed,
      storedReviews: stored,
      rawReviews: rawReviews.filter(review =>
        String(review.operationKey).startsWith(`${effectiveId}:`)
      ),
    };
  });

  for (const candidate of candidates)
    if (
      candidate.sentToSelector === true &&
      !candidate.decisions.length &&
      selectionObservations.some(
        observation =>
          !observation.operationKey ||
          observation.operationKey === "prepare:selection"
      )
    )
      issue(
        "candidate_missing_from_selection_trace",
        String(candidate.offerId),
        "O candidato enviado ao planejador não aparece nos slots observados."
      );
  const selected = candidates.filter(
    candidate =>
      list(candidate.generatedPosts).some(
        post => post.selectedInitially === true || post.selectedFinally === true
      ) || candidate.outcome === "selected"
  );
  const selectedFamilies = new Set(
    selected.map(candidate => String(candidate.family))
  );
  const config = row(request.generation_config ?? request.generationConfig);
  const cohort = {
    catalogRevision:
      request.catalog_revision ?? request.catalogRevision ?? null,
    catalogReceiptHash: election.catalogReceiptHash ?? null,
    platform: input.platform ?? null,
    postMode: input.postMode ?? null,
    aspectRatio: input.aspectRatio ?? null,
    generationConfigHash: arsenalHash(config),
    assessmentModel: selectionInput.jevModel ?? null,
    reviewConfigurationHash:
      row(selectionInput.reviewExecutionConfig).configurationHash ?? null,
    policy:
      selectionInput.selectionPolicy ??
      row(selectionInput.familyNeutrality).selectionPolicy ??
      "legacy",
  };
  // Inventory is stable across requests; the receipt includes a capture timestamp.
  const coverage = row(
    clean(operations.find(op => op.operation_key === "prepare:catalog")?.result)
      .coverage
  );
  const cohortKey = arsenalHash({
    ...cohort,
    catalogReceiptHash: coverage.inventoryHash ?? cohort.catalogRevision,
  });
  return {
    schemaVersion: 1,
    requestId: request.id ?? null,
    requestStatus: request.status ?? null,
    verification: "captured_data_only",
    cohort,
    cohortKey,
    requestFingerprint: arsenalHash({
      content: input.content,
      executionBrief: input.executionBrief,
      sources: input.sources,
    }),
    coverage: {
      electionVerified: election.complete === true,
      electionStatus: election.status,
      electionIssues: election.issues ?? [],
      liveSelectionCaptured: selectionObservations.length > 0,
      liveReviewCaptured: reviewObservations.length > 0,
      message:
        "Cobertura do catálogo, avaliação por IA, viabilidade técnica e entrega são etapas distintas.",
    },
    criteria: {
      assessmentScale: [0, 4],
      assessmentMeaning:
        "Adequação ao pedido/contexto; confiança registrada separadamente.",
      scoreAttribution: familyRows.length
        ? "Uma nota por família, projetada sobre seus membros."
        : "Nota por oferta quando presente.",
      reviewerMeaning:
        "Parecer e achados capturados antes da normalização de entrega; a resposta bruta é apresentada separadamente.",
      selectionInput: {
        familyNeutrality: selectionInput.familyNeutrality ?? null,
        reviewConfigurationHash:
          row(selectionInput.reviewExecutionConfig).configurationHash ?? null,
      },
    },
    registeredDesigns: election.registeredDesigns ?? [],
    families: familyRows,
    candidates,
    assessments,
    selectionObservations,
    reviewObservations,
    observationReceipts,
    recoveryObservations,
    recoveryDecisions,
    generatedPosts,
    rawReviews,
    variability: {
      seed: row(selectionInput.familyNeutrality).seed ?? null,
      selectedCandidates: selected.map(candidate => candidate.offerId),
      distinctSelectedFamilies: selectedFamilies.size,
      deliveredFamilies: Array.from(
        new Set(
          generatedPosts
            .filter(post => post.status === "ready")
            .map(post => post.family)
            .filter(Boolean)
        )
      ),
    },
    issues,
    limitations: [
      "Dados ausentes não são reconstruídos a partir do catálogo atual.",
      "Motivo individual não informado pelo modelo permanece ausente.",
      "Concentração de escolhas é um sinal para investigação; não demonstra viés causal.",
      "Uma nota de família não é uma avaliação independente de cada post gerado.",
    ],
  };
}

export type GenerationDecisionTrace = ReturnType<
  typeof inspectGenerationDecisionTrace
>;

/** Conditional rates use exposures in each stage, never total catalog size. */
export function summarizeDecisionVariability(input: GenerationDecisionTrace[]) {
  const runs = Array.from(
    new Map(
      input.filter(run => run.requestId).map(run => [run.requestId, run])
    ).values()
  );
  const groups = new Map<string, GenerationDecisionTrace[]>();
  for (const run of runs)
    groups.set(run.cohortKey, [...(groups.get(run.cohortKey) ?? []), run]);
  return Array.from(groups).map(([cohortKey, sample]) => {
    const counts = new Map<
      string,
      {
        family: string;
        eligibleRuns: number;
        retrievedRuns: number;
        scoredRuns: number;
        selectedRuns: number;
        selectedScoredRuns: number;
        deliveredRuns: number;
        reviewedRuns: number;
        reviewRejectedRuns: number;
        reviewInconclusiveRuns: number;
        findingCategories: Record<string, number>;
      }
    >();
    for (const run of sample) {
      // Invalid election evidence remains visible per run, outside the rates.
      if (!run.coverage.electionVerified) continue;
      const eligible = new Set(
        run.candidates.map(candidate => String(candidate.family))
      );
      for (const family of Array.from(eligible)) {
        const count = counts.get(family) ?? {
          family,
          eligibleRuns: 0,
          retrievedRuns: 0,
          scoredRuns: 0,
          selectedRuns: 0,
          selectedScoredRuns: 0,
          deliveredRuns: 0,
          reviewedRuns: 0,
          reviewRejectedRuns: 0,
          reviewInconclusiveRuns: 0,
          findingCategories: {},
        };
        const families = run.families.filter(
          candidate => candidate.family === family
        );
        const candidates = run.candidates.filter(
          candidate => candidate.family === family
        );
        count.eligibleRuns++;
        if (
          families.some(candidate => candidate.retrieved === true) ||
          (!families.length &&
            candidates.some(candidate => candidate.sentToSelector))
        )
          count.retrievedRuns++;
        const scored = run.assessments.some(
          batch =>
            batch.verified &&
            batch.scores.some(score => score.valid && score.family === family)
        );
        const selected = run.variability.selectedCandidates.some(id =>
          candidates.some(candidate => candidate.offerId === id)
        );
        if (scored) count.scoredRuns++;
        if (selected) count.selectedRuns++;
        if (selected && scored) count.selectedScoredRuns++;
        if (run.variability.deliveredFamilies.includes(family))
          count.deliveredRuns++;
        const reviews = run.reviewObservations
          .filter(observation => observation.family === family)
          .map(observation => row(observation.review));
        if (reviews.length) count.reviewedRuns++;
        if (reviews.some(review => review.status === "correction_required"))
          count.reviewRejectedRuns++;
        if (reviews.some(review => review.status === "inconclusive"))
          count.reviewInconclusiveRuns++;
        for (const category of Array.from(
          new Set(
            reviews.flatMap(review =>
              list(review.findings).map(finding => String(finding.category))
            )
          )
        ))
          count.findingCategories[category] =
            (count.findingCategories[category] ?? 0) + 1;
        counts.set(family, count);
      }
    }
    const totalSelections = Array.from(counts.values()).reduce(
      (sum, count) => sum + count.selectedRuns,
      0
    );
    return {
      cohortKey,
      cohort: sample[0].cohort,
      sampledRuns: sample.length,
      verifiedRuns: sample.filter(run => run.coverage.electionVerified).length,
      distinctRequestFingerprints: new Set(
        sample.map(run => run.requestFingerprint)
      ).size,
      families: Array.from(counts.values())
        .map(count => ({
          ...count,
          assessmentRateGivenEligible: count.scoredRuns / count.eligibleRuns,
          selectionRateGivenEligible: count.selectedRuns / count.eligibleRuns,
          selectionRateGivenScored: count.scoredRuns
            ? count.selectedScoredRuns / count.scoredRuns
            : null,
          rejectionRateGivenReviewed: count.reviewedRuns
            ? count.reviewRejectedRuns / count.reviewedRuns
            : null,
          deliveryRateGivenSelected: count.selectedRuns
            ? count.deliveredRuns / count.selectedRuns
            : null,
          selectionShare: totalSelections
            ? count.selectedRuns / totalSelections
            : null,
        }))
        .sort(
          (a, b) =>
            b.selectedRuns - a.selectedRuns || a.family.localeCompare(b.family)
        ),
      caution:
        "Taxas descritivas por exposição. Pedidos diferentes podem justificar escolhas diferentes; uma única rodada não mede variabilidade.",
    };
  });
}

const escape = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    char =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!
  );
export function renderDecisionTraceHtml(
  runs: GenerationDecisionTrace[],
  refreshSeconds?: number
) {
  const table = (headers: string[], rows: unknown[][]) =>
    `<div class="scroll"><table><thead><tr>${headers.map(header => `<th>${escape(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(values => `<tr>${values.map(value => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const reasons: Record<string, string> = {
    selected: "Escolhido",
    lower_rank: "Posição inferior no ranking",
    outside_suitability_gap: "Fora da faixa de adequação",
    family_already_selected: "Família já escolhida em outro slot",
    lower_rank_after_media_coverage:
      "Posição inferior após preservar cobertura de mídia",
    required_photo_unavailable: "Sem suporte à fotografia exigida",
    photo_forbidden: "Não atende à restrição de fotografia",
    content_or_layout_incompatible:
      "Conteúdo incompatível com o layout; consultar rejeições técnicas",
    viable_member_not_representative:
      "Outro membro da família venceu por encaixe, recência ou desempate",
  };
  const runSections = runs
    .map(run => {
      const candidateTable = table(
        [
          "Candidato",
          "Família",
          "Nota / 4",
          "Confiança",
          "Nota atribuída a",
          "Resultado",
          "Critérios por slot",
        ],
        run.candidates.map(candidate => [
          candidate.offerId,
          candidate.family,
          candidate.score,
          candidate.confidence,
          candidate.scoreTargetId,
          candidate.outcome,
          candidate.decisions
            .map(
              decision =>
                `slot ${decision.slot}: ${reasons[decision.reason] ?? decision.reason}; rank=${decision.rank ?? "—"}; utilidade=${decision.rankingUtility ?? "—"}`
            )
            .join("\n"),
        ])
      );
      const reviewTable = table(
        [
          "Proposta",
          "Estado de entrega",
          "Parecer capturado",
          "Parecer armazenado",
          "Motivo",
        ],
        run.generatedPosts.map(post => [
          post.effectiveProposalId,
          post.status,
          post.reviewerOutcome,
          post.storedReviewOutcome,
          post.errorReason ?? post.approvalBasis,
        ])
      );
      const findingsTable = table(
        [
          "Proposta",
          "Rodada",
          "Parecer",
          "Categoria",
          "Efeito",
          "Justificativa / limitação",
          "Correção esperada",
        ],
        run.reviewObservations.flatMap(observation => {
          const review = row(observation.review),
            findings = list(review.findings);
          return findings.length
            ? findings.map(finding => [
                observation.proposalId,
                review.round,
                review.status,
                finding.category,
                finding.effect,
                finding.explanation,
                finding.expected,
              ])
            : [
                [
                  observation.proposalId,
                  review.round,
                  review.status,
                  "—",
                  "—",
                  review.limitation ||
                    "Sem achados reportados no parecer capturado.",
                  "—",
                ],
              ];
        })
      );
      const alertsTable = table(
        ["Código", "Alvo", "Detalhe"],
        [
          ...run.issues.map(issue => [issue.code, issue.target, issue.detail]),
          ...strings(run.coverage.electionIssues).map(code => [
            code,
            "eleição",
            "Evidência incompleta ou inconsistente.",
          ]),
        ]
      );
      const catalogTable = table(
        ["Design", "Nome", "Família", "Situação", "Motivos de exclusão"],
        list(run.registeredDesigns).map(design => [
          design.id,
          design.label,
          design.family,
          design.disposition,
          strings(design.reasons).join("; "),
        ])
      );
      return `<section><h2>Geração ${escape(run.requestId)}</h2>
      <p>Estado: ${escape(run.requestStatus)} · Eleição: ${escape(run.coverage.electionStatus)} · Famílias escolhidas: ${run.variability.distinctSelectedFamilies}</p>
      <details><summary>Catálogo e exclusões (${run.registeredDesigns.length})</summary>${catalogTable}</details>
      <h3>Candidatos</h3>${candidateTable}<h3>Revisão e entrega</h3>${reviewTable}
      <details><summary>Pareceres e motivos por rodada</summary>${findingsTable}</details>
      <h3>Alertas</h3>${alertsTable}
      <details><summary>Registros completos: notas, critérios, descartes, recuperação e respostas brutas</summary><pre>${escape(JSON.stringify(run, null, 2))}</pre></details></section>`;
    })
    .join("");
  const variability = summarizeDecisionVariability(runs)
    .map(
      group => `<p>${escape(group.cohort.postMode)} · ${group.verifiedRuns}/${group.sampledRuns} gerações com eleição verificada · ${group.distinctRequestFingerprints} pedidos distintos</p>
    ${table(
      [
        "Família",
        "Elegível",
        "Recuperada",
        "Avaliada",
        "Escolhida",
        "Entregue",
        "Reprovação / revisão",
        "Escolha / elegível",
      ],
      group.families.map(family => [
        family.family,
        family.eligibleRuns,
        family.retrievedRuns,
        family.scoredRuns,
        family.selectedRuns,
        family.deliveredRuns,
        family.rejectionRateGivenReviewed === null
          ? null
          : `${(100 * family.rejectionRateGivenReviewed).toFixed(1)}%`,
        `${(100 * family.selectionRateGivenEligible).toFixed(1)}%`,
      ])
    )}
    <small>${escape(group.caution)}</small>`
    )
    .join("");
  const refresh =
    refreshSeconds && Number.isFinite(refreshSeconds) && refreshSeconds >= 1
      ? `<meta http-equiv="refresh" content="${Math.floor(refreshSeconds)}">`
      : "";
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh}
    <title>PostSpark · Rastreabilidade</title>
    <style>body{font:15px system-ui;background:#10121a;color:#e5e7ef;margin:0;padding:24px;line-height:1.5}main{max-width:1400px;margin:auto;min-width:0}h1,h2,h3{color:#b6a5ff;overflow-wrap:anywhere}section{margin:30px 0;padding:20px;background:#191d29;border-radius:12px;min-width:0}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}td,th{text-align:left;padding:10px;border-bottom:1px solid #34394c;vertical-align:top;white-space:pre-line}th{color:#c5baff}pre{white-space:pre-wrap;overflow-wrap:anywhere}details{margin:18px 0}summary{cursor:pointer}small{color:#b2bbce}@media(max-width:600px){body{padding:12px}section{padding:12px}}</style>
    <main><h1>Rastreabilidade das decisões</h1><p>Catálogo → recuperação → notas → escolha → revisão → entrega. Ausência de nota ou parecer não significa reprovação nem aprovação.</p>
    ${runSections}<section><h2>Variabilidade entre gerações</h2>${variability}</section></main></html>`;
}
