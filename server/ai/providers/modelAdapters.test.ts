import { describe, expect, it } from "vitest";
import {
  adaptRequestForProvider,
  hasMultimodalContent,
  validateStructuredContent,
} from "./modelAdapters";

const schema = {
  name: "sample",
  strict: true,
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
          },
          required: ["id"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "items"],
    additionalProperties: false,
  },
} as const;

describe("model provider adapters", () => {
  it("round trips optional GPT fields through nested refs and unions without removing valid nullable values", () => {
    const original = { name: "strict-copy", strict: true, schema: {
      type: "object", properties: { slides: { type: "array", items: { anyOf: [
        { $ref: "#/$defs/slide" },
        { type: "object", properties: { kind: { const: "end" } }, required: ["kind"], additionalProperties: false },
      ] } } }, required: ["slides"], additionalProperties: false,
      $defs: { slide: { type: "object", properties: {
        kind: { const: "slide" }, title: { type: "string" }, optional: { type: "string" }, nullable: { type: ["string", "null"] },
      }, required: ["kind", "title"], additionalProperties: false } },
    } };
    const adapted = adaptRequestForProvider({ provider: "openrouter", effectiveModel: "openai/gpt-6.1-sol", messages: [], responseFormat: { type: "json_schema", json_schema: original } });
    expect(adapted.schema).toEqual(original);
    const restored = adapted.normalizeResponseContent!(JSON.stringify({ slides: [{ kind: "slide", title: "A", optional: null, nullable: null }] }));
    expect(JSON.parse(restored)).toEqual({ slides: [{ kind: "slide", title: "A", nullable: null }] });
    expect(validateStructuredContent(restored, original).valid).toBe(true);
    expect(validateStructuredContent(adapted.normalizeResponseContent!('{"slides":[{"kind":"slide","title":3,"optional":null,"nullable":null}]}'), original).valid).toBe(false);
    expect(adapted.normalizeResponseContent!("invalid json")).toBe("invalid json");
  });
  it("keeps native json_schema for Groq GPT-OSS", () => {
    const adapted = adaptRequestForProvider({
      provider: "groq",
      effectiveModel: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: "Gere o resultado" }],
      responseFormat: {
        type: "json_schema",
        json_schema: schema,
      },
    });

    expect(adapted.responseFormat).toEqual({
      type: "json_schema",
      json_schema: schema,
    });
    expect(adapted.schema).toEqual(schema);
    expect(adapted.structuredOutputMode).toBe("native_schema");
    expect(String(adapted.messages[0].content)).not.toContain("JSON Schema");
  });

  it("keeps native json_schema for OpenRouter GPT-5 mini", () => {
    const adapted = adaptRequestForProvider({
      provider: "openrouter",
      effectiveModel: "openai/gpt-5-mini",
      messages: [{ role: "user", content: "Gere o resultado" }],
      responseFormat: {
        type: "json_schema",
        json_schema: schema,
      },
    });

    expect(adapted.responseFormat).toEqual({
      type: "json_schema",
      json_schema: schema,
    });
    expect(adapted.schema).toEqual(schema);
    expect(adapted.structuredOutputMode).toBe("native_schema");
    expect(String(adapted.messages[0].content)).not.toContain("JSON Schema");
  });

  it("translates unsupported Groq json_schema into json_object plus schema instructions", () => {
    const adapted = adaptRequestForProvider({
      provider: "groq",
      effectiveModel: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "Gere o resultado" }],
      responseFormat: {
        type: "json_schema",
        json_schema: schema,
      },
    });

    expect(adapted.responseFormat).toEqual({ type: "json_object" });
    expect(adapted.schema).toEqual(schema);
    expect(adapted.structuredOutputMode).toBe("text_schema");
    expect(String(adapted.messages[0].content)).toContain("JSON Schema");
  });

  it("translates Gemini 3.8 OpenRouter schema to the prompt-json mode validated by the benchmark", () => {
    const adapted = adaptRequestForProvider({
      provider: "openrouter",
      effectiveModel: "google/gemini-3.8-flash",
      messages: [{ role: "user", content: "Gere o resultado" }],
      responseFormat: {
        type: "json_schema",
        json_schema: schema,
      },
    });

    expect(adapted.responseFormat).toEqual({ type: "json_object" });
    expect(adapted.schema).toEqual(schema);
    expect(adapted.structuredOutputMode).toBe("text_schema");
    expect(String(adapted.messages[0].content)).toContain("JSON Schema");
  });

  it("forces Google to text-schema mode while retaining local schema validation", () => {
    const adapted = adaptRequestForProvider({
      provider: "google",
      effectiveModel: "gemini-2.5-flash",
      forceTextSchema: true,
      messages: [{ role: "user", content: "Gere o resultado" }],
      responseFormat: { type: "json_schema", json_schema: schema },
    });

    expect(adapted.responseFormat).toEqual({ type: "json_object" });
    expect(adapted.structuredOutputMode).toBe("text_schema");
    expect(adapted.schema).toEqual(schema);
    expect(String(adapted.messages[0].content)).toContain("JSON Schema");
    expect(validateStructuredContent('{"title":"ok","items":[]}', adapted.schema!).valid).toBe(true);
    expect(validateStructuredContent('{"title":2,"items":[]}', adapted.schema!).valid).toBe(false);
  });

  it("validates required fields, nested arrays and extra properties", () => {
    expect(
      validateStructuredContent(
        JSON.stringify({ title: "Ok", items: [{ id: 1 }] }),
        schema,
      ).valid,
    ).toBe(true);
    expect(
      validateStructuredContent(
        JSON.stringify({ title: "Erro", items: [{ id: "1" }], extra: true }),
        schema,
      ).valid,
    ).toBe(false);
  });

  it("detects calls that cannot fall back to the text model", () => {
    expect(
      hasMultimodalContent([
        {
          role: "user",
          content: [
            { type: "text", text: "Analise" },
            { type: "image_url", image_url: { url: "data:image/png;base64,x" } },
          ],
        },
      ]),
    ).toBe(true);
  });
});


