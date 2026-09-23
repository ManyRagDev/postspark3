import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ENV } from "../../_core/env";
import { EDITORIAL_BENCHMARK_CORPUS } from "./corpus";
import {
  BENCHMARK_MODELS,
  buildEditorialMessages,
  EDITORIAL_JSON_SCHEMA,
  estimateCostUsd,
  measureFactCoverage,
  parseEditorialResponse,
  shuffledAnonymousLabels,
  type BenchmarkModel,
} from "./core";

type ApiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

type BenchmarkResult = {
  caseId: string;
  anonymousModel: string;
  modelId: string;
  status: "completed" | "invalid" | "error";
  latencyMs: number;
  usage: ApiUsage;
  estimatedCostUsd: number;
  actualCostUsd?: number;
  structuredOutputMode: "native_schema" | "prompt_json";
  response?: ReturnType<typeof parseEditorialResponse>["value"];
  rawContent?: string;
  factCoverage?: ReturnType<typeof measureFactCoverage>;
  errors: string[];
};

class RateLimitError extends Error {}

function hasFlag(flag: string) {
  return process.argv.slice(2).includes(flag);
}

function getArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function selectedModels(): BenchmarkModel[] {
  const requested = getArg("--models")?.split(",").map((value) => value.trim()).filter(Boolean);
  if (!requested?.length) return BENCHMARK_MODELS.filter((model) => model.defaultEnabled);
  const selected = BENCHMARK_MODELS.filter((model) => requested.includes(model.id));
  const unknown = requested.filter((id) => !selected.some((model) => model.id === id));
  if (unknown.length) throw new Error(`Modelos desconhecidos: ${unknown.join(", ")}`);
  return selected;
}

function selectedCases() {
  const requested = getArg("--cases")?.split(",").map((value) => value.trim()).filter(Boolean);
  if (!requested?.length) return EDITORIAL_BENCHMARK_CORPUS;
  const selected = EDITORIAL_BENCHMARK_CORPUS.filter((item) => requested.includes(item.id));
  const unknown = requested.filter((id) => !selected.some((item) => item.id === id));
  if (unknown.length) throw new Error(`Casos desconhecidos: ${unknown.join(", ")}`);
  return selected;
}

async function callOpenRouter(model: BenchmarkModel, testCase: (typeof EDITORIAL_BENCHMARK_CORPUS)[number]) {
  const messages = buildEditorialMessages(testCase);
  const body: Record<string, unknown> = {
    model: model.id,
    messages,
    temperature: 0.45,
    top_p: 0.9,
    max_tokens: 3500,
    reasoning: { effort: model.reasoningEffort, exclude: true },
    provider: {
      allow_fallbacks: true,
      data_collection: "deny",
      require_parameters: model.requireParameters,
      sort: "latency",
    },
  };
  if (model.nativeStructuredOutput) {
    body.response_format = { type: "json_schema", json_schema: EDITORIAL_JSON_SCHEMA };
  } else {
    messages[0].content += `\n\nO provedor não impõe JSON Schema. Siga exatamente este schema e não use markdown:\n${JSON.stringify(EDITORIAL_JSON_SCHEMA.schema)}`;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = Number(getArg("--timeout-ms") ?? 60_000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let rawText: string;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ENV.openRouterApiKey}`,
        "HTTP-Referer": ENV.openRouterSiteUrl,
        "X-Title": `${ENV.openRouterAppName} Editorial Benchmark`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    rawText = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`timeout após ${timeoutMs}ms em ${model.id} / ${testCase.id}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const latencyMs = Date.now() - startedAt;
  if (response.status === 429) throw new RateLimitError(`429 em ${model.id} / ${testCase.id}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${rawText.slice(0, 400)}`);

  const payload = JSON.parse(rawText) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: ApiUsage;
  };
  return {
    content: payload.choices?.[0]?.message?.content ?? "",
    usage: payload.usage ?? {},
    latencyMs,
  };
}

