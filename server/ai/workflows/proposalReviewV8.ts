import { ENV } from "../../_core/env";
import { z } from "zod";
import { arsenalHash } from "@shared/arsenalContent";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import type { ArsenalComposition } from "@shared/designArsenal";
import { GenerationFailureError } from "@shared/generationFailure";
import { isFormalReviewFailure } from "@shared/proposalReviewFailure";
import {
  proposalReviewResponseV8Schema,
  type ProposalReviewDurableContextV3,
  type ProposalReviewRecordV8,
} from "@shared/proposalReviewV8";
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
  assertReviewExecutionConfigV8,
  reviewInstructionsV8,
} from "./reviewExecutionConfigV8";
import { validatedEditorialContextV8 } from "./editorialContextV8";
import {
  localDiagnosticsEnabled,
  writeLocalDiagnostic,
} from "../localDiagnostics";
import {
  reviewEvidenceAnchors,
  buildReviewEvidenceAliases,
} from "./reviewEvidence";
import { reviewTextUnitsV7 } from "./proposalReviewPolicy";
import { normalizeReviewV8, decodeReviewV8 } from "./proposalReviewPolicyV8";

export async function reviewProposalV8(
  input: ProposalExecutionInput,
  deps: ProposalGraphDeps,
  definitions: ComponentDefinitionV1[],
  compositions: ArsenalComposition[],
  copy: ReviewCopy,
  round: "initial" | "recheck"
): Promise<ProposalReviewRecordV8> {
  let inputHash = arsenalHash({ policyVersion: 8, copy, compositions, round });
  const operationKeys: string[] = [];
  const empty = (limitation: string): ProposalReviewRecordV8 => ({
    policyVersion: 8,
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
  });
  try {
    const reviewConfig = assertReviewExecutionConfigV8(
      input.reviewExecutionConfig
    );
    const context = validatedEditorialContextV8(input);
    if (input.editorialContextHash !== context.hash)
      throw new GenerationFailureError(
        "preparation_contract_incompatible",
        "review"
      );
    const prior = await readReviewOperations(deps, input);
    const initialContext = initialReviewContext(prior, input, reviewConfig);
    const bounded = async <T>(
      budgetMs: number,
      work: (signal: AbortSignal, deadlineMs: number) => Promise<T>
    ) => {
      input.signal?.throwIfAborted();
      const controller = new AbortController();
      const onAbort = () => controller.abort(input.signal?.reason);
      input.signal?.addEventListener("abort", onAbort, { once: true });
      const now = Date.now();
      const hardCap = input.deadlineMs ? input.deadlineMs - now : Infinity;
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
      await bounded(reviewConfig.timeoutMs, (signal, deadlineMs) =>
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
    const anchors = reviewEvidenceAnchors(copy, compositions),
      aliases = buildReviewEvidenceAliases(anchors),
      units = reviewTextUnitsV7(copy, aliases);
    const profile =
      initialContext?.profile ??
      (copy.slides.length <= 4 &&
      context.requirements.length <= 8 &&
      units.length <= 20
        ? "standard"
        : "extended");
    const maxCompletionTokens =
      reviewConfig.profiles[profile].maxCompletionTokens;
    const json = z.toJSONSchema(proposalReviewResponseV8Schema);
    delete json.$schema;
    const reviewData = {
      context,
      copy: {
        caption: copy.caption,
        hashtags: copy.hashtags,
        slides: copy.slides.map(s => ({ values: s.values })),
      },
      textUnits: units,
      anchors: aliases.promptInventory,
      nativeConstraints: definitions.map((d, slideIndex) => ({
        slideIndex,
        fields: completeDesignFields(d),
        designGuidance: d.completeDesign?.designGuidance,
      })),
      previous: input.previousReviewContext
        ? {
            previous: input.previousReviewContext.previous,
            changedTargets: input.previousReviewContext.changedTargets,
          }
        : undefined,
    };
    const renderHashes = scenes.map(s => ({
      slideIndex: s.slideIndex,
      hash: arsenalHash(s.dataUri),
    }));
    inputHash = arsenalHash({
      policyVersion: 8,
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
      profile,
      maxCompletionTokens,
    });
    const durableContext: ProposalReviewDurableContextV3 = {
      version: 3,
      policyVersion: 8,
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
    const work = async (
      violations?: string[],
      invalidHash?: string,
      invalidResponse?: string
    ) => {
      recordGenerationEvent({
        stage: "proposal_review_protocol",
        status: "started",
        detail: violations ? "formal_repair" : "evaluation",
        data: {
          policyVersion: 8,
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
        reviewConfig.timeoutMs,
        (signal, deadlineMs) =>
          deps.generateText({
            taskRoute: "post_evaluation",
            pinnedModel: reviewConfig.resolvedModel,
            traceLabel: violations
              ? `proposal_review_evidence_repair_${round}`
              : `proposal_review_${round}`,
            signal,
            deadlineMs,
            transportTimeoutMs: reviewConfig.timeoutMs,
            maxTransportAttempts: 1,
            disableFallback: true,
            disableStructuredRepair: true,
            forceTextSchema: true,
            structuredValidationOwner: "caller",
            reasoningEffort: reviewConfig.reasoningEffort,
            temperature: reviewConfig.temperature,
            maxCompletionTokens,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "proposal_review_v8",
                strict: true,
                schema: json,
              },
            },
            messages: [
              {
                role: "system",
                content: reviewInstructionsV8(violations, invalidHash),
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      ...reviewData,
                      ...(invalidResponse
                        ? {
                            formalRepair: {
                              invalidResponse,
                              violations,
                              invalidHash,
                            },
                          }
                        : {}),
                    }),
                  },
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
          })
      );
      return { ...result, __proposalReview: durableContext };
    };
    const execute = async (
      key: string,
      violations?: string[],
      invalidHash?: string,
      invalidResponse?: string
    ) => {
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
      const { response, discarded } = decodeReviewV8(
        extractTextContent(c?.message?.content)
      );
      if (discarded.length)
        recordGenerationEvent({
          stage: "proposal_review_decode",
          status: "completed",
          detail: "auxiliary_fields_discarded",
          data: { policyVersion: 8, round, count: discarded.length },
        });
      // Do not turn a declared non-material suggestion into a factual veto,
      // or approve a false guarantee by simply trusting its downgraded effect.
      // A contradictory judgment needs the existing single formal repair.
      if (
        (reviewConfig.editorialGuidanceVersion ?? 1) >= 4 &&
        response.findings.some(
          f => f.category === "unsupported_claim" && f.consequence === "none"
        )
      )
        throw new Error("proposal_review_response_invalid");
      return normalizeReviewV8({
        response,
        units,
        aliases,
        context,
        copy,
        compositions,
        inputHash,
        round,
        operationKeys: [...operationKeys],
        discardedFields: discarded,
      });
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
      recordGenerationEvent({
        stage: "proposal_review_validation",
        status: "failed",
        detail: reason,
        data: { policyVersion: 8, round, profile, inputHash },
      });
      const invalidHash = arsenalHash(result),
        repairHash = arsenalHash({
          policyVersion: 8,
          inputHash,
          invalidHash,
          violations: [reason],
        });
      const repairKey = `review_evidence_repair:${round}:${repairHash}`;
      const repairs = (await readReviewOperations(deps, input)).filter(o =>
        o.operationKey.startsWith("review_evidence_repair:")
      );
      if (repairs.some(o => o.operationKey !== repairKey)) return empty(reason);
      const raw = extractTextContent(result.choices?.[0]?.message?.content);
      if (raw.length > 100000) return empty("proposal_review_evidence_invalid");
      result = await execute(repairKey, [reason], invalidHash, raw);
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
