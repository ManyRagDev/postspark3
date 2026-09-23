import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type StoredResult = {
  caseId: string;
  anonymousModel: string;
  modelId: string;
  status: "completed" | "invalid" | "error";
  latencyMs: number;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  estimatedCostUsd: number;
  actualCostUsd?: number;
  factCoverage?: { rate: number | null };
  errors: string[];
};

function getArg(flag: string) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function latestRunDir() {
  const root = resolve("artifacts", "editorial-model-benchmark");
  const dirs = readdirSync(root)
    .map((name) => join(root, name))
    .filter((path) => statSync(path).isDirectory() && existsSync(join(path, "results.private.json")))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (!dirs[0]) throw new Error("Nenhuma execução do benchmark foi encontrada.");
  return dirs[0];
}

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const percentile = (values: number[], ratio: number) => {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))];
};

function summarize(results: StoredResult[]) {
  const models = Array.from(new Set(results.map((result) => result.modelId)));
  return models.map((modelId) => {
    const rows = results.filter((result) => result.modelId === modelId);
    const measuredLatency = rows.filter((row) => row.latencyMs > 0).map((row) => row.latencyMs);
    const coverage = rows
      .filter((row) => row.status === "completed" && row.factCoverage?.rate !== null && row.factCoverage?.rate !== undefined)
      .map((row) => row.factCoverage!.rate!);
    return {
      modelId,
      anonymousModel: rows[0]?.anonymousModel,
      attempted: rows.length,
      completed: rows.filter((row) => row.status === "completed").length,
      invalid: rows.filter((row) => row.status === "invalid").length,
      errors: rows.filter((row) => row.status === "error").length,
      validRate: rows.length ? rows.filter((row) => row.status === "completed").length / rows.length : 0,
      averageLatencyMs: average(measuredLatency),
      p50LatencyMs: percentile(measuredLatency, 0.5),
      averageFactCoverage: average(coverage),
      promptTokens: rows.reduce((sum, row) => sum + (row.usage.prompt_tokens ?? 0), 0),
      completionTokens: rows.reduce((sum, row) => sum + (row.usage.completion_tokens ?? 0), 0),
      reasoningTokens: rows.reduce(
        (sum, row) => sum + (row.usage.completion_tokens_details?.reasoning_tokens ?? 0),
        0,
      ),
      costUsd: rows.reduce((sum, row) => sum + (row.actualCostUsd ?? row.estimatedCostUsd), 0),
      errorSamples: Array.from(new Set(rows.flatMap((row) => row.errors))).slice(0, 5),
    };
  });
}

function main() {
  const runDir = resolve(getArg("--run") ?? latestRunDir());
  const source = join(runDir, "results.private.json");
  if (!existsSync(source)) throw new Error(`Arquivo ausente: ${source}`);
  const results = JSON.parse(readFileSync(source, "utf8")) as StoredResult[];
  const summary = {
    derivedAt: new Date().toISOString(),
    source,
    attempts: results.length,
    models: summarize(results),
  };

  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "machine-summary.private.json"), JSON.stringify(summary, null, 2), "utf8");
  const lines = [
    "# Resumo operacional privado — benchmark editorial",
    "",
    `Fonte: \`${source}\``,
    "",
    "| Modelo | Válidas | Inválidas | Erros | Latência média | Cobertura factual | Custo |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...summary.models.map((model) =>
      `| ${model.modelId} | ${model.completed}/${model.attempted} | ${model.invalid} | ${model.errors} | ${model.averageLatencyMs === null ? "n/d" : `${(model.averageLatencyMs / 1000).toFixed(1)}s`} | ${model.averageFactCoverage === null ? "n/d" : `${(model.averageFactCoverage * 100).toFixed(0)}%`} | US$ ${model.costUsd.toFixed(4)} |`,
    ),
    "",
    "> Este relatório mede operação e fidelidade lexical. Qualidade editorial depende da ficha cega humana.",
    "",
  ];
  writeFileSync(join(runDir, "machine-summary.private.md"), lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
  console.log(`Resumo gravado em ${runDir}`);
}

main();
