import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

/** Sources plus actual renderer bytes; no environment values or credentials. */
export async function localPipelineFingerprint(rendererPath: string) {
  const files: string[] = [];
  const walk = async (path: string) => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (/\.(?:ts|mjs)$/.test(file) && !/\.test\.ts$/.test(file))
        files.push(file);
    }
  };
  await walk("server");
  await walk("shared");
  files.push(rendererPath);
  const hash = createHash("sha256");
  for (const path of files.sort()) {
    hash.update(path);
    hash.update(await readFile(path));
  }
  return hash.digest("hex");
}
