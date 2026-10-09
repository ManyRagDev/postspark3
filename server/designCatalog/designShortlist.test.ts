import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compactComponentCard,
  type ComponentCardV1,
} from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import {
  designShortlistBrief,
  evaluateDesignBatch,
  shortlistCompleteDesigns,
  type JevRequest,
  type JevResponse,
} from "./designShortlist";

vi.mock("../_core/env", () => ({
  ENV: {
    openRouterApiKey: "test-key",
    openRouterSiteUrl: "https://example.test",
    openRouterAppName: "test",
    openRouterDesignSelectionModel: "typesafe/jev-1.13",
  },
}));

function catalog(count: number): ComponentCardV1[] {
  const base = compactComponentCard(completeDesignTestDefinitions()[0]);
  return Array.from({ length: count }, (_, i) => ({
    ...base,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    completeDesign: { ...base.completeDesign!, family: `family-${i}` },
    roles: ["static", "cover", "development", "closing"],
  }));
}
function answer(request: JevRequest, score = (_id: string) => 3): JevResponse {
  return {
    model: request.model,
    answers: Object.fromEntries(
      Object.keys(request.questions).map(id => [
        id,
        { type: "score", score: score(id), confidence: 0.8 },
      ])
    ),
    usage: { input_tokens: 100, output_tokens: 10, cost: 0.001 },
  };
}
const input = (cards: ComponentCardV1[]) => ({
  cards,
  brief: "Uma ideia aberta a várias composições",
  slideCount: 1,
  deadlineMs: null,
});
afterEach(() => vi.unstubAllGlobals());

