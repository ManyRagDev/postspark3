import { describe, expect, it } from "vitest";
import { generationDeliveryMetrics } from "./generationTerminalDiagnostic";

const review = (inputHash: string, round = "initial", marker = "intentChecks[0]:advisory_idea_not_requirement:idea1") => ({round,inputHash,discardedFields:[marker]});
const proposal = (proposalId: string, status: string, reviews: unknown[] = [], revision=1) => ({proposalId,status,reviews,revision});
describe("persisted local delivery metrics", () => {
  it("deduplicates normalized reviews by proposal revision/round/hash without equating normalization to delivery", () => {
    const record={proposals:[proposal("p0","ready",[review("a"),review("a"),review("a","recheck")]),proposal("p1","failed",[review("b")]),proposal("p2","expired",[review("c","initial","intentChecks[0]:another_reason:idea1")])]} as any;
    const before=structuredClone(record);
    expect(generationDeliveryMetrics(record)).toEqual({deliveredCount:1,failedCount:2,cancelledCount:0,pendingCount:0,completedThree:false,localNormalizedReviewCount:3,localRecoveredProposalCount:2});
    expect(generationDeliveryMetrics(record)).toEqual(generationDeliveryMetrics(before));
    expect(record).toEqual(before);
  });
  it("counts completion only for three delivered slots and keeps cancellation/pending distinct", () => {
    expect(generationDeliveryMetrics({proposals:[proposal("p0","ready"),proposal("p1","ready"),proposal("p2","ready")]} as any)).toMatchObject({deliveredCount:3,completedThree:true,localRecoveredProposalCount:0});
    expect(generationDeliveryMetrics({proposals:[proposal("p0","ready"),proposal("p1","cancelled"),proposal("p2","awaiting_reconciliation")]} as any)).toMatchObject({deliveredCount:1,failedCount:0,cancelledCount:1,pendingCount:1,completedThree:false});
    expect(generationDeliveryMetrics({proposals:[]} as any).completedThree).toBe(false);
  });
  it("does not count historical reviews or malformed marker text as local recovery", () => {
    const record={proposals:[proposal("p0","ready",[{round:"initial",inputHash:"a"},review("b","initial","prefix:intentChecks[0]:advisory_idea_not_requirement:idea1"),review("c","initial","intentChecks[0]:advisory_idea_not_requirement:")])]} as any;
    expect(generationDeliveryMetrics(record)).toMatchObject({localNormalizedReviewCount:0,localRecoveredProposalCount:0});
  });
});


describe("persisted V3 normalization metrics", () => {
  const note = `findings[0]:untargeted_non_material_note:${"a".repeat(64)}`;
  const visual = `unitChecks[20]:visual_loss_requires_correction:u_${"b".repeat(20)}`;
  it("counts notes and visual corrections once per review while keeping failed/pending outcomes distinct", () => {
    const combined={...review("same","initial",note),discardedFields:[note,visual]};
    const record={proposals:[proposal("p0","failed",[combined,combined]),proposal("p1","recovering",[review("b","initial",visual)]),proposal("p2","ready",[review("c","initial",note)])]} as any;
    const before=structuredClone(record);
    expect(generationDeliveryMetrics(record)).toEqual({deliveredCount:1,failedCount:1,cancelledCount:0,pendingCount:1,completedThree:false,localNormalizedReviewCount:3,localRecoveredProposalCount:3});
    expect(record).toEqual(before);
  });
  it.each([
    `prefix:${note}`, `${note}:suffix`, `${note}\n`, note.slice(0,-1), note.replace(/a$/, "g"), note.replace("[0]", "[-1]"), note.replace("[0]", "[00]"),
    `prefix:${visual}`, `${visual}:suffix`, `${visual}\n`, visual.slice(0,-1), visual.replace(/b$/, "x"), visual.replace("u_", "unit_"), visual.replace("[20]", "[2x]"),
  ])("rejects a malformed V3 marker: %s", marker => {
    expect(generationDeliveryMetrics({proposals:[proposal("p0","ready",[review("a","initial",marker)])]} as any)).toMatchObject({localNormalizedReviewCount:0,localRecoveredProposalCount:0});
  });
});