function writeReview(path: string, results: BenchmarkResult[]) {
  const lines = [
    "# Avaliação cega — modelos editoriais PostSpark",
    "",
    "> Não abra `model-map.private.json` antes de concluir esta ficha.",
    "> Dê notas de 1 (fraco) a 5 (excelente). Julgue o conjunto sem tentar adivinhar o modelo.",
    "",
  ];
  for (const testCase of EDITORIAL_BENCHMARK_CORPUS) {
    const caseResults = results.filter((result) => result.caseId === testCase.id);
    if (!caseResults.length) continue;
    lines.push(`## ${testCase.id}`, "", `**Briefing:** ${testCase.brief}`, "");
    for (const result of caseResults.sort((a, b) => a.anonymousModel.localeCompare(b.anonymousModel))) {
      lines.push(`### ${result.anonymousModel}`, "");
      if (!result.response) {
        lines.push(`Resposta indisponível (${result.status}).`, "");
        continue;
      }
      result.response.variations.forEach((variation, index) => {
        lines.push(
          `**Opção ${index + 1} — ${variation.tone}**`,
          "",
          `> ${variation.headline}`,
          `>`,
          `> ${variation.body}`,
          `>`,
          `> CTA: ${variation.cta}`,
          "",
        );
      });
      lines.push(
        "- Clareza na primeira leitura (1–5):",
        "- Naturalidade em português brasileiro (1–5):",
        "- Sensação humana e premium (1–5):",
        "- Fidelidade ao briefing (1–5):",
        "- Melhor opção (1–3):",
        "- Observações:",
        "",
      );
    }
  }
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const execute = hasFlag("--execute");
  const models = selectedModels();
  const cases = selectedCases();
  const totalCalls = models.length * cases.length;

  console.log(`Benchmark editorial: ${models.length} modelos × ${cases.length} casos = ${totalCalls} chamadas.`);
  if (!execute) {
    console.log("Modo seguro: nenhuma chamada foi feita. Use --execute para autorizar custo real.");
    console.log(`Modelos: ${models.map((model) => model.id).join(", ")}`);
    return;
  }
  if (!ENV.openRouterApiKey) throw new Error("OPENROUTER_API_KEY não está configurada.");

  const appendRun = getArg("--append");
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const outDir = appendRun
    ? join(process.cwd(), appendRun)
    : join(process.cwd(), "artifacts", "editorial-model-benchmark", runId);
  mkdirSync(outDir, { recursive: true });
  const mapPath = join(outDir, "model-map.private.json");
  const resultsPath = join(outDir, "results.private.json");
  const labelMap: Record<string, string> = appendRun && existsSync(mapPath)
    ? JSON.parse(readFileSync(mapPath, "utf8"))
    : shuffledAnonymousLabels(models);
  if (appendRun) {
    const missingModels = models.filter((model) => !labelMap[model.id]);
    const usedLabels = new Set(Object.values(labelMap));
    for (const model of missingModels) {
      const nextIndex = Array.from({ length: 26 }, (_, index) => index)
        .find((index) => !usedLabels.has(`Modelo ${String.fromCharCode(65 + index)}`));
      if (nextIndex === undefined) throw new Error("Sem rótulo anônimo disponível.");
      const label = `Modelo ${String.fromCharCode(65 + nextIndex)}`;
      labelMap[model.id] = label;
      usedLabels.add(label);
    }
  }
  const existingResults: BenchmarkResult[] = appendRun && existsSync(resultsPath)
    ? JSON.parse(readFileSync(resultsPath, "utf8"))
    : [];
  const replacing = new Set(models.flatMap((model) => cases.map((testCase) => `${model.id}:${testCase.id}`)));
  const results: BenchmarkResult[] = existingResults.filter(
    (result) => !replacing.has(`${result.modelId}:${result.caseId}`),
  );

  const persist = () => {
    const publicResults = results.map(({ modelId: _modelId, rawContent: _rawContent, ...result }) => result);
    writeFileSync(join(outDir, "results.blind.json"), JSON.stringify(publicResults, null, 2), "utf8");
    writeFileSync(join(outDir, "results.private.json"), JSON.stringify(results, null, 2), "utf8");
    writeFileSync(join(outDir, "model-map.private.json"), JSON.stringify(labelMap, null, 2), "utf8");
    writeReview(join(outDir, "review.blind.md"), results);
  };

  try {
    for (const testCase of cases) {
      for (const model of models) {
        const anonymousModel = labelMap[model.id];
        process.stdout.write(`• ${testCase.id} / ${anonymousModel} ... `);
        try {
          const call = await callOpenRouter(model, testCase);
          const parsed = parseEditorialResponse(call.content);
          const promptTokens = call.usage.prompt_tokens ?? 0;
          const completionTokens = call.usage.completion_tokens ?? 0;
          results.push({
            caseId: testCase.id,
            anonymousModel,
            modelId: model.id,
            status: parsed.valid ? "completed" : "invalid",
            latencyMs: call.latencyMs,
            usage: call.usage,
            estimatedCostUsd: estimateCostUsd({ model, promptTokens, completionTokens }),
            actualCostUsd: typeof call.usage.cost === "number" ? call.usage.cost : undefined,
            structuredOutputMode: model.nativeStructuredOutput ? "native_schema" : "prompt_json",
            response: parsed.value,
            rawContent: call.content,
            factCoverage: parsed.value ? measureFactCoverage(parsed.value, testCase.expectedFacts) : undefined,
            errors: parsed.errors,
          });
          console.log(`${parsed.valid ? "ok" : "JSON inválido"} · ${call.latencyMs}ms`);
        } catch (error) {
          if (error instanceof RateLimitError) throw error;
          results.push({
            caseId: testCase.id,
            anonymousModel,
            modelId: model.id,
            status: "error",
            latencyMs: 0,
            usage: {},
            estimatedCostUsd: 0,
            structuredOutputMode: model.nativeStructuredOutput ? "native_schema" : "prompt_json",
            errors: [error instanceof Error ? error.message : String(error)],
          });
          console.log("erro registrado");
        }
        persist();
      }
    }
  } catch (error) {
    persist();
    if (error instanceof RateLimitError) {
      console.error(`\nBenchmark interrompido imediatamente por rate limit: ${error.message}`);
      console.error(`Resultados parciais: ${outDir}`);
      process.exitCode = 29;
      return;
    }
    throw error;
  }

  persist();
  const completed = results.filter((result) => result.status === "completed").length;
  const invalid = results.filter((result) => result.status === "invalid").length;
  const errors = results.filter((result) => result.status === "error").length;
  const actualCost = results.reduce((sum, result) => sum + (result.actualCostUsd ?? result.estimatedCostUsd), 0);
  console.log(`\nConcluído: ${completed} válidas, ${invalid} inválidas, ${errors} erros.`);
  console.log(`Custo registrado/estimado: US$ ${actualCost.toFixed(4)}`);
  console.log(`Ficha cega: ${join(outDir, "review.blind.md")}`);
  console.log(`Mapa privado: ${join(outDir, "model-map.private.json")}`);
}

main().catch((error) => {
  console.error("Benchmark abortou:", error instanceof Error ? error.message : error);
  process.exit(1);
});
