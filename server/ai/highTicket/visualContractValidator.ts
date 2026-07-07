import type { MasterBriefing, WorkerPayload } from "@shared/highTicket";
import type { AspectRatio, PostMode } from "@shared/postspark";
import { workerPayloadSchema } from "@shared/highTicketSchemas";

export interface VisualContractIssue {
  angleId: string;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface VisualContractResult {
  valid: boolean;
  issues: VisualContractIssue[];
}

const REQUIRED_RATIOS: AspectRatio[] = ["1:1", "5:6", "9:16"];

function issue(
  payload: WorkerPayload,
  code: string,
  message: string,
  severity: "error" | "warning" = "error",
): VisualContractIssue {
  return { angleId: payload.angleId, code, message, severity };
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return 1;
  const la = luminance(rgbA);
  const lb = luminance(rgbB);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

function containsForbiddenTerm(payload: WorkerPayload, forbiddenTerms: string[]): string | undefined {
  const text = [
    payload.copy.headline,
    payload.copy.body,
    payload.copy.caption,
    payload.copy.callToAction,
    payload.visual.concept,
  ].join(" ").toLowerCase();

  return forbiddenTerms.find((term) => term.trim() && text.includes(term.toLowerCase()));
}

function validatePayload(
  payload: WorkerPayload,
  briefing: MasterBriefing,
  postMode: PostMode,
): VisualContractIssue[] {
  const issues: VisualContractIssue[] = [];
  const parsed = workerPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    issues.push(
      issue(
        payload,
        "schema_invalid",
        parsed.error.issues.map((item) => item.message).join("; "),
      ),
    );
  }

  if (payload.copy.headline.length > briefing.constraints.maxHeadlineChars) {
    issues.push(issue(payload, "headline_too_long", "Headline exceeds the MasterBriefing limit."));
  }
  if (payload.copy.body.length > briefing.constraints.maxBodyChars) {
    issues.push(issue(payload, "body_too_long", "Body exceeds the MasterBriefing limit."));
  }

  const forbidden = containsForbiddenTerm(payload, briefing.constraints.forbiddenTerms);
  if (forbidden) {
    issues.push(issue(payload, "forbidden_term", `Payload contains forbidden term: ${forbidden}`));
  }

  const contrast = contrastRatio(payload.visual.backgroundColor, payload.visual.textColor);
  if (contrast < 4.5) {
    issues.push(issue(payload, "low_contrast", `Text/background contrast is ${contrast.toFixed(2)}:1.`));
  }

  const optimizations = payload.visual.aspectRatioOptimizations;
  if (!optimizations) {
    issues.push(issue(payload, "missing_aspect_ratio_optimizations", "Missing multi-format aspectRatioOptimizations."));
  } else {
    for (const ratio of REQUIRED_RATIOS) {
      const opt = optimizations[ratio];
      if (!opt) {
        issues.push(issue(payload, "missing_ratio_optimization", `Missing optimization for ${ratio}.`));
        continue;
      }
      const optContrast = contrastRatio(opt.backgroundColor, opt.textColor);
      if (optContrast < 4.5) {
        issues.push(issue(payload, "low_ratio_contrast", `${ratio} contrast is ${optContrast.toFixed(2)}:1.`));
      }
    }
  }

  if (postMode === "carousel") {
    if (payload.visual.slides?.length !== 5) {
      issues.push(issue(payload, "invalid_carousel_slides", "Carousel payload must contain exactly 5 slides."));
    }
  } else {
    const sections = payload.visual.sections ?? [];
    const template = payload.visual.template ?? "simple";
    if (template === "simple" && sections.length > 0) {
      issues.push(issue(payload, "simple_template_sections", "Simple static payload must not include sections."));
    }
    if (template !== "simple" && sections.length !== 3) {
      issues.push(issue(payload, "invalid_static_sections", "Structured static payload must contain exactly 3 sections."));
    }
  }

  if (payload.visual.layout === "split" && !payload.visual.imagePrompt.trim()) {
    issues.push(issue(payload, "split_without_visual", "Split layout needs a concrete imagePrompt."));
  }

  return issues;
}

export function validateVisualContract(input: {
  payloads: WorkerPayload[];
  briefing: MasterBriefing;
  postMode: PostMode;
}): VisualContractResult {
  const issues = input.payloads.flatMap((payload) =>
    validatePayload(payload, input.briefing, input.postMode),
  );
  return {
    valid: issues.every((item) => item.severity !== "error"),
    issues,
  };
}