describe("design shortlist", () => {
  it("uses textual evidence for images without shipping base64 into a text-only classifier", () => {
    const image = "data:image/png;base64," + "abcd".repeat(20000);
    const brief = designShortlistBrief(
      [
        { type: "text", text: `Faça um anúncio a partir de ${image}` },
        { type: "image_url", image_url: { url: image } },
      ],
      {
        sourceEvidence: "Sabonete artesanal em embalagem azul",
        referenceImageProvided: true,
      }
    );
    expect(brief).toContain("Sabonete artesanal");
    expect(brief).toContain("visual content not evaluated here");
    expect(brief).not.toContain("base64");
    expect(brief.length).toBeLessThan(400);
  });
  it("keeps small catalogs without buying a redundant classification", async () => {
    const cards = catalog(12),
      evaluate = vi.fn();
    const result = await shortlistCompleteDesigns(input(cards), evaluate);
    expect(result.cards).toEqual(cards);
    expect(result.batches).toBe(0);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("scores every eligible card, including late entries, in bounded batches before sending 12 options", async () => {
    const cards = catalog(45),
      seen: JevRequest[] = [];
    const evaluate = vi.fn(async (request: JevRequest) => {
      seen.push(request);
      return answer(request, id => (id === cards.at(-1)!.id ? 4 : 2));
    });
    const result = await shortlistCompleteDesigns(input(cards), evaluate);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.flatMap(r => Object.keys(r.questions)).sort()).toEqual(
      cards.map(c => c.id).sort()
    );
    expect(seen.every(r => Buffer.byteLength(JSON.stringify(r)) <= 28000)).toBe(
      true
    );
    expect(seen.every(r => r.state === input(cards).brief)).toBe(true);
    expect(result.cards).toHaveLength(12);
    expect(result.cards[0].id).toBe(cards.at(-1)!.id);
    expect(result.evaluated).toHaveLength(45);
    expect(result.inputTokens).toBe(100 * seen.length);
  });

  it("retains a complete authored kit per carousel family and excludes incomplete families", async () => {
    const cards = catalog(46).map((card, i) => ({
      ...card,
      completeDesign: {
        ...card.completeDesign!,
        family: `kit-${Math.floor(i / 3)}`,
      },
      roles: [["cover"], ["development"], ["closing"]][
        i % 3
      ] as ComponentCardV1["roles"],
    }));
    const result = await shortlistCompleteDesigns(
      { ...input(cards), slideCount: 5 },
      async r => answer(r)
    );
    expect(result.cards).toHaveLength(36);
    const families = [
      ...new Set(result.cards.map(c => c.completeDesign!.family)),
    ];
    expect(families).toHaveLength(12);
    expect(families).not.toContain("kit-15");
    for (const family of families)
      expect(
        result.cards
          .filter(c => c.completeDesign!.family === family)
          .flatMap(c => c.roles)
          .sort()
      ).toEqual(["closing", "cover", "development"]);
  });

  it("journals each batch separately and reuses completed answers without repurchasing", async () => {
    const saved = new Map<string, unknown>(),
      evaluate = vi.fn(async (r: JevRequest) => answer(r));
    const operation = async <T>(
      key: string,
      work: () => Promise<T>
    ): Promise<T> => {
      if (!saved.has(key)) saved.set(key, await work());
      return saved.get(key) as T;
    };
    const first = await shortlistCompleteDesigns(
      { ...input(catalog(30)), operation },
      evaluate
    );
    const second = await shortlistCompleteDesigns(
      { ...input(catalog(30)), operation },
      evaluate
    );
    expect(second).toEqual(first);
    expect(evaluate).toHaveBeenCalledTimes(first.batches);
    expect(
      [...saved.keys()].every(key => key.startsWith("design-shortlist:"))
    ).toBe(true);
  });

  it("rejects partial answers rather than silently hiding unevaluated designs", async () => {
    await expect(
      shortlistCompleteDesigns(input(catalog(13)), async r => ({
        ...answer(r),
        answers: {},
      }))
    ).rejects.toThrow("incomplete_answers");
  });

  it("does not truncate an oversized brief or start a partial evaluation", async () => {
    const evaluate = vi.fn();
    await expect(
      shortlistCompleteDesigns(
        { ...input(catalog(13)), brief: "á".repeat(28000) },
        evaluate
      )
    ).rejects.toThrow("context_too_large");
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("stops scheduling and cancels the other in-flight batch after an error", async () => {
    let calls = 0;
    const evaluate = vi.fn(
      async (_r: JevRequest, options: { signal?: AbortSignal }) => {
        calls++;
        if (calls === 1) throw new Error("provider unavailable");
        return new Promise<JevResponse>((_resolve, reject) => {
          options.signal!.addEventListener(
            "abort",
            () => reject(options.signal!.reason),
            { once: true }
          );
        });
      }
    );
    await expect(
      shortlistCompleteDesigns(input(catalog(100)), evaluate)
    ).rejects.toThrow("provider unavailable");
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("honors cancellation before even the small-catalog bypass", async () => {
    await expect(
      shortlistCompleteDesigns({
        ...input(catalog(3)),
        signal: AbortSignal.abort(new Error("cancelled")),
      })
    ).rejects.toThrow("cancelled");
  });

  it("uses the typed System One endpoint and validates the provider response without transport retries", async () => {
    const requests: JevRequest[] = [];
    await shortlistCompleteDesigns(input(catalog(13)), async r => {
      requests.push(r);
      return answer(r);
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => answer(requests[0]) });
    vi.stubGlobal("fetch", fetchMock);
    await evaluateDesignBatch(requests[0], { deadlineMs: Date.now() + 10000 });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/systemone"
    );
    const sent = fetchMock.mock.calls[0][1];
    expect(JSON.parse(sent.body)).toEqual(requests[0]);
    expect(sent.headers.Authorization).toBe("Bearer test-key");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(
      evaluateDesignBatch(requests[0], { deadlineMs: null })
    ).rejects.toThrow("http_503");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(
      evaluateDesignBatch(requests[0], { deadlineMs: Date.now() - 1 })
    ).rejects.toThrow("deadline_exceeded");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
