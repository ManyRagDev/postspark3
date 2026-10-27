import { resolveReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";
import { editorialContextV7 } from "./editorialContextV7";
import { healthyReviewV7Fixture } from "./proposalReviewV7.fixture";
/** Diagnostic only: real LLM transport/runtime/PostgreSQL RPC; simulated HTTP and pixels. No remote I/O. */
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
import { ENV } from "../../_core/env";
import { invokeLLM } from "../../_core/llm";
import { durableOperations } from "./generationRuntime";
import { generationPostgresFixture } from "./generationPostgres.fixture";
import { reviewProposal } from "./proposalReview";
import { resolveReviewExecutionConfig } from "./proposalReviewV6";
import { instantiateCompleteDesign } from "@shared/completeDesignGeneration";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { resolveArsenalGeometry } from "@shared/arsenalGeometry";
import { reviewFailureCode } from "@shared/proposalReviewFailure";
import { assertReviewExecutionConfig } from "./reviewExecutionConfig";
import { summarizeGenerationJournal } from "./generationJournalTrace";
vi.mock("../../_core/operationalLog", () => ({
  appendOperationalLog: vi.fn(async () => {}),
}));
const owner = "11111111-1111-4111-8111-111111111111";
const source = "Café Horizonte funciona de segunda a sexta.";
const definition = completeDesignTestDefinitions()[0];
const env = { ...ENV };
let pg: Awaited<ReturnType<typeof generationPostgresFixture>>;
let serial = 0;
beforeAll(async () => {
  pg = await generationPostgresFixture(owner);
});
afterAll(async () => {
  await pg.close();
});
beforeEach(() => {
  ENV.openRouterApiKey = "dummy-never-sent";
  ENV.openRouterProposalReviewModel = "google/gemini-3.8-flash";
  ENV.llmTransientRetries = 0;
  ENV.aiModelFallbackEnabled = false;
});
afterEach(async () => {
  Object.assign(ENV, env);
  vi.unstubAllGlobals();
  // Isolated fixture cleanup, same pattern as the existing carousel PostgreSQL tests.
  await pg.query(
    "update postspark.generation_v5_requests set status='failed' where status in ('queued','running')"
  );
});
async function scalar(sql: string, values: any[] = []) {
  return (await pg.query<any>(sql, values)).rows[0]?.value;
}
async function setup(policy:6|7=6) {
  const id = `30000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`;
  const payload = {
    ownerId: owner,
    inputType: "text",
    content: source,
    platform: "instagram",
    postMode: "static",
    creationMode: "ideation",
    idempotencyKey: id,
  };
  await scalar(
    "select postspark.generation_v5_admit($1,$2,$3,$4,$5::jsonb,false,now()+interval '10 minutes') value",
    [id, owner, id, "a".repeat(64), JSON.stringify(payload)]
  );
  const claimed = await scalar(
    "select postspark.generation_v5_claim('offline-diagnostic') value"
  );
  expect(claimed.id).toBe(id);
  const token = claimed.leaseToken;
  const operation = async (key: string, action: string, result?: any) =>
    scalar(
      "select postspark.generation_v5_operation($1,$2,$3,$4,$5::jsonb) value",
      [
        id,
        token,
        key,
        action,
        result === undefined ? null : JSON.stringify(result),
      ]
    );
  const store: any = {
    beginOperation: async (_id: string, _lease: string, key: string) =>
      operation(key, "begin"),
    persistOperationResult: async (
      _id: string,
      _lease: string,
      key: string,
      result: any
    ) => {
      const saved = await operation(key, "complete", result);
      if (saved.state !== "completed") throw new Error("not_committed");
    },
    markOperationUncertain: async (_id: string, _lease: string, key: string) =>
      operation(key, "uncertain"),
  };
  const copy: any = {
    caption: "",
    hashtags: [],
    editorialPlan: {
      version: 1,
      mode: "compose",
      centralMessage: source,
      facts: [
        { id: "fact1", sourceQuote: source, meaning: "Dias de funcionamento" },
      ],
      protectedEntities: [],
      slides: [{ slideIndex: 0, purpose: "Informar", factIds: ["fact1"] }],
    },
    slides: [
      {
        values: [
          { fieldId: "field-0", value: "Café Horizonte" },
          { fieldId: "field-1", value: source },
        ],
        mediaPrompts: [],
      },
    ],
  };
  const compile = () =>
    resolveArsenalGeometry(
      instantiateCompleteDesign({
        definition,
        values: copy.slides[0].values,
        mediaPrompts: [],
        runId: id,
        slot: 0,
        slide: 0,
        planHash: "a".repeat(64),
        experimental: true,
      }),
      { measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }) }
    );
  const input: any = {
    requestId: id,
    runId: id,
    proposalId: "diagnostic-proposal",
    slot: 0,
    prompt: source,
    reviewPolicyVersion: policy,
    reviewExecutionConfig: policy===7?resolveReviewExecutionConfigV7():resolveReviewExecutionConfig(),
    postMode: "static",
  };
  if(policy===7)input.editorialContextHash=editorialContextV7(input, input.reviewExecutionConfig?.editorialGuidanceVersion).hash;
  let pixelVersion = 1;
  const operations = async () =>
    (
      await pg.query<any>(
        "select operation_key,state,result from postspark.generation_v5_operations where request_id=$1 order by operation_key",
        [id]
      )
    ).rows;
  const controller = new AbortController();
  input.signal = controller.signal;
  const execute = durableOperations(
    store,
    { id, ownerId: owner, deadlineAt: Date.now() + 600000 } as any,
    token,
    controller.signal,
    `${input.proposalId}:`
  );
  const deps: any = {
    actor: owner,
    generateText: invokeLLM,
    renderReviewScenes: async () => [
      {
        slideIndex: 0,
        dataUri: `data:image/png;base64,${Buffer.from(`fixture-pixels-${pixelVersion}`).toString("base64")}`,
        renderer: "CanvasPostStage",
        width: 1080,
        height: 1350,
      },
    ],
    executeOperation: async ({ operationKey }: any, work: any) =>
      execute(operationKey, work),
    reviewOperations: async () =>
      (await operations()).map(r => ({
        operationKey: r.operation_key.slice(input.proposalId.length + 1),
        state: r.state,
        result: r.result,
      })),
    reviewRepairOperationKeys: async () =>
      (await operations())
        .filter(r => r.operation_key.includes(":review_evidence_repair:"))
        .map(r => r.operation_key.slice(input.proposalId.length + 1)),
  };
  return {
    id,
    input,
    copy,
    deps,
    operations,
    controller,
    store,
    token,
    setPixels: (n: number) => {
      pixelVersion = n;
    },
    run: (round: "initial" | "recheck" = "initial") =>
      reviewProposal(input, deps, [definition], [compile()], copy, round),
  };
}
function valid(args: any) {
  if(args.messages.some((m:any)=>typeof m.content==="string"&&m.content.includes("postspark.review.v7")))return healthyReviewV7Fixture(args);
  const data = JSON.parse(
    args.messages.find((m: any) => m.role === "user").content[0].text
  );
  const ids = data.anchors.slice(0, 2).map((a: any) => a.alias);
  const coverage = {
    factId: "fact1",
    status: "covered",
    evidenceIds: ids,
    materiality: "essential",
  };
  return {
    outcome: "reviewed",
    reviewedSlides: [0],
    findings: [],
    limitation: "",
    factCoverage: [coverage],
    sourceCoverage: [
      { ...coverage, sourceQuote: source, meaning: "Dias de funcionamento" },
    ],
  };
}
function simulate(
  make: (
    args: any,
    n: number
  ) =>
    | { content: string; finish?: string }
    | Promise<{ content: string; finish?: string }>
) {
  const payloads: any[] = [];
  const fetch = vi.fn(async (_url: any, init: any) => {
    const args = JSON.parse(init.body);
    payloads.push(args);
    const { content, finish = "stop" } = await make(args, payloads.length);
    return new Response(
      JSON.stringify({
        id: `simulated-${payloads.length}`,
        model: ENV.openRouterProposalReviewModel,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: finish,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          cost: 0.001,
        },
      }),
      { status: 200 }
    );
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, payloads };
}

