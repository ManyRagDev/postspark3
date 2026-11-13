import { describe, expect, it } from "vitest";
import { deliveryRecoveryAttempt, deliveryRecoveryKey, deliveryRecoveryReadKeys } from "./generationPlan";
import { deliveryRecoveryHistory } from "../server/ai/workflows/generationDeliveryRecovery";
describe("SQL-compatible recovery keys and historical reads", () => {
  it.each([1, 2, 3])("emits an unpaid candidate suffix for attempt%s", attempt => {
    expect(deliveryRecoveryKey(attempt)).toMatch(/:candidate$/);
    expect(deliveryRecoveryAttempt(deliveryRecoveryKey(attempt))).toBe(attempt);
  });
  it("retains the original key and reads legacy local receipts without emitting them", () => {
    expect(deliveryRecoveryKey(1)).toBe("delivery_recovery:candidate");
    expect(deliveryRecoveryReadKeys(2)).toEqual(["delivery_recovery:2:candidate", "delivery_recovery:candidate:2"]);
    const plan = (candidateId: string) => ({ candidateId, pages: [] });
    const history = deliveryRecoveryHistory([
      { operationKey: "p:delivery_recovery:candidate", state: "completed", result: { plan: plan("first") } },
      { operationKey: "p:delivery_recovery:candidate:2", state: "completed", result: { plan: plan("legacy") } },
      { operationKey: "p:delivery_recovery:2:candidate", state: "completed", result: { plan: plan("canonical") } },
      { operationKey: "p:delivery_recovery:3:candidate", state: "started", result: { plan: plan("pending") } },
      { operationKey: "p-other:delivery_recovery:2:candidate", state: "completed", result: { plan: plan("foreign") } },
    ], "p", 3);
    expect(history.previous).toMatchObject({ attempt: 2, attemptId: "p-fb2", plan: plan("canonical") });
    expect(history.candidateIds).not.toContain("foreign");
    expect(history.candidateIds).not.toContain("pending");
    expect(deliveryRecoveryReadKeys(0)).toEqual([]);
    expect(() => deliveryRecoveryKey(4)).toThrow("invalid_delivery_recovery_attempt");
  });
});
