/** Offline only: imports no provider/runtime, reads no .env and dispatches no requests. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { evaluateEditorialReplay } from "../server/ai/workflows/editorialEvaluation";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && !args[0].startsWith("--responses=")))
  throw new Error(
    "Usage: pnpm evaluate:editorial:offline [--responses=recorded-verdicts.json]"
  );
const corpus = JSON.parse(
  await readFile(
    fileURLToPath(
      new URL(
        "../server/ai/workflows/fixtures/editorial-corpus.json",
        import.meta.url
      )
    ),
    "utf8"
  )
);
const supplied = args.length
  ? JSON.parse(await readFile(args[0].slice("--responses=".length), "utf8"))
  : undefined;
console.log(JSON.stringify(evaluateEditorialReplay(corpus, supplied), null, 2));
