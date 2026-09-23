import { describe, expect, it } from "vitest";
import {
  classifyGenerationError,
  isRetryable,
  toFailureMetadata,
  userMessageFor,
} from "./generationFailure";
import type { GenerationFailureReason } from "./postspark";

describe("generationFailure taxonomy", () => {
  it("classifies insufficient sparks", () => {
    expect(classifyGenerationError({ code: "PAYMENT_REQUIRED" })).toBe("insufficient_sparks");
    expect(classifyGenerationError(new Error("insufficient balance to pay"))).toBe("insufficient_sparks");
  });

  it("classifies quality rejection distinctly from network errors", () => {
    expect(classifyGenerationError(new Error("A IA não conseguiu produzir três variações válidas"))).toBe("quality_rejected");
    expect(classifyGenerationError(new Error("quality_rejected"))).toBe("quality_rejected");
  });

  it("classifies format mismatch", () => {
    expect(classifyGenerationError(new Error("format_mismatch"))).toBe("format_mismatch");
  });

  it("classifies provider timeout vs unavailable", () => {
    expect(classifyGenerationError(new Error("request timed out"))).toBe("provider_timeout");
    expect(classifyGenerationError(new Error("upstream provider unavailable"))).toBe("provider_unavailable");
    expect(classifyGenerationError({ message: "429 rate limit" })).toBe("provider_unavailable");
  });

  it("classifies invalid provider response", () => {
    expect(classifyGenerationError(new Error("unexpected response_format"))).toBe("invalid_provider_response");
  });

  it("classifies persistence failure", () => {
    expect(classifyGenerationError(new Error("database statement timeout"))).toBe("persistence_failed");
  });

  it("classifies variations not distinct", () => {
    expect(classifyGenerationError(new Error("variations are not sufficiently distinct"))).toBe("variations_not_distinct");
  });

  it("falls back to unknown", () => {
    expect(classifyGenerationError(new Error("something bizarre"))).toBe("unknown");
  });

  it("marks only transient reasons as retryable", () => {
    expect(isRetryable("provider_unavailable")).toBe(true);
    expect(isRetryable("provider_timeout")).toBe(true);
    expect(isRetryable("quality_rejected")).toBe(false);
    expect(isRetryable("insufficient_sparks")).toBe(false);
  });

  it("builds failure metadata without exposing secrets", () => {
    const metadata = toFailureMetadata({
      generationRunId: "run-1",
      reason: "quality_rejected",
      refunded: true,
      validationIssues: [{ code: "invalid_set", slot: 2, detail: "bad slot" }],
    });

    expect(metadata.generationRunId).toBe("run-1");
    expect(metadata.reason).toBe("quality_rejected");
    expect(metadata.retryable).toBe(false);
    expect(metadata.refunded).toBe(true);
    expect(metadata.userMessage).toBe(userMessageFor("quality_rejected"));
    expect(metadata.validationIssues).toHaveLength(1);
    expect(JSON.stringify(metadata)).not.toMatch(/stack|token|secret/i);
  });

  it.each<GenerationFailureReason>([
    "insufficient_sparks",
    "authentication",
    "provider_unavailable",
    "provider_timeout",
    "invalid_provider_response",
    "format_mismatch",
    "quality_rejected",
    "variations_not_distinct",
    "persistence_failed",
    "billing_commit_failed",
    "unknown",
  ])("has a user message for %s", (reason) => {
    expect(userMessageFor(reason).length).toBeGreaterThan(0);
  });
});