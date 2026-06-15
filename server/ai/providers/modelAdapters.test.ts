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
  it("translates Groq json_schema into json_object plus schema instructions", () => {
    const adapted = adaptRequestForProvider({
      provider: "groq",
      messages: [{ role: "user", content: "Gere o resultado" }],
      responseFormat: {
        type: "json_schema",
        json_schema: schema,
      },
    });

    expect(adapted.responseFormat).toEqual({ type: "json_object" });
    expect(adapted.schema).toEqual(schema);
    expect(String(adapted.messages[0].content)).toContain("JSON Schema");
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
