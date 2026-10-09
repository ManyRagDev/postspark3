import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ENV } from "../../_core/env";

/** Starts the V5 executor only alongside the local development server. */
export function startLocalGenerationWorker(): ChildProcess | undefined {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.VERCEL ||
    ENV.generationV5Mode !== "dev"
  ) {
    return undefined;
  }

  const workerPath = fileURLToPath(
    new URL("./generationWorker.ts", import.meta.url)
  );
  let child: ChildProcess;

  try {
    child = fork(workerPath, [], {
      env: { ...process.env },
      execArgv: ["--import", "tsx"],
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    });
  } catch (error) {
    console.error(
      "[generation-worker:local] Não foi possível iniciar o executor; sem novas tentativas.",
      error
    );
    return undefined;
  }

  console.info(
    "[generation-worker:local] Executor V5 iniciado como processo filho."
  );
  child.once("error", error => {
    console.error(
      "[generation-worker:local] Falha no processo filho; sem novas tentativas.",
      error
    );
  });
  child.once("exit", (code, signal) => {
    if (code === 0) {
      console.info("[generation-worker:local] Executor encerrado.");
    } else {
      console.error(
        `[generation-worker:local] Executor encerrou com code=${String(code)} signal=${String(signal)}; sem novas tentativas.`
      );
    }
  });

  return child;
}
