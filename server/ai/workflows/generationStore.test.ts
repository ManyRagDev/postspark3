import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  runWithGenerationTrace,
  type GenerationTrace,
} from "../generationTrace";
import { createGenerationStore } from "./generationStore";
import type { OrchestratedGenerationInput } from "../../../shared/generationRequest";
import type { ProposalDelivery } from "../../../shared/generationContracts";

const requestId = "2f12c2f5-c75e-49e2-a4e9-65296bbac0f1";
const ownerId = "734940f6-a8e7-42d4-a6cb-7d5e61976870";
const input = {
  ownerId,
  inputType: "text",
  content: "brief",
  platform: "instagram",
  postMode: "static",
  creationMode: "ideation",
  idempotencyKey: "key-1",
} as OrchestratedGenerationInput;

function proposal(
  slot: number,
  status: ProposalDelivery["status"] = "planned"
) {
  return {
    contractVersion: 1,
    proposalId: `p-${requestId}-${slot}`,
    runId: requestId,
    slot,
    revision: 1,
    status,
    findings: [],
    diagnostics: [],
  } as ProposalDelivery;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    owner_id: ownerId,
    input,
    input_hash: "a".repeat(64),
    status: "queued",
    experimental: false,
    deadline_at: "2026-10-08T18:10:00.000Z",
    proposals: [proposal(0), proposal(1), proposal(2)],
    billing_mode: "dev_pilot",
    ...overrides,
  };
}

function makeDb(responses: Record<string, unknown> = {}) {
  const rpc = vi.fn(async (name: string) => ({
    data: responses[name] ?? null,
    error: null,
  }));
  return { db: { rpc } as any, rpc };
}

describe("durable generation store", () => {
  it("admits with a stable request/run id and the persisted 10 minute deadline", async () => {
    const { db, rpc } = makeDb({
      generation_admit: { ...row(), created: true },
    });
    const store = createGenerationStore(db);
    const before = Date.now();
    const result = await store.admission({
      ownerId,
      idempotencyKey: "key-1",
      inputHash: "a".repeat(64),
      input,
      experimental: false,
    });

    expect(result.created).toBe(true);
    expect(result.record.id).toBe(requestId);
    expect(result.record.proposals).toHaveLength(3);
    expect(result.record.billingMode).toBe("dev_pilot");
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Date.parse(args.p_deadline_at as string)).toBeGreaterThanOrEqual(
      before + 9 * 60_000
    );
    expect(Date.parse(args.p_deadline_at as string)).toBeLessThanOrEqual(
      before + 10 * 60_000 + 100
    );
  });

  it("claims with the lease token and exposes the persisted snapshot", async () => {
    const token = "a9a9ec5e-206a-4ae0-a0c0-79c75ecb3f84";
    const { db } = makeDb({
      generation_v5_claim: {
        ...row({ status: "running", lease_token: token }),
        leaseToken: token,
      },
    });
    const claimed = await createGenerationStore(db).claim("worker-a");
    expect(claimed?.leaseToken).toBe(token);
    expect(claimed?.record.status).toBe("running");
    expect(claimed?.record.leaseToken).toBe(token);
  });

  it("checkpoints in-flight proposals through the lease-fenced mutation", async () => {
    const { db, rpc } = makeDb({
      generation_v5_lease_update: row({ status: "running" }),
    });
    const store = createGenerationStore(db);
    const record = await store.checkpointProposal(
      requestId,
      "lease",
      proposal(0, "checking")
    );
    expect(record.id).toBe(requestId);
    expect(rpc).toHaveBeenCalledWith(
      "generation_v5_lease_update",
      expect.objectContaining({
        p_lease_token: "lease",
        p_action: "checkpoint",
        p_payload: expect.objectContaining({
          delivery: expect.objectContaining({ status: "checking", slot: 0 }),
        }),
      })
    );
  });

  it("passes owner identity to the authenticated polling lookup", async () => {
    const { db } = makeDb();
    const maybeSingle = vi.fn().mockResolvedValue({ data: row(), error: null });
    const eqOwner = vi.fn(() => ({ maybeSingle }));
    const eqId = vi.fn(() => ({ eq: eqOwner }));
    db.from = vi.fn(() => ({ select: vi.fn(() => ({ eq: eqId })) }));
    const record = await createGenerationStore(db).get(requestId, ownerId);
    expect(record?.id).toBe(requestId);
    expect(eqId).toHaveBeenCalledWith("id", requestId);
    expect(eqOwner).toHaveBeenCalledWith("owner_id", ownerId);
  });

  it("treats a started provider operation as uncertain instead of retrying it", async () => {
    const { db, rpc } = makeDb({
      generation_v5_operation: { state: "uncertain" },
    });
    const outcome = await createGenerationStore(db).beginOperation(
      requestId,
      "lease",
      "slot-0:selection"
    );
    expect(outcome).toEqual({ state: "uncertain" });
    expect(rpc).toHaveBeenCalledWith(
      "generation_v5_operation",
      expect.objectContaining({
        p_action: "begin",
        p_operation_key: "slot-0:selection",
      })
    );
  });

  it.each(["new", "uncertain"] as const)(
    "keeps legacy recent-read compatibility without hiding the %s operation state",
    async state => {
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({
          data: null,
          error: { message: "Only unpaid preparation reads may be replayed" },
        })
        .mockResolvedValueOnce({ data: { state }, error: null });
      const result = await createGenerationStore({ rpc } as any).beginOperation(
        requestId,
        "lease",
        "prepare:recent_selections",
        true
      );
      expect(result).toEqual({ state });
      expect(rpc.mock.calls.map(([, args]) => args.p_action)).toEqual([
        "begin_safe",
        "begin",
      ]);
      for (const [, args] of rpc.mock.calls) {
        expect(args).toMatchObject({
          p_id: requestId,
          p_lease_token: "lease",
          p_operation_key: "prepare:recent_selections",
        });
      }
    }
  );

  it.each(["prepare:catalog", "prepare:selection", "proposal-0:copy"])(
    "never downgrades a replay-policy rejection for %s",
    async operationKey => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Only unpaid preparation reads may be replayed" },
      });
      await expect(
        createGenerationStore({ rpc } as any).beginOperation(
          requestId,
          "lease",
          operationKey,
          true
        )
      ).rejects.toThrow("Only unpaid preparation reads may be replayed");
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  );

  it("does not retry a recent-read operation after lease loss", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "Generation lease lost" },
    });
    await expect(
      createGenerationStore({ rpc } as any).beginOperation(
        requestId,
        "lease",
        "prepare:recent_selections",
        true
      )
    ).rejects.toThrow("Generation lease lost");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