it.each([
  ["length", '{"outcome":', "length"],
  ["invalid JSON", "invalid-json", "stop"],
  ["schema mismatch", '{"outcome":"reviewed"}', "stop"],
] as const)(
  "persists %s through real transport/RPC before its single repair; restart never repurchases",
  async (_name, text, finish) => {
    const s = await setup();
    const h = simulate((args, n) =>
      n === 1
        ? { content: text, finish }
        : { content: JSON.stringify(valid(args)) }
    );
    const result = await s.run();
    const ops = await s.operations();
    expect(result.status, result.limitation).toBe("passed");
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(ops).toHaveLength(2);
    expect(ops.every(r => r.state === "completed")).toBe(true);
    expect(
      ops.find(r => r.operation_key.includes(":review:"))!.result.choices[0]
        .message.content
    ).toBe(text);
    s.deps.reviewRepairBudget = new Set();
    s.deps.reviewOperationCache = new Map();
    expect(await s.run()).toEqual(result);
    expect(h.fetch).toHaveBeenCalledTimes(2);
    const summary = summarizeGenerationJournal(
      ops.map(r => ({
        operationKey: r.operation_key,
        state: r.state,
        result: r.result,
      }))
    );
    expect(summary.calls).toHaveLength(2);
    expect(summary.unknownCostOperations).toEqual([]);
    expect(summary.calls.reduce((n, c) => n + c.estimatedCostUsd, 0)).toBe(
      0.002
    );
  }
);

