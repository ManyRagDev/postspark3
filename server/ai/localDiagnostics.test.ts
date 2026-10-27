import {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  utimes,
  stat,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  writeLocalDiagnostic,
  redactDiagnostics,
  readLocalDiagnosticRecords,
} from "./localDiagnostics";
describe("private diagnostics", () => {
  it("rotates an aged active log before writing so retention keeps the new diagnostic", async () => {
    const dir = await mkdtemp(join(tmpdir(), "postspark-active-log-"));
    try {
      await writeLocalDiagnostic("operational", {event:"old"}, dir);
      await utimes(join(dir,"operational.jsonl"),new Date(0),new Date(0));
      await writeLocalDiagnostic("operational", {event:"new"}, dir);
      expect(await readLocalDiagnosticRecords("operational",dir)).toEqual([{event:"new"}]);
      expect(await readdir(dir)).toEqual(["operational.jsonl"]);
    } finally { await rm(dir,{recursive:true,force:true}); }
  });
  it("redacts credential fields and bearer tokens without losing diagnostic content", () => {
    expect(
      redactDiagnostics({
        prompt: "normal input",
        access_token: "secret",
        authorization: "Bearer something",
        nested: { cookie: "private" },
        error: "Bearer xyz expired",
      })
    ).toEqual({
      prompt: "normal input",
      access_token: "[redacted]",
      authorization: "[redacted]",
      nested: { cookie: "[redacted]" },
      error: "Bearer [redacted] expired",
    });
  });
  it("rotates files, removes expired records and reports write failures to the caller", async () => {
    const dir = await mkdtemp(join(tmpdir(), "postspark-diagnostics-"));
    try {
      await writeFile(join(dir, "old.jsonl"), "old");
      await utimes(join(dir, "old.jsonl"), new Date(0), new Date(0));
      await writeLocalDiagnostic(
        "run",
        { prompt: "a".repeat(3 * 1024 * 1024) },
        dir
      );
      await writeLocalDiagnostic(
        "run",
        { prompt: "b".repeat(3 * 1024 * 1024) },
        dir
      );
      const files = await readdir(dir);
      expect(files).not.toContain("old.jsonl");
      expect(files).toHaveLength(2);
      for (const f of files)
        expect((await stat(join(dir, f))).size).toBeLessThanOrEqual(
          5 * 1024 * 1024
        );
      expect(await readFile(join(dir, "run.jsonl"), "utf8")).toContain("bbbb");
      await expect(
        writeLocalDiagnostic("run", {}, join(dir, "run.jsonl"))
      ).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("reassembles large local evidence for diagnostic consumers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "postspark-large-trace-"));
    try {
      const trace = {
        id: "run",
        events: [
          {
            stage: "component.retrieve",
            data: { cards: ["a".repeat(6 * 1024 * 1024)] },
          },
        ],
      };
      await writeLocalDiagnostic("run", trace, dir);
      const records = await readLocalDiagnosticRecords("run", dir);
      expect(records).toEqual([trace]);
      for (const file of await readdir(dir))
        expect((await stat(join(dir, file))).size).toBeLessThanOrEqual(
          5 * 1024 * 1024
        );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
