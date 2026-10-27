/** Historical transport suites exercise their original V7 pin, not the new default.
 * The original assertions, provider responses and durable operations are preserved. */
import {
  prepareOrchestratedGeneration as prepareCurrent,
  type PreparationDeps,
} from "./generationPreparation";
import { editorialContextV7 } from "./editorialContextV7";
import { resolveReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";
import { buildUserPrompt } from "../generationOrchestrator";
import { normalizeExecutionBrief } from "@shared/generationRequest";

const historical =
  (guidance: 5 | 6): typeof prepareCurrent =>
  async (input, owner, experimental, deadline, overrides) => {
    let contextContent = "";
    const operation = overrides.operation!;
    return prepareCurrent(input, owner, experimental, deadline, {
      ...overrides,
      operation: async <T>(key: string, work: () => Promise<T>) => {
        const result = await operation(key, async () => {
          const value = await work();
          if (key !== "selection_input") return value;
          const current = value as any;
          const brief = input.executionBrief
            ? normalizeExecutionBrief(input.executionBrief)
            : undefined;
          const context = editorialContextV7(
            {
              prompt: input.content,
              executionBrief: brief,
              contextContent,
              projectSnapshot: input.projectSnapshot,
              projectDossier:
                input.projectDossier ??
                (input.projectId ? contextContent : undefined),
              platform: input.platform,
              postMode: input.postMode,
              tone: input.tone,
            },
            guidance
          );
          const original = buildUserPrompt({
            request: input,
            executionBrief: brief ?? null,
            contextContent,
          }).content;
          const complementary =
            !!brief &&
            !!input.content &&
            input.content !== brief.rawInput &&
            input.content !== brief.notes;
          const { editorialContext: _context, ...rest } = current;
          const sourceAlreadyInBrief =
            JSON.stringify(original).includes(contextContent) ||
            brief?.rawInput === contextContent ||
            brief?.notes === contextContent;
          return {
            ...rest,
            brief:
              guidance === 5
                ? original
                : Array.isArray(original)
                  ? original.map(part =>
                      typeof part === "object" && part.type === "text"
                        ? { ...part, text: input.content }
                        : part
                    )
                  : input.content,
            ...(guidance === 5 && !sourceAlreadyInBrief
              ? { sourceEvidence: contextContent }
              : {}),
            ...(complementary
              ? { complementaryInstruction: input.content }
              : {}),
            requirements: context.requirements,
            ...(guidance === 6 ? { editorialContext: context } : {}),
            reviewExecutionConfig: resolveReviewExecutionConfigV7(
              guidance,
              current.reviewExecutionConfig.textModel
            ),
          } as T;
        });
        if (key === "context") contextContent = result as string;
        return result;
      },
    });
  };

export const prepareHistoricalGeneration = historical(6);
export const prepareHistoricalContextGeneration = historical(5);
