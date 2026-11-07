import { generationTaskModelSchema, type GenerationTaskModelConfig } from "../../../shared/generationModel";
import type {
  JsonSchema,
  Message,
  MessageContent,
  ResponseFormat,
} from "../../_core/llm";

export type LlmProvider = "google" | "groq" | "forge" | "openrouter";

export interface ProviderModelConfig {
  provider: LlmProvider;
  apiUrl: string;
  apiKey: string;
  effectiveModel: string;
  headers?: Record<string, string>;
  providerOptions?: Record<string, unknown>;
}

interface NormalizedMessage {
  role: string;
  content: unknown;
  name?: string;
  tool_call_id?: string;
}

export interface AdaptedProviderRequest {
  messages: NormalizedMessage[];
  responseFormat?: ResponseFormat;
  schema?: JsonSchema;
  structuredOutputMode?: "native_schema" | "text_schema";
  normalizeResponseContent?: (content: string) => string;
}

/** OpenAI strict objects encode an absent optional value as null on the wire. */
function strictNativeSchema(node: Record<string, unknown>): Record<string, unknown> {
  const result = { ...node };
  delete result.$schema;
  delete result.default;
  for (const key of ["anyOf", "oneOf", "allOf"])
    if (Array.isArray(result[key])) result[key] = result[key].map(child => strictNativeSchema(child));
  for (const key of ["$defs", "definitions"])
    if (result[key] && typeof result[key] === "object") result[key] = Object.fromEntries(
      Object.entries(result[key]).map(([name, child]) => [name, strictNativeSchema(child as Record<string, unknown>)])
    );
  if (result.items && typeof result.items === "object") result.items = strictNativeSchema(result.items as Record<string, unknown>);
  if (result.type === "object" || result.properties) {
    if (result.additionalProperties && typeof result.additionalProperties === "object")
      throw new Error("native_schema_dynamic_properties_unsupported");
    const required = new Set(Array.isArray(result.required) ? result.required : []);
    const properties = Object.entries((result.properties ?? {}) as Record<string, Record<string, unknown>>);
    result.properties = Object.fromEntries(properties.map(([key, child]) => [
      key, required.has(key) ? strictNativeSchema(child) : { anyOf: [strictNativeSchema(child), { type: "null" }] },
    ]));
    result.required = properties.map(([key]) => key);
    result.additionalProperties = false;
  }
  return result;
}

function restoreOptionalValues(value: unknown, schema: Record<string, unknown>, root: Record<string, unknown>): unknown {
  if (typeof schema.$ref === "string") {
    const resolved = resolveReference(root, schema.$ref);
    return resolved ? restoreOptionalValues(value, resolved, root) : value;
  }
  for (const key of ["anyOf", "oneOf"] as const) {
    if (!Array.isArray(schema[key])) continue;
    for (const child of schema[key]) {
      const restored = restoreOptionalValues(value, child, root);
      const errors: string[] = [];
      validateNode(restored, child, root, "$", errors);
      if (!errors.length) return restored;
    }
  }
  if (Array.isArray(value) && schema.items && typeof schema.items === "object")
    return value.map(item => restoreOptionalValues(item, schema.items as Record<string, unknown>, root));
  if (value && typeof value === "object" && !Array.isArray(value) && schema.properties) {
    const restored = { ...value } as Record<string, unknown>;
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    for (const [key, child] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) {
      if (!(key in restored)) continue;
      const nullErrors: string[] = [];
      validateNode(null, child, root, "$", nullErrors);
      if (restored[key] === null && !required.has(key) && nullErrors.length) delete restored[key];
      else restored[key] = restoreOptionalValues(restored[key], child, root);
    }
    return restored;
  }
  return value;
}

function contentParts(content: MessageContent | MessageContent[]): MessageContent[] {
  return Array.isArray(content) ? content : [content];
}

export function hasMultimodalContent(messages: Message[]): boolean {
  return messages.some((message) =>
    contentParts(message.content).some(
      (part) =>
        typeof part !== "string" &&
        (part.type === "image_url" || part.type === "file_url"),
    ),
  );
}

function appendSystemInstruction(
  messages: NormalizedMessage[],
  instruction: string,
): NormalizedMessage[] {
  const systemIndex = messages.findIndex((message) => message.role === "system");
  if (systemIndex === -1) {
    return [{ role: "system", content: instruction }, ...messages];
  }

  return messages.map((message, index) => {
    if (index !== systemIndex) return message;
    const current =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
    return {
      ...message,
      content: `${current}\n\n${instruction}`,
    };
  });
}

