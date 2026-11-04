import { describe, expect, it, vi } from "vitest";
import {
  createEmbeddingEngine,
  EmbeddingEngineError,
  type EmbeddingBackend,
  type EmbeddingEngineConfig,
} from "./embeddingEngine";

const config: EmbeddingEngineConfig = {
  modelPath: "/tmp/editorial-affinity-model",
  modelId: "test/multilingual",
  revision: "pinned-revision",
  artifactHash: "a".repeat(64),
  dimensions: 2,
  maxTokens: 4,
  dtype: "q8",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

function backend(overrides: Partial<EmbeddingBackend> = {}): EmbeddingBackend {
  return {
    countTokens: vi.fn(() => 2),
    infer: vi.fn(async () => ({
      hiddenState: {
        dims: [1, 3, 2],
        data: Float32Array.from([1, 0, 0, 1, 999, 999]),
      },
      attentionMask: { dims: [1, 3], data: BigInt64Array.from([1n, 1n, 0n]) },
      release: vi.fn(),
    })),
    dispose: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("local editorial embedding engine", () => {
  it("is fully lazy and does not load a model for metadata, invalid input or unused disposal", async () => {
    const load = vi.fn(async () => backend());
    const engine = createEmbeddingEngine(config, load);
    expect(engine.metadata.modelId).toBe(config.modelId);
    await expect(
      engine.embed(["   "], { kind: "query" })
    ).rejects.toMatchObject({ code: "empty_input" });
    await expect(
      engine.embed(["x".repeat(24_001)], { kind: "query" })
    ).rejects.toMatchObject({ code: "input_too_long" });
    await engine.dispose();
    expect(load).not.toHaveBeenCalled();
  });

  it("pools only attended tokens, normalizes and owns the returned vector after tensor release", async () => {
    const data = Float32Array.from([3, 0, 0, 4, 999, 999]);
    const release = vi.fn(() => data.fill(0));
    const engine = createEmbeddingEngine(config, async () =>
      backend({
        infer: async () => ({
          hiddenState: { dims: [1, 3, 2], data },
          attentionMask: { dims: [1, 3], data: [1, 1, 0] },
          release,
        }),
      })
    );
    const result = await engine.embed(["comparar alternativas"], {
      kind: "query",
    });
    expect(result.vectors[0][0]).toBeCloseTo(0.6);
    expect(result.vectors[0][1]).toBeCloseTo(0.8);
    expect(result.inputs).toEqual([
      { tokenCount: 2, usedTokens: 2, truncated: false },
    ]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(data.every(v => v === 0)).toBe(true);
    await engine.dispose();
  });

  it("preserves case and internal whitespace, normalizes Unicode and applies the model role prefix", async () => {
    const impl = backend();
    const load = vi.fn(async () => impl);
    const engine = createEmbeddingEngine(
      { ...config, queryPrefix: "query: ", referencePrefix: "passage: " },
      load
    );
    await engine.embed(["  Cafe\u0301  Editorial  "], { kind: "query" });
    await engine.embed(["Exemplo"], { kind: "reference" });
    expect(impl.countTokens).toHaveBeenNthCalledWith(
      1,
      "query: Café  Editorial"
    );
    expect(impl.infer).toHaveBeenNthCalledWith(1, "query: Café  Editorial", 4);
    expect(impl.infer).toHaveBeenNthCalledWith(2, "passage: Exemplo", 4);
    expect(load).toHaveBeenCalledTimes(1);
    await engine.dispose();
  });

  it("rejects a long member before starting any inference in its batch", async () => {
    const impl = backend({ countTokens: text => (text === "curto" ? 2 : 5) });
    const engine = createEmbeddingEngine(config, async () => impl);
    await expect(
      engine.embed(["curto", "a instrução decisiva termina depois"], {
        kind: "query",
      })
    ).rejects.toMatchObject({ code: "token_limit", inputIndex: 1 });
    expect(impl.infer).not.toHaveBeenCalled();
    await engine.dispose();
  });

  it("reports actual token truncation only when explicitly allowed", async () => {
    const engine = createEmbeddingEngine(config, async () =>
      backend({
        countTokens: () => 7,
        infer: async () => ({
          hiddenState: { dims: [1, 4, 2], data: [1, 0, 1, 0, 1, 0, 1, 0] },
          attentionMask: { dims: [1, 4], data: [1, 1, 1, 1] },
          release() {},
        }),
      })
    );
    const result = await engine.embed(["um pedido longo"], {
      kind: "query",
      overflow: "truncate",
    });
    expect(result.inputs).toEqual([
      { tokenCount: 7, usedTokens: 4, truncated: true },
    ]);
    await engine.dispose();
  });

  it.each([
    { dims: [1, 2, 2], data: [0, 0, 0, 0] },
    { dims: [1, 2, 2], data: [Number.NaN, 0, 1, 0] },
    { dims: [1, 2, 3], data: [1, 0, 0, 1, 0, 0] },
  ])(
    "rejects invalid hidden states and always releases them (%j)",
    async hiddenState => {
      const release = vi.fn();
      const engine = createEmbeddingEngine(config, async () =>
        backend({
          infer: async () => ({
            hiddenState,
            attentionMask: { dims: [1, 2], data: [1, 1] },
            release,
          }),
        })
      );
      await expect(
        engine.embed(["texto"], { kind: "query" })
      ).rejects.toMatchObject({ code: "invalid_output" });
      expect(release).toHaveBeenCalledTimes(1);
      await engine.dispose();
    }
  );

  it("detects silent tokenizer cuts rather than claiming a complete embedding", async () => {
    const engine = createEmbeddingEngine(config, async () =>
      backend({ countTokens: () => 3 })
    );
    await expect(
      engine.embed(["texto"], { kind: "query" })
    ).rejects.toMatchObject({ code: "invalid_output" });
    await engine.dispose();
  });

  it("limits waiting requests and never overlaps native operations", async () => {
    const entered = deferred<void>();
    const finish = deferred<void>();
    let active = 0;
    let maxActive = 0;
    const impl = backend();
    const defaultInfer = impl.infer;
    impl.infer = vi.fn(async (text, limit) => {
      active++;
      maxActive = Math.max(maxActive, active);
      entered.resolve();
      await finish.promise;
      active--;
      return defaultInfer(text, limit);
    });
    const engine = createEmbeddingEngine(
      { ...config, maxPending: 1 },
      async () => impl
    );
    const first = engine.embed(["primeiro"], { kind: "query" });
    await entered.promise;
    const second = engine.embed(["segundo"], { kind: "query" });
    await expect(
      engine.embed(["terceiro"], { kind: "query" })
    ).rejects.toMatchObject({ code: "busy" });
    finish.resolve();
    await Promise.all([first, second]);
    expect(maxActive).toBe(1);
    expect(impl.infer).toHaveBeenCalledTimes(2);
    await engine.dispose();
  });

  it("aborts queued work without inference and discards active results before releasing the queue", async () => {
    const entered = deferred<void>();
    const finish = deferred<void>();
    const release = vi.fn();
    const impl = backend({
      infer: vi.fn(async () => {
        entered.resolve();
        await finish.promise;
        return {
          hiddenState: { dims: [1, 2, 2], data: [1, 0, 1, 0] },
          attentionMask: { dims: [1, 2], data: [1, 1] },
          release,
        };
      }),
    });
    const engine = createEmbeddingEngine(config, async () => impl);
    const activeAbort = new AbortController();
    const queuedAbort = new AbortController();
    const first = engine.embed(["primeiro"], {
      kind: "query",
      signal: activeAbort.signal,
    });
    await entered.promise;
    const second = engine.embed(["segundo"], {
      kind: "query",
      signal: queuedAbort.signal,
    });
    activeAbort.abort();
    queuedAbort.abort();
    const assertions = Promise.all([
      expect(first).rejects.toMatchObject({ code: "aborted" }),
      expect(second).rejects.toMatchObject({ code: "aborted" }),
    ]);
    finish.resolve();
    await assertions;
    expect(impl.infer).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    await engine.dispose();
  });

  it("waits for admitted work before disposing exactly once, then refuses new work", async () => {
    const entered = deferred<void>();
    const finish = deferred<void>();
    const impl = backend();
    const defaultInfer = impl.infer;
    impl.infer = async (text, limit) => {
      entered.resolve();
      await finish.promise;
      return defaultInfer(text, limit);
    };
    const engine = createEmbeddingEngine(config, async () => impl);
    const work = engine.embed(["texto"], { kind: "query" });
    await entered.promise;
    const disposal = engine.dispose();
    expect(engine.dispose()).toBe(disposal);
    expect(impl.dispose).not.toHaveBeenCalled();
    await expect(
      engine.embed(["outro"], { kind: "query" })
    ).rejects.toMatchObject({ code: "disposed" });
    finish.resolve();
    await work;
    await disposal;
    expect(impl.dispose).toHaveBeenCalledTimes(1);
  });

  it("caches a failed load and exposes no raw provider error, path or prompt", async () => {
    const load = vi.fn(async () => {
      throw new Error("private path, prompt and provider details");
    });
    const engine = createEmbeddingEngine(config, load);
    await expect(engine.embed(["um texto"], { kind: "query" })).rejects.toThrow(
      "editorial_embedding_unavailable"
    );
    await expect(
      engine.embed(["outro texto"], { kind: "query" })
    ).rejects.toThrow("editorial_embedding_unavailable");
    expect(load).toHaveBeenCalledTimes(1);
    await engine.dispose();
  });

  it("rejects nonlocal configuration and fingerprints preprocessing changes", async () => {
    expect(() =>
      createEmbeddingEngine({
        ...config,
        modelPath: "https://huggingface.co/model",
      })
    ).toThrow(EmbeddingEngineError);
    const first = createEmbeddingEngine(config);
    const same = createEmbeddingEngine({
      ...config,
      modelPath: "/tmp/another-location",
      maxPending: 0,
    });
    const changed = createEmbeddingEngine({
      ...config,
      queryPrefix: "query: ",
    });
    expect(first.metadata.fingerprint).toBe(same.metadata.fingerprint);
    expect(first.metadata.fingerprint).not.toBe(changed.metadata.fingerprint);
    expect(Object.isFrozen(first.metadata)).toBe(true);
    await Promise.all([first.dispose(), same.dispose(), changed.dispose()]);
  });
});
