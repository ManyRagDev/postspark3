import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("refuses the old queue consumer before starting resources when local demand is active", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--require", resolve("scripts/testing/block-network.cjs"),
      "--import", "tsx",
      resolve("server/ai/workflows/generationWorker.ts"),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        VERCEL: "",
        GENERATION_LOCAL_DEMAND_ENABLED: "true",
        GENERATION_WORKER_MODE: "local-demand",
      },
      encoding: "utf8",
      timeout: 15_000,
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("generation:worker é exclusivo do modo external explícito");
  expect(result.stdout).not.toContain("Executor iniciado");
});
