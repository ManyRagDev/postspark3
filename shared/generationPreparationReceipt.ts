import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const preparationExpectationSchema = z.object({
  kind: z.literal("generation_preparation_v1"),
  configurationHash: hash,
  model: z.string().min(1),
  messagesHash: hash,
  responseFormatHash: hash,
  requestHash: hash,
}).strict();
export type PreparationExpectation = z.infer<typeof preparationExpectationSchema>;

/** Persist the provider envelope before JSON/schema validation can fail. */
export function preparationReceipt<T>(response: T, expectation: PreparationExpectation) {
  return { ...response, __preparationReceipt: { version: 1, expectation } };
}

/** Both historical normalized values and new provider receipts remain readable. */
export function readPreparationResult(value: unknown): unknown {
  const v = value as Record<string, any> | null;
  if (!v || v.__preparationReceipt?.version !== 1) return value;
  if (v.choices?.[0]?.finish_reason === "length") return null;
  const content = v.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content)
    ? content.filter(p => p?.type === "text").map(p => p.text).join("\n") : "";
  try { return JSON.parse(text); } catch { return null; }
}
