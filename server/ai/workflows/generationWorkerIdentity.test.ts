import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createGenerationWorkerIdentity } from "./generationWorkerIdentity";

it("identifies the running source/renderer while ignoring secrets and tests", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "generation-version-"));
  try {
    for (const path of ["server", "shared", "dist/review-renderer"])
      await mkdir(join(rootDir, path), { recursive: true });
    for (const path of [
      "server/runtime.ts",
      "shared/contract.ts",
      "package.json",
      "pnpm-lock.yaml",
      "dist/review-renderer/renderer.js",
    ])
      await writeFile(join(rootDir, path), "original");
    const first = await createGenerationWorkerIdentity({ rootDir });
    await writeFile(join(rootDir, ".env"), "secret");
    await writeFile(join(rootDir, "server/runtime.test.ts"), "test");
    const second = await createGenerationWorkerIdentity({ rootDir });
    expect(second.codeVersion).toBe(first.codeVersion);
    expect(second.workerId).not.toBe(first.workerId);
    expect(first.workerId).toMatch(/^sha256:[a-f0-9]{64}:[a-f0-9-]{36}$/);
    expect(first.workerId.length).toBeLessThanOrEqual(160);
    await writeFile(join(rootDir, "server/runtime.ts"), "fixed");
    const fixed = await createGenerationWorkerIdentity({ rootDir });
    expect(fixed.codeVersion).not.toBe(first.codeVersion);
    await writeFile(
      join(rootDir, "dist/review-renderer/renderer.js"),
      "rebuilt"
    );
    expect(
      (await createGenerationWorkerIdentity({ rootDir })).codeVersion
    ).not.toBe(fixed.codeVersion);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
