import type { PostVariation, SiteIntelligence, GenerationDebugEvent } from "@shared/postspark";
import { runStateGraph } from "@shared/graphEngine";
import { createPostVisualSnapshot } from "@shared/variationSnapshot";
import { validateVisualFit } from "@shared/visualFit";
import {
  applyDeterministicCopyGuards,
  hasCoherentStaticItemCount,
  hasRequiredCopy,
  hasValidStaticSections,
} from "@shared/validation";
import { ENV } from "../../_core/env";
import { assertVariationSet, validateVariationSet } from "../generationValidation";
import { getGenerationTrace, recordGenerationEvent } from "../generationTrace";
import { parseReplayPromptSnapshot } from "./replay";

export type PipelineStatus =
  | "created"
  | "billing_audited"
  | "context_audited"
  | "strategy_audited"
  | "slots_generated"
  | "schema_validated"
  | "brand_guardian_applied"
  | "diversification_audited"
  | "quality_evaluated"
  | "composition_applied"
  | "snapshots_created"
  | "visual_fit_validated"
  | "captions_synthesized"
  | "final_approved"
  | "completed"
  | "failed";

export interface PipelineEvent {
  node: string;
  status: "ok" | "warn" | "error";
  detail: string;
}

export interface PipelineKpi {
  slotRetryRate: number;
  brandGuardianFallbackRate: number;
  diversificationTriggered: boolean;
  qualityRevisionRate: number;
  /**
   * Share of visual-fit issues resolved by applyVisualFitFallback.
   * `null` when the pre-fallback issue count cannot be measured (the current
   * pipeline only observes the post-fallback snapshot), so the metric is
   * reported as unavailable rather than inflated. The KPI becomes computable
   * once createPostVisualSnapshot exposes a pre-fit view.
   */
  visualFitAutoFixRate: number | null;
  carouselDegradationRate: number;
  judgeRejectionRate: number;
  llmCallsTotal: number;
  llmCallsReplayable: number;
}

export interface GenerationPipelineState {
  runId: string;
  status: PipelineStatus;
  postMode: "static" | "carousel";
  variationCount: number;
  replayable: boolean;
  replayCallsTotal: number;
  replayCallsReplayable: number;
  validationErrors: string[];
  copyErrors: string[];
  sectionsErrors: string[];
  compositionCount: number;
  visualFitIssues: number;
  visualFitErrors: string[];
  copyGuardsApplied: boolean;
  copyGuardsChanges: string[];
  strategyFallbackUsed: boolean;
  brandGuardianApplied: boolean;
  diversificationTriggered: boolean;
  revisionCount: number;
  judgeRejections: number;
  captionsSynthesized: boolean;
  carouselSlidesFabricated: boolean;
  events: PipelineEvent[];
  kpi: PipelineKpi;
}

export interface PipelineContext {
  variations: PostVariation[];
  legacyEvents: GenerationDebugEvent[];
  promptSnapshot: unknown;
}

function emitEvent(state: GenerationPipelineState, node: string, status: "ok" | "warn" | "error", detail: string): GenerationPipelineState {
  return {
    ...state,
    events: [...state.events, { node, status, detail }],
  };
}

function computeKpi(state: GenerationPipelineState): PipelineKpi {
  const totalSlots = state.variationCount;
  const failedSlots = state.validationErrors.length + state.copyErrors.length;
  const slotRetryRate = totalSlots > 0 ? failedSlots / totalSlots : 0;

  return {
    slotRetryRate,
    // brandGuardianFallbackRate tracks whether the deterministic brand guardian
    // ran instead of an LLM brand_visual_qa. The pipeline observes only whether
    // a brand_visual_qa event was emitted; absence means the deterministic
    // guardian path was taken.
    brandGuardianFallbackRate: state.brandGuardianApplied ? 0 : 1,
    diversificationTriggered: state.diversificationTriggered,
    qualityRevisionRate: state.revisionCount > 0 ? state.judgeRejections / state.variationCount : 0,
    // Not measurable in the current pipeline: createPostVisualSnapshot applies
    // the fallback before this node runs, so only the post-fit issue count is
    // available. Reported as null (unavailable) rather than a misleading ratio.
    visualFitAutoFixRate: null,
    carouselDegradationRate: state.carouselSlidesFabricated ? 1 : 0,
    judgeRejectionRate: state.variationCount > 0 ? state.judgeRejections / state.variationCount : 0,
    llmCallsTotal: state.replayCallsTotal,
    llmCallsReplayable: state.replayCallsReplayable,
  };
}

