import { describe, expect, it } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { resolveGenerationModelConfig } from "../generationModel";
import { assertReviewExecutionConfigV10, resolveReviewExecutionConfigV10, reviewContractHashV10 } from "./reviewExecutionConfigV10";

const current = () => resolveReviewExecutionConfigV10(undefined, resolveGenerationModelConfig({ generationModel: "auto", postMode: "static" }).taskRouting!.copy);
const seal = (data: object) => ({ ...data, configurationHash: arsenalHash(data) });
describe("pinned visual text repair policy", () => {
  it("enables the existing vision model only on new automatic admissions", () => {
    const config = current();
    expect(config).toMatchObject({ automaticReviewVersion: 4, textFlexibilityVersion: 1, visualTextRepairVersion: 1, taskModelConfig: { model: "anthropic/claude-haiku-5.5" } });
    expect(assertReviewExecutionConfigV10(config)).toEqual(config);
    const manual = resolveReviewExecutionConfigV10("google/gemini-2.5-flash");
    expect(manual).not.toHaveProperty("visualTextRepairVersion");
    expect(assertReviewExecutionConfigV10(manual)).toEqual(manual);
  });
  it("accepts historical absence and rejects marker changes without rehash", () => {
    const { configurationHash, ...data } = current(); delete data.visualTextRepairVersion;
    expect(() => assertReviewExecutionConfigV10({ ...data, configurationHash })).toThrow();
    const old = seal(data); expect(assertReviewExecutionConfigV10(old)).toEqual(old);
    expect(old.configurationHash).not.toBe(configurationHash);
    expect(() => assertReviewExecutionConfigV10({ ...old, visualTextRepairVersion: 1 })).toThrow();
  });
  it.each(["without_window", "without_task", "old_review", "unsupported_version"])("rejects %s even when its configuration hash is sealed", mode => {
    const { configurationHash: _, ...data } = current();
    const changed: any = { ...data };
    if (mode === "without_window") delete changed.textFlexibilityVersion;
    if (mode === "without_task") delete changed.taskModelConfig;
    if (mode === "unsupported_version") changed.visualTextRepairVersion = 2;
    if (mode === "old_review") {
      changed.automaticReviewVersion = 3;
      for (const key of ["localContrastPolicyVersion", "profileHandlePolicyVersion", "nativeGlyphProjection", "nativeGlyphManifestHash", "textFlexibilityVersion"]) delete changed[key];
      changed.contractHash = reviewContractHashV10(false, true, 1, 3);
    }
    expect(() => assertReviewExecutionConfigV10(seal(changed))).toThrow();
  });
});
