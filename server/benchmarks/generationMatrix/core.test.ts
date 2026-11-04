import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMatrixArgs, matrixPlan, blindReport } from "./core";
import {
  MatrixBudget,
  installMatrixTransport,
  reserveQuote,
  paidOperationScope,
  type PriceQuote,
} from "./budget";
import { localJournal, writeJson } from "./journal";
import {
  inspectMatrixCampaign,
  loadContinuationOrigin,
} from "./campaignAnalysis";
import {
  runWithGenerationTrace,
  recordLlmTraceCall,
  type GenerationTrace,
} from "../../ai/generationTrace";

afterEach(() => {
  vi.unstubAllGlobals();
});
const quote: PriceQuote = {
  id: "openai/gpt-6.1-sol",
  context_length: 1_000_000,
  pricing: { prompt: "0.000002", completion: "0.00001" },
  top_provider: { max_completion_tokens: 10000 },
};
const trace = (): GenerationTrace => ({
  id: "test",
  userUuid: "offline-test",
  inputType: "text",
  inputContent: "synthetic",
  platform: "instagram",
  postMode: "static",
  creationMode: "ideation",
  requestedModel: quote.id,
  startedAt: Date.now(),
  calls: [],
  events: [],
});

describe("generation matrix orchestration (offline controlled transports)", () => {
  it("confines receipt replay to a separate shared-budget phase for the original single GPT arm", () => {
    const args = [
      "--selection-replay",
      "/tmp/receipt.json",
      "--shared-budget",
      "/tmp/budget.json",
      "--campaign-id",
      "new-phase",
      "--cases",
      "five-items",
      "--arms",
      "s2-gpt",
    ];
    expect(parseMatrixArgs(args).selectionReplay).toBe("/tmp/receipt.json");
    expect(() => parseMatrixArgs([...args, "--resume"])).toThrow(
      "one_new_shared_budget"
    );
    expect(() => parseMatrixArgs([...args, "--repeats", "2"])).toThrow(
      "one_new_shared_budget"
    );
    expect(() =>
      parseMatrixArgs(["--selection-replay", "/tmp/receipt.json"])
    ).toThrow("one_new_shared_budget");
  });
  it("pins a single requested arm without changing its deterministic identity or default concurrency", () => {
    const full = parseMatrixArgs(["--cases", "five-items"]);
    const selected = parseMatrixArgs([
      "--cases",
      "five-items",
      "--arms",
      "s2-gpt",
      "--proposal-concurrency",
      "1",
    ]);
    expect(matrixPlan(selected)).toEqual(
      matrixPlan(full).filter(e => e.strategy === 2 && e.choice === "gpt")
    );
    expect(selected.proposalConcurrency).toBe(1);
    expect(full.proposalConcurrency).toBeUndefined();
    expect(() => parseMatrixArgs(["--arms", "s2-gpt,s2-gpt"])).toThrow(
      "duplicate matrix arm"
    );
    expect(() => parseMatrixArgs(["--arms", "s3-gpt"])).toThrow("matrix arm");
    expect(() => parseMatrixArgs(["--proposal-concurrency", "4"])).toThrow(
      "proposal-concurrency"
    );
  });
  it("defaults to 36 dry-run executions and requires explicit live limits and pinned catalogs", () => {
    const options = parseMatrixArgs([]);
    expect(options.live).toBe(false);
    const plan = matrixPlan(options);
    expect(plan).toHaveLength(36);
    expect(new Set(plan.map(p => p.runId)).size).toBe(36);
    expect(matrixPlan(options)).toEqual(plan);
    expect(() => parseMatrixArgs(["--live"])).toThrow("Live requires");
    expect(() => parseMatrixArgs(["--max-usd", "NaN"])).toThrow(
      "Invalid positive"
    );
    expect(() => parseMatrixArgs(["--max-calls", "0"])).toThrow(
      "Invalid positive"
    );
    expect(() => parseMatrixArgs(["--cases", "nonexistent"])).toThrow(
      "Unknown"
    );
    expect(() =>
      parseMatrixArgs([
        "--continue-from",
        "/tmp/original",
        "--out",
        "/tmp/original/nested",
      ])
    ).toThrow("new_output_directory");
  });
  it("writes a report with encoded user text and no model/config identity", () => {
    const html = blindReport([
      {
        id: "Peça-123",
        caseId: "serious",
        prompt: "<script>escape</script>",
        caption: "Texto",
        images: ["art/piece.png"],
        ready: true,
      },
    ]);
    expect(html).not.toMatch(/gemini|gpt|strategy|baseline|revised/i);
    expect(html).toContain("&lt;script&gt;escape&lt;/script&gt;");
    expect(html).toContain("human-ratings.json");
  });
  it("serializes durable accounting while real effects overlap within the total reservation", async () => {
    const persisted: number[] = [];
    const budget = new MatrixBudget(1, 2, [], async calls => {
      persisted.push(calls.length);
    });
    let active = 0,
      maximum = 0,
      release!: () => void;
    const barrier = new Promise<void>(resolve => {
      release = resolve;
    });
    const effect = () =>
      budget.run("model", 0.4, async () => {
        active++;
        maximum = Math.max(maximum, active);
        await barrier;
        active--;
        return { result: "real-effect-simulated", actualUsd: 0.3 };
      });
    const pending = Promise.all([effect(), effect()]);
    await vi.waitFor(() => expect(maximum).toBe(2));
    expect(budget.committedUsd).toBe(0.8);
    expect(persisted).toEqual([1, 2]);
    release();
    expect(await pending).toEqual([
      "real-effect-simulated",
      "real-effect-simulated",
    ]);
    await expect(effect()).rejects.toThrow("before_dispatch");
    expect(budget.calls).toHaveLength(2);
    expect(budget.committedUsd).toBe(0.6);
    expect(budget.interruption?.reason).toBe("budget_exhausted");
  });
  it("halts the campaign on a concurrent reservation denial without cancelling a dispatched sibling", async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
      release = resolve;
    });
    const budget = new MatrixBudget(1, 10, [], async () => {}),
      sent = vi.fn();
    const first = budget.run("model", 0.6, async () => {
      sent();
      await barrier;
      return { result: "completed", actualUsd: 0.1 };
    });
    await vi.waitFor(() => expect(sent).toHaveBeenCalledOnce());
    await expect(
      budget.run("model", 0.6, async () => {
        sent();
        return { result: null };
      })
    ).rejects.toThrow("before_dispatch");
    release();
    expect(await first).toBe("completed");
    await expect(
      budget.run("model", 0.01, async () => {
        sent();
        return { result: null };
      })
    ).rejects.toThrow("campaign_stopped");
    expect(sent).toHaveBeenCalledOnce();
    expect(budget.committedUsd).toBe(0.1);
  });
  it("does not record or send an already-aborted queued effect", async () => {
    const budget = new MatrixBudget(1, 2, [], async () => {}),
      effect = vi.fn();
    await expect(
      budget.run("model", 0.2, effect, AbortSignal.abort())
    ).rejects.toThrow();
    expect(effect).not.toHaveBeenCalled();
    expect(budget.calls).toHaveLength(0);
  });
  it("retains an uncertain reservation on missing usage/network failure and on resume", async () => {
    const budget = new MatrixBudget(1, 5, [], async () => {});
    await expect(
      budget.run("model", 0.6, async () => {
        throw new Error("network");
      })
    ).rejects.toThrow("network");
    const resumed = new MatrixBudget(
      1,
      5,
      JSON.parse(JSON.stringify(budget.calls)),
      async () => {}
    );
    await expect(
      resumed.run("model", 0.6, async () => ({ result: null }))
    ).rejects.toThrow("before_dispatch");
    expect(resumed.committedUsd).toBe(0.6);
  });
  it("budgets actual OpenRouter transport shapes including a retry, with provider price ceilings", async () => {
    const upstream = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id: "fake-receipt", usage: { cost: 0.01 } }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", upstream);
    const budget = new MatrixBudget(10, 1, [], async () => {});
    const restore = installMatrixTransport(
      budget,
      new Map([[quote.id, quote]])
    );
    try {
      const request = {
        method: "POST",
        body: JSON.stringify({
          model: quote.id,
          messages: [{ role: "user", content: "Synthetic case" }],
          max_tokens: 1000,
          provider: { data_collection: "deny" },
        }),
      };
      await paidOperationScope.run("fake-unit:copy", () =>
        fetch("https://openrouter.ai/api/v1/chat/completions", request)
      );
      await expect(
        fetch("https://openrouter.ai/api/v1/chat/completions", request)
      ).rejects.toThrow("before_dispatch");
      expect(upstream).toHaveBeenCalledTimes(1);
      const sent = JSON.parse((upstream.mock.calls[0] as any)[1].body);
      expect(sent.provider).toEqual({
        data_collection: "deny",
        max_price: { prompt: 2, completion: 10 },
      });
      expect(budget.calls[0].operation).toBe("fake-unit:copy");
      expect(budget.knownUsd).toBe(0.01);
      expect(budget.calls[0].httpStatus).toBe(200);
      await expect(
        fetch("https://image.pollinations.ai/prompt/test")
      ).rejects.toThrow("outside_openrouter_blocked");
      await expect(
        fetch("https://api.openai.com/v1/chat/completions", { method: "POST" })
      ).rejects.toThrow("outside_openrouter_blocked");
      await expect(
        fetch("https://unquoted-provider.example/generate", { method: "POST" })
      ).rejects.toThrow("outside_openrouter_blocked");
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(
        reserveQuote(
          {
            model: quote.id,
            messages: [{ image_url: "data:image/png;base64,AA" }],
            max_tokens: 1000,
          },
          quote
        ).usd
      ).toBeGreaterThan(4);
    } finally {
      restore();
    }
  });
  it("retains HTTP status and a response header ID even when the provider body is unreadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("broken upstream body", {
            status: 502,
            headers: {
              "x-generation-id": "controlled-metadata-id",
              "x-request-id": "controlled-request-id",
            },
          })
      )
    );
    const budget = new MatrixBudget(10, 2, [], async () => {}),
      restore = installMatrixTransport(budget, new Map([[quote.id, quote]]));
    try {
      await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model: quote.id, messages: [], max_tokens: 10 }),
      });
      expect(budget.calls[0]).toMatchObject({
        status: "uncertain",
        httpStatus: 502,
        providerId: "controlled-metadata-id",
        requestId: "controlled-request-id",
        bodyReadError: "SyntaxError",
      });
      expect(budget.calls[0].actualUsd).toBeUndefined();
    } finally {
      restore();
    }
  });
  it("analyzes an interrupted campaign without releasing reservations or altering original artifacts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "postspark-campaign-")),
      operator = join(directory, "operator");
    await mkdir(join(operator, "used", "operations"), { recursive: true });
    try {
      await writeJson(join(operator, "manifest.json"), {
        version: 1,
        maxUsd: 4,
        maxCalls: 80,
        fingerprint: "original",
        entries: [{ id: "used" }, { id: "untouched" }],
      });
      await writeJson(join(operator, "paid-calls.json"), [
        {
          operation: "used:copy",
          model: "controlled",
          startedAt: "2026-11-01T20:00:00Z",
          reservedUsd: 1,
          status: "started",
        },
      ]);
      await writeJson(join(operator, "used", "operations", "copy.json"), {
        operationKey: "copy",
        state: "started",
      });
      await writeJson(join(operator, "used", "operations", "review.json"), {
        operationKey: "review:initial:hash",
        state: "started",
      });
      const before = await readFile(join(operator, "paid-calls.json"), "utf8"),
        analysis = await inspectMatrixCampaign(directory);
      expect(analysis).toMatchObject({
        exercised: 1,
        planned: 2,
        knownUsd: 0,
        unknownReservedUsd: 1,
        remaining: { usd: 3, calls: 79 },
      });
      expect(analysis.units[0].operations.map(o => o.reuse).sort()).toEqual([
        "do_not_repeat_dispatched_effect",
        "no_paid_dispatch_recorded",
      ]);
      const inherited = await loadContinuationOrigin(directory),
        next = new MatrixBudget(4, 80, inherited.calls, async () => {});
      expect(next.committedUsd).toBe(1);
      expect(await readFile(join(operator, "paid-calls.json"), "utf8")).toBe(
        before
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("replays local completed operations and refuses an uncertain effect after a process restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "postspark-matrix-"));
    const budget = new MatrixBudget(1, 4, [], async () => {});
    try {
      const first = await localJournal(directory, "unit", budget);
      const generated = vi.fn(async () =>
        budget.run("model", 0.1, async () => ({
          result: { value: "controlled fake" },
          actualUsd: 0.01,
        }))
      );
      expect(
        await runWithGenerationTrace(trace(), () =>
          first.execute("copy", generated)
        )
      ).toEqual({ value: "controlled fake" });
      await expect(
        runWithGenerationTrace(trace(), () =>
          first.execute("repair", () =>
            budget.run("model", 0.1, async () => {
              throw new Error("uncertain fake");
            })
          )
        )
      ).rejects.toThrow("uncertain fake");
      const resumed = await localJournal(directory, "unit", budget);
      await runWithGenerationTrace(trace(), () =>
        resumed.execute("copy", generated)
      );
      await expect(
        runWithGenerationTrace(trace(), () =>
          resumed.execute("repair", generated)
        )
      ).rejects.toThrow("uncertain_operation");
      expect(generated).toHaveBeenCalledOnce();
      expect(budget.calls).toHaveLength(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