it.each(["ok", "db_error", "network_error"])(
  "uses the real Supabase JSONB encoding and records %s history evidence without stopping generation",
  async outcome => {
    const requests: URL[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      requests.push(new URL(String(url)));
      if (outcome === "network_error")
        throw new Error("private network detail");
      return new Response(
        JSON.stringify(
          outcome === "db_error"
            ? { code: "22P02", message: "private DB detail" }
            : []
        ),
        {
          status: outcome === "db_error" ? 400 : 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    });
    const db = createClient("https://test.invalid", "test-key", {
      db: { schema: "postspark" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fetcher as typeof fetch },
    });
    const trace = { calls: [], events: [] } as unknown as GenerationTrace;
    const result = await runWithGenerationTrace(trace, () =>
      createGenerationStore(db as any).recentSelections(ownerId, requestId)
    );
    expect(result).toEqual([]);
    expect(requests[0].searchParams.get("proposals")).toBe(
      'cs.[{"status":"ready"}]'
    );
    expect(requests[0].searchParams.get("owner_id")).toBe(`eq.${ownerId}`);
    expect(requests[0].searchParams.get("id")).toBe(`neq.${requestId}`);
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]).toMatchObject({
      stage: "recent_selections",
      status: outcome === "ok" ? "completed" : "fallback",
      data: { historyAvailable: outcome === "ok", returnedRequests: 0 },
    });
    expect(JSON.stringify(trace.events)).not.toContain("private");
  }
);

