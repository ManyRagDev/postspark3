import { describe, expect, it } from "vitest";
import { createSnapshotV1, createSnapshotV2 } from "../../../tests/fixtures/postspark";
import { postVisualSnapshotSchema } from "../../../shared/postsparkSchemas";
import { migrateToLatest, migrateV1ToV2, migrateV2ToV3, isSnapshotV1, isSnapshotV2, isSnapshotV4 } from "./snapshotMigration";
import type { PostVisualSnapshot } from "@shared/postspark";

describe("snapshotMigration", () => {
  it("migrates v1 to v2 preserving all fields", () => {
    const v1 = createSnapshotV1({ snapshotVersion: 1, backgroundColor: "#101828", textColor: "#FFFFFF", accentColor: "#7F56D9" });
    const v2 = migrateV1ToV2(v1);

    expect(v2.snapshotVersion).toBe(2);
    expect(v2.headline).toBe(v1.headline);
    expect(v2.body).toBe(v1.body);
    expect(v2.backgroundColor).toBe("#101828");
    expect(v2.textColor).toBe("#FFFFFF");
    expect(v2.accentColor).toBe("#7F56D9");
    expect(v2.sections).toEqual(v1.sections);
    expect(v2.textElements).toEqual(v1.textElements);
  });

  it("migrates v2 to v3 preserving all fields", () => {
    const v2 = createSnapshotV2({ snapshotVersion: 2 });
    const v3 = migrateV2ToV3(v2);

    expect(v3.snapshotVersion).toBe(3);
    expect(v3.headline).toBe(v2.headline);
    expect(v3.backgroundColor).toBe(v2.backgroundColor);
    expect(v3.designTokens).toBeDefined();
    expect(v3.layoutSettings).toBeDefined();
    expect(v3.bgValue).toBeDefined();
  });

  it("migrates v1 to v4 in one step", () => {
    const v1 = createSnapshotV1({ snapshotVersion: 1 });
    const v4 = migrateToLatest(v1);

    expect(v4.snapshotVersion).toBe(4);
    expect(isSnapshotV4(v4)).toBe(true);
  });

  it("v4 is idempotent under migration", () => {
    const v2 = createSnapshotV2({ snapshotVersion: 2 });
    const first = migrateToLatest(v2);
    const second = migrateToLatest(first);

    expect(first.snapshotVersion).toBe(4);
    expect(second).toEqual(first);
  });

  it("validates v3 snapshots with Zod schema", () => {
    const v2 = createSnapshotV2({ snapshotVersion: 2, headline: "Test v3", body: "Body v3" });
    const v3 = migrateV2ToV3(v2);

    const parsed = postVisualSnapshotSchema.parse(v3);
    expect(parsed.snapshotVersion).toBe(3);
    expect(parsed.headline).toBe("Test v3");
  });

  it("validates v1 snapshots with Zod schema", () => {
    const v1 = createSnapshotV1({ snapshotVersion: 1, headline: "Legacy", body: "Legacy body" });
    const parsed = postVisualSnapshotSchema.parse(v1);

    expect(parsed.snapshotVersion).toBe(1);
    expect(parsed.headline).toBe("Legacy");
  });

  it("validates v2 snapshots with Zod schema", () => {
    const v2 = createSnapshotV2({ snapshotVersion: 2 });
    const parsed = postVisualSnapshotSchema.parse(v2);

    expect(parsed.snapshotVersion).toBe(2);
  });

  it("does not remove unknown fields during migration", () => {
    const v2 = createSnapshotV2({ snapshotVersion: 2 }) as PostVisualSnapshot & { customField: string };
    v2.customField = "preserved";

    const v3 = migrateV2ToV3(v2);
    expect((v3 as any).customField).toBe("preserved");
  });
});
