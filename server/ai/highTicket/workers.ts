import type { AngleAssignment, MasterBriefing, WorkerPayload } from "@shared/highTicket";
import { workerPayloadSchema } from "@shared/highTicketSchemas";
import { invokeLLM } from "../../_core/llm";
import { slimBriefingForWorker } from "./slimBriefing";

const DEFAULT_COLORS = {
  backgroundColor: "#111827",
  textColor: "#ffffff",
  accentColor: "#f59e0b",
};

function ratioOptimizations(colors = DEFAULT_COLORS): NonNullable<WorkerPayload["visual"]["aspectRatioOptimizations"]> {
  return {
    "1:1": { layout: "centered", ...colors },
    "5:6": { layout: "left-aligned", ...colors },
    "9:16": { layout: "left-aligned", ...colors },
  };
}

function fallbackWorker(briefing: MasterBriefing, angle: AngleAssignment): WorkerPayload {
  const preferred = briefing.constraints.preferredColors;
  const colors = {
    backgroundColor: preferred[0] ?? DEFAULT_COLORS.backgroundColor,
    textColor: "#ffffff",
    accentColor: preferred[1] ?? preferred[0] ?? DEFAULT_COLORS.accentColor,
  };
  const headline = angle.hook.slice(0, briefing.constraints.maxHeadlineChars) || "Ideia clara, execucao premium";
  const body = angle.promise.slice(0, briefing.constraints.maxBodyChars) || "Uma abordagem objetiva para decidir melhor";
  return {
    angleId: angle.angleId,
    copy: {
      headline,
      body,
      caption: `${headline}. ${body}.`,
      hashtags: ["#estrategia", "#conteudo", "#marca"],
      callToAction: briefing.userInput.executionBrief?.callToAction || "Veja como aplicar",
      tone: briefing.brand.toneOfVoice || "profissional",
    },
    visual: {
      concept: angle.visualDirection,
      imagePrompt: `premium editorial social media background, ${angle.visualDirection}, no text, high contrast`,
      layout: angle.mechanism === "story" ? "centered" : "left-aligned",
      aspectRatio: "1:1",
      template: "simple",
      sections: [],
      backgroundColor: colors.backgroundColor,
      textColor: colors.textColor,
      accentColor: colors.accentColor,
      designTokens: {
        colors: {
          background: colors.backgroundColor,
          primary: colors.accentColor,
          secondary: colors.accentColor,
          text: colors.textColor,
          card: colors.backgroundColor,
        },
        typography: briefing.brand.visualTokens?.typography,
        structure: briefing.brand.visualTokens?.structure,
      },
      aspectRatioOptimizations: ratioOptimizations(colors),
    },
  };
}

export async function runHighTicketWorkers(input: {
  briefing: MasterBriefing;
  angles: AngleAssignment[];
}): Promise<WorkerPayload[]> {
  return Promise.all(
    input.angles.map(async (angle) => {
      try {
        const response = await invokeLLM({
          traceLabel: `high_ticket_worker_${angle.angleId}`,
          taskRoute: "high_ticket_worker",
          maxCompletionTokens: input.briefing.userInput.postMode === "carousel" ? 2600 : 1800,
          temperature: 0.4,
          reasoningEffort: "low",
          messages: [
            {
              role: "system",
              content:
                "Voce e um diretor de conteudo e arte high ticket. Gere um pacote atomico: copy, conceito visual, prompt de imagem, tokens e adaptacoes por formato. Responda JSON valido.",
            },
            {
              role: "user",
              content: JSON.stringify({
                briefing: slimBriefingForWorker(input.briefing),
                angle,
                required: "Retorne WorkerPayload. aspectRatioOptimizations deve conter 1:1, 5:6 e 9:16.",
              }),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "high_ticket_worker_payload",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  angleId: { type: "string" },
                  copy: {
                    type: "object",
                    properties: {
                      headline: { type: "string" },
                      body: { type: "string" },
                      caption: { type: "string" },
                      hashtags: { type: "array", items: { type: "string" } },
                      callToAction: { type: "string" },
                      tone: { type: "string" },
                    },
                    required: ["headline", "body", "caption", "hashtags", "callToAction", "tone"],
                    additionalProperties: false,
                  },
                  visual: {
                    type: "object",
                    properties: {
                      concept: { type: "string" },
                      imagePrompt: { type: "string" },
                      layout: { type: "string", enum: ["centered", "left-aligned", "split", "minimal"] },
                      aspectRatio: { type: "string", enum: ["1:1", "5:6", "9:16"] },
                      template: { type: "string", enum: ["simple", "feature-grid", "numbered-list", "step-by-step"] },
                      sections: { type: "array", items: { type: "object", additionalProperties: true } },
                      slides: { type: "array", items: { type: "object", additionalProperties: true } },
                      backgroundColor: { type: "string" },
                      textColor: { type: "string" },
                      accentColor: { type: "string" },
                      designTokens: { type: "object", additionalProperties: true },
                      aspectRatioOptimizations: {
                        type: "object",
                        properties: {
                          "1:1": { type: "object", additionalProperties: true },
                          "5:6": { type: "object", additionalProperties: true },
                          "9:16": { type: "object", additionalProperties: true },
                        },
                        required: ["1:1", "5:6", "9:16"],
                        additionalProperties: false,
                      },
                      layoutSettingsByAspectRatio: { type: "object", additionalProperties: true },
                    },
                    required: ["concept", "imagePrompt", "layout", "aspectRatio", "backgroundColor", "textColor", "accentColor", "aspectRatioOptimizations"],
                    additionalProperties: false,
                  },
                },
                required: ["angleId", "copy", "visual"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = response.choices[0]?.message?.content;
        const parsed = JSON.parse(typeof content === "string" ? content : "{}");
        const checked = workerPayloadSchema.safeParse(parsed);
        if (checked.success) return checked.data as WorkerPayload;
      } catch (error) {
        // Slot-level fallback is intentional; graph-level validation still decides.
      }
      return fallbackWorker(input.briefing, angle);
    }),
  );
}