describe("verified automatic native schemas", () => {
  it.each(["anthropic/claude-haiku-5.5", "deepseek/deepseek-v4.1-flash"])("preserves %s field bounds and validates them locally", effectiveModel => {
    const bounded = { name: "bounded", schema: { type: "object", properties: {
      text: { type: "string", maxLength: 7 }, optional: { type: "string" },
    }, required: ["text"], additionalProperties: false } };
    const messages = [{ role: "user", content: "Ajuste o campo" }];
    const adapted = adaptRequestForProvider({ provider: "openrouter", effectiveModel, requireNativeSchema: true,
      messages, responseFormat: { type: "json_schema", json_schema: bounded } });
    expect(adapted.messages).toEqual(messages);
    expect(adapted.responseFormat).toEqual({ type: "json_schema", json_schema: { ...bounded, strict: true } });
    expect(adapted.structuredOutputMode).toBe("native_schema");
    expect(validateStructuredContent('{"text":"Agora"}', adapted.schema!).valid).toBe(true);
    expect(validateStructuredContent('{"text":"Texto grande"}', adapted.schema!).valid).toBe(false);
  });

  it("fails closed instead of downgrading an automatic route to text schema", () => {
    expect(() => adaptRequestForProvider({ provider: "openrouter", effectiveModel: "anthropic/claude-haiku-5.5", requireNativeSchema: true,
      forceTextSchema: true, messages: [], responseFormat: { type: "json_schema", json_schema: schema } })).toThrow("supported_native_schema");
    expect(() => adaptRequestForProvider({ provider: "openrouter", effectiveModel: "unvalidated/model", requireNativeSchema: true,
      messages: [], responseFormat: { type: "json_schema", json_schema: schema } })).toThrow("supported_native_schema");
  });
});

describe("immutable automatic provider routing", () => {
  const deepseek = { model: "deepseek/deepseek-v4.1-flash", providerEndpoint: "deepinfra/fp8", maxPrice: { prompt: 0.1414, completion: 0.4242 }, reasoningEffort: "none", reasoningEnabled: false, structuredOutputMode: "native_schema", transportTimeoutMs: 60000 } as const;
  it("keeps V1 endpoint pinning and gives V2 a compatible same-model provider preference", async () => {
    const { generationTaskProviderOptions } = await import("./modelAdapters");
    expect(generationTaskProviderOptions(deepseek)).toEqual({ only: ["deepinfra/fp8"], allow_fallbacks: false, require_parameters: true, data_collection: "deny", max_price: deepseek.maxPrice });
    const task = { ...deepseek, providerEndpoint: "deepinfra" as const, allowProviderFallbacks: true as const };
    const saved = JSON.stringify(task);
    const routed = generationTaskProviderOptions(task);
    expect(routed).toEqual({ order: ["deepinfra"], allow_fallbacks: true, require_parameters: true, data_collection: "deny", max_price: deepseek.maxPrice });
    expect(routed).not.toHaveProperty("only");
    expect(routed).not.toHaveProperty("models");
    expect(JSON.stringify(task)).toBe(saved);
    const native = adaptRequestForProvider({ provider: "openrouter", effectiveModel: task.model, requireNativeSchema: true, messages: [{role:"user",content:"Preserve o campo"}], responseFormat: {type:"json_schema",json_schema:schema} });
    expect(native.structuredOutputMode).toBe("native_schema");
    expect(native.responseFormat).toEqual({type:"json_schema",json_schema:schema});
  });
  it("keeps Haiku pinned and rejects an unversioned or price-relaxed DeepSeek task before transport", async () => {
    const { generationTaskProviderOptions } = await import("./modelAdapters");
    const copy = { ...deepseek, model:"anthropic/claude-haiku-5.5" as const, providerEndpoint:"anthropic" as const,maxPrice:{prompt:0.101 as const,completion:0.505 as const} };
    expect(generationTaskProviderOptions(copy)).toEqual({only:["anthropic"],allow_fallbacks:false,require_parameters:true,data_collection:"deny",max_price:copy.maxPrice});
    for(const task of [{...deepseek,providerEndpoint:"deepinfra"},{...deepseek,allowProviderFallbacks:true},{...deepseek,providerEndpoint:"deepinfra",allowProviderFallbacks:true,maxPrice:{prompt:1,completion:1}},{...copy,allowProviderFallbacks:true}])expect(()=>generationTaskProviderOptions(task as any)).toThrow();
  });
});
