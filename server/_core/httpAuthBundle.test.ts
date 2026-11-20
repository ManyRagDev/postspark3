import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { afterAll, beforeAll, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const run = promisify(execFile);
const versioned = path.join(root, "api/index.js");
// A byte-identical release copy installed beside its own lockfile's dependencies.
const releaseBundle = process.env.POSTSPARK_TEST_RELEASE_BUNDLE;
let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "postspark-http-auth-"));
  await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
  await symlink(path.join(root, "shared/typography/fonts/files"), path.join(directory, "files"), "dir");
  await build({
    absWorkingDir: root,
    entryPoints: ["server/_core/index.ts"],
    platform: "node", packages: "external", bundle: true, format: "esm",
    define: { "process.env.POSTSPARK_API_WITHOUT_LOCAL_EMBEDDINGS": '"1"' },
    outfile: path.join(directory, "current.mjs"),
  });
});

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function checkHttp(bundle: string, target: "versioned" | "current", mode: string) {
  // The entrypoint writes diagnostics relative to cwd. Isolate both logs and environment.
  await run(process.execPath, [path.join(root, "scripts/testing/http-auth.smoke.mjs"), bundle, target], {
    cwd: directory,
    env: {
      NODE_ENV: mode, BYPASS_AUTH: "true", VERCEL: "1",
      DOTENV_CONFIG_PATH: "/dev/null", POSTSPARK_ACERVO82_LOCAL: "true",
      SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
    },
    timeout: 15_000,
  });
}

it("excludes the development override from both distributable bundles", async () => {
  for (const bundle of [versioned, path.join(directory, "current.mjs")]) {
    expect(await readFile(bundle, "utf8")).not.toMatch(/\b(?:BYPASS_AUTH|DEV_USER)\b/);
  }
});

it.each(["development", "production"])("enforces HTTP auth in a fresh build in %s", async mode => {
  await checkHttp(path.join(directory, "current.mjs"), "current", mode);
}, 20_000);

it.skipIf(!releaseBundle).each(["development", "production"])("enforces HTTP auth in the versioned release in %s", async mode => {
  const bundle = path.resolve(releaseBundle!);
  expect((await readFile(versioned)).equals(await readFile(bundle))).toBe(true);
  await checkHttp(bundle, "versioned", mode);
}, 20_000);
