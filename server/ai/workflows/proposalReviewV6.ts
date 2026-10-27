import { z } from "zod";
import { arsenalHash } from "@shared/arsenalContent";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import type { ArsenalComposition } from "@shared/designArsenal";
import {
  proposalReviewResponseV6Schema,
  proposalReviewRecordV6Schema,
  type ProposalReviewRecord,
  type ProposalReviewFinding,
  type NarrativeCheck,
  type ReviewExecutionConfigV1,
} from "@shared/proposalReview";
import { GenerationFailureError } from "@shared/generationFailure";
import { isFormalReviewFailure } from "@shared/proposalReviewFailure";
import { recordGenerationEvent } from "../generationTrace";
import { assertReviewExecutionConfig, reviewSystemInstructionsV6 } from "./reviewExecutionConfig";
import { readReviewOperations, initialReviewContext, executeReviewOperation, readReviewContext, type ProposalReviewDurableContextV1 } from "./proposalReviewJournal";
import { extractTextContent } from "../llmJson";
import type {
  ProposalExecutionInput,
  ProposalGraphDeps,
} from "./proposalGraph";
import {
  corroboratesTextCorrection,
  type ReviewCopy,
  type ReviewScene,
} from "./proposalReview";
import {
  editorialSources,
  entitySpellingFindings,
  groundsEditorialFinding,
  validateEditorialPlan,
  editorialSlideText,
} from "./proposalEditorial";
import {
  inspectFactCoverage,
  inspectSourceCoverage,
  requiresFactCoverage,
} from "./proposalFactCoverage";
import {
  inspectNarrativeChecks,
  requiresNarrativeReview,
} from "./proposalNarrative";
import {
  reviewEvidenceAnchors,
  buildReviewEvidenceAliases,
  resolveReviewEvidenceV6,
} from "./reviewEvidence";
import { carouselNarrativeContract } from "@shared/carouselNarrative";
import { supportingCoverageAllowed } from "./proposalReviewV5";

export type { ReviewExecutionConfigV1 };

export function resolveReviewProfile(
  slideCountOrOpts: number | { slideCount: number; factCount: number; anchorCount?: number; evidenceAnchorCount?: number },
  factCount?: number,
  anchorCount?: number
): "standard" | "extended" {
  let slides = 0;
  let facts = 0;
  let anchors = 0;
  if (typeof slideCountOrOpts === "object") {
    slides = slideCountOrOpts.slideCount;
    facts = slideCountOrOpts.factCount;
    anchors = slideCountOrOpts.anchorCount ?? slideCountOrOpts.evidenceAnchorCount ?? 0;
  } else {
    slides = slideCountOrOpts;
    facts = factCount ?? 0;
    anchors = anchorCount ?? 0;
  }
  if (slides <= 4 && facts <= 8 && anchors <= 20) {
    return "standard";
  }
  return "extended";
}

export { resolveReviewExecutionConfig } from "./reviewExecutionConfig";
export type { ProposalReviewDurableContextV1 } from "./proposalReviewJournal";

function isTruncatedChoice(choice?: { finish_reason?: string | null; native_finish_reason?: string | null }): boolean {
  if (!choice) return false;
  const finish = `${choice.finish_reason ?? ""} ${choice.native_finish_reason ?? ""}`.toLowerCase();
  return (
    finish.includes("length") ||
    finish.includes("max_token") ||
    finish.includes("max_output") ||
    finish.includes("limit")
  );
}

