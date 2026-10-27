import { describe, expect, it } from "vitest";
import { partitionArsenalReadinessIssues } from "./arsenalReadiness";

describe("partitionArsenalReadinessIssues", () => {
  it("keeps authored image overlap and unknown contrast diagnostic without releasing measured failures", () => {
    const issues = ["collision:text_media:title/photo", "contrast:unknown:title", "contrast:low:body", "collision:title/body", "overflow:title", "cardinality:list", "new_unknown_issue"];
    expect(partitionArsenalReadinessIssues(issues)).toEqual({
      diagnostics: issues.slice(0, 2), blocking: issues.slice(2),
    });
    expect(issues).toHaveLength(7);
  });
});
