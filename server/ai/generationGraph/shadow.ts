import type { PostVariation } from "@shared/postspark";
import { runStateGraph } from "@shared/graphEngine";
import { createPostVisualSnapshot, projectSnapshotForSlide } from "@shared/variationSnapshot";
import { validateVisualFit } from "@shared/visualFit";
import {
  hasRequiredCopy,
  hasValidStaticSections,
  hasCoherentStaticItemCount,
  applyDeterministicCopyGuards,
} from "@shared/validation";
import { ENV } from "../../_core/env";
import { validateVariationSet } from "../generationValidation";
import { getGenerationTrace, recordGenerationEvent } from "../generationTrace";
import { parseReplayPromptSnapshot } from "./replay";

export interface GenerationShadowState {
  status: "created" | "replay_audited" | "schema_validated" | "copy_validated" | "sections_validated" | "copy_guards_applied" | "visual_fit_validated" | "completed" | "failed";
  postMode: "static" | "carousel";
  variationCount: number;
  replayable: boolean;
  llmCallCount: number;
  replayableCallCount: number;
  validationErrors: string[];
  copyValidationErrors: string[];
  sectionsValidationErrors: string[];
  copyGuardsApplied: boolean;
  copyGuardsChanges: string[];
  visualFitIssueCount: number;
  visualFitErrors: string[];
}

interface GenerationShadowContext {
  variations: Partial<PostVariation>[];
  guardedVariations?: Partial<PostVariation>[];
  promptSnapshot: unknown;
}