export async function runGenerationPipeline(input: {
  variations: PostVariation[];
  postMode: "static" | "carousel";
}): Promise<GenerationPipelineState | null> {
  if (!ENV.aiGraphPipelineEnabled) return null;

  const trace = getGenerationTrace();
  // The in-memory trace always populates messages/response on each call
  // (recordLlmTraceCall); AI_TRACE_STORE_CONTENT only gates PERSISTENCE to
  // generation_runs.prompt_snapshot, not the in-memory object we read here.
  // replayable therefore reflects the in-memory reality: calls are replayable
  // when they carry a response payload.
  const calls = trace?.calls ?? [];
  const promptSnapshot = {
    version: 2 as const,
    replayable: calls.length > 0 && calls.every((call) => "response" in call && call.response !== undefined),
    calls,
  };

  const initialState: GenerationPipelineState = {
    runId: trace?.id ?? "",
    status: "created",
    postMode: input.postMode,
    variationCount: input.variations.length,
    replayable: false,
    replayCallsTotal: 0,
    replayCallsReplayable: 0,
    validationErrors: [],
    copyErrors: [],
    sectionsErrors: [],
    compositionCount: 0,
    visualFitIssues: 0,
    visualFitErrors: [],
    copyGuardsApplied: false,
    copyGuardsChanges: [],
    strategyFallbackUsed: false,
    brandGuardianApplied: false,
    diversificationTriggered: false,
    revisionCount: 0,
    judgeRejections: 0,
    captionsSynthesized: false,
    carouselSlidesFabricated: false,
    events: [],
    kpi: {
      slotRetryRate: 0,
      brandGuardianFallbackRate: 0,
      diversificationTriggered: false,
      qualityRevisionRate: 0,
      visualFitAutoFixRate: 0,
      carouselDegradationRate: 0,
      judgeRejectionRate: 0,
      llmCallsTotal: 0,
      llmCallsReplayable: 0,
    },
  };

  try {
    const result = await runStateGraph<GenerationPipelineState, PipelineContext>({
      initialState,
      context: {
        variations: input.variations,
        legacyEvents: trace?.events ?? [],
        promptSnapshot,
      },
      definition: {
        start: "replay_audit",
        nodes: {
          replay_audit: (state, context) => {
            const replay = parseReplayPromptSnapshot(context.promptSnapshot);
            const llmLabels = replay.calls.map((c) => c.label).filter(Boolean);
            const expectedLabels = [
              "content_strategy",
              "slot_0",
              "slot_1",
              "slot_2",
              "lexical_diversification",
              "post_evaluation",
              "quality_revision",
              "caption_synthesis",
            ];
            const foundExpected = expectedLabels.filter((label) => llmLabels.includes(label));

            return emitEvent(
              {
                ...state,
                status: "billing_audited",
                replayable: replay.replayable,
                replayCallsTotal: replay.calls.length,
                replayCallsReplayable: replay.calls.filter((c) => c.response !== undefined).length,
              },
              "replay_audit",
              foundExpected.length >= 4 ? "ok" : "warn",
              `Replay audit: ${foundExpected.length}/${expectedLabels.length} expected LLM call labels found (${replay.calls.length} total calls)`,
            );
          },

          context_audit: (state, context) => {
            const hasSiteIntelligence = context.legacyEvents.some(
              (e) => e.stage === "site_intelligence" && e.status === "completed",
            );
            const hasContentStrategy = context.legacyEvents.some(
              (e) => e.stage === "content_strategy",
            );

            return emitEvent(
              {
                ...state,
                status: "context_audited",
                strategyFallbackUsed: context.legacyEvents.some(
                  (e) => e.stage === "content_strategy" && e.status === "fallback",
                ),
              },
              "context_audit",
              hasContentStrategy ? "ok" : "warn",
              `Context audit: siteIntelligence=${hasSiteIntelligence}, contentStrategy=${hasContentStrategy}`,
            );
          },

          schema_validation: (state, context) => {
            const validation = validateVariationSet(context.variations, state.postMode);
            return emitEvent(
              {
                ...state,
                status: "schema_validated",
                validationErrors: validation.errors,
              },
              "schema_validation",
              validation.errors.length === 0 ? "ok" : "error",
              validation.errors.length === 0
                ? "Schema validation passed."
                : `Schema validation failed: ${validation.errors.join("; ")}`,
            );
          },

          copy_validation: (state, context) => {
            const copyErrors: string[] = [];
            for (let index = 0; index < context.variations.length; index += 1) {
              if (!hasRequiredCopy(context.variations[index])) {
                copyErrors.push(`var ${index + 1}: missing required copy`);
              }
            }
            return emitEvent(
              {
                ...state,
                status: "slots_generated",
                copyErrors,
              },
              "copy_validation",
              copyErrors.length === 0 ? "ok" : "error",
              copyErrors.length === 0
                ? "Copy validation passed."
                : `Copy validation failed for ${copyErrors.length} variation(s).`,
            );
          },

          sections_validation: (state, context) => {
            const sectionsErrors: string[] = [];
            for (let index = 0; index < context.variations.length; index += 1) {
              const v = context.variations[index];
              if (state.postMode !== "carousel" && !hasValidStaticSections(v)) {
                sectionsErrors.push(`var ${index + 1}: invalid static sections`);
              }
              if (state.postMode !== "carousel" && !hasCoherentStaticItemCount(v)) {
                sectionsErrors.push(`var ${index + 1}: incoherent item count`);
              }
            }
            return emitEvent(
              {
                ...state,
                status: "brand_guardian_applied",
                sectionsErrors,
                brandGuardianApplied: context.legacyEvents.some(
                  (e) => e.stage === "brand_visual_qa" && e.status === "completed",
                ),
              },
              "sections_validation",
              sectionsErrors.length === 0 ? "ok" : "error",
              sectionsErrors.length === 0
                ? "Sections validation passed."
                : `Sections validation failed: ${sectionsErrors.join("; ")}`,
            );
          },

          copy_guards: (state, context) => {
            const changes: string[] = [];
            for (let index = 0; index < context.variations.length; index += 1) {
              const v = context.variations[index];
              const beforeHeadline = v.headline;
              const beforeBody = v.body;
              const beforeCaption = v.caption;
              const beforeCta = v.callToAction;
              const beforeHashtags = v.hashtags;

              const guarded = applyDeterministicCopyGuards(v as any);

              if (guarded.headline !== beforeHeadline) changes.push(`var ${index + 1}: headline truncated`);
              if (guarded.body !== beforeBody) changes.push(`var ${index + 1}: body truncated`);
              if (guarded.caption !== beforeCaption) changes.push(`var ${index + 1}: caption truncated`);
              if (guarded.callToAction !== beforeCta) changes.push(`var ${index + 1}: CTA truncated`);
              if (JSON.stringify(guarded.hashtags) !== JSON.stringify(beforeHashtags)) {
                changes.push(`var ${index + 1}: hashtags normalized`);
              }
            }

            const hasDiversification = context.legacyEvents.some(
              (e) => e.stage === "diversification" && e.status === "completed",
            );

            return emitEvent(
              {
                ...state,
                status: "diversification_audited",
                copyGuardsApplied: changes.length > 0,
                copyGuardsChanges: changes,
                diversificationTriggered: hasDiversification,
              },
              "copy_guards",
              changes.length > 0 ? "warn" : "ok",
              changes.length > 0
                ? `Copy guards applied ${changes.length} change(s): ${changes.join("; ")}`
                : "Copy guards: no changes needed.",
            );
          },

          quality_audit: (state, context) => {
            const evaluationEvents = context.legacyEvents.filter(
              (e) => e.stage === "post_evaluation" || e.stage === "quality_revision",
            );
            const rejections = evaluationEvents.filter((e) => e.status === "rejected").length;
            const revision = context.legacyEvents.filter(
              (e) => e.stage === "quality_revision" && e.status === "completed",
            ).length;

            return emitEvent(
              {
                ...state,
                status: "quality_evaluated",
                revisionCount: revision,
                judgeRejections: rejections,
              },
              "quality_audit",
              rejections > 0 ? "warn" : "ok",
              `Quality audit: ${evaluationEvents.length} events, ${rejections} rejections, ${revision} revisions.`,
            );
          },

          composition_audit: (state, context) => {
            const compositionCount = context.variations.filter(
              (v) => v.layout || v.layoutSettings,
            ).length;

            const slideFabrication = context.legacyEvents.some(
              (e) => e.stage === "carousel_slide_fabrication",
            );

            return emitEvent(
              {
                ...state,
                status: "composition_applied",
                compositionCount,
                carouselSlidesFabricated: slideFabrication,
              },
              "composition_audit",
              compositionCount === context.variations.length ? "ok" : "warn",
              `Composition audit: ${compositionCount}/${context.variations.length} have layout/composition.`,
            );
          },

          snapshot_audit: (state, context) => {
            let snapshotsCreated = 0;
            for (const v of context.variations) {
              try {
                const snapshot = createPostVisualSnapshot(v, v.aspectRatio ?? "1:1");
                if (snapshot && snapshot.snapshotVersion) {
                  snapshotsCreated += 1;
                }
              } catch {
                // Snapshot creation failed for this variation
              }
            }

            return emitEvent(
              {
                ...state,
                status: "snapshots_created",
              },
              "snapshot_audit",
              snapshotsCreated === context.variations.length ? "ok" : "warn",
              `Snapshot audit: ${snapshotsCreated}/${context.variations.length} valid snapshots.`,
            );
          },

          visual_fit_validation: (state, context) => {
            const fitErrors: string[] = [];
            // createPostVisualSnapshot already applies applyVisualFitFallback,
            // so validateVisualFit here measures only the issues that SURVIVED
            // the fallback (i.e. unfixable). The auto-fix rate is therefore not
            // computable from this node (no pre-fit snapshot); see computeKpi.
            let remainingIssues = 0;

            for (let index = 0; index < context.variations.length; index += 1) {
              const v = context.variations[index];
              const snapshot = createPostVisualSnapshot(v, v.aspectRatio ?? "1:1");
              const result = validateVisualFit(snapshot);
              remainingIssues += result.issues.length;
              if (!result.ok) {
                fitErrors.push(
                  `var ${index + 1}: ${result.issues.map((i) => `${i.type}:${i.target}`).join(", ")}`,
                );
              }
            }

            return emitEvent(
              {
                ...state,
                status: "visual_fit_validated",
                visualFitIssues: remainingIssues,
                visualFitErrors: fitErrors,
              },
              "visual_fit_validation",
              fitErrors.length === 0 ? "ok" : "error",
              fitErrors.length === 0
                ? `Visual fit: no unfixable issues across all variations.`
                : `Visual fit errors: ${fitErrors.join(" | ")}`,
            );
          },

          caption_audit: (state, context) => {
            const captionEvent = context.legacyEvents.find(
              (e) => e.stage === "caption_synthesis",
            );
            const hasCaptions = context.variations.every((v) => v.caption && v.caption.length > 0);

            return emitEvent(
              {
                ...state,
                status: "captions_synthesized",
                captionsSynthesized: captionEvent?.status === "completed" || hasCaptions,
              },
              "caption_audit",
              hasCaptions ? "ok" : "error",
              `Caption audit: ${hasCaptions ? "all variations have captions" : "missing captions"} (legacy event: ${captionEvent?.status ?? "not found"})`,
            );
          },

          final_approval: (state, context) => {
            try {
              assertVariationSet(context.variations, state.postMode);

              return {
                ...emitEvent(
                  state,
                  "final_approval",
                  "ok",
                  "All variations approved: count, diversity, and structure valid.",
                ),
                status: "final_approved" as PipelineStatus,
              };
            } catch (error) {
              return {
                ...emitEvent(
                  state,
                  "final_approval",
                  "error",
                  `Final approval rejected: ${error instanceof Error ? error.message : String(error)}`,
                ),
                status: "failed" as PipelineStatus,
              };
            }
          },

          completed: (state) => {
            const kpi = computeKpi(state);
            return {
              ...emitEvent(state, "completed", "ok", "Pipeline graph completed all stages."),
              status: "completed" as PipelineStatus,
              kpi,
            };
          },
        },
        next: (nodeId, state, _context) => {
          if (state.status === "failed") return null;

          const linearPath: Record<string, string | null> = {
            replay_audit: "context_audit",
            context_audit: "schema_validation",
            schema_validation: "copy_validation",
            copy_validation: "sections_validation",
            sections_validation: "copy_guards",
            copy_guards: "quality_audit",
            quality_audit: "composition_audit",
            composition_audit: "snapshot_audit",
            snapshot_audit: "visual_fit_validation",
            visual_fit_validation: "caption_audit",
            caption_audit: "final_approval",
            final_approval: "completed",
            completed: null,
          };

          return linearPath[nodeId] ?? null;
        },
      },
    });

    recordGenerationEvent({
      stage: "generation_graph_pipeline",
      status: result.state.status === "completed" || result.state.status === "final_approved"
        ? "completed"
        : result.state.status === "failed"
          ? "failed"
          : "rejected",
      detail: result.state.status === "completed"
        ? "Pipeline graph completed all stages. KPIs: " + JSON.stringify(result.state.kpi)
        : `Pipeline graph finished with status "${result.state.status}".`,
      data: {
        status: result.state.status,
        kpi: result.state.kpi,
        events: result.state.events,
        visited: result.visited,
      },
    });

    return result.state;
  } catch (error) {
    recordGenerationEvent({
      stage: "generation_graph_pipeline",
      status: "failed",
      detail: "Pipeline graph execution failed with error.",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return {
      ...initialState,
      status: "failed",
      events: [
        { node: "fatal", status: "error", detail: error instanceof Error ? error.message : String(error) },
      ],
    };
  }
}
