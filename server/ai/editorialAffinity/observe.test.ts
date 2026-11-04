import { describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard } from "@shared/componentAssembly";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { editorialCatalogProfiles } from "./catalogProfiles";
import { affinityHash, editorialAffinityReceiptSchema } from "./contracts";
import {
  createAffinityObserver,
  affinityInputText,
  safeObserveEditorialAffinity,
  offeredEditorialProfiles,
  observationInputHash,
} from "./observe";
import { EmbeddingEngineError } from "./embeddingEngine";

const profile = editorialCatalogProfiles[0];
function request() {
  const card = compactComponentCard(completeDesignTestDefinitions()[0]);
  card.id = profile.id;
  card.hash = profile.evidence.sourceHash;
  card.roles = ["static"];
  card.completeDesign = {
    ...card.completeDesign!,
    family: profile.familyId,
    baselineVerified: true,
  };
  const input = orchestratedGenerationInputSchema.parse({
    ownerId: "00000000-0000-4000-8000-000000000001",
    idempotencyKey: "affinity",
    content: "Apresente a fotografia do produto com uma frase curta",
    inputType: "text",
    platform: "instagram",
    postMode: "static",
  });
  return { input, cards: [card] };
}
function runtime() {
  const metadata = {
    modelId: "controlled-encoder",
    artifactHash: "a".repeat(64),
  };
  const embed = vi.fn(async () => ({
    vectors: [new Float32Array([1, 0])],
    inputs: [{ tokenCount: 12, usedTokens: 12, truncated: false }],
    metadata,
    latencyMs: 1,
  }));
  const bundle = {
    version: 1,
    scoringVersion: 1,
    model: { dimensions: 2 },
    hash: "b".repeat(64),
    profilesHash: "c".repeat(64),
    references: profile.references.map(r => ({
      profileId: profile.id,
      referenceId: r.id,
      vector: [1, 0],
    })),
  };
  const loaded = { bundle, engine: { metadata, embed } } as any;
  return { embed, loaded, load: vi.fn(async () => loaded) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("editorial shadow isolation", () => {
  it("off never touches model files or interprets the input", async () => {
    const load = vi.fn();
    expect(
      await createAffinityObserver({ mode: "off", load })({} as any)
    ).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it("scores only references offered by the actual source and records hashes, not raw text", async () => {
    const r = runtime(),
      args = request();
    const result = await createAffinityObserver({
      mode: "shadow",
      directory: "/controlled",
      load: r.load,
    })(args);
    expect(result?.status).toBe("scored");
    expect(result?.scores).toHaveLength(1);
    expect(
      result?.scores[0].references.every(r =>
        profile.references
          .find(p => p.id === r.id)!
          .evidenceComponentIds.includes(profile.id)
      )
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain(args.input.content);
    expect(JSON.stringify(result)).not.toContain("/controlled");
    expect(result?.tokenCount).toBe(12);
    expect(
      editorialAffinityReceiptSchema.parse(JSON.parse(JSON.stringify(result)))
    ).toEqual(result);
    expect(r.embed).toHaveBeenCalledWith(
      [args.input.content],
      expect.objectContaining({ kind: "query", overflow: "reject" })
    );
  });

  it("does not reuse a decision when tone/context changes and does not collapse letter case", async () => {
    const r = runtime(),
      args = request();
    const observe = createAffinityObserver({
      mode: "shadow",
      directory: "/controlled",
      load: r.load,
    });
    const first = await observe(args);
    const second = await observe({
      ...args,
      input: { ...args.input, tone: "Sem humor" },
    });
    expect(first?.inputHash).not.toBe(second?.inputHash);
    expect(r.embed).toHaveBeenCalledTimes(2);
    expect(r.load).toHaveBeenCalledOnce();
    expect(
      affinityInputText({ ...args.input, content: "URL com CaseSensitive" })
    ).toBe("URL com CaseSensitive");
    expect(affinityInputText({ ...args.input, inputType: "image" })).toBe(
      args.input.content
    );
    expect(
      observationInputHash({
        ...args,
        imageObligation: {
          policy: "required",
          required: true,
          purpose: "editorial-photo",
          reason: "Explicit",
          slotTargets: 1,
        },
      })
    ).not.toBe(first?.inputHash);
  });

  it("leaves unavailable/changed catalogue identities neutral without loading a model", async () => {
    const r = runtime(),
      args = request();
    args.cards[0].hash = "f".repeat(64);
    expect(offeredEditorialProfiles(args)).toEqual([]);
    const result = await createAffinityObserver({
      mode: "shadow",
      directory: "/controlled",
      load: r.load,
    })(args);
    expect(result).toMatchObject({ status: "unavailable", scores: [] });
    expect(r.load).not.toHaveBeenCalled();
  });

  it("omits URL/image contents until text is available, and never silently cuts a long prompt", async () => {
    const r = runtime(),
      args = request();
    const observe = createAffinityObserver({
      mode: "shadow",
      directory: "/controlled",
      load: r.load,
    });
    expect(
      await observe({
        ...args,
        input: {
          ...args.input,
          inputType: "url",
          content: "https://example.test/content",
        },
      })
    ).toMatchObject({
      status: "insufficient_input",
      reason: "empty",
      scores: [],
    });
    expect(
      await observe({
        ...args,
        input: { ...args.input, content: "x".repeat(24001) },
      })
    ).toMatchObject({
      status: "insufficient_input",
      reason: "input_limit",
      truncated: false,
    });
    expect(r.load).not.toHaveBeenCalled();
  });

  it("sanitizes model failures and rejects too many tokens with no invented scores", async () => {
    const r = runtime(),
      args = request();
    r.embed.mockRejectedValueOnce(new EmbeddingEngineError("token_limit"));
    const observe = createAffinityObserver({
      mode: "shadow",
      directory: "/controlled",
      load: r.load,
    });
    expect(await observe(args)).toMatchObject({
      status: "insufficient_input",
      reason: "token_limit",
      scores: [],
    });
    const failed = await createAffinityObserver({
      mode: "shadow",
      directory: "/controlled",
      load: async () => {
        throw new Error("private prompt and /private/path");
      },
    })(args);
    expect(failed).toMatchObject({
      status: "unavailable",
      reason: "invalid_artifact",
      scores: [],
    });
    expect(JSON.stringify(failed)).not.toMatch(/private/);
  });

  it("bounds timed-out native work: concurrent and later requests stay busy until completion", async () => {
    const r = runtime(),
      args = request();
    const pending = deferred<any>();
    r.embed.mockImplementationOnce(() => pending.promise);
    const observe = createAffinityObserver({
      mode: "shadow",
      directory: "/controlled",
      load: r.load,
      timeoutMs: 15,
    });
    const first = observe(args);
    expect(await observe(args)).toMatchObject({ reason: "busy" });
    expect(await first).toMatchObject({ reason: "timeout", scores: [] });
    expect(await observe(args)).toMatchObject({ reason: "busy" });
    expect(r.embed).toHaveBeenCalledOnce();
    pending.resolve({
      vectors: [new Float32Array([1, 0])],
      inputs: [{ tokenCount: 12, usedTokens: 12, truncated: false }],
    });
    await new Promise(done => setTimeout(done, 0));
    expect((await observe(args))?.status).toBe("scored");
  });

  it("aborts during loading without starting a neural inference", async () => {
    const r = runtime(),
      args = request(),
      pending = deferred<any>();
    const controller = new AbortController();
    const observe = createAffinityObserver({
      mode: "shadow",
      directory: "/controlled",
      load: () => pending.promise,
    });
    const result = observe({ ...args, signal: controller.signal });
    controller.abort();
    expect(await result).toMatchObject({ reason: "aborted" });
    pending.resolve(r.loaded);
    await new Promise(done => setTimeout(done, 0));
    expect(r.embed).not.toHaveBeenCalled();
  });

  it("protects generation even when an observer regresses or returns invalid data", async () => {
    for (const observer of [
      async () => {
        throw new Error("regression");
      },
      async () => ({ status: "scored", scores: [] }) as any,
    ]) {
      const result = await safeObserveEditorialAffinity(request(), observer);
      expect(result).toMatchObject({
        status: "unavailable",
        reason: "invalid_output",
        scores: [],
      });
      expect(result?.inputHash).toBe(observationInputHash(request()));
    }
    expect(affinityHash({ b: 1, a: { d: 2, c: 3 } })).toBe(
      affinityHash({ a: { c: 3, d: 2 }, b: 1 })
    );
  });
});
