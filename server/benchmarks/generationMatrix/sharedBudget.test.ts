import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openSharedBudget,
  prepareSharedBudget,
  readSharedBudget,
} from "./sharedBudget";
import { installLocalJourneyGuard } from "./localJourneyGuard";
import { writeJson } from "./journal";
import { matrixPlan, parseMatrixArgs } from "./core";
import { localPipelineFingerprint } from "./localPipelineFingerprint";
import {
  interpretRawBriefing,
  creationBriefToExecutionBrief,
} from "../../../shared/creationBrief";

const execFileAsync = promisify(execFile),
  temporary: string[] = [];
const quote = {
  id: "test/model",
  context_length: 1000,
  pricing: { prompt: "0.000001", completion: "0.000001" },
};
const content = "Comunicado sintético autorizado.";
const carouselContent = "Cinco itens sintéticos do carrossel autorizado.";
async function fixture(maxUsd = 1) {
  const directory = await mkdtemp(join(tmpdir(), "postspark-shared-budget-"));
  temporary.push(directory);
  const origin = join(directory, "old"),
    file = join(directory, "new/shared-budget.json");
  await mkdir(join(origin, "operator"), { recursive: true });
  const calls = [
    {
      operation: "old:uncertain",
      model: quote.id,
      startedAt: "2026-11-01T00:00:00Z",
      reservedUsd: 0.4,
      status: "uncertain",
    },
  ];
  await writeJson(join(origin, "operator/manifest.json"), {
    version: 1,
    fingerprint: "old",
    maxUsd: 4,
    maxCalls: 80,
    entries: [],
  });
  await writeJson(join(origin, "operator/paid-calls.json"), calls);
  await writeJson(join(origin, "operator/prices.json"), [
    { ...quote, context_length: 20000 },
  ]);
  await prepareSharedBudget({
    file,
    origin,
    maxUsd,
    maxCalls: 10,
    matrixCampaignId: "new-matrix",
    journeyCampaignId: "new-ui",
    journeys: [
      {
        id: "static-gemini",
        postMode: "static",
        choice: "gemini",
        contentHash: createHash("sha256").update(content).digest("hex"),
      },
      {
        id: "carousel-gpt",
        postMode: "carousel",
        choice: "gpt",
        contentHash: createHash("sha256").update(carouselContent).digest("hex"),
      },
    ],
  });
  return { directory, origin, file, calls };
}
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporary.splice(0).map(p => rm(p, { recursive: true, force: true }))
  );
});

