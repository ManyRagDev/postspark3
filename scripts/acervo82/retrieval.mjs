import { spawn } from "node:child_process";
import { readLocalEnvironment, sanitizedEnvironment } from "./environment.mjs";
const env = sanitizedEnvironment(await readLocalEnvironment(process.cwd()));
env.DESIGN_RETRIEVAL_DIRECTORY ||= ".postspark-local/design-retrieval";
const verify = process.argv[2] === "--verify";
const child = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    verify
      ? "scripts/acervo82/retrievalVerify.ts"
      : "scripts/acervo82/retrieval.ts",
    ...process.argv.slice(verify ? 3 : 2),
  ],
  { env, stdio: "inherit" }
);
child.once("exit", code => (process.exitCode = code ?? 1));
