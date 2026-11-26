import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { generationRouter } from "./routers/generation";
import { buildStudioDebugger } from "./studioDebugger";
import { getDb } from "./db";

vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getDb: vi.fn(),
}));
const ownerId = "00000000-0000-4000-8800-000000000001";
const requestId = "00000000-0000-4000-8800-000000000002";
const request = {
  id: requestId,
  input: { content: "briefing privado" },
  proposals: [],
  status: "running",
  created_at: "2026-11-19T01:00:00Z",
};
function caller(role: string) {
  return generationRouter.createCaller({
    user: { id: ownerId, role },
    req: {},
    res: {},
  } as never);
}
describe("Studio debugger", () => {
  it("only reads the administrator's own request, even with a valid external request ID", async () => {
    await expect(
      caller("user").debugger({ ownerId, requestId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller("admin").debugger({ ownerId: requestId, requestId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const from = vi.fn(() => query);
    vi.mocked(getDb).mockReturnValue({ from } as never);
    await expect(
      caller("admin").debugger({ ownerId, requestId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(query.eq.mock.calls).toEqual([
      ["id", requestId],
      ["owner_id", ownerId],
    ]);
    expect(from).toHaveBeenCalledTimes(1);
  });
  it("reads a pending request through the authenticated route and its scoped PostgREST filters", async () => {
    const reads: string[] = [];
    const client = createClient("https://offline.example.test", "test-only", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(String(input)),
            table = url.pathname.split("/").at(-1)!;
          expect(init?.method).toBe("GET");
          reads.push(table);
          if (table === "generation_v5_requests") {
            expect(url.searchParams.get("owner_id")).toBe("eq." + ownerId);
            expect(url.searchParams.get("id")).toBe("eq." + requestId);
          } else if (table === "generation_runs") {
            expect(url.searchParams.get("user_uuid")).toBe("eq." + ownerId);
            expect(url.searchParams.get("id")).toBe("eq." + requestId);
          } else
            expect(url.searchParams.get("request_id")).toBe("eq." + requestId);
          // PostgREST returns arrays for GET maybeSingle and supabase-js unwraps them.
          const body = table === "generation_v5_requests" ? [request] : [];
          return new Response(JSON.stringify(body), {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });
    vi.mocked(getDb).mockReturnValue(client as never);
    const report = await caller("admin").debugger({ ownerId, requestId });
    expect(report.timeline.map(e => e.title)).toEqual(["Pedido admitido"]);
    expect(reads.sort()).toEqual([
      "generation_runs",
      "generation_v5_operations",
      "generation_v5_requests",
    ]);
  });
  it("orders parallel activity, preserves uncertain operations and merges duplicate trace copies without returning raw calls", () => {
    const event = {
      stage: "scene_inspection",
      detail: "preflight",
      status: "completed",
      at: "2026-11-19T01:00:03Z",
      data: { inspectedSlides: [{ slide: 1, findings: [] }] },
    };
    const call = {
      label: "copy",
      operationKey: "p:copy",
      effectiveModel: "model",
      messages: ["PRIVATE"],
      response: "PRIVATE",
    };
    const result = buildStudioDebugger(
      {
        request,
        operations: [
          {
            operation_key: "p:copy",
            state: "completed",
            started_at: "2026-11-19T01:00:01Z",
            updated_at: "2026-11-19T01:00:04Z",
            result: { __generationTrace: { calls: [call], events: [event] } },
          },
          {
            operation_key: "p:image",
            state: "uncertain",
            started_at: "2026-11-19T01:00:02Z",
            updated_at: "2026-11-19T01:00:05Z",
          },
        ],
        events: [event],
      },
      [call]
    );
    expect(result.timeline.map(s => s.title)).toEqual([
      "Pedido admitido",
      "p:copy",
      "p:image",
      "scene_inspection",
      "p:copy",
      "p:image",
    ]);
    expect(result.timeline.at(-1)?.status).toBe("uncertain");
    expect(result.calls).toHaveLength(1);
    expect(result.coverage.liveSelectionCaptured).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|briefing privado/);
  });

  it("charges failed final repairs to operational cost per recovered proposal, preserving unknown cost", () => {
    const proposals = [
      { proposalId: "p0", status: "ready", diagnostics: [{ code: "final_text_fit_passed", target: "p0-fb1" }] },
      { proposalId: "p1", status: "failed" },
    ];
    const operations = proposals.map(({ proposalId }, i) => ({ operation_key: proposalId + ":copy_final_fit", state: "completed",
      result: { usage: { cost: i ? 0.003 : 0.001 }, finalFit: { attemptId: proposalId + "-fb1", durationMs: 602, targetCount: 4 } } }));
    const report = () => buildStudioDebugger({ request: { ...request, proposals }, operations });
    expect(report().timeline.find(step => step.id === "final-fit-summary")?.detail).toMatchObject({
      attempts: 2, delivered: 1, costUsdPerRecoveredProposal: 0.004,
    });
    Reflect.deleteProperty(operations[1].result.usage, "cost");
    expect(report().timeline.find(step => step.id === "final-fit-summary")?.detail).toMatchObject({
      delivered: 1, knownCostUsd: 0.001, unknownCosts: 1, costUsdPerRecoveredProposal: null,
    });
  });

  it("surfaces provider rejections and copy validation details as debugger issues", () => {
    const result = buildStudioDebugger({
      request: {
        ...request,
        proposals: [
          {
            proposalId: "p-1",
            slot: 0,
            status: "failed",
            diagnostics: [
              {
                code: "copy_response_invalid_detail",
                target: "proposal",
                evidence: '[{"path":"slides.0","message":"native_field_set_mismatch"}]',
              },
            ],
          },
        ],
      },
      operations: [
        {
          operation_key: "p-1:copy_recovery",
          state: "completed",
          started_at: "2026-11-19T01:00:01Z",
          updated_at: "2026-11-19T01:00:02Z",
          result: {
            __providerRejection: {
              provider: "openrouter",
              model: "anthropic/claude-haiku-5.5",
              httpStatus: 400,
              reason: "invalid_request_error",
            },
          },
        },
      ],
      events: [],
    });
    expect(result.timeline.find(s => s.id === "p-1:copy_recovery:result")?.status).toBe("provider_rejected");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "provider_request_rejected", target: "p-1:copy_recovery" }),
        expect.objectContaining({ code: "copy_response_invalid_detail", target: "p-1" }),
      ])
    );
  });
  it("retains validation details after another design delivers the slot", () => {
    const issue = {path:"slides.0.values", code:"too_big", message:"too many fields"};
    const result = buildStudioDebugger({ request, operations: [], events: [{
      at:request.created_at, stage:"proposal_copy_validation_failed", detail:"copy_response_invalid", status:"failed",
      data:{proposalId:"p-1", attemptId:"p-1-fb1", issues:[issue]},
    }] });
    expect(result.issues).toContainEqual({code:"copy_response_invalid_detail", target:"p-1-fb1", detail:JSON.stringify([issue])});
    expect(result.timeline.find(s=>s.title==="proposal_copy_validation_failed")?.detail).toMatchObject({issues:[issue]});
  });

});