export function adaptRequestForProvider(input: {
  provider: LlmProvider;
  effectiveModel?: string;
  forceTextSchema?: boolean;
  /** Validated automatic routing must never silently translate its native contract. */
  requireNativeSchema?: boolean;
  messages: NormalizedMessage[];
  responseFormat?: ResponseFormat;
}): AdaptedProviderRequest {
  if (input.requireNativeSchema) {
    if (input.provider !== "openrouter" || input.forceTextSchema ||
        !["anthropic/claude-haiku-5.5", "deepseek/deepseek-v4.1-flash"].includes(input.effectiveModel ?? "") ||
        input.responseFormat && input.responseFormat.type !== "json_schema") {
      throw new Error("automatic_route_requires_supported_native_schema");
    }
    const schema = input.responseFormat?.type === "json_schema" ? input.responseFormat.json_schema : undefined;
    // Keep the source schema (including bounds and optional fields) unchanged.
    // Local validation still applies: native enforcement is not a proof of fit.
    return {
      messages: input.messages,
      responseFormat: schema ? { type: "json_schema", json_schema: { ...schema, strict: true } } : undefined,
      schema,
      structuredOutputMode: schema ? "native_schema" : undefined,
    };
  }
  if (input.provider === "openrouter" && input.effectiveModel?.startsWith("openai/gpt-6.1-sol") &&
      !input.forceTextSchema && input.responseFormat?.type === "json_schema") {
    const schema = input.responseFormat.json_schema;
    return {
      messages: input.messages,
      responseFormat: { type: "json_schema", json_schema: { ...schema, strict: true, schema: strictNativeSchema(schema.schema) } },
      schema,
      structuredOutputMode: "native_schema",
      normalizeResponseContent: content => {
        try { return JSON.stringify(restoreOptionalValues(JSON.parse(content), schema.schema, schema.schema)); }
        catch { return content; }
      },
    };
  }
  const openRouterGeminiNeedsTextSchema =
    input.provider === "openrouter" &&
    input.effectiveModel?.startsWith("google/gemini-3.8-flash");
  const forceTextSchema = input.forceTextSchema === true;
  if (
    input.responseFormat?.type !== "json_schema" ||
    (!forceTextSchema &&
      input.provider !== "groq" &&
      !openRouterGeminiNeedsTextSchema)
  ) {
    return {
      messages: input.messages,
      responseFormat: input.responseFormat,
      schema:
        input.responseFormat?.type === "json_schema"
          ? input.responseFormat.json_schema
          : undefined,
      structuredOutputMode:
        input.responseFormat?.type === "json_schema" ? "native_schema" : undefined,
    };
  }

  const schema = input.responseFormat.json_schema;
  if (
    !forceTextSchema &&
    !openRouterGeminiNeedsTextSchema &&
    input.effectiveModel === "openai/gpt-oss-120b" &&
    !input.forceTextSchema
  ) {
    return {
      messages: input.messages,
      responseFormat: input.responseFormat,
      schema,
      structuredOutputMode: "native_schema",
    };
  }

  const schemaInstruction = `ADAPTADOR DE SAIDA ESTRUTURADA:
Retorne SOMENTE um objeto JSON valido, sem markdown ou comentarios.
O objeto deve respeitar integralmente o JSON Schema abaixo.
Nao remova campos obrigatorios, nao crie propriedades extras e preserve os tipos.
JSON Schema (${schema.name}):
${JSON.stringify(schema.schema)}`;

  return {
    messages: appendSystemInstruction(input.messages, schemaInstruction),
    responseFormat: { type: "json_object" },
    schema,
    structuredOutputMode: "text_schema",
  };
}

function resolveReference(
  root: Record<string, unknown>,
  reference: string,
): Record<string, unknown> | null {
  if (!reference.startsWith("#/")) return null;
  let current: unknown = root;
  for (const segment of reference.slice(2).split("/")) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return current && typeof current === "object"
    ? (current as Record<string, unknown>)
    : null;
}

