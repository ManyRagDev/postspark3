import { afterEach, describe, expect, it, vi } from "vitest";
import { INITIAL_POST } from "../../../client/src/pages/CanvasLab/components/types";
import { arsenalHash } from "@shared/arsenalContent";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { ENV } from "../../_core/env";
import { generateFixedCopy } from "./fixedDesignCopy";

const original = {
  openRouterApiKey: ENV.openRouterApiKey,
  geminiApiKey: ENV.geminiApiKey,
  aiModelFallbackEnabled: ENV.aiModelFallbackEnabled,
  llmTransientRetries: ENV.llmTransientRetries,
};
afterEach(() => {
  Object.assign(ENV, original);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  ENV.openRouterApiKey = "offline-fixed-design-test";
  ENV.aiModelFallbackEnabled = true;
  ENV.llmTransientRetries = 0;
  const canvas = {
    ...structuredClone(INITIAL_POST),
    aspectRatio: "4:5" as const,
    familyName: "ReUNE",
  };
  canvas.slides = [
    {
      id: "cover",
      headline: "",
      subtext: "",
      step: "",
      suppressFamilyDecorations: true,
      extraTexts: [
        { id: "text-0", text: "ReUNE", x: 20, y: 20, width: 100, fontSize: 11 },
        {
          id: "title",
          text: "Título antigo",
          x: 20,
          y: 80,
          width: 300,
          fontSize: 30,
        },
        {
          id: "support",
          text: "Apoio antigo",
          x: 20,
          y: 200,
          width: 300,
          fontSize: 14,
        },
      ],
    },
  ];
  const input = orchestratedGenerationInputSchema.parse({
    ownerId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "reune-fixed-design",
    inputType: "text",
    content: "Organize seu amigo secreto no ReUNE.",
    platform: "instagram",
    postMode: "static",
    aspectRatio: "4:5",
    fixedDesign: {
      kind: "project",
      id: "22222222-2222-4222-8222-222222222222",
    },
  });
  const journal = new Map<string, unknown>();
  const args = {
    pin: { sourceId: "project:reune:1", revision: arsenalHash(canvas), canvas },
    input,
    runId: "33333333-3333-4333-8333-333333333333",
    source: input.content,
    signal: new AbortController().signal,
    deadline: Date.now() + 60000,
    model: "anthropic/claude-haiku-5.5",
    operation: async <T>(key: string, work: () => Promise<T>): Promise<T> => {
      if (journal.has(key)) return journal.get(key) as T;
      const result = await work();
      journal.set(key, structuredClone(result));
      return result;
    },
  };
  return { args, canvas, journal };
}
const copy = (title = "Amigo secreto fácil") => ({
  values: [
    { id: "0:title", text: title },
    { id: "0:support", text: "Organize seu sorteio no ReUNE." },
  ],
  caption: "Convide seu grupo.",
});

function provider(body: unknown) {
  return new Response(
    JSON.stringify({
      id: "offline-provider",
      model: "anthropic/claude-haiku-5.5",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(body) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("fixed design with the real model adapter and simulated provider", () => {
  it.each([false, true])(
    "dispatches the pinned model and preserves the kit through journal replay (repair=%s)",
    async repair => {
      const { args, canvas, journal } = setup();
      const before = arsenalHash(canvas);
      const bodies = repair
        ? [copy("Amigo secreto ".repeat(100)), copy(), { issues: [] }]
        : [copy(), { issues: [] }];
      const fetchMock = vi.fn(async () => provider(bodies.shift()));
      vi.stubGlobal("fetch", fetchMock);
      const post = await generateFixedCopy(args);
      expect(post.familyName).toBe("ReUNE");
      expect(post.palette).toEqual(canvas.palette);
      expect(post.slides[0].extraTexts).toEqual([
        expect.objectContaining({ text: "ReUNE", x: 20, y: 20 }),
        expect.objectContaining({
          text: "Amigo secreto fácil",
          x: 20,
          y: 80,
          fontSize: 30,
        }),
        expect.objectContaining({
          text: "Organize seu sorteio no ReUNE.",
          x: 20,
          y: 200,
        }),
      ]);
      expect(arsenalHash(canvas)).toBe(before);
      expect(fetchMock).toHaveBeenCalledTimes(repair ? 3 : 2);
      for (const [url, options] of fetchMock.mock.calls as unknown as Array<
        [string, RequestInit]
      >) {
        expect(url).toContain("openrouter.ai");
        expect(JSON.parse(options.body as string).model).toBe(args.model);
      }
      expect(journal.has("repair")).toBe(repair);
      expect(await generateFixedCopy(args)).toEqual(post);
      expect(fetchMock).toHaveBeenCalledTimes(repair ? 3 : 2);
      expect(JSON.parse(JSON.stringify(post))).toEqual(post);
    }
  );

  it("keeps a rejected pinned model from silently falling back to another provider", async () => {
    const { args } = setup();
    ENV.geminiApiKey = "fallback-must-not-run";
    const fetchMock = vi.fn(
      async () => new Response("Model unavailable", { status: 404 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateFixedCopy(args)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(args.model);
  });
});
