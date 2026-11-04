/** Controlled reviewer judgments for offline integration tests only.
 * This fixture does not detect facts or certify a model's semantic quality. */
import type { InvokeParams } from "../../_core/llm";
import type { ReviewResponseV10 } from "@shared/proposalReviewV10";
import { reviewPayloadV7 } from "./proposalReviewV7.fixture";
export function healthyReviewV10Fixture(
  params: InvokeParams
): ReviewResponseV10 {
  const data = reviewPayloadV7(params);
  return {
    outcome: "reviewed",
    limitation: "",
    reviewedSlides: data.copy.slides.map((_: unknown, i: number) => i),
    requirementChecks: data.context.requirements.map((r: any) => ({
      requirementId: r.id,
      status: "met",
      unitIds: data.textUnits
        .filter(
          (u: any) =>
            (r.scope === "either" || r.scope === u.scope) &&
            (u.scope === "caption" || u.visibleAliases.length)
        )
        .map((u: any) => u.id),
      explanation: "",
    })),
    messageAssessment: { status: "preserved", explanation: "" },
    findings: [],
    intentChecks: (data.generationIntent?.requirements ?? []).map((r: any) => ({
      requirementId: r.id,
      status: "met",
      explanation: "Julgamento controlado de entrega.",
      deliveries: data.generationIntent.content
        .filter((c: any) => c.requirementIds.includes(r.id))
        .map((c: any) => ({
          contentId: c.id,
          unitIds: data.textUnits
            .filter((u: any) => r.surface === "either" || u.scope === r.surface)
            .slice(0, 1)
            .map((u: any) => u.id),
        })),
    })),
    unitChecks: data.textUnits.map((u: any) => ({
      unitId: u.id,
      meaning: u.text.slice(0, 1500),
      verdict: "editorial",
      evidenceIds: [],
      editorialBasis: "invitation",
      explanation:
        "Julgamento controlado: convite sem promessa factual neste cenário.",
    })),
    sequenceAssessment: {
      status: "coherent",
      explanation: "Julgamento controlado da sequência.",
      promises: [],
    },
  };
}
