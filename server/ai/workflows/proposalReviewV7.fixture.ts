/** Explicit controlled reviewer judgments. Never used to certify a provider's semantics. */
import type { InvokeParams } from "../../_core/llm";
export function reviewPayloadV7(params: InvokeParams): any {
  const user = params.messages.find(m => m.role === "user")!;
  const content = user.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.find(c => typeof c !== "string" && c.type === "text")
        : undefined;
  return JSON.parse(
    typeof text === "string" ? text : ((text as any)?.text ?? "{}")
  );
}
export function healthyReviewV7Fixture(params: InvokeParams): any {
  const data = reviewPayloadV7(params);
  return {
    outcome: "reviewed",
    limitation: "",
    reviewedSlides: data.copy.slides.map((_: unknown, i: number) => i),
    checkedTextUnits: data.textUnits.map((u: any) => u.id),
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
  };
}