export async function runGenerationShadowGraph(input: {
  variations: Partial<PostVariation>[];
  postMode: "static" | "carousel";
}): Promise<GenerationShadowState | null> {
  if (!ENV.aiGraphShadowEnabled) return null;

  const initialState: GenerationShadowState = {
    status: "created",
    postMode: input.postMode,
    variationCount: input.variations.length,
    replayable: false,
    llmCallCount: 0,
    replayableCallCount: 0,
    validationErrors: [],
    copyValidationErrors: [],
    sectionsValidationErrors: [],
    copyGuardsApplied: false,
    copyGuardsChanges: [],
    visualFitIssueCount: 0,
    visualFitErrors: [],
  };

  try {
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

    const result = await runStateGraph<GenerationShadowState, GenerationShadowContext>({
      initialState,
      context: { variations: input.variations, promptSnapshot },
      definition: {
        start: "replay_audit",
        nodes: {
          replay_audit: (state, context) => {
            const replay = parseReplayPromptSnapshot(context.promptSnapshot);
            return {
              ...state,
              status: "replay_audited" as const,
              replayable: replay.replayable,
              llmCallCount: replay.calls.length,
              replayableCallCount: replay.calls.filter((call) => call.response !== undefined).length,
            };
          },
          schema_validation: (state, context) => {
            const validation = validateVariationSet(context.variations, state.postMode);
            return {
              ...state,
              status: "schema_validated" as const,
              validationErrors: validation.errors,
            };
          },
          copy_validation: (state, context) => {
            const copyErrors: string[] = [];
            for (let index = 0; index < context.variations.length; index += 1) {
              const variation = context.variations[index];
              if (!hasRequiredCopy(variation)) {
                copyErrors.push(`variation ${index + 1}: missing required copy fields (headline, body, caption, CTA, imagePrompt)`);
              }
            }
            return {
              ...state,
              status: "copy_validated" as const,
              copyValidationErrors: copyErrors,
            };
          },
          sections_validation: (state, context) => {
            const sectionsErrors: string[] = [];
            for (let index = 0; index < context.variations.length; index += 1) {
              const variation = context.variations[index];
              if (state.postMode === "static" && !hasValidStaticSections(variation)) {
                sectionsErrors.push(`variation ${index + 1}: invalid static sections (must be exactly 3 with valid label/description)`);
              }
              if (state.postMode === "static" && !hasCoherentStaticItemCount(variation)) {
                sectionsErrors.push(`variation ${index + 1}: incoherent item count (headline number vs actual sections)`);
              }
            }
            return {
              ...state,
              status: "sections_validated" as const,
              sectionsValidationErrors: sectionsErrors,
            };
          },
          copy_guards: (state, context) => {
            const changes: string[] = [];
            context.guardedVariations = context.variations.map((variation, index) => {
              const beforeHeadline = variation.headline;
              const beforeBody = variation.body;
              const beforeCaption = variation.caption;
              const beforeCallToAction = variation.callToAction;
              const beforeHashtags = variation.hashtags;

              const guarded = applyDeterministicCopyGuards(variation);

              if (guarded.headline !== beforeHeadline) changes.push(`variation ${index + 1}: headline truncated`);
              if (guarded.body !== beforeBody) changes.push(`variation ${index + 1}: body truncated`);
              if (guarded.caption !== beforeCaption) changes.push(`variation ${index + 1}: caption truncated`);
              if (guarded.callToAction !== beforeCallToAction) changes.push(`variation ${index + 1}: CTA truncated`);
              if (JSON.stringify(guarded.hashtags) !== JSON.stringify(beforeHashtags)) {
                changes.push(`variation ${index + 1}: hashtags normalized`);
              }

              return guarded;
            });
            return {
              ...state,
              status: "copy_guards_applied" as const,
              copyGuardsApplied: changes.length > 0,
              copyGuardsChanges: changes,
            };
          },
          visual_fit_validation: (state, context) => {
            const visualFitErrors: string[] = [];
            for (let index = 0; index < context.variations.length; index += 1) {
              const variation = context.variations[index];
              const snapshot = createPostVisualSnapshot(
                variation as PostVariation,
                (variation as PostVariation).aspectRatio ?? "1:1",
              );
              const snapshotsToValidate = state.postMode === "carousel" && snapshot.slides?.length
                ? snapshot.slides.map((_, slideIndex) => projectSnapshotForSlide(snapshot, slideIndex))
                : [snapshot];

              for (let slideIndex = 0; slideIndex < snapshotsToValidate.length; slideIndex += 1) {
                const projected = snapshotsToValidate[slideIndex];
                const result = validateVisualFit(projected);
                if (!result.ok) {
                  visualFitErrors.push(
                    `variation ${index + 1}${snapshotsToValidate.length > 1 ? ` slide ${slideIndex + 1}` : ""}: ${result.issues.map((issue) => `${issue.type}:${issue.target}`).join(", ")}`,
                  );
                }
              }
            }

            return {
              ...state,
              status: "visual_fit_validated" as const,
              visualFitIssueCount: visualFitErrors.length,
              visualFitErrors,
            };
          },
          completed: (state) => ({ ...state, status: "completed" as const }),
        },
        next: (nodeId) => {
          if (nodeId === "replay_audit") return "schema_validation";
          if (nodeId === "schema_validation") return "copy_validation";
          if (nodeId === "copy_validation") return "sections_validation";
          if (nodeId === "sections_validation") return "copy_guards";
          if (nodeId === "copy_guards") return "visual_fit_validation";
          if (nodeId === "visual_fit_validation") return "completed";
          return null;
        },
      },
    });

    recordGenerationEvent({
      stage: "generation_graph_shadow",
      status: result.state.validationErrors.length === 0 &&
        result.state.copyValidationErrors.length === 0 &&
        result.state.sectionsValidationErrors.length === 0 &&
        result.state.visualFitErrors.length === 0 ? "completed" : "rejected",
      detail: result.state.validationErrors.length === 0 &&
        result.state.copyValidationErrors.length === 0 &&
        result.state.sectionsValidationErrors.length === 0 &&
        result.state.visualFitErrors.length === 0
        ? "Shadow graph replay/schema/copy/sections/visual-fit audit completed without divergence."
        : "Shadow graph audit found divergence.",
      data: {
        ...result.state,
        visited: result.visited,
      },
    });

    // Shadow graph events are persisted by finishGenerationTrace, which writes
    // the full trace.events array (including this recordGenerationEvent) to
    // generation_runs.events. Persisting here directly would be premature:
    // the generation_runs row is only created (via upsert) by finishGenerationTrace,
    // which runs later in post.generate (routers.ts), after this shadow pass.
    return result.state;
  } catch (error) {
    const failedState: GenerationShadowState = {
      ...initialState,
      status: "failed",
      validationErrors: [error instanceof Error ? error.message : String(error)],
      copyValidationErrors: [],
      sectionsValidationErrors: [],
      copyGuardsApplied: false,
      copyGuardsChanges: [],
      visualFitErrors: [],
    };
    recordGenerationEvent({
      stage: "generation_graph_shadow",
      status: "failed",
      detail: "Shadow graph failed; legacy generation output was preserved.",
      data: failedState,
    });
    return failedState;
  }
}
