import { afterEach, describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { GenerationCoordinator } from "./generationCoordinator";
import { executeProposalWorkflow } from "./proposalGraph";

vi.mock("./proposalGraph", () => ({ executeProposalWorkflow: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe("coordinator graph scheduling", () => {
  it.each([undefined, 1] as const)("starts proposal work only when its graph slot is available (concurrency %s)", async maxConcurrency => {
    const owner = "00000000-0000-4000-8000-000000000001", definition = completeDesignTestDefinitions()[0];
    const releases: Array<() => void> = [], starts: number[] = [];
    let active = 0, maximum = 0;
    const workflow = vi.mocked(executeProposalWorkflow);
    workflow.mockImplementation(async input => {
      starts.push(input.slot);
      maximum = Math.max(maximum, ++active);
      await new Promise<void>(resolve => releases.push(resolve));
      active--;
      return { contractVersion: 1, proposalId: input.proposalId, runId: input.runId, slot: input.slot,
        status: "failed", revision: 1, findings: [], diagnostics: [],
        failure: { code: "provider_unavailable", stage: "copy", retryable: false } };
    });
    const coordinator = new GenerationCoordinator({ requestId: owner, runId: owner, actor: owner,
      prompt: "Synthetic scheduling fixture", reviewPolicyVersion: 10,
      selectedDefinitions: [[definition], [definition], [definition]],
    }, { actor: owner, generateText: vi.fn() });
    const result = coordinator.start({ maxConcurrency });
    const firstBatch = maxConcurrency ?? 3;
    await vi.waitFor(() => expect(starts).toHaveLength(firstBatch));
    expect(releases).toHaveLength(firstBatch);
    // A queued proposal has not entered its workflow, where review deadlines are created.
    if (maxConcurrency === 1) {
      releases[0]();
      await vi.waitFor(() => expect(starts).toHaveLength(2));
      expect(active).toBe(1);
      releases[1]();
      await vi.waitFor(() => expect(starts).toHaveLength(3));
      releases[2]();
    } else releases.forEach(release => release());
    const completed = await result;
    expect(maximum).toBe(firstBatch);
    expect(new Set(starts)).toEqual(new Set([0, 1, 2]));
    expect(completed.proposals).toHaveLength(3);
    expect(completed.proposals.every(p => p.status === "failed")).toBe(true);
  });
});
