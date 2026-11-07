import { reviewProposalExceptionsV10 } from "./proposalReviewExceptionsV10";
import { compactAutomaticReviewInstructions, compactAutomaticReviewInstructionsV3, compactAutomaticReviewIntent, isAutomaticReviewNormalizationMarker } from "./automaticReviewProtocol";
import { ENV } from "../../_core/env";
import { generationPinnedTaskModelCallOptions } from "../generationModel";
import { z } from "zod";
import { arsenalHash } from "@shared/arsenalContent";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import type { ArsenalComposition } from "@shared/designArsenal";
import { failureFromError, GenerationFailureError } from "@shared/generationFailure";
import { isFormalReviewFailure } from "@shared/proposalReviewFailure";
import {
  proposalReviewResponseV10Schema,
  reviewResponseInventorySchemaV10,
  type ProposalReviewDurableContextV5,
  type ProposalReviewRecordV10,
  type ProposalReviewExceptionsRecordV10,
} from "@shared/proposalReviewV10";
import { recordGenerationEvent } from "../generationTrace";
import type {
  ProposalExecutionInput,
  ProposalGraphDeps,
} from "./proposalGraph";
import type { ReviewCopy, ReviewScene } from "./proposalReview";
import { extractTextContent } from "../llmJson";
import {
  readReviewOperations,
  initialReviewContext,
  executeReviewOperation,
  readReviewContext,
} from "./proposalReviewJournal";
import {
  assertReviewExecutionConfigV10,
  reviewInstructionsV10,
  automaticReviewInstructionsV10,
} from "./reviewExecutionConfigV10";
import { validatedEditorialContextV9 } from "./editorialContextV9";
import {
  localDiagnosticsEnabled,
  writeLocalDiagnostic,
} from "../localDiagnostics";
import {
  reviewEvidenceAnchors,
  buildReviewEvidenceAliases,
} from "./reviewEvidence";
import {
  reviewTextUnitsV10,
  buildSourceEvidenceV10,
  reviewContextV10,
} from "./reviewEvidenceV10";
import { normalizeReviewV10, decodeReviewV10 } from "./proposalReviewPolicyV10";
import { materialGenerationIntent } from "@shared/generationPlan";
import { rendersChromaticPortal } from "@shared/generationVisualRequirements";

