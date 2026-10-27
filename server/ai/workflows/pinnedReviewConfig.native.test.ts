import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("loads the real API module graph under native ESM, including all review protocol versions", () => {
  const output = execFileSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    "await import('./server/routers.ts'); console.log('native-api-import-ready');",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 20000,
    env: { ...process.env, NODE_OPTIONS: "--require=./scripts/testing/block-network.cjs" },
  });
  expect(output).toContain("native-api-import-ready");
}, 25000);

it("loads server configuration before transitive consumers even when a route is imported first", () => {
  const directory = mkdtempSync(join(tmpdir(), "postspark-env-bootstrap-"));
  const configPath = join(directory, ".env");
  writeFileSync(configPath, "SUPABASE_URL=https://bootstrap.example.com\nSUPABASE_SERVICE_ROLE_KEY=bootstrap-test-key\nOPENROUTER_API_KEY=bootstrap-provider-key\nGENERATION_LOCAL_DEMAND_ENABLED=true\n");
  const env = { ...process.env };
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY", "GENERATION_LOCAL_DEMAND_ENABLED"]) delete env[key];
  try {
    const output = execFileSync(process.execPath, [
      "--import", "tsx", "--input-type=module", "--eval",
      `await import('./server/_core/brandCaptureRoutes.ts');
       await import('dotenv/config');
       const { ENV } = await import('./server/_core/env.ts');
       if (ENV.supabaseUrl !== 'https://bootstrap.example.com' || ENV.supabaseServiceRoleKey !== 'bootstrap-test-key' || ENV.openRouterApiKey !== 'bootstrap-provider-key' || !ENV.localDemandEnabled) throw Error('server_configuration_loaded_too_late');
       console.log('native-configuration-ready');`,
    ], {
      cwd: process.cwd(), encoding: "utf8", timeout: 20000,
      env: { ...env, NODE_ENV: "development", DOTENV_CONFIG_PATH: configPath, NODE_OPTIONS: "--require=./scripts/testing/block-network.cjs" },
    });
    expect(output).toContain("native-configuration-ready");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 25000);
