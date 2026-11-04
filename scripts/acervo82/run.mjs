import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readLocalEnvironment, sanitizedEnvironment } from "./environment.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const action = process.argv[2];
if (!["fixtures", "verify"].includes(action))
  throw new Error("unsupported_local_action");
const child = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/acervo82/journey.ts", action],
  {
    cwd: root,
    stdio: "inherit",
    env: sanitizedEnvironment(await readLocalEnvironment(root)),
  }
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
