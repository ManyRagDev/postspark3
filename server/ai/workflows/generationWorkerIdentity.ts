import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface GenerationWorkerIdentity {
  workerId: string;
  codeVersion: string;
  startedAt: string;
}

/** Fingerprint the executable sources and renderer, including uncommitted fixes.
 * Secrets, fixtures and tests are never inputs. The existing heartbeat id carries
 * the fingerprint so older API/database deployments remain compatible.
 */
export async function createGenerationWorkerIdentity(
  options: {
    rootDir?: string;
    rendererBundlePath?: string;
  } = {}
): Promise<GenerationWorkerIdentity> {
  const root =
    options.rootDir ?? fileURLToPath(new URL("../../../", import.meta.url));
  const hash = createHash("sha256");
  async function add(label: string, path: string) {
    const bytes = await readFile(path);
    hash.update(`${label}\0${bytes.length}\0`).update(bytes);
  }
  async function visit(relative: string) {
    const entries = await readdir(join(root, relative), {
      withFileTypes: true,
    });
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      if (/^(?:fixtures|benchmarks|__tests__|node_modules)$/.test(entry.name))
        continue;
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(child);
      else if (
        entry.isFile() &&
        /\.(?:ts|tsx|js|mjs|json)$/.test(entry.name) &&
        !/\.(?:test|spec|fixture)\./.test(entry.name)
      )
        await add(child, join(root, child));
    }
  }
  await visit("server");
  await visit("shared");
  await add("package.json", join(root, "package.json"));
  await add("pnpm-lock.yaml", join(root, "pnpm-lock.yaml"));
  await add(
    "review-renderer",
    resolve(
      root,
      options.rendererBundlePath ?? "dist/review-renderer/renderer.js"
    )
  );
  const codeVersion = `sha256:${hash.digest("hex")}`;
  return {
    workerId: `${codeVersion}:${randomUUID()}`,
    codeVersion,
    startedAt: new Date().toISOString(),
  };
}
