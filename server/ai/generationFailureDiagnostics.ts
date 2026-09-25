import type { GenerationFailureMetadata } from "@shared/postspark";
import type { GenerationTrace } from "./generationTrace";

const DIAGNOSTIC_STAGES = new Set([
  "post_generation",
  "quality_evaluation",
  "repair",
  "caption_synthesis",
  "carousel_slide_fabrication",
  "typography_resolution",
  "visual_diversity_plan",
  "final_validation",
  "source_copy_gate",
]);

const SAFE_ISSUE_DETAILS = [
  /^expected \d+ variations, received \d+$/,
  /^variation \d+ (?:is missing required copy fields|is missing a copy angle|must contain \d+ slides)$/,
  /^quality_rejected_slots:\d+(?:,\d+)*$/,
  /^quality_(?:missing_required_fact|unsupported_authority)_slot:\d+$/,
  /^variations are not sufficiently distinct$/,
  /^visual diversity requires at least two (?:composed layouts|creative families|composition cells)$/,
  /^(?:headline|body|caption|slide_headline|slide_body|callToAction) (?:reproduz literalmente o prompt|excessivamente semelhante ao prompt \(sobreposição \d+%\)|contém o prompt de forma integral)$/,
];

function safeIssueDetail(detail: string): string {
  return SAFE_ISSUE_DETAILS.some((pattern) => pattern.test(detail))
    ? detail.slice(0, 300)
    : "[detalhe omitido por privacidade]";
}

/** Diagnóstico compacto e sem prompt/copy, inclusive no schema mínimo do banco. */
export function buildGenerationFailureDiagnostics(
  trace: GenerationTrace,
  failure: GenerationFailureMetadata,
  classificationSource: "typed" | "inferred" = "typed",
) {
  const metricEvent = [...trace.events].reverse().find((event) => event.stage === "generation_metrics");
  const rawMetrics = metricEvent?.data && typeof metricEvent.data === "object"
    ? metricEvent.data as Record<string, unknown>
    : null;
  return {
    version: 1,
    generationRunId: trace.id,
    reason: failure.reason,
    classificationSource,
    postMode: trace.postMode,
    validationIssues: (failure.validationIssues ?? []).slice(0, 20).map((issue) => ({
      code: issue.code.slice(0, 80),
      ...(issue.slot !== undefined ? { slot: issue.slot } : {}),
      detail: safeIssueDetail(issue.detail),
    })),
    stages: trace.events
      .filter((event) => DIAGNOSTIC_STAGES.has(event.stage))
      .slice(-20)
      .map(({ stage, status }) => ({ stage, status })),
    metrics: rawMetrics ? {
      generativeCalls: typeof rawMetrics.generativeCalls === "number" ? rawMetrics.generativeCalls : undefined,
      repairCalls: typeof rawMetrics.repairCalls === "number" ? rawMetrics.repairCalls : undefined,
      exceededDeadline: rawMetrics.exceededDeadline === true,
      fallbacks: Array.isArray(rawMetrics.fallbacks)
        ? rawMetrics.fallbacks.filter((value): value is string => typeof value === "string").slice(0, 10)
        : [],
    } : undefined,
    calls: trace.calls.map(({ label, provider, effectiveModel, attempt, error }) => ({
      label,
      provider,
      effectiveModel,
      ...(attempt !== undefined ? { attempt } : {}),
      failed: Boolean(error),
    })),
  };
}

export function formatGenerationFailureError(
  message: string,
  diagnostics: ReturnType<typeof buildGenerationFailureDiagnostics>,
): string {
  return `${message}\nGENERATION_DIAGNOSTIC_V1=${JSON.stringify(diagnostics)}`;
}