it("blocks changed initial hash before another purchase, including concurrent same-lease entries", async () => {
  const s = await setup();
  const h = simulate(args => ({ content: JSON.stringify(valid(args)) }));
  expect((await s.run()).status).toBe("passed");
  s.setPixels(2);
  const results = await Promise.allSettled([s.run(), s.run(), s.run()]);
  expect(
    results.every(
      r =>
        r.status === "rejected" &&
        r.reason.failure?.code === "preparation_contract_incompatible"
    )
  ).toBe(true);
  expect(h.fetch).toHaveBeenCalledTimes(1);
  expect(await s.operations()).toHaveLength(1);
});

it("rejects missing/corrupted pinning before rendering or dispatch", async () => {
  const s = await setup();
  const render = vi.fn(s.deps.renderReviewScenes);
  s.deps.renderReviewScenes = render;
  const h = simulate(args => ({ content: JSON.stringify(valid(args)) }));
  const original = structuredClone(s.input.reviewExecutionConfig);
  for (const config of [
    undefined,
    { ...original, configurationHash: "f".repeat(64) },
    { ...original, temperature: 0.7 },
    { ...original, resolvedModel: "another/model" },
  ]) {
    s.input.reviewExecutionConfig = config;
    await expect(s.run()).rejects.toMatchObject({
      failure: { code: "preparation_contract_incompatible" },
    });
  }
  expect(h.fetch).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
  expect(await s.operations()).toEqual([]);
});

it("pins the complete fingerprint including timeout and uses saved configuration when process timeout changes", async () => {
  const s = await setup();
  const original = s.input.reviewExecutionConfig;
  ENV.proposalReviewTimeoutMs += 1;
  const changed = resolveReviewExecutionConfig();
  expect(changed.configurationHash).not.toBe(original.configurationHash);
  expect(changed.contractHash).toBe(original.contractHash);
  expect(assertReviewExecutionConfig(original)).toEqual(original);
  const h = simulate(args => ({ content: JSON.stringify(valid(args)) }));
  expect((await s.run()).status).toBe("passed");
  expect(h.fetch).toHaveBeenCalledTimes(1);
});

