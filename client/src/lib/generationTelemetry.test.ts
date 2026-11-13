import { afterEach, describe, expect, it, vi } from "vitest";
import { createGenerationTelemetry } from "./generationTelemetry";
import { generationTelemetryBatchSchema } from "@shared/generationTelemetry";

const requestId = "00000000-0000-4000-8000-000000000001";
const exposure = "00000000-0000-4000-8000-000000000002";
const identity = { requestId, proposalId: "proposal-1", revision: 1 };
afterEach(() => vi.useRealTimers());
describe("disposable generation journey batches", () => {
  it("does no idle work and coalesces committed edits with no document content", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue(undefined);
    const tracker = createGenerationTelemetry(send);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(send).not.toHaveBeenCalled();
    tracker.record(identity, exposure, "exposure", { position: 2 });
    tracker.record(identity, exposure, "exposure", { position: 2 });
    for (let i = 0; i < 50; i++) tracker.record(identity, exposure, "edit");
    tracker.record(identity, exposure, "choice");
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(3);
    expect(send.mock.calls[0][0][1]).toMatchObject({ kind: "edit", changes: 50 });
    expect(generationTelemetryBatchSchema.parse({ events: send.mock.calls[0][0] }).events).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(send).toHaveBeenCalledTimes(1);
    tracker.dispose();
  });
  it("drops failed analysis with no retries; same briefing/request-independent identity stays distinct", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockRejectedValue(new Error("offline"));
    const tracker = createGenerationTelemetry(send);
    tracker.record(identity, exposure, "export_png");
    tracker.record({ ...identity, requestId: "00000000-0000-4000-8000-000000000003" }, exposure, "export_png");
    tracker.flush();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0][0].eventId).not.toBe(send.mock.calls[0][0][1].eventId);
    expect(generationTelemetryBatchSchema.safeParse({ events: [{ ...send.mock.calls[0][0][0], brief: "private" }] }).success).toBe(false);
  });
  it("splits even maximum-size identifiers before exceeding the transport byte budget", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const tracker = createGenerationTelemetry(send);
    for (let index=0;index<40;index++) tracker.record({...identity,proposalId:"p".repeat(160)},exposure,"choice");
    tracker.dispose();
    await Promise.resolve();
    expect(send.mock.calls.reduce((count,[events])=>count+events.length,0)).toBe(40);
    for (const [events] of send.mock.calls) expect(generationTelemetryBatchSchema.safeParse({events}).success).toBe(true);
  });
});
