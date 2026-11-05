import { describe, expect, it, vi } from "vitest";
import { arsenalHash } from "./arsenalContent";
import { planFamilyRecovery } from "./familyRecovery";

const fit = (viableSlots: number[]) => ({
  viableSlots,
  planHash: arsenalHash(viableSlots),
});
describe("bounded recovery of uncertain editorial judgements", () => {
  it("keeps the original score, recovers only verified gains and stops at three local attempts", () => {
    const scores = Array.from({ length: 30 }, (_, i) => ({
      id: `family-${String(i).padStart(2, "0")}`,
      score: 1.5,
      confidence: 0.12,
    }));
    const inspect = vi.fn((ids: string[]) =>
      fit(ids.includes("family-02") ? [0, 1, 2] : [])
    );
    const receipt = planFamilyRecovery(scores, inspect);
    expect(receipt).toMatchObject({
      outcome: "recovered",
      recoveredIds: ["family-02"],
      attempts: [
        { id: "family-00", accepted: false },
        { id: "family-01", accepted: false },
        { id: "family-02", accepted: true },
      ],
    });
    expect(scores.every(s => s.score === 1.5 && s.confidence === 0.12)).toBe(
      true
    );
    expect(inspect).toHaveBeenCalledTimes(4); // baseline plus three candidates
  });
  it("never rescues a confident rejection, zero, or a score outside the conservative band", () => {
    const scores = [
      { id: "confident", score: 1.5, confidence: 0.9 },
      { id: "zero", score: 0, confidence: 0.1 },
      { id: "very_weak", score: 0.5, confidence: 0.1 },
    ];
    const inspect = vi.fn(() => fit([]));
    expect(planFamilyRecovery(scores, inspect)).toMatchObject({
      outcome: "exhausted",
      attempts: [],
      recoveredIds: [],
    });
    expect(inspect).toHaveBeenCalledTimes(1);
  });
  it("does not trade an already viable slot for a different one or continue after success", () => {
    const scores = [
      { id: "normal", score: 3, confidence: 0.9 },
      { id: "a", score: 1.5, confidence: 0.1 },
      { id: "b", score: 1.4, confidence: 0.1 },
      { id: "c", score: 1.3, confidence: 0.1 },
    ];
    const inspect = vi.fn((ids: string[]) =>
      fit(ids.includes("b") ? [0, 1, 2] : ids.includes("a") ? [1, 2] : [0])
    );
    const r = planFamilyRecovery(scores, inspect);
    expect(r.attempts.map(a => a.accepted)).toEqual([false, true]);
    expect(r.recoveredIds).toEqual(["b"]);
    expect(inspect.mock.calls.some(([ids]) => ids.includes("c"))).toBe(false);
  });
  it("keeps a sufficient normal shortlist without attempting uncertain families", () => {
    const inspect = vi.fn(() => fit([0, 1, 2]));
    expect(
      planFamilyRecovery(
        [
          { id: "normal", score: 3, confidence: 0.9 },
          { id: "weak", score: 1.5, confidence: 0.1 },
        ],
        inspect
      )
    ).toMatchObject({ outcome: "not_needed", attempts: [], recoveredIds: [] });
    expect(inspect).toHaveBeenCalledTimes(1);
  });
});