it("retains initial standard profile after a recheck grows beyond its original anchor threshold", async () => {
  const s = await setup();
  const h = simulate(args => ({ content: JSON.stringify(valid(args)) }));
  expect((await s.run()).status).toBe("passed");
  s.copy.slides[0].values[1].value = `${source} ${"texto ".repeat(1900)}`;
  expect((await s.run("recheck")).status).toBe("passed");
  expect(h.payloads.map(p => p.max_tokens)).toEqual([9216, 9216]);
});

it.each([
  "sourceQuote",
  "reviewedSlides",
  "factCoverage",
  "sourceCoverage",
  "alias",
] as const)(
  "repairs formal %s once with a known durable receipt",
  async defect => {
    const s = await setup();
    const h = simulate((args, n) => {
      const body: any = valid(args);
      if (n === 1) {
        if (defect === "sourceQuote")
          body.findings = [
            {
              category: "aesthetic",
              slideIndex: 0,
              fieldId: "field-0",
              expected: "",
              sourceQuote: "Frase ausente da fonte.",
              explanation: "Fixture: bad source quote",
              action: "none",
              effect: "advisory",
              evidenceIds: ["e1"],
            },
          ];
        if (defect === "reviewedSlides") body.reviewedSlides = [];
        if (defect === "factCoverage") body.factCoverage = [];
        if (defect === "sourceCoverage") body.sourceCoverage = [];
        if (defect === "alias") body.factCoverage[0].evidenceIds = ["e999"];
      }
      return { content: JSON.stringify(body) };
    });
    const result = await s.run();
    expect(result.status, result.limitation).toBe("passed");
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(await s.operations()).toHaveLength(2);
  }
);

it("rejects divergent stored context before accepting or repairing the response", async () => {
  const s = await setup();
  const execute = s.deps.executeOperation;
  s.deps.executeOperation = async (params: any, work: any) =>
    execute(params, async () => {
      const r = await work();
      r.__proposalReview.configurationHash = "0".repeat(64);
      r.__proposalReview.aliasMap = { e1: "bad-anchor" };
      return r;
    });
  const h = simulate(args => ({ content: JSON.stringify(valid(args)) }));
  await expect(s.run()).rejects.toMatchObject({
    failure: { code: "preparation_contract_incompatible" },
  });
  expect(h.fetch).toHaveBeenCalledTimes(1);
  expect(await s.operations()).toHaveLength(1);
});

it("repairs no semantic inconclusion and leaves supported aesthetic preference advisory", async () => {
  const s = await setup();
  const h = simulate(args => ({
    content: JSON.stringify({
      ...valid(args),
      outcome: "inconclusive",
      limitation: "Semantics not confirmed",
    }),
  }));
  expect((await s.run()).limitation).toBe(
    "proposal_review_semantic_inconclusive"
  );
  expect(h.fetch).toHaveBeenCalledTimes(1);
  const t = await setup();
  const g = simulate(args => ({
    content: JSON.stringify({
      ...valid(args),
      findings: [
        {
          category: "aesthetic",
          slideIndex: 0,
          fieldId: "field-0",
          expected: "",
          sourceQuote: "",
          explanation: "Fixture: prefer another title rhythm",
          action: "none",
          effect: "advisory",
          evidenceIds: ["e1"],
        },
      ],
    }),
  }));
  expect((await t.run()).status).toBe("passed");
  expect(g.fetch).toHaveBeenCalledTimes(1);
});

