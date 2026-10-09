import { expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { executeProposalWorkflow } from "../ai/workflows/proposalGraph";
const owner = "00000000-0000-4000-8000-000000000001",
  runId = "00000000-0000-4000-8000-000000000002";
const h = vi.hoisted(() => ({
  run: null as any,
  read: vi.fn(),
  trace: vi.fn().mockResolvedValue(true),
}));
vi.mock("../db", () => ({
  getDb: vi.fn(),
  getGenerationRunById: async (id: string, actor: string) => {
    h.read(id, actor);
    return actor === "00000000-0000-4000-8000-000000000001" ? h.run : null;
  },
}));
vi.mock("../designCatalog/trace", () => ({ traceCatalog: h.trace }));
import { designCatalogRouter } from "./designCatalog";

it("accepts compilation reports for a committed partial slot and rejects mismatched candidates or another owner", async () => {
  const result = await executeProposalWorkflow(
    {
      requestId: runId,
      runId,
      proposalId: "p-1",
      slot: 1,
      prompt: "Café",
      selectedDefinition: completeDesignTestDefinitions()[0],
    },
    {
      actor: owner,
      measureText: () => ({ height: 20, lines: [{ width: 100 }], runs: [] }),
      generateText: async () =>
        ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  caption: "Café",
                  hashtags: [],
                  slides: [
                    {
                      values: [
                        { fieldId: "field-0", value: "Café" },
                        { fieldId: "field-1", value: "Hoje" },
                      ],
                      mediaPrompts: [],
                    },
                  ],
                }),
              },
            },
          ],
        }) as any,
    }
  );
  if (result.status !== "ready") throw new Error(result.errorReason);
  const slide = result.bundle.slides[0],
    candidateId = slide.composition.origin.candidateId;
  h.run = {
    status: "partial",
    output_snapshot: [{ completeDesignV1: result.bundle }],
  };
  const input = {
    runId,
    slot: 1,
    slideId: slide.id,
    report: {
      traceId: runId,
      runId,
      slot: 1,
      materializationId: "00000000-0000-4000-8000-000000000003",
      userContentHash: slide.composition.userContentHash,
      selectedCandidateId: candidateId,
      status: "applied" as const,
      durationMs: 10,
      attempts: [
        { candidateId, policy: "normal" as const, reasons: [], durationMs: 10 },
      ],
    },
  };
  const caller = (id: string) =>
    designCatalogRouter.createCaller({
      user: { id, email: "dev@example.test", role: "admin" },
      req: {} as any,
      res: {} as any,
    } as any);
  expect(await caller(owner).reportComponentCompilation(input)).toEqual({
    persisted: true,
  });
  expect(h.read).toHaveBeenCalledWith(runId, owner);
  expect(h.trace).toHaveBeenCalledWith(
    runId,
    owner,
    "complete_design.compile",
    "completed",
    expect.any(Object),
    expect.any(String)
  );
  await expect(
    caller(owner).reportComponentCompilation({
      ...input,
      report: { ...input.report, selectedCandidateId: "unoffered" },
    })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller("00000000-0000-4000-8000-000000000004").reportComponentCompilation(
      input
    )
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(h.trace).toHaveBeenCalledTimes(1);
});