function validateNode(
  value: unknown,
  schema: Record<string, unknown>,
  root: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  if (typeof schema.$ref === "string") {
    const resolved = resolveReference(root, schema.$ref);
    if (!resolved) {
      errors.push(`${path}: referencia de schema nao resolvida`);
      return;
    }
    validateNode(value, resolved, root, path, errors);
    return;
  }

  if ("const" in schema && value !== schema.const) {
    errors.push(`${path}: valor diferente do const`);
    return;
  }

  if (Array.isArray(schema.allOf)) {
    for (const childSchema of schema.allOf) {
      if (childSchema && typeof childSchema === "object") {
        validateNode(
          value,
          childSchema as Record<string, unknown>,
          root,
          path,
          errors,
        );
      }
    }
  }

  for (const combinator of ["anyOf", "oneOf"] as const) {
    if (!Array.isArray(schema[combinator])) continue;
    const matches = schema[combinator].filter((childSchema) => {
      if (!childSchema || typeof childSchema !== "object") return false;
      const candidateErrors: string[] = [];
      validateNode(
        value,
        childSchema as Record<string, unknown>,
        root,
        path,
        candidateErrors,
      );
      return candidateErrors.length === 0;
    }).length;
    if (
      (combinator === "anyOf" && matches === 0) ||
      (combinator === "oneOf" && matches !== 1)
    ) {
      errors.push(`${path}: nao satisfaz ${combinator}`);
      return;
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: valor fora do enum`);
    return;
  }

  const type = schema.type;
  if (Array.isArray(type)) {
    const matchesType = type.some((candidateType) => {
      const candidateErrors: string[] = [];
      validateNode(
        value,
        { ...schema, type: candidateType },
        root,
        path,
        candidateErrors,
      );
      return candidateErrors.length === 0;
    });
    if (!matchesType) errors.push(`${path}: tipo nao permitido`);
    return;
  }
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path}: deveria ser objeto`);
      return;
    }
    const record = value as Record<string, unknown>;
    const properties =
      schema.properties && typeof schema.properties === "object"
        ? (schema.properties as Record<string, Record<string, unknown>>)
        : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [];
    for (const key of required) {
      if (!(key in record)) errors.push(`${path}.${key}: campo obrigatorio ausente`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in properties)) errors.push(`${path}.${key}: propriedade extra`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in record) {
        validateNode(record[key], childSchema, root, `${path}.${key}`, errors);
      }
    }
    return;
  }

  if (type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path}: deveria ser array`);
      return;
    }
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path}: itens abaixo do minimo`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${path}: itens acima do maximo`);
    }
    if (schema.items && typeof schema.items === "object") {
      value.forEach((item, index) =>
        validateNode(
          item,
          schema.items as Record<string, unknown>,
          root,
          `${path}[${index}]`,
          errors,
        ),
      );
    }
    return;
  }

  if (type === "string") {
    if (typeof value !== "string") {
      errors.push(`${path}: deveria ser string`);
      return;
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: texto abaixo do tamanho minimo`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path}: texto acima do tamanho maximo`);
    }
    if (
      typeof schema.pattern === "string" &&
      !new RegExp(schema.pattern).test(value)
    ) {
      errors.push(`${path}: texto fora do pattern`);
    }
  } else if (
    type === "number" &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    errors.push(`${path}: deveria ser number`);
  } else if (
    type === "integer" &&
    (typeof value !== "number" || !Number.isInteger(value))
  ) {
    errors.push(`${path}: deveria ser integer`);
  } else if (type === "boolean" && typeof value !== "boolean") {
    errors.push(`${path}: deveria ser boolean`);
  } else if (type === "null" && value !== null) {
    errors.push(`${path}: deveria ser null`);
  }

  if (
    (type === "number" || type === "integer") &&
    typeof value === "number"
  ) {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path}: numero abaixo do minimo`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path}: numero acima do maximo`);
    }
  }
}

export function validateStructuredContent(
  content: string,
  schema: JsonSchema,
): { valid: true; value: unknown } | { valid: false; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { valid: false, errors: ["$: JSON invalido"] };
  }

  const errors: string[] = [];
  validateNode(parsed, schema.schema, schema.schema, "$", errors);
  return errors.length === 0
    ? { valid: true, value: parsed }
    : { valid: false, errors: errors.slice(0, 12) };
}

export function buildRepairMessages(input: {
  messages: NormalizedMessage[];
  invalidContent: string;
  schema: JsonSchema;
  errors: string[];
}): NormalizedMessage[] {
  return [
    ...input.messages,
    {
      role: "assistant",
      content: input.invalidContent.slice(0, 20_000),
    },
    {
      role: "user",
      content: `A resposta anterior violou o contrato.
Erros detectados:
${input.errors.map((error) => `- ${error}`).join("\n")}

Corrija a resposta e devolva SOMENTE o objeto JSON completo conforme o schema ${input.schema.name}.`,
    },
  ];
}

/** Provider failover stays within the admitted model and its price/data/schema
 * constraints. V1 keeps its exact endpoint; only explicitly versioned V2 tasks
 * may try compatible providers after the preferred DeepInfra family.
 * https://openrouter.ai/docs/guides/routing/provider-selection */
export function generationTaskProviderOptions(taskModelConfig: GenerationTaskModelConfig) {
  const config = generationTaskModelSchema.parse(taskModelConfig);
  const routing = "allowProviderFallbacks" in config
    ? { order: [config.providerEndpoint], allow_fallbacks: true }
    : { only: [config.providerEndpoint], allow_fallbacks: false };
  return {
    ...routing,
    require_parameters: true,
    max_price: { ...config.maxPrice },
    data_collection: "deny",
  };
}
