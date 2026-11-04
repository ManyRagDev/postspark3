import { createHash } from "node:crypto";
import type { InvokeParams, Message } from "../../_core/llm";
import { adaptRequestForProvider } from "../../ai/providers/modelAdapters";
import type { GenerationSelectionCatalogTransportV1 } from "../../../shared/generationSelectionTransport";
import { reserveQuote, type MatrixBudget, type PriceQuote } from "./budget";

export interface SelectionAdmissionInput {
  request: InvokeParams;
  maxCandidates: number;
}

export interface SelectionAdmissionRecord {
  version: 1;
  stage: "before_shortlist";
  kind: "conservative_selection_admission_bound";
  model: string;
  eligibleCandidates: number;
  maxCandidates: number;
  candidateIds: string[];
  payloadHash: string;
  payloadBytes: number;
  reservedUsd: number;
  dispatched: false;
}

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

function textFromUser(message: Message) {
  if (typeof message.content === "string") return message.content;
  const parts = Array.isArray(message.content)
    ? message.content
    : [message.content];
  const texts = parts.filter(
    part => typeof part === "object" && part.type === "text"
  );
  if (texts.length !== 1)
    throw new Error("selection_admission_user_text_unsupported");
  return (texts[0] as { text: string }).text;
}

function replaceUserText(message: Message, text: string): Message {
  if (typeof message.content === "string") return { ...message, content: text };
  const parts = Array.isArray(message.content)
    ? message.content
    : [message.content];
  return {
    ...message,
    content: parts.map(part =>
      typeof part === "object" && part.type === "text"
        ? { ...part, text }
        : part
    ),
  };
}

/**
 * Bound only: this synthetic envelope must never be sent or decoded as a catalog.
 * Keep every global dictionary entry, but only the largest N encoded candidates.
 * A real subset uses no more dictionary entries, nor longer reference IDs. If a
 * text occurs only once in that subset and becomes literal, its full value plus
 * reference already occupies space in this bound. No content is dropped from
 * the actual generation request; this object exists only to price admission.
 */
export function selectionAdmissionPayload(input: SelectionAdmissionInput) {
  const { request, maxCandidates } = input;
  if (
    !Number.isInteger(maxCandidates) ||
    maxCandidates < 1 ||
    !request.pinnedModel ||
    !request.disableFallback ||
    request.tools ||
    !request.maxCompletionTokens ||
    request.response_format?.type !== "json_schema"
  )
    throw new Error("selection_admission_request_unsupported");
  const userIndex = request.messages.findIndex(m => m.role === "user");
  if (
    userIndex < 0 ||
    request.messages.filter(m => m.role === "user").length !== 1
  )
    throw new Error("selection_admission_user_message_unsupported");
  const data = JSON.parse(textFromUser(request.messages[userIndex]));
  const catalog = data.catalog as GenerationSelectionCatalogTransportV1;
  if (
    catalog?.encoding !== "selection_catalog_v1" ||
    !Array.isArray(catalog.candidates) ||
    !catalog.sharedTexts ||
    !catalog.fieldContracts
  )
    throw new Error("selection_admission_catalog_unsupported");
  // Count JSON inside the message's JSON string, including escaped quotes.
  const candidates = [...catalog.candidates]
    .sort(
      (a, b) =>
        bytes(JSON.stringify(b)) - bytes(JSON.stringify(a)) ||
        a.candidateId.localeCompare(b.candidateId)
    )
    .slice(0, maxCandidates);
  const boundedData = { ...data, catalog: { ...catalog, candidates } };
  const messages = request.messages.map((message, index) =>
    index === userIndex
      ? replaceUserText(message, JSON.stringify(boundedData))
      : message
  );
  const adapted = adaptRequestForProvider({
    provider: "openrouter",
    effectiveModel: request.pinnedModel,
    forceTextSchema: request.forceTextSchema,
    messages,
    responseFormat: request.response_format,
  });
  const gpt = request.pinnedModel.startsWith("openai/gpt-6.1-sol");
  const reasoning =
    request.reasoningEffort ?? request.reasoning_effort ?? "medium";
  const payload = {
    // Retain non-wire call metadata as extra reservation, never as a provider request.
    ...request,
    signal: undefined,
    model: request.pinnedModel,
    messages: adapted.messages,
    response_format: adapted.responseFormat,
    max_tokens: request.maxCompletionTokens,
    reasoning_effort: reasoning,
    reasoning: { effort: reasoning, exclude: true },
    provider: {
      allow_fallbacks: true,
      data_collection: "deny",
      ...(gpt ? { require_parameters: true } : {}),
    },
    ...(!gpt
      ? {
          temperature: request.temperature ?? 0.55,
          top_p: request.topP ?? request.top_p ?? 0.9,
        }
      : {}),
    // Before JEV, suitability numbers are placeholders. This covers decimal/exponent
    // length differences and metadata overhead without assuming their eventual score.
    selection_admission_numeric_margin: " ".repeat(128 * candidates.length),
  };
  return {
    payload,
    eligibleCandidates: catalog.candidates.length,
    candidateIds: candidates.map(c => c.candidateId),
  };
}

export function quoteSelectionAdmission(
  input: SelectionAdmissionInput,
  quote: PriceQuote
): SelectionAdmissionRecord {
  const { payload, eligibleCandidates, candidateIds } =
    selectionAdmissionPayload(input);
  if (quote.id !== payload.model)
    throw new Error("selection_admission_quote_mismatch");
  const serialized = JSON.stringify(payload);
  return {
    version: 1,
    stage: "before_shortlist",
    kind: "conservative_selection_admission_bound",
    model: payload.model,
    eligibleCandidates,
    maxCandidates: input.maxCandidates,
    candidateIds,
    payloadHash: createHash("sha256").update(serialized).digest("hex"),
    payloadBytes: Buffer.byteLength(serialized),
    reservedUsd: reserveQuote(payload, quote).usd,
    dispatched: false,
  };
}

export function createSelectionBudgetPreflight(options: {
  budget: Pick<MatrixBudget, "canPrepare">;
  quotes: Map<string, PriceQuote>;
  record?: (record: SelectionAdmissionRecord) => Promise<void>;
}) {
  return async (input: SelectionAdmissionInput) => {
    const quote = options.quotes.get(input.request.pinnedModel ?? "");
    if (!quote) throw new Error("selection_admission_quote_missing");
    const record = quoteSelectionAdmission(input, quote);
    await options.record?.(record);
    if (!(await options.budget.canPrepare(record.reservedUsd)))
      throw new Error(
        "comparison_selection_preflight_budget_exhausted_before_shortlist"
      );
  };
}
