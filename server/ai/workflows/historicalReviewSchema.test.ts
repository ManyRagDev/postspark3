import { describe, expect, it } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { assertReviewExecutionConfigV7, resolveReviewExecutionConfigV7, reviewContractHashV7 } from "./reviewExecutionConfigV7";
import { assertReviewExecutionConfigV8, resolveReviewExecutionConfigV8, reviewContractHashV8 } from "./reviewExecutionConfigV8";
import { assertReviewExecutionConfigV9, resolveReviewExecutionConfigV9, reviewContractHashV9 } from "./reviewExecutionConfigV9";
import { assertReviewExecutionConfigV10, resolveReviewExecutionConfigV10, reviewContractHashV10 } from "./reviewExecutionConfigV10";

describe("historical review contracts", () => {
  it("preserves the V8 and V9 hashes emitted with the original schema serializer", () => {
    expect(reviewContractHashV8()).toBe("b1bebc41684812179cd5dde2b196fe05dbd2a0d240a350dc37f3579bd3ed4be0");
    expect(reviewContractHashV9()).toBe("de64d69757d4bec0a572ea912e0d5dc73d49a15fdb501d9ed0142064f9fb353e");
  });

  it("accepts both representations for already persisted review configurations", () => {
    const cases = [
      [resolveReviewExecutionConfigV7(1), assertReviewExecutionConfigV7, reviewContractHashV7(1, false)],
      [resolveReviewExecutionConfigV8(), assertReviewExecutionConfigV8, reviewContractHashV8(false)],
      [resolveReviewExecutionConfigV9(), assertReviewExecutionConfigV9, reviewContractHashV9(false)],
      [resolveReviewExecutionConfigV10(), assertReviewExecutionConfigV10, reviewContractHashV10(false, false, undefined, undefined, false)],
    ] as const;
    for (const [config, validate, modernHash] of cases) {
      const { configurationHash: _, ...data } = config;
      const modern = { ...data, contractHash: modernHash };
      expect(() => validate({ ...modern, configurationHash: arsenalHash(modern) })).not.toThrow();
      expect(() => validate(config)).not.toThrow();
    }
  });
});