export async function reviewProposalV10(
  input: ProposalExecutionInput,
  deps: ProposalGraphDeps,
  definitions: ComponentDefinitionV1[],
  compositions: ArsenalComposition[],
  copy: ReviewCopy,
  round: "initial" | "recheck"
): Promise<ProposalReviewRecordV10 | ProposalReviewExceptionsRecordV10> {
  if (input.reviewExecutionConfig?.version === 5 && input.reviewExecutionConfig.automaticReviewVersion === 4) return reviewProposalExceptionsV10(input, deps, definitions, compositions, copy, round);
  const automatic = Boolean(input.generationConfig?.taskRouting || (input.reviewExecutionConfig?.version === 5 && input.reviewExecutionConfig.taskModelConfig));
  const portal = automatic ? undefined : input.visualRequirements?.chromaticPortal;
  if (portal && (compositions.length !== definitions.length ||
    !compositions.every((composition, index) => rendersChromaticPortal(definitions[index], composition)))) {
    throw new GenerationFailureError("artwork_unusable", "review", false);
  }
  input = { ...input, generationIntent: materialGenerationIntent(input.generationIntent) };
  let inputHash = arsenalHash({ policyVersion: 10, copy, compositions, round });
  const operationKeys: string[] = [];
  const empty = (limitation: string): ProposalReviewRecordV10 => ({
    policyVersion: 10,
    round,
    inputHash,
    status: "inconclusive",
    outcome: "inconclusive",
    limitation,
    reviewedSlides: [],
    checkedTextUnits: [],
    requirementChecks: [],
    messageAssessment: { status: "uncertain", explanation: limitation },
    findings: [],
    factCoverage: [],
    sourceCoverage: [],
    operationKeys: [...operationKeys],
    discardedFields: [],
    factualAudit: { units: [], claims: [] },
    evidenceInventory: [],
    unitChecks: [],
    intentRequirements: input.generationIntent?.requirements ?? [],
    intentChecks: [],
    findingEvidence: [],
    sequenceAssessment: {
      status: "uncertain",
      explanation: limitation,
      promises: [],
    },
  });
  try {
    const reviewConfig = assertReviewExecutionConfigV10(
      input.reviewExecutionConfig
    );
    if(reviewConfig.automaticReviewVersion===4)throw new GenerationFailureError("preparation_contract_incompatible","review");
    const automaticReviewVersion = reviewConfig.automaticReviewVersion === 2 ? 2 : reviewConfig.automaticReviewVersion === 3 ? 3 : undefined;
    const automaticV2 = automaticReviewVersion !== undefined;
    const context = validatedEditorialContextV9(input);
    if (input.editorialContextHash !== context.hash)
      throw new GenerationFailureError(
        "preparation_contract_incompatible",
        "review"
      );
    const prior = await readReviewOperations(deps, input);
    const initialContext = initialReviewContext(prior, input, reviewConfig);
    const anchors = reviewEvidenceAnchors(copy, compositions),
      aliases = buildReviewEvidenceAliases(anchors),
      units = reviewTextUnitsV10(copy, aliases);
    const profile =
      initialContext?.profile ??
      (copy.slides.length <= 4 &&
      context.requirements.length <= 8 &&
      units.length <= 20
        ? "standard"
        : "extended");
    let phaseDeadline =
      Date.now() +
      (profile === "extended"
        ? reviewConfig.extendedTimeoutMs
        : reviewConfig.timeoutMs);
    const bounded = async <T>(
      budgetMs: number,
      work: (signal: AbortSignal, deadlineMs: number) => Promise<T>
    ) => {
      input.signal?.throwIfAborted();
      const controller = new AbortController();
      const onAbort = () => controller.abort(input.signal?.reason);
      input.signal?.addEventListener("abort", onAbort, { once: true });
      const now = Date.now();
      const hardCap =
        Math.min(input.deadlineMs ?? Infinity, phaseDeadline) - now;
      const effectiveMs = Math.min(budgetMs, hardCap);
      if (effectiveMs <= 0) throw new Error("proposal_review_timeout");
      const deadlineMs = now + effectiveMs;
      const timer = setTimeout(
        () => controller.abort(new Error("proposal_review_timeout")),
        effectiveMs
      );
      try {
        return await work(controller.signal, deadlineMs);
      } catch (error) {
        if (
          controller.signal.aborted &&
          !input.signal?.aborted &&
          !(
            error instanceof Error &&
            error.message.startsWith("reconciliation_required:")
          )
        ) {
          throw new Error("proposal_review_timeout");
        }
        throw error;
      } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", onAbort);
      }
    };

    const render =
      deps.renderReviewScenes ??
      (await import("./proposalRenderer")).renderReviewScenes;
    const scenes = (
      await bounded(
        profile === "extended"
          ? reviewConfig.extendedTimeoutMs
          : reviewConfig.timeoutMs,
        (signal, deadlineMs) =>
          render({
            compositions,
            definitions,
            actor: deps.actor,
            signal,
            deadlineMs,
          })
      ).catch(error => {
        if (
          input.signal?.aborted ||
          error?.message === "proposal_review_timeout"
        )
          throw error;
        throw new Error("proposal_review_renderer_unavailable");
      })
    ).sort((a, b) => a.slideIndex - b.slideIndex);
    validateScenes(scenes, compositions.length);
    const prioritizeDelivery = input.firstDeliveryReviewRecovery === true;
    const compactRecheck = prioritizeDelivery && round === "recheck";
    const maxCompletionTokens =
      reviewConfig.profiles[profile].maxCompletionTokens;
    const checkInventories = {
      requirementChecks: context.requirements.map(r => r.id),
      intentChecks: input.generationIntent?.requirements.map(r => r.id) ?? [],
    };
    const responseSchema = reviewConfig.nativeInventoryVersion === 1
      ? reviewResponseInventorySchemaV10(checkInventories, automaticReviewVersion)
      : proposalReviewResponseV10Schema;
    const json = z.toJSONSchema(responseSchema);
    delete json.$schema;
    const evidenceInventory = buildSourceEvidenceV10(context);
    const reviewData = {
      context: reviewContextV10(context, evidenceInventory),
      generationIntent: automaticV2 ? compactAutomaticReviewIntent(input.generationIntent) : input.generationIntent,
      ...(portal ? { visualRequirements: [{
        requestQuote: portal.quote,
        check: "Confira na imagem o arco luminoso e a transição de cores no fundo. Se ausentes, registre um achado bloqueante de requisito explícito, citando o briefing.",
      }] } : {}),
      ...(input.generationIntent?.editorial ? { editorialInterpretation: {
        definitions: input.editorialCatalog?.document.intents.filter(d => input.generationIntent!.editorial!.signals.some(s => s.intentId === d.id)) ?? [],
        rule: "requested exprime pedido; suggested é possibilidade, nunca obrigação; forbidden é proibição explícita. Aspectos ausentes são neutros. Não invente requisitos ou falhas porque a peça não realiza todas as capacidades editoriais do layout.",
      } } : {}),
      narrativePlan: automaticV2 ? undefined : automatic ? input.narrativePlan?.pages.map(page => ({ slideIndex: page.slideIndex, purpose: page.purpose, rhythm: page.rhythm, advisory: true, assignments: page.assignments.map(({fieldId,contentIds,itemCount}) => ({fieldId,contentIds,itemCount})) })) : input.narrativePlan,
      checkInventories,
      copy: {
        caption: copy.caption,
        hashtags: copy.hashtags,
        slides: copy.slides.map(s => ({ values: s.values })),
      },
      textUnits: units,
      anchors: aliases.promptInventory,
      nativeConstraints: definitions.map((d, slideIndex) => ({
        slideIndex,
        fields: automatic ? completeDesignFields(d).map(({id,role,kind,required,cardinality}) => ({id,role,kind,required,cardinality})) : completeDesignFields(d),
        ...(automatic ? {} : { designGuidance: d.completeDesign?.designGuidance }),
      })),
      previous: input.previousReviewContext
        ? {
            previous: compactRecheck ? { findings: input.previousReviewContext.previous.findings } : input.previousReviewContext.previous,
            changedTargets: input.previousReviewContext.changedTargets,
          }
        : undefined,
    };
    const renderHashes = scenes.map(s => ({
      slideIndex: s.slideIndex,
      hash: arsenalHash(s.dataUri),
    }));
    inputHash = arsenalHash({
      policyVersion: 10,
      configurationHash: reviewConfig.configurationHash,
      identity: {
        requestId: input.requestId,
        proposalId: input.proposalId,
        revision: input.revision ?? 1,
      },
      reviewData,
      compositions,
      round,
      renderHashes,
      sourceImageHashes: input.sourceImages?.map(arsenalHash),
      profile,
      maxCompletionTokens,
      ...(compactRecheck ? { compactRecheck: 1 } : {}),
    });
    const durableContext: ProposalReviewDurableContextV5 = {
      version: 5,
      policyVersion: 10,
      requestId: input.requestId,
      proposalId: input.proposalId,
      revision: input.revision ?? 1,
      round,
      inputHash,
      configurationHash: reviewConfig.configurationHash,
      sourceContextHash: context.hash,
      renderHashes,
      anchorInventory: aliases.inventory,
      aliasMap: aliases.aliasMap,
      textUnitInventory: units,
      evidenceInventory,
      profile,
    };
    if (localDiagnosticsEnabled() && ENV.aiTraceStoreContent)
      await writeLocalDiagnostic(input.requestId, {
        kind: "editorial_composition",
        requestId: input.requestId,
        proposalId: input.proposalId,
        round,
        contextHash: context.hash,
        renderHashes,
        slides: compositions.map((c, slideIndex) => ({
          slideIndex,
          canonical: copy.slides[slideIndex].values,
          groups: c.groups,
          fragments: c.elements
            .filter(e => e.text !== undefined)
            .map(e => ({
              id: e.id,
              bindingId: e.bindingId,
              parentId: e.parentId,
              text: e.text,
              x: e.x,
              y: e.y,
              width: e.width,
              height: e.height,
              fontSize: e.fontSize,
              measured: deps.measureText?.({
                ...e,
                text: e.text ?? "",
                fontStyle: String(e.fontWeight),
              }),
            })),
        })),
      }).catch(() =>
        recordGenerationEvent({
          stage: "editorial_composition",
          status: "failed",
          detail: "local_diagnostic_unavailable",
        })
      );
    let activeOperationKey = "";
    const work = async (
      violations?: string[],
      invalidHash?: string,
      invalidResponse?: string
    ) => {
      if (violations)
        phaseDeadline = Date.now() + reviewConfig.extendedTimeoutMs;
      const compact = compactRecheck || (prioritizeDelivery && Boolean(violations));
      const instruction = reviewConfig.automaticReviewVersion === 3 ? compactAutomaticReviewInstructionsV3(violations, invalidHash) : automaticV2 ? compactAutomaticReviewInstructions(violations, invalidHash) : [reviewInstructionsV10(violations, invalidHash), ...(automatic ? [automaticReviewInstructionsV10] : [])].join("\n");
      recordGenerationEvent({
        stage: "proposal_review_protocol",
        status: "started",
        detail: violations ? "formal_repair" : "evaluation",
        data: {
          policyVersion: 10,
          proposalId: input.proposalId,
          round,
          profile,
          maxCompletionTokens,
          slides: copy.slides.length,
          textUnits: units.length,
          requirements: context.requirements.length,
          configurationHash: reviewConfig.configurationHash,
        },
      });
      const result = await bounded(
        violations || profile === "extended"
          ? reviewConfig.extendedTimeoutMs
          : reviewConfig.timeoutMs,
        (signal, deadlineMs) =>
          (async () => {
            const params: Parameters<typeof deps.generateText>[0] = {
              taskRoute: "post_evaluation",
              pinnedModel: reviewConfig.resolvedModel,
              traceLabel: violations
                ? `proposal_review_evidence_repair_${round}`
                : `proposal_review_${round}`,
              signal,
              deadlineMs,
              transportTimeoutMs:
                violations || profile === "extended"
                  ? reviewConfig.extendedTimeoutMs
                  : reviewConfig.timeoutMs,
              maxTransportAttempts: 1,
              disableFallback: true,
              disableStructuredRepair: true,
              forceTextSchema: true,
              structuredValidationOwner: "caller",
              reasoningEffort: compact ? "low" : reviewConfig.reasoningEffort,
              ...(reviewConfig.taskModelConfig ? {} : { temperature: reviewConfig.temperature }),
              maxCompletionTokens,
              ...(reviewConfig.taskModelConfig ? generationPinnedTaskModelCallOptions(reviewConfig.taskModelConfig) : {}),
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "proposal_review_v10",
                  strict: true,
                  schema: json,
                },
              },
              messages: [
                {
                  role: "system",
                  content: compact ? `${instruction}\nEm meaning e explanation, use uma frase curta por item. Preserve todos os inventários, critérios de aprovação e a inspeção de cada lâmina. Retorne o JSON completo.` : instruction,
                },
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        ...reviewData,
                        ...(violations && (invalidResponse || prioritizeDelivery)
                          ? {
                              formalRepair: {
                                ...(automaticV2 ? {} : {invalidResponse}),
                                violations,
                                invalidHash,
                              },
                            }
                          : {}),
                      }),
                    },
                    ...(input.sourceImages ?? []).flatMap((url, index) => [
                      {
                        type: "text" as const,
                        text: `Imagem fonte original ${index + 1}: conteúdo factual, separada da arte gerada.`,
                      },
                      {
                        type: "image_url" as const,
                        image_url: { url, detail: "high" as const },
                      },
                    ]),
                    ...scenes.flatMap(s => [
                      { type: "text" as const, text: `Slide ${s.slideIndex}` },
                      {
                        type: "image_url" as const,
                        image_url: { url: s.dataUri, detail: "high" as const },
                      },
                    ]),
                  ],
                },
              ],
            };
            await deps.persistReviewExpectation?.(activeOperationKey, {
              ...durableContext,
              transport: {
                model: reviewConfig.resolvedModel,
                messagesHash: arsenalHash(params.messages),
                configurationHash: reviewConfig.configurationHash,
              },
            });
            return deps.generateText(params);
          })()
      );
      return { ...result, __proposalReview: durableContext };
    };
    const execute = async (
      key: string,
      violations?: string[],
      invalidHash?: string,
      invalidResponse?: string
    ) => {
      activeOperationKey = key;
      operationKeys.push(`${input.proposalId}:${key}`);
      return executeReviewOperation(
        input,
        deps,
        key,
        durableContext,
        reviewConfig,
        () => work(violations, invalidHash, invalidResponse)
      );
    };
    const parse = (
      result: Awaited<ReturnType<typeof execute>>,
      key: string
    ) => {
      const receipt = readReviewContext(result, input, reviewConfig, key);
      if (arsenalHash(receipt) !== arsenalHash(durableContext))
        throw new GenerationFailureError(
          "preparation_contract_incompatible",
          "review"
        );
      const c = result.choices?.[0];
      if (
        /length|max_token|max_output|limit/i.test(
          `${c?.finish_reason ?? ""} ${c?.native_finish_reason ?? ""}`
        )
      )
        throw new Error("proposal_review_response_truncated");
      const { response, discarded } = decodeReviewV10(
        extractTextContent(c?.message?.content)
      );
      if (discarded.length)
        recordGenerationEvent({
          stage: "proposal_review_decode",
          status: "completed",
          detail: "auxiliary_fields_discarded",
          data: { policyVersion: 10, round, count: discarded.length },
        });
      // V10 owns category/judgment consistency and preserves the exact violation
      // for formal repair, instead of losing it behind a generic parse error.
      const review = normalizeReviewV10({
        response,
        units,
        aliases,
        context,
        generationIntent: input.generationIntent,
        narrativePlan: input.narrativePlan,
        copy,
        compositions,
        inputHash,
        round,
        operationKeys: [...operationKeys],
        discardedFields: discarded,
        ...(automaticV2 ? {automaticReviewVersion} : {}),
      });
      const localFields = review.discardedFields.filter(isAutomaticReviewNormalizationMarker);
      if (localFields.length) recordGenerationEvent({stage:"proposal_review_decode",status:"completed",detail:"local_advisory_inventory_normalized",data:{policyVersion:10,proposalId:input.proposalId,round,inputHash,count:localFields.length,paidEffect:false}});
      return review;
    };
    const key = `review:${round}:${inputHash}`;
    let result = await execute(key);
    try {
      return parse(result, key);
    } catch (error) {
      if (error instanceof GenerationFailureError) throw error;
      const reason =
        error instanceof Error && error.message.startsWith("proposal_review_")
          ? error.message
          : "proposal_review_response_invalid";
      if (!isFormalReviewFailure(reason)) return empty(reason);
      const diagnostic = (error as { violation?: unknown })?.violation ?? {
        rule: reason,
        checkInventories: reviewData.checkInventories,
        instruction:
          "Revise a consistência do parecer com esses inventários e as unidades, fontes e pixels fornecidos; não altere a peça nem suponha aprovação.",
      };
      const violations = [reason, JSON.stringify(diagnostic)];
      recordGenerationEvent({
        stage: "proposal_review_validation",
        status: "failed",
        detail: reason,
        data: { policyVersion: 10, round, profile, inputHash, diagnostic },
      });
      const invalidHash = arsenalHash(result),
        repairHash = arsenalHash({
          policyVersion: 10,
          inputHash,
          invalidHash,
          violations,
          ...(prioritizeDelivery ? { concise: 1 } : {}),
        });
      const repairKey = `review_evidence_repair:${round}:${repairHash}`;
      const repairPrefix = prioritizeDelivery ? `review_evidence_repair:${round}:` : "review_evidence_repair:";
      const repairs = (await readReviewOperations(deps, input)).filter(o =>
        o.operationKey.startsWith(repairPrefix)
      );
      const budgetUsed = prioritizeDelivery
        ? Array.from(deps.reviewRepairBudget ?? []).some(key => key.includes(repairPrefix))
        : Boolean(deps.reviewRepairBudget?.size);
      if (
        repairs.some(o => o.operationKey !== repairKey) ||
        (budgetUsed &&
          !repairs.some(o => o.operationKey === repairKey))
      )
        return empty(reason);
      deps.reviewRepairBudget?.add(repairKey);
      const raw = extractTextContent(result.choices?.[0]?.message?.content);
      if (raw.length > 100000) return empty("proposal_review_evidence_invalid");
      result = await execute(repairKey, violations, invalidHash,
        prioritizeDelivery && reason === "proposal_review_response_truncated" ? undefined : raw);
      try {
        return parse(result, repairKey);
      } catch (repairError) {
        if (repairError instanceof GenerationFailureError) throw repairError;
        return empty(
          repairError instanceof Error &&
            repairError.message.startsWith("proposal_review_")
            ? repairError.message
            : "proposal_review_response_invalid"
        );
      }
    }
  } catch (error) {
    const failure = failureFromError(error, "review");
    if (failure.code === "provider_route_unavailable")
      throw Object.assign(new GenerationFailureError(failure.code, "review", true), { cause: error });
    if (input.signal?.aborted || error instanceof GenerationFailureError)
      throw error;
    const e = error as { name?: string; code?: string; message?: string };
    return empty(
      e.message && /^proposal_review_[a-z_]+$/.test(e.message)
        ? e.message
        : e.message?.startsWith("reconciliation_required:")
          ? "proposal_review_reconciliation_required"
          : e.name === "LlmDeadlineExceededError" || e.code === "TIMEOUT"
            ? "proposal_review_provider_timeout"
            : "proposal_review_unavailable"
    );
  }
}
function validateScenes(scenes: ReviewScene[], count: number) {
  if (
    scenes.length !== count ||
    new Set(scenes.map(s => s.slideIndex)).size !== count ||
    scenes.some(
      s =>
        s.slideIndex < 0 ||
        s.slideIndex >= count ||
        s.renderer !== "CanvasPostStage" ||
        s.width < 256 ||
        s.height < 256 ||
        s.width > 4096 ||
        s.height > 4096 ||
        !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          s.dataUri
        )
    ) ||
    scenes.reduce((n, s) => n + s.dataUri.length, 0) > 16_000_000
  )
    throw new Error("proposal_review_invalid_render");
}
