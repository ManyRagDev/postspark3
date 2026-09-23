import { TRPCError } from "@trpc/server";
import type { GenerationFailureMetadata } from "@shared/postspark";

/**
 * Erro tRPC que transporta `GenerationFailureMetadata` estruturado até o
 * cliente sem depender da mensagem textual. O `errorFormatter` em
 * `server/_core/trpc.ts` serializa `failure` em `shape.data.generationFailure`.
 */
export class GenerationFailureError extends TRPCError {
  public readonly failure: GenerationFailureMetadata;

  constructor(input: {
    code: TRPCError["code"];
    failure: GenerationFailureMetadata;
    cause?: unknown;
  }) {
    super({
      code: input.code,
      message: input.failure.userMessage,
      cause: input.cause instanceof Error ? input.cause : undefined,
    });
    this.name = "GenerationFailureError";
    this.failure = input.failure;
  }
}

export function isGenerationFailureError(value: unknown): value is GenerationFailureError {
  return value instanceof GenerationFailureError;
}