it("reads operation evidence only after confirming request ownership", async () => {
  let owned = false;
  const reads: { table: string; calls: unknown[][] }[] = [];
  const db: any = {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      const calls: unknown[][] = [];
      reads.push({ table, calls });
      const query: any = {
        select: (...args: unknown[]) => {
          calls.push(["select", ...args]);
          return query;
        },
        eq: (...args: unknown[]) => {
          calls.push(["eq", ...args]);
          return query;
        },
        maybeSingle: async () => ({
          data: owned ? { id: requestId } : null,
          error: null,
        }),
        then: (resolve: any) =>
          Promise.resolve({
            data: [
              {
                operation_key: "p:copy",
                state: "completed",
                result: { id: "receipt" },
              },
            ],
            error: null,
          }).then(resolve),
      };
      return query;
    }),
  };
  const store = createGenerationStore(db);
  expect(await store.listOperations(requestId, ownerId)).toEqual([]);
  expect(reads.map(read => read.table)).toEqual(["generation_v5_requests"]);
  expect(reads[0].calls).toContainEqual(["eq", "owner_id", ownerId]);
  owned = true;
  expect(await store.listOperations(requestId, ownerId)).toEqual([
    { operationKey: "p:copy", state: "completed", result: { id: "receipt" } },
  ]);
});

it("bounds recent delivered selections to the owner and excludes the active request without returning inputs or draft definitions", async () => {
  const { completeDesignTestDefinitions } = await import(
    "../../../shared/completeDesignGeneration.fixture"
  );
  const { instantiateCompleteDesign } = await import(
    "../../../shared/completeDesignGeneration"
  );
  const { resolveArsenalGeometry } = await import(
    "../../../shared/arsenalGeometry"
  );
  const definition = completeDesignTestDefinitions()[0];
  const composition = resolveArsenalGeometry(
    instantiateCompleteDesign({
      definition,
      values: [
        { fieldId: "field-0", value: "Evento" },
        { fieldId: "field-1", value: "Hoje" },
      ],
      mediaPrompts: [],
      runId: requestId,
      slot: 0,
      slide: 0,
      planHash: "a".repeat(64),
      experimental: true,
    }),
    { measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }) }
  );
  const ready = {
    ...proposal(0),
    status: "ready",
    bundle: {
      schemaVersion: 1,
      pipeline: "complete-design-v1",
      traceId: requestId,
      runId: requestId,
      slot: 0,
      name: "Design",
      reason: "Native",
      family: definition.completeDesign!.family,
      visualPreference: { enabled: false, language: null, intensity: "auto" },
      caption: "Private",
      hashtags: [],
      slides: [{ id: "slide", role: "static", composition }],
    },
  };
  const calls: unknown[][] = [];
  const query: any = {
    select: (...a: unknown[]) => {
      calls.push(["select", ...a]);
      return query;
    },
    eq: (...a: unknown[]) => {
      calls.push(["eq", ...a]);
      return query;
    },
    neq: (...a: unknown[]) => {
      calls.push(["neq", ...a]);
      return query;
    },
    in: (...a: unknown[]) => {
      calls.push(["in", ...a]);
      return query;
    },
    contains: (...a: unknown[]) => {
      calls.push(["contains", ...a]);
      return query;
    },
    order: (...a: unknown[]) => {
      calls.push(["order", ...a]);
      return query;
    },
    limit: (...a: unknown[]) => {
      calls.push(["limit", ...a]);
      return query;
    },
    then: (resolve: any) =>
      Promise.resolve({
        data: [
          {
            id: "old-run",
            proposals: [ready, proposal(1, "failed")],
            input: "private-brief",
          },
        ],
        error: null,
      }).then(resolve),
  };
  const store = createGenerationStore({
    rpc: vi.fn(),
    from: vi.fn(() => query),
  } as any);
  const recent = await store.recentSelections(ownerId, requestId);
  expect(recent).toEqual([
    {
      requestId: "old-run",
      selections: [
        {
          family: definition.completeDesign!.family,
          designIds: [definition.id],
        },
      ],
    },
  ]);
  expect(calls).toEqual(
    expect.arrayContaining([
      ["eq", "owner_id", ownerId],
      ["neq", "id", requestId],
      ["limit", 5],
      ["contains", "proposals", JSON.stringify([{ status: "ready" }])],
    ])
  );
  expect(JSON.stringify(recent)).not.toMatch(
    /private|experimental|pieces|composition/
  );
});
