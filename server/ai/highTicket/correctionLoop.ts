import type { MasterBriefing, QaResult, WorkerPayload } from "@shared/highTicket";
import { workerPayloadSchema } from "@shared/highTicketSchemas";
import { invokeLLM } from "../../_core/llm";
import { slimBriefingForWorker } from "./slimBriefing";

export async function reviseRejectedPayloads(input: {
  briefing: MasterBriefing;
  payloads: WorkerPayload[];
  qa: QaResult[];
  rejectedIndexes: number[];
}): Promise<{ payloads: WorkerPayload[]; revisedIndexes: number[]; revisionFailedIndexes: number[] }> {
  const next = [...input.payloads];
  const revisedIndexes: number[] = [];
  const revisionFailedIndexes: number[] = [];

  await Promise.all(
    input.rejectedIndexes.map(async (index) => {
      const payload = input.payloads[index];
      const qa = input.qa[index];
      if (!payload || !qa) return;
      try {
        const response = await invokeLLM({
          traceLabel: `high_ticket_revision_${payload.angleId}`,
          taskRoute: "high_ticket_revision",
          maxCompletionTokens: input.briefing.userInput.postMode === "carousel" ? 2600 : 1800,
          temperature: 0.25,
          reasoningEffort: "low",
          messages: [
            {
              role: "system",
              content:
                "Voce e um revisor cirurgico High Ticket. Corrija apenas os pontos reprovados do WorkerPayload. Preserve angleId, partes aprovadas, formato e estrutura. Responda JSON valido conforme o schema.",
            },
            {
              role: "user",
              content: JSON.stringify({
                briefing: slimBriefingForWorker(input.briefing),
                qa,
                payload,
                instruction: "Retorne o WorkerPayload corrigido, mantendo aspectRatioOptimizations completas para 1:1, 5:6 e 9:16.",
              }),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "high_ticket_revision_payload",
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
        if (!checked.success) throw new Error(checked.error.message);
        next[index] = checked.data as WorkerPayload;
        revisedIndexes.push(index);
      } catch (error) {
        revisionFailedIndexes.push(index);
      }
    }),
  );

  return { payloads: next, revisedIndexes, revisionFailedIndexes };
}