export async function reviewProposalV6(
  input: ProposalExecutionInput,
  deps: ProposalGraphDeps,
  definitions: ComponentDefinitionV1[],
  compositions: ArsenalComposition[],
  copy: ReviewCopy,
  round: "initial" | "recheck"
): Promise<ProposalReviewRecord> {
  let inputHash = arsenalHash({ policyVersion: 6, copy, compositions, round });
  const operationKeys: string[] = [];
  const empty = (limitation: string): ProposalReviewRecord => ({
    policyVersion: 6,
    round,
    inputHash,
    status: "inconclusive",
    reviewedSlides: [],
    findings: [],
    factCoverage: [],
    sourceCoverage: [],
    operationKeys: [...operationKeys],
    limitation,
  });

  try {
    const reviewConfig = assertReviewExecutionConfig(input.reviewExecutionConfig);
    const priorOperations = await readReviewOperations(deps, input);
    const initialContext = initialReviewContext(priorOperations, input, reviewConfig);
    const coverageRequired = requiresFactCoverage(input, copy);
    const narrative = requiresNarrativeReview(input, copy);
    if (coverageRequired) {
      const planValidation = validateEditorialPlan(copy, input);
      if (planValidation.length)
        return empty("proposal_review_invalid_editorial_plan");
    }

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
          !(error instanceof Error && error.message.startsWith("reconciliation_required:"))
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
    const scenes = await bounded(reviewConfig.timeoutMs, (signal, deadlineMs) =>
      render({
        compositions,
        definitions,
        actor: deps.actor,
        signal,
        deadlineMs,
      })
    );
    validateScenes(scenes, compositions.length);

    const rawAnchors = reviewEvidenceAnchors(copy, compositions);
    const { inventory, aliasMap, promptInventory } = buildReviewEvidenceAliases(rawAnchors);

    // Profile and token budget
    const profile = initialContext?.profile ?? resolveReviewProfile(
      copy.slides.length, copy.editorialPlan?.facts?.length ?? 0, rawAnchors.length
    );
    const maxCompletionTokens = reviewConfig.profiles[profile].maxCompletionTokens;

    const schema = proposalReviewResponseV6Schema(narrative);
    const json = z.toJSONSchema(schema);
    delete json.$schema;

    const context = {
      prompt: input.prompt,
      context: input.contextContent,
      sources: input.sourceReferences?.map((s) => ({
        title: s.title,
        facts: s.facts,
      })),
      brief: input.executionBrief
        ? {
            rawInput: input.executionBrief.rawInput,
            notes: input.executionBrief.notes,
            objective: input.executionBrief.objective,
            interventionLevel: input.executionBrief.interventionLevel,
            mustKeep: input.executionBrief.mustKeep,
            mustInclude: input.executionBrief.mustInclude,
            forbiddenTerms: input.executionBrief.forbiddenTerms,
            callToAction: input.executionBrief.callToAction,
          }
        : null,
    };

    const config = {
      model: reviewConfig.resolvedModel,
      reasoningEffort: reviewConfig.reasoningEffort,
      temperature: reviewConfig.temperature,
      maxCompletionTokens,
      timeoutMs: reviewConfig.timeoutMs,
      profile,
    };

    const reviewData = {
      context,
      copy: {
        caption: copy.caption,
        hashtags: copy.hashtags,
        editorialPlan: copy.editorialPlan,
        slides: copy.slides.map((s) => ({ values: s.values })),
      },
      anchors: promptInventory,
      narrativeContract: narrative
        ? carouselNarrativeContract(
            copy.slides.length,
            input.executionBrief?.interventionLevel
          )
        : undefined,
      nativeConstraints: definitions.map((d, slideIndex) => ({
        slideIndex,
        fields: completeDesignFields(d),
        designGuidance: d.completeDesign?.designGuidance,
      })),
      previous: input.previousReviewContext ? {
        previous: (({inputHash:_hash,operationKeys:_keys,...record})=>record)(input.previousReviewContext.previous as ProposalReviewRecord & {operationKeys?:string[]}),
        changedTargets: input.previousReviewContext.changedTargets,
      } : undefined,
    };

    const renderHashes = scenes.map((s) => ({
      slideIndex: s.slideIndex,
      hash: arsenalHash(s.dataUri),
    }));

    inputHash = arsenalHash({
      policyVersion: 6,
      config: {
        configurationHash: reviewConfig.configurationHash,
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        temperature: config.temperature,
        maxCompletionTokens,
        profile,
      },
      identity: {
        requestId: input.requestId,
        proposalId: input.proposalId,
        revision: input.revision ?? 1,
      },
      reviewData,
      compositions,
      round,
      renders: renderHashes,
    });

    const durableContext: ProposalReviewDurableContextV1 = {
      version: 1,
      policyVersion: 6,
      requestId: input.requestId, proposalId: input.proposalId,
      revision: input.revision ?? 1, round,
      inputHash,
      configurationHash: reviewConfig.configurationHash,
      renderHashes,
      anchorInventory: inventory,
      aliasMap,
      profile,
    };

    const initialKey = `review:${round}:${inputHash}`;

    const work = async (
      violations?: string[],
      invalidHash?: string,
      invalidResponse?: string
    ) => {
      recordGenerationEvent({stage:"proposal_review_protocol",status:"started",detail:violations?"formal_repair":"evaluation",data:{policyVersion:6,proposalId:input.proposalId,configurationHash:reviewConfig.configurationHash,round,profile,maxCompletionTokens,slides:copy.slides.length,facts:copy.editorialPlan?.facts?.length??0,anchors:rawAnchors.length}});
      const rawResult = await bounded(config.timeoutMs, (signal, deadlineMs) =>
        deps.generateText({
          taskRoute: "post_evaluation",
          traceLabel: violations
            ? `proposal_review_evidence_repair_${round}`
            : `proposal_review_${round}`,
          signal,
          deadlineMs,
          transportTimeoutMs: config.timeoutMs,
          maxTransportAttempts: 1,
          disableFallback: true,
          disableStructuredRepair: true,
          forceTextSchema: true,
          structuredValidationOwner: "caller",
          reasoningEffort: config.reasoningEffort,
          temperature: config.temperature,
          maxCompletionTokens: config.maxCompletionTokens,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "proposal_review_v6",
              strict: true,
              schema: json,
            },
          },
          messages: [
            {
              role: "system",
              content: reviewSystemInstructionsV6({ narrative, coverageRequired, violations, invalidHash }),
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
                ...scenes.flatMap((s) => [
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

      return {
        ...rawResult,
        __proposalReview: durableContext,
      };
    };

    const execute = async (
      key: string,
      violations?: string[],
      invalidHash?: string,
      invalidResponse?: string
    ) => {
      operationKeys.push(`${input.proposalId}:${key}`);
      return executeReviewOperation(input, deps, key, durableContext, reviewConfig,
        () => work(violations, invalidHash, invalidResponse));
    };

    let result = await execute(initialKey);

    const parse = (
      execResult: Awaited<ReturnType<ProposalGraphDeps["generateText"]>>,
      operationKey: string
    ) => {
      const receipt = readReviewContext(execResult, input, reviewConfig, operationKey);
      if (arsenalHash(receipt) !== arsenalHash(durableContext))
        throw new GenerationFailureError("preparation_contract_incompatible", "review");
      const receiptAnchors = receipt.anchorInventory.map(({ alias: _alias, ...anchor }) => anchor);
      if (isTruncatedChoice(execResult.choices?.[0])) {
        throw new Error("proposal_review_response_truncated");
      }
      const rawText = extractTextContent(execResult.choices?.[0]?.message?.content);
      if (!rawText.trim()) {
        throw new Error("proposal_review_response_invalid");
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(rawText);
      } catch {
        throw new Error("proposal_review_response_invalid");
      }

      const response = schema.safeParse(decoded);
      if (!response.success) {
        throw new Error("proposal_review_response_invalid");
      }

      const r = response.data;
      if (r.outcome === "inconclusive" || r.limitation.trim()) {
        return empty("proposal_review_semantic_inconclusive");
      }

      // Coverage normalization and evidence resolution
      const coverage = (rows: typeof r.factCoverage) =>
        rows.map(({ evidenceIds, explanation = "", materialityReason = "", missingSourceQuote = "", ...row }) => {
          const evidence = resolveReviewEvidenceV6(evidenceIds, receipt.aliasMap, receiptAnchors);
          const isSupporting =
            row.materiality === "supporting" &&
            supportingCoverageAllowed({
              status: row.status,
              materiality: row.materiality,
              materialityReason,
              missingSourceQuote,
              evidence,
            }) &&
            ![
              ...(input.executionBrief?.mustKeep ?? []),
              ...(input.executionBrief?.mustInclude ?? []),
            ].some(
              (literal) =>
                missingSourceQuote.includes(literal) ||
                (literal.includes(missingSourceQuote) && Boolean(missingSourceQuote))
            );

          return {
            ...row,
            missingSourceQuote,
            explanation,
            materialityReason,
            evidence,
            materiality: isSupporting ? ("supporting" as const) : ("essential" as const),
          };
        });

      const factCoverage = coverage(r.factCoverage);
      const sourceCoverage = coverage(r.sourceCoverage) as Array<
        ReturnType<typeof coverage>[number] & {
          sourceQuote: string;
          meaning: string;
        }
      >;

      const narrativeChecks = (
        r as typeof r & {
          narrativeChecks?: Array<
            Omit<NarrativeCheck, "evidence"> & {
              effect: "blocking" | "advisory";
              evidenceIds: string[];
            }
          >;
        }
      ).narrativeChecks?.map(({ evidenceIds, explanation = "", ...c }) => ({
        ...c,
        explanation,
        evidence: resolveReviewEvidenceV6(evidenceIds, receipt.aliasMap, receiptAnchors),
      }));

      const providerFindings = r.findings.map(({ evidenceIds, ...f }) => {
        const evidence = resolveReviewEvidenceV6(evidenceIds, receipt.aliasMap, receiptAnchors);
        if (
          evidence.some(
            (e) =>
              e.slideIndex !== f.slideIndex ||
              (f.fieldId && e.fieldId !== f.fieldId)
          )
        ) {
          throw new Error("proposal_review_divergent_finding_reference");
        }
        const value = f.fieldId
          ? copy.slides[f.slideIndex]?.values.find((v) => v.fieldId === f.fieldId)?.value
          : editorialSlideText(copy, f.slideIndex);
        const actual = Array.isArray(value) ? value.join("\n") : value;
        if (actual === undefined)
          throw new Error("proposal_review_unknown_finding_field");
        if (actual.trim() && !evidence.length)
          throw new Error("proposal_review_missing_finding_evidence");
        if (
          f.sourceQuote &&
          !editorialSources(input).some((s) => s.includes(f.sourceQuote))
        )
          throw new Error("proposal_review_invalid_source_quote");

        const visible = evidence.map((e) => e.quote).join(" ");
        const relevantAnchorIds = evidenceIds.map((id) => receipt.aliasMap[id]);
        const ranges = relevantAnchorIds
          .map((id) => receiptAnchors.find((a) => a.anchorId === id)!)
          .filter(Boolean)
          .filter((a) => a.itemIndex === null)
          .sort((a, b) => a.start - b.start);
        let cursor = 0;
        for (const a of ranges) {
          if (a.start > cursor && actual.slice(cursor, a.start).trim()) break;
          cursor = Math.max(cursor, a.end);
        }
        const covered =
          typeof value === "string" && ranges.length > 0 && !actual.slice(cursor).trim();
        return { ...f, observed: covered ? actual : visible };
      });

      const fc = inspectFactCoverage(input, copy, compositions, definitions, factCoverage);
      const sc = inspectSourceCoverage(input, copy, compositions, definitions, sourceCoverage);
      const nc = inspectNarrativeChecks(
        input,
        copy,
        compositions,
        narrativeChecks?.map((c) =>
          c.effect === "advisory" && c.status === "needs_revision"
            ? { ...c, status: "met" as const, revisionSlides: [] }
            : c
        )
      );

      for (const check of [fc, sc, nc]) {
        if (check.limitation) throw new Error(check.limitation);
      }

      if (
        r.reviewedSlides.length !== compositions.length ||
        new Set(r.reviewedSlides).size !== compositions.length ||
        r.reviewedSlides.some((i) => i >= compositions.length)
      ) {
        throw new Error("proposal_review_incomplete_evidence");
      }

      const supporting = [...factCoverage, ...sourceCoverage].filter(
        (c) => c.materiality === "supporting" && c.status === "partial"
      );
      const sources: Array<ProposalReviewFinding & { effect?: "blocking" | "advisory" }> = [
        ...providerFindings,
        ...entitySpellingFindings(copy, input),
        ...fc.findings,
        ...sc.findings,
        ...nc.findings,
      ];
      const findings = Array.from(
        new Map(
          sources.map((f) => [
            arsenalHash([f.category, f.slideIndex, f.fieldId, f.observed, f.sourceQuote]),
            f,
          ])
        ).values()
      ).map((f) => {
        const authority = nc.findings.includes(f)
          ? ("contract_grounded" as const)
          : corroboratesTextCorrection(f, copy, input)
            ? ("corroborated" as const)
            : groundsEditorialFinding(f, copy, input)
              ? ("source_grounded" as const)
              : ("diagnostic" as const);
        const advisory =
          authority === "diagnostic" ||
          (f.category === "fact_omission" &&
            supporting.some((c) => c.missingSourceQuote === f.sourceQuote));
        return {
          ...f,
          authority,
          effect: advisory ? ("advisory" as const) : ("blocking" as const),
        };
      });

      const record = {
        policyVersion: 6 as const,
        round,
        inputHash,
        status:
          r.outcome !== "reviewed" || r.limitation.trim()
            ? ("inconclusive" as const)
            : findings.some((f) => f.effect === "blocking")
              ? ("correction_required" as const)
              : ("passed" as const),
        reviewedSlides: r.reviewedSlides,
        findings,
        factCoverage,
        sourceCoverage,
        ...(narrativeChecks ? { narrativeChecks } : {}),
        operationKeys: [...operationKeys],
        limitation: "",
      };
      return proposalReviewRecordV6Schema.parse(record);
    };

    try {
      return parse(result, initialKey);
    } catch (error) {
      if (error instanceof GenerationFailureError) throw error;
      const reason =
        error instanceof Error && error.message.startsWith("proposal_review_")
          ? error.message
          : "proposal_review_response_invalid";

      if (!isFormalReviewFailure(reason)) return empty(reason);
      recordGenerationEvent({stage:"proposal_review_validation",status:"failed",detail:reason,data:{round,profile,inputHash}});

      const invalidHash = arsenalHash(result);
      const repairInputHash = arsenalHash({
        policyVersion: 6,
        inputHash,
        invalidHash,
        violations: [reason],
      });
      const key = `review_evidence_repair:${round}:${repairInputHash}`;
      const prior = new Set([
        ...Array.from(deps.reviewRepairBudget ?? []),
        ...(await readReviewOperations(deps, input)).filter(o => o.operationKey.startsWith("review_evidence_repair:")).map(o => o.operationKey),
      ]);
      if (prior.size && !prior.has(key)) {
        recordGenerationEvent({ stage: "proposal_review", status: "failed", detail: "formal_repair_exhausted", data: { reason, round } });
        return empty(reason);
      }
      prior.add(key);

      const invalidResponse = extractTextContent(result.choices?.[0]?.message?.content);
      if (invalidResponse.length > 100000)
        return empty("proposal_review_evidence_invalid");

      result = await execute(key, [reason], invalidHash, invalidResponse);
      try {
        return parse(result, key);
      } catch (repairErr) {
        if (repairErr instanceof GenerationFailureError) throw repairErr;
        const finalReason =
          repairErr instanceof Error && repairErr.message.startsWith("proposal_review_")
            ? repairErr.message
            : "proposal_review_response_invalid";
        return empty(finalReason);
      }
    }
  } catch (error) {
    if (input.signal?.aborted || error instanceof GenerationFailureError) throw error;
    const reason =
      error instanceof Error && /^proposal_review_[a-z_]+$/.test(error.message)
        ? error.message
        : error instanceof Error && error.message.startsWith("reconciliation_required:")
          ? "proposal_review_reconciliation_required"
          : (error as { name?: string; code?: string })?.name === "LlmDeadlineExceededError" || (error as { code?: string })?.code === "TIMEOUT"
            ? "proposal_review_provider_timeout"
            : "proposal_review_unavailable";
    return empty(reason);
  }
}

function validateScenes(scenes: ReviewScene[], count: number) {
  if (
    scenes.length !== count ||
    new Set(scenes.map((s) => s.slideIndex)).size !== count ||
    scenes.some(
      (s) =>
        s.slideIndex < 0 ||
        s.slideIndex >= count ||
        s.renderer !== "CanvasPostStage" ||
        s.width < 256 ||
        s.height < 256 ||
        s.width > 4096 ||
        s.height > 4096 ||
        !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(s.dataUri)
    ) ||
    scenes.reduce((n, s) => n + s.dataUri.length, 0) > 16_000_000
  )
    throw new Error("proposal_review_invalid_render");
}
