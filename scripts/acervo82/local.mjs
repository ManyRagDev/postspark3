import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import {
  validateEnvironment,
  readLocalEnvironment,
  sanitizedEnvironment,
  supabaseEnvironment,
} from "./environment.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const command = process.argv[2] || "doctor";
if (!["init", "doctor", "dev"].includes(command))
  throw new Error("unknown_local_command");
if (command === "init") {
  await mkdir(path.join(root, ".acervo82-local"), { recursive: true });
  const example = await readFile(
    path.join(root, "ops/acervo82/local.env.example"),
    "utf8"
  );
  try {
    await writeFile(path.join(root, ".acervo82-local/.env"), example, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  console.log("Local profile prepared; existing values were preserved.");
} else if (command === "doctor") {
  const checks = [];
  const cli = spawnSync(
    process.execPath,
    [path.join(root, "node_modules/supabase/dist/supabase.js"), "--version"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 10000,
      env: supabaseEnvironment(root),
    }
  );
  checks.push({
    name: "supabase-cli-3.0.0",
    ready: !cli.error && cli.status === 0 && cli.stdout.trim() === "3.0.0",
  });
  let env;
  try {
    env = await readLocalEnvironment(root);
    validateEnvironment(env);
    checks.push({ name: "local-environment", ready: true });
  } catch (error) {
    checks.push({
      name: "local-environment",
      ready: false,
      reason: error.message,
    });
  }
  if (env) {
    const client = new pg.Client({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: 2000,
    });
    try {
      await client.connect();
      const tables = [
        "postspark.posts",
        "postspark.profiles",
        "postspark.generation_v5_requests",
        "postspark.design_components",
        "postspark.catalog_state",
      ];
      const result = await client.query(
        "SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS name",
        [tables]
      );
      const missing = result.rows.filter(r => !r.present).map(r => r.name);
      checks.push({
        name: "local-application-schema",
        ready: missing.length === 0,
        missing,
      });
      if (!missing.length) {
        const account = JSON.parse(
          await readFile(
            path.join(root, ".acervo82-local/test-account.json"),
            "utf8"
          )
        );
        const profile = await client.query(
          `select p.id,p.plan,exists(select 1 from acervo82_private.access_grants g where g.user_id=p.id) as access
          from postspark.profiles p where p.id=$1 and p.email=$2`,
          [account.id, account.email]
        );
        checks.push({
          name: "local-test-profile",
          ready:
            profile.rows[0]?.plan === "DEV" && profile.rows[0]?.access === true,
        });
        const journal = await client.query(
          "select count(*)::int as steps from acervo82_private.schema_steps"
        );
        checks.push({
          name: "local-bootstrap-journal",
          ready: journal.rows[0]?.steps === 56,
          steps: journal.rows[0]?.steps,
        });
        const catalog = await client.query(
          "select active_revision::text from postspark.catalog_state where id=true"
        );
        checks.push({
          name: "catalogue-generation-paused",
          ready:
            env.GENERATION_ADMISSION_PAUSED === "true" &&
            env.GENERATION_LOCAL_DEMAND_ENABLED === "false",
          activeRevision: catalog.rows[0]?.active_revision ?? null,
        });
      }
    } catch (error) {
      checks.push({
        name: "local-application-schema",
        ready: false,
        reason: error.code || error.message,
      });
    } finally {
      await client.end();
    }
    try {
      const response = await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: env.VITE_SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(5000),
      });
      const settings = await response.json();
      checks.push({
        name: "local-auth-service",
        ready: response.ok,
        providers: {
          google: settings.external?.google === true,
          email: settings.external?.email === true,
        },
      });
    } catch (error) {
      checks.push({
        name: "local-auth-service",
        ready: false,
        reason: error.code || error.message,
      });
    }
    try {
      const admin = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const result = await admin.storage.listBuckets();
      const expected = ["postspark-media", "design-arsenal"];
      checks.push({
        name: "private-local-storage",
        ready:
          !result.error &&
          expected.every(name =>
            result.data?.some(b => b.name === name && !b.public)
          ),
        buckets: expected,
      });
    } catch (error) {
      checks.push({
        name: "private-local-storage",
        ready: false,
        reason: error.code || error.message,
      });
    }
  }
  console.log(
    JSON.stringify({
      checks,
      runtime: "native-experimental",
      paidResourcesCreated: false,
      admissionPaused: true,
      fullJourneyVerified: false,
    })
  );
  if (checks.some(c => !c.ready)) process.exitCode = 2;
} else {
  const input = await readLocalEnvironment(root);
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/_core/index.ts"],
    { cwd: root, stdio: "inherit", env: sanitizedEnvironment(input) }
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.once("error", error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once("exit", code => {
    process.exitCode = code ?? 1;
  });
}