it("preserves semantic missing/uncertain and blocks unsupported essential coverage", async () => {
  const s = await setup();
  s.copy.slides[0].values[1].value = "Conheça a cafeteria.";
  const h = simulate(args => {
    const body = valid(args);
    for (const row of [...body.factCoverage, ...body.sourceCoverage] as any[])
      Object.assign(row, {
        status: "missing",
        evidenceIds: [],
        missingSourceQuote: "de segunda a sexta",
        explanation: "Dias omitidos",
        materialityReason: "Condição essencial",
      });
    return { content: JSON.stringify(body) };
  });
  expect((await s.run()).status).toBe("correction_required");
  expect(h.fetch).toHaveBeenCalledTimes(1);
});

it("shares one formal repair across initial/recheck and never purchases a fourth evaluation", async () => {
  const s = await setup();
  s.copy.slides[0].values[1].value = "Conheça a cafeteria.";
  const h = simulate((args, n) => {
    if (n === 1 || n === 3) return { content: '{"outcome":', finish: "length" };
    const body = valid(args);
    for (const row of [...body.factCoverage, ...body.sourceCoverage] as any[])
      Object.assign(row, {
        status: "missing",
        evidenceIds: [],
        missingSourceQuote: "de segunda a sexta",
        explanation: "Dias omitidos",
        materialityReason: "Condição essencial",
      });
    return { content: JSON.stringify(body) };
  });
  expect((await s.run()).status).toBe("correction_required");
  s.copy.slides[0].values[1].value = source;
  const recheck = await s.run("recheck");
  expect(recheck.limitation).toBe("proposal_review_response_truncated");
  expect(h.fetch).toHaveBeenCalledTimes(3);
  expect(await s.operations()).toHaveLength(3);
  s.deps.reviewRepairBudget = new Set();
  expect((await s.run("recheck")).limitation).toBe(
    "proposal_review_response_truncated"
  );
  expect(h.fetch).toHaveBeenCalledTimes(3);
});

it("preserves uncertain formal effect on restart without repurchasing it", async () => {
  const s = await setup();
  const h = simulate((_args, n) => {
    if (n === 1) return { content: '{"outcome":', finish: "length" };
    throw new TypeError("fetch failed");
  });
  const first = await s.run();
  expect(reviewFailureCode(first.status, first.limitation)).toBe(
    "provider_unavailable"
  );
  expect((await s.operations()).map(r => r.state).sort()).toEqual([
    "completed",
    "uncertain",
  ]);
  const again = await s.run();
  expect(again.limitation).toBe("proposal_review_reconciliation_required");
  expect(h.fetch).toHaveBeenCalledTimes(2);
});

it("does not purchase after cancellation or deadline", async () => {
  const s = await setup();
  const h = simulate(args => ({ content: JSON.stringify(valid(args)) }));
  s.controller.abort(new Error("cancelled"));
  await expect(s.run()).rejects.toThrow("cancelled");
  expect(h.fetch).not.toHaveBeenCalled();
  const t = await setup();
  t.input.deadlineMs = Date.now() - 1;
  expect((await t.run()).limitation).toBe("proposal_review_timeout");
  expect(h.fetch).not.toHaveBeenCalled();
  expect(await t.operations()).toEqual([]);
});

it("persists a known result even if cancellation arrives just before the result commit", async () => {
  const s = await setup();
  const save = s.store.persistOperationResult;
  s.store.persistOperationResult = async (...args: any[]) => {
    s.controller.abort(new Error("cancel-after-receipt"));
    return save(...args);
  };
  const h = simulate(args => ({ content: JSON.stringify(valid(args)) }));
  await expect(s.run()).rejects.toThrow("cancel-after-receipt");
  expect(h.fetch).toHaveBeenCalledTimes(1);
  expect((await s.operations())[0].state).toBe("completed");
});

it("reconciles a lost result-commit response without purchasing the provider again", async () => {
  const s = await setup();
  const save = s.store.persistOperationResult;
  s.store.persistOperationResult = async (...args: any[]) => {
    await save(...args);
    throw new Error("response lost after SQL commit");
  };
  const h = simulate(args => ({ content: JSON.stringify(valid(args)) }));
  expect((await s.run()).status).toBe("passed");
  expect(h.fetch).toHaveBeenCalledTimes(1);
  expect((await s.run()).status).toBe("passed");
  expect(h.fetch).toHaveBeenCalledTimes(1);
});