describe("shared budget protocol 3 — offline effects only", () => {
  it("refuses a declined proposal even with explicit live flags and preserves all inherited spend", async () => {
    const f = await fixture(),
      state = await readSharedBudget(f.file);
    await writeJson(f.file, {
      ...state,
      authorization: "DECLINED_NOT_AUTHORIZED",
      effectiveAuthorizedLimits: { usd: 4, calls: 80 },
      interruption: {
        reason: "authorization_declined",
        at: "2026-11-01T00:00:00Z",
      },
    });
    const bytes = await readFile(f.file, "utf8");
    await expect(
      openSharedBudget({
        file: f.file,
        campaignId: "new-matrix",
        maxUsd: 1,
        maxCalls: 10,
        live: true,
      })
    ).rejects.toThrow("declined_not_authorized");
    expect(await readFile(f.file, "utf8")).toBe(bytes);
    expect((await readSharedBudget(f.file)).calls).toEqual(f.calls);
  });
  it("gives a new campaign different execution IDs and forbids mixing continuation", () => {
    const old = matrixPlan(
      parseMatrixArgs(["--cases", "serious-implicit,five-items"])
    );
    const next = matrixPlan(
      parseMatrixArgs([
        "--campaign-id",
        "new-matrix",
        "--cases",
        "serious-implicit,five-items",
      ])
    );
    expect(next).toHaveLength(8);
    expect(next.some(n => old.some(o => o.runId === n.runId))).toBe(false);
    expect(() =>
      parseMatrixArgs([
        "--shared-budget",
        "/tmp/budget",
        "--continue-from",
        "/tmp/old",
        "--campaign-id",
        "new-matrix",
      ])
    ).toThrow("without_continuation");
  });
  it("inherits unknown receipts without mutating originals and rejects cap/reset/output changes", async () => {
    const f = await fixture(),
      bytes = await readFile(
        join(f.origin, "operator/paid-calls.json"),
        "utf8"
      );
    await expect(
      openSharedBudget({
        file: f.file,
        campaignId: "new-matrix",
        maxUsd: 1,
        maxCalls: 10,
        live: false,
      })
    ).rejects.toThrow("live_opt_in");
    await expect(
      openSharedBudget({
        file: f.file,
        campaignId: "new-matrix",
        maxUsd: 2,
        maxCalls: 10,
        live: true,
      })
    ).rejects.toThrow("mismatch");
    const opened = await openSharedBudget({
      file: f.file,
      campaignId: "new-matrix",
      maxUsd: 1,
      maxCalls: 10,
      live: true,
      pipelineHash: "new-code",
      executionDirectory: "new-dir",
    });
    expect(opened.budget.committedUsd).toBe(0.4);
    await expect(
      openSharedBudget({
        file: f.file,
        campaignId: "new-matrix",
        maxUsd: 1,
        maxCalls: 10,
        live: true,
        pipelineHash: "new-code",
        executionDirectory: "other-dir",
      })
    ).rejects.toThrow("output_directory_changed");
    expect(
      await readFile(join(f.origin, "operator/paid-calls.json"), "utf8")
    ).toBe(bytes);
    expect((await readSharedBudget(f.file)).calls).toEqual(f.calls);
  });
  it("coordinates two real Node processes without holding a lock during simulated provider work", async () => {
    const f = await fixture(),
      release = join(f.directory, "release"),
      modulePath = resolve(
        "server/benchmarks/generationMatrix/sharedBudget.ts"
      );
    const script = `import {openSharedBudget} from ${JSON.stringify(modulePath)};import{access}from'node:fs/promises';const{budget}=await openSharedBudget({file:${JSON.stringify(f.file)},campaignId:'new-matrix',maxUsd:1,maxCalls:10,live:true});try{await budget.run('fake',0.4,async()=>{if(process.argv[1]==='hold'){for(let n=0;n<300;n++){try{await access(${JSON.stringify(release)});break}catch{}await new Promise(r=>setTimeout(r,20));}}return{result:'controlled',actualUsd:0.1}});console.log('sent')}catch(e){console.log('blocked:'+e.message)}`;
    const first = execFileAsync(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      script,
      "hold",
    ]);
    await vi.waitFor(
      async () =>
        expect((await readSharedBudget(f.file)).calls).toHaveLength(2),
      { timeout: 5000 }
    );
    const second = await execFileAsync(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      script,
      "nohold",
    ]);
    expect((await readSharedBudget(f.file)).interruption?.reason).toBe(
      "budget_exhausted"
    );
    await writeFile(release, "release");
    await first;
    const state = await readSharedBudget(f.file);
    expect(state.calls).toHaveLength(2);
    expect(state.calls[0]).toEqual(f.calls[0]);
    expect(state.interruption?.reason).toBe("budget_exhausted");
    expect(
      state.calls.reduce((sum, c) => sum + (c.actualUsd ?? c.reservedUsd), 0)
    ).toBe(0.5);
  }, 15000);
  it("awaits the inherited preload before a fresh Node worker can attempt any paid request", async () => {
    const f = await fixture(10),
      rendererPath = join(f.directory, "fake-renderer.js"),
      configFile = join(f.directory, "bootstrap.json"),
      resultFile = join(f.directory, "result.json"),
      fakeNetwork = join(f.directory, "fake-network.mjs");
    await writeFile(
      rendererPath,
      "/* Controlled renderer bytes, never renders. */"
    );
    await writeJson(configFile, {
      live: true,
      budgetFile: f.file,
      campaignId: "new-ui",
      maxUsd: 10,
      maxCalls: 10,
      supabaseOrigin: "https://expected.supabase.co",
      catalogRevision: "22",
      pipelineHash: await localPipelineFingerprint(rendererPath),
      rendererPath,
      reviewModel: quote.id,
    });
    await writeFile(
      fakeNetwork,
      "globalThis.fetch=async()=>new Response('{}');"
    );
    const preload = pathToFileURL(
      resolve("server/benchmarks/generationMatrix/localPaidPreload.mjs")
    ).href;
    const code = `import{writeFile}from'node:fs/promises';let result='UNGUARDED';try{await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'test/model',max_tokens:10,messages:[]})})}catch(e){result=e.message}await writeFile(${JSON.stringify(resultFile)},JSON.stringify({result}));`;
    await execFileAsync(process.execPath, ["--input-type=module", "-e", code], {
      env: {
        ...process.env,
        NODE_OPTIONS: `--import=tsx --import=${pathToFileURL(fakeNetwork).href} --import=${preload}`,
        POSTSPARK_LOCAL_PAID_GUARD_CONFIG: configFile,
      },
    });
    expect(JSON.parse(await readFile(resultFile, "utf8")).result).toBe(
      "local_paid_request_without_authorized_journey"
    );
    expect((await readSharedBudget(f.file)).calls).toHaveLength(1);
  }, 15000);
  it("guards real application transport shapes, admits only the planned journey, and correlates the journal receipt", async () => {
    let currentTraceId = "request-1";
    const f = await fixture(10),
      upstream = vi.fn(async (request: any, init?: RequestInit) => {
        const url = new URL(String(request));
        if (url.hostname === "openrouter.ai")
          return new Response(
            JSON.stringify({ id: "fake-provider-id", usage: { cost: 0.0001 } })
          );
        return new Response(
          JSON.stringify(
            url.pathname.includes("generation_admit")
              ? { id: JSON.parse(init!.body as string).p_id, created: true }
              : { state: "completed" }
          )
        );
      });
    vi.stubGlobal("fetch", upstream);
    const installed = await installLocalJourneyGuard(
      {
        live: true,
        budgetFile: f.file,
        campaignId: "new-ui",
        maxUsd: 10,
        maxCalls: 10,
        supabaseOrigin: "https://expected.supabase.co",
        catalogRevision: "22",
        pipelineHash: "fixed-code",
        reviewModel: quote.id,
      },
      () => currentTraceId
    );
    const paid = () =>
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: quote.id,
          max_tokens: 10,
          messages: [],
          response_format: { json_schema: { name: "copy" } },
        }),
      });
    const admission = {
      p_id: "request-1",
      p_idempotency_key: "one",
      p_input_hash: "hash",
      p_revision: "22",
      p_experimental: true,
      p_generation_config: {
        choice: "gemini",
        generationStrategyVersion: 2,
        configurationHash: "config",
      },
      p_input: {
        aspectRatio: "4:5",
        platform: "instagram",
        includeDraftDesigns: true,
        inputType: "text",
        content: content + " Preferência visual declarada na interface.",
        postMode: "static",
        executionBrief: creationBriefToExecutionBrief(
          interpretRawBriefing(content, { selectedFormat: "static" })
        ),
      },
    };
    try {
      await expect(paid()).rejects.toThrow("without_authorized_journey");
      expect(upstream).not.toHaveBeenCalled();
      await fetch(
        "https://expected.supabase.co/rest/v1/rpc/generation_admit_staged_local",
        { method: "POST", body: JSON.stringify(admission) }
      );
      await paid();
      await fetch(
        "https://expected.supabase.co/rest/v1/rpc/generation_v5_operation",
        {
          method: "POST",
          body: JSON.stringify({
            p_id: "request-1",
            p_action: "complete",
            p_operation_key: "p-request-1-0:copy",
            p_result: {
              trace: { calls: [{ providerId: "fake-provider-id" }] },
            },
          }),
        }
      );
      const state = await readSharedBudget(f.file),
        last = state.calls[state.calls.length - 1];
      expect(last.metadata).toMatchObject({
        campaignId: "new-ui",
        generationRequestId: "request-1",
        catalogRevision: "22",
        canonicalOperationKey: "p-request-1-0:copy",
      });
      expect(last.actualUsd).toBe(0.0001);
      await fetch(
        "https://expected.supabase.co/storage/v1/object/authorized-fixture.svg",
        { method: "PUT", body: "<svg/>" }
      );
      const carouselBrief = interpretRawBriefing(carouselContent, {
        selectedFormat: "carousel",
      });
      await fetch(
        "https://expected.supabase.co/rest/v1/rpc/generation_admit_staged_local",
        {
          method: "POST",
          body: JSON.stringify({
            ...admission,
            p_id: "request-2",
            p_idempotency_key: "carousel-one",
            p_input_hash: "carousel-hash",
            p_generation_config: {
              ...admission.p_generation_config,
              choice: "gpt",
            },
            p_input: {
              aspectRatio: "4:5",
              platform: "instagram",
              includeDraftDesigns: true,
              inputType: "text",
              content: carouselContent,
              postMode: "carousel",
              slideCount: carouselBrief.slideCount,
              executionBrief: creationBriefToExecutionBrief(carouselBrief),
            },
          }),
        }
      );
      currentTraceId = "request-2";
      await paid();
      expect(
        (await readSharedBudget(f.file)).journeys.filter(
          j => j.admissionState === "completed"
        )
      ).toHaveLength(2);
      expect((await readSharedBudget(f.file)).calls).toHaveLength(3);
      await expect(
        fetch(
          "https://expected.supabase.co/rest/v1/rpc/generation_admit_staged_local",
          {
            method: "POST",
            body: JSON.stringify({ ...admission, p_idempotency_key: "two" }),
          }
        )
      ).rejects.toThrow("already_admitted");
      await expect(
        fetch("https://other.supabase.co/rest/v1/table", {
          method: "POST",
          body: "{}",
        })
      ).rejects.toThrow("outside_openrouter");
      await expect(
        fetch("https://expected.supabase.co/functions/v1/unmetered-ai", {
          method: "POST",
          body: "{}",
        })
      ).rejects.toThrow("route_not_allowed");
      await expect(
        fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          body: "{}",
        })
      ).rejects.toThrow("outside_openrouter");
    } finally {
      installed.restore();
    }
  });
});
