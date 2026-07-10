import { describe, expect, it } from "vitest";
import {
  createReplayCallReader,
  isReplayablePromptSnapshot,
  parseReplayPromptSnapshot,
} from "./replay";

describe("generationGraph replay", () => {
  it("parses legacy array prompt snapshots as non-replayable metadata", () => {
    const parsed = parseReplayPromptSnapshot([
      { label: "post_generation", promptHash: "abc" },
    ]);

    expect(parsed).toMatchObject({
      version: 1,
      replayable: false,
      calls: [{ label: "post_generation", promptHash: "abc" }],
    });
    expect(isReplayablePromptSnapshot(parsed)).toBe(false);
  });

  it("reads replayable v2 calls in label order without reusing calls", () => {
    const reader = createReplayCallReader({
      version: 2,
      replayable: true,
      calls: [
        { label: "slot", response: { value: 1 } },
        { label: "other", response: { value: 2 } },
        { label: "slot", response: { value: 3 } },
      ],
    });

    expect(reader.snapshot.replayable).toBe(true);
    expect(isReplayablePromptSnapshot(reader.snapshot)).toBe(true);
    expect(reader.next("slot")?.response).toEqual({ value: 1 });
    expect(reader.next("slot")?.response).toEqual({ value: 3 });
    expect(reader.next("slot")).toBeUndefined();
    expect(reader.next("other")?.response).toEqual({ value: 2 });
  });
});