it("does not repair when receipt persistence was not confirmed", async () => {
  const s = await setup();
  s.store.persistOperationResult = async () => {
    throw new Error("local write unavailable");
  };
  const h = simulate(() => ({ content: '{"outcome":', finish: "length" }));
  expect((await s.run()).limitation).toBe(
    "proposal_review_reconciliation_required"
  );
  expect(h.fetch).toHaveBeenCalledTimes(1);
  expect((await s.operations())[0].state).toBe("uncertain");
});

it("classifies actual transport failure as provider failure, with uncertainty preserved", async () => {
  const s = await setup();
  const fetch = vi.fn(async () => {
    throw new TypeError("fetch failed");
  });
  vi.stubGlobal("fetch", fetch);
  const result = await s.run();
  expect(reviewFailureCode(result.status, result.limitation)).toBe(
    "provider_unavailable"
  );
  expect((await s.operations())[0].state).toBe("uncertain");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(["truncated","invalid-json","extra-field"])("V7 %s receipt/repair/retake uses the real transport and PostgreSQL",async kind=>{
  const s=await setup(7);
  const h=simulate((args,n)=>n===1&&kind!=="extra-field"?{content:kind==="truncated"?'{"outcome":':"invalid-json",finish:kind==="truncated"?"length":"stop"}:{content:JSON.stringify({...valid(args),...(kind==="extra-field"?{auxiliary:"discardable"}:{})})});
  const result=await s.run();expect(result.status,result.limitation).toBe("passed");expect(result.policyVersion).toBe(7);
  const count=kind==="extra-field"?1:2;expect(h.fetch).toHaveBeenCalledTimes(count);
  const ops=await s.operations();expect(ops).toHaveLength(count);expect(ops.every(o=>o.state==="completed"&&o.result.__proposalReview.policyVersion===7)).toBe(true);
  expect((await s.run()).status).toBe("passed");expect(h.fetch).toHaveBeenCalledTimes(count);
},30000);
it("V7 PostgreSQL guards cross-render purchases and uncertain effects",async()=>{
  const s=await setup(7),h=simulate(args=>({content:JSON.stringify(valid(args))}));
  expect((await s.run()).status).toBe("passed");s.setPixels(2);await expect(s.run()).rejects.toThrow("preparation_contract_incompatible");expect(h.fetch).toHaveBeenCalledTimes(1);
  const t=await setup(7);const key=`${t.input.proposalId}:review:initial:${"f".repeat(64)}`;
  await scalar("select postspark.generation_v5_operation($1,$2,$3,'begin') value",[t.id,t.token,key]);
  expect((await t.run()).status).toBe("inconclusive");expect(h.fetch).toHaveBeenCalledTimes(1);
},30000);
it("V7 shares one formal repair across initial/recheck and keeps the initial token profile",async()=>{
  const s=await setup(7);
  const h=simulate((args,n)=>n===1?{content:"invalid-json"}:n===3?{content:'{"outcome":',finish:"length"}:{content:JSON.stringify(valid(args))});
  expect((await s.run()).status).toBe("passed");
  s.copy.caption=Array.from({length:30},(_,i)=>`#tag${i}`).join(" ");
  const recheck=await s.run("recheck");expect(recheck.status).toBe("inconclusive");
  expect(h.fetch).toHaveBeenCalledTimes(3);expect(h.payloads.map(p=>p.max_tokens??p.max_completion_tokens)).toEqual([9216,9216,9216]);
  const ops=await s.operations();expect(ops).toHaveLength(3);expect(ops.filter(o=>o.operation_key.includes(":review_evidence_repair:")).length).toBe(1);
  expect((await s.run("recheck")).status).toBe("inconclusive");expect(h.fetch).toHaveBeenCalledTimes(3);
},30000);
