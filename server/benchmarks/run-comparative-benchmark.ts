import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { invokeLLM } from "../_core/llm";
import { generationModelCallOptions, resolveGenerationModelConfig } from "../ai/generationModel";
import type { ActiveGenerationModel } from "../../shared/generationModel";
import { ENV } from "../_core/env";
import {
  EDITORIAL_JSON_SCHEMA,
  EditorialResponseSchema,
  type EditorialResponse,
} from "./editorialModels/core";

export type TestModelConfig = {
  id: ActiveGenerationModel;
  name: string;
  slug: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  reasoningEffort: "none" | "minimal" | "low";
};

export const TEST_MODELS: TestModelConfig[] = [
  {
    id: "gemini",
    name: "Gemini 3.8 Flash",
    slug: "google/gemini-3.8-flash",
    inputCostPerMillion: 0.825,
    outputCostPerMillion: 4.125,
    reasoningEffort: "minimal",
  },
  {
    id: "claude",
    name: "Claude Haiku 5.5",
    slug: "anthropic/claude-haiku-5.5",
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.50,
    reasoningEffort: "none",
  },
  {
    id: "deepseek",
    name: "DeepSeek V4.1 Flash",
    slug: "deepseek/deepseek-v4.1-flash",
    inputCostPerMillion: 0.045,
    outputCostPerMillion: 0.50,
    reasoningEffort: "none",
  },
];

export type TestCase = {
  id: string;
  title: string;
  theme: string;
  brief: string;
  expectedFacts: string[];
};

export const TEST_CASES: TestCase[] = [
  {
    id: "trafego-pago-dados",
    title: "Tráfego Pago & Performance",
    theme: "Factual & Métricas",
    brief:
      "Os 3 princípios inegociáveis da gestão de tráfego pago baseada em dados: 1. Atribuição multi-toque em vez de último clique; 2. Otimização orientada a margem líquida (LTV/CAC), não apenas ROAS de tela; 3. Janela de maturação de aprendizado do algoritmo de 7 dias sem interrupções manuais. Crie um post para gestores de tráfego e donos de e-commerce.",
    expectedFacts: ["multi-toque", "margem líquida", "7 dias"],
  },
  {
    id: "lideranca-comunicacao",
    title: "Liderança & Gestão Comportamental",
    theme: "Narrativo & Provocativo",
    brief:
      "Por que líderes experientes continuam cometendo erros básicos de comunicação: 1. Presumir alinhamento tácito sem validação explícita de entendimento; 2. Fornecer feedback vago em vez de observações baseadas em comportamentos objetivos; 3. Reter contexto estratégico por receio de sobrecarregar o time. Crie um post reflexivo e provocador para diretores e gerentes.",
    expectedFacts: ["alinhamento", "feedback", "contexto"],
  },
  {
    id: "automacao-processos-b2b",
    title: "Eficiência & Automação de Processos B2B",
    theme: "Pragmático & Solução Operacional",
    brief:
      "Uma distribuidora reduziu em 40% o tempo de faturamento ao eliminar a digitação manual de pedidos recebidos por PDF e WhatsApp, integrando uma automação direta ao ERP em 15 dias. Crie um post para empresários e diretores de operações destacando a perda invisível de horas com retrabalho, sem prometer prazos mágicos fora do case.",
    expectedFacts: ["40%", "PDF", "WhatsApp", "15 dias"],
  },
];

export type ExecutionBenchmarkRecord = {
  modelId: string;
  modelName: string;
  modelSlug: string;
  caseId: string;
  caseTitle: string;
  caseTheme: string;
  status: "success" | "error";
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number | null;
  totalTokens: number;
  costUsd: number | null;
  costSource: "provider" | "estimate" | "unknown";
  measurement: "isolated_editorial_call_v2";
  completedAt: string;
  configuredModel: string;
  effectiveModel?: string;
  parsedResponse?: EditorialResponse;
  rawText?: string;
  factMatches: { fact: string; found: boolean }[];
  factCoveragePercent: number;
  validationError?: string;
};

/** Full transport/JSON read through the production adapter; excludes the Studio journey. */
export async function executeSingleCall(
  model: TestModelConfig,
  testCase: TestCase,
  deps: { generate?: typeof invokeLLM; now?: () => number } = {},
): Promise<ExecutionBenchmarkRecord> {
  const clock = deps.now ?? Date.now;
  const startedAt = clock();
  const config = resolveGenerationModelConfig({ generationModel: model.id, postMode: "static" });
  const base = {
    modelId: model.id, modelName: model.name, modelSlug: config.model,
    caseId: testCase.id, caseTitle: testCase.title, caseTheme: testCase.theme,
    measurement: "isolated_editorial_call_v2" as const,
    configuredModel: config.model,
  };
  try {
    const result = await (deps.generate ?? invokeLLM)({
      taskRoute: "static_generation",
      messages: [
        { role: "system", content: "Você é o editor de copy do PostSpark para marcas no Brasil. Sustente as afirmações nos fatos do briefing e gere exatamente três variações completas, cada uma com título de 20 a 65 caracteres, corpo de 100 a 260 caracteres e CTA de 15 a 90 caracteres." },
        { role: "user", content: `Briefing:\n${testCase.brief}\nGere três abordagens distintas e preserve os fatos e condições da fonte.` },
      ],
      maxTokens: 4500,
      maxTransportAttempts: 1,
      disableStructuredRepair: true,
      response_format: { type: "json_schema", json_schema: EDITORIAL_JSON_SCHEMA },
      ...generationModelCallOptions(config),
    });
    // invokeLLM resolves only after receiving and decoding the complete response.
    const latencyMs = clock() - startedAt;
    const rawText = result.choices?.[0]?.message?.content;
    const text = typeof rawText === "string" ? rawText : "";
    const count = (value: unknown): number | null =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    const prompt = count(result.usage?.prompt_tokens);
    const completion = count(result.usage?.completion_tokens);
    const reasoningTokens = count(result.usage?.completion_tokens_details?.reasoning_tokens);
    const providerCost = count(result.usage?.cost);
    const costSource = providerCost !== null ? "provider" as const
      : prompt !== null && completion !== null ? "estimate" as const : "unknown" as const;
    const costUsd = providerCost ?? (costSource === "estimate"
      ? (prompt! * model.inputCostPerMillion + completion! * model.outputCostPerMillion) / 1_000_000 : null);
    let parsedResponse: EditorialResponse | undefined;
    let validationError: string | undefined;
    try { parsedResponse = EditorialResponseSchema.parse(JSON.parse(text)); }
    catch (error) { validationError = error instanceof Error ? error.message : String(error); }
    const publicCopy = parsedResponse?.variations.map(variation => `${variation.headline}\n${variation.body}\n${variation.cta}`).join("\n").toLowerCase() ?? "";
    const factMatches = testCase.expectedFacts.map(fact => ({ fact, found: publicCopy.includes(fact.toLowerCase()) }));
    return {
      ...base, status: validationError ? "error" : "success", latencyMs,
      promptTokens: prompt ?? 0, completionTokens: completion ?? 0,
      totalTokens: count(result.usage?.total_tokens) ?? (prompt ?? 0) + (completion ?? 0),
      reasoningTokens, costUsd, costSource, completedAt: new Date().toISOString(),
      effectiveModel: result.model, parsedResponse, rawText: text, factMatches,
      factCoveragePercent: testCase.expectedFacts.length ? Math.round(100 * factMatches.filter(match => match.found).length / factMatches.length) : 0,
      validationError,
    };
  } catch (error) {
    return {
      ...base, status: "error", latencyMs: clock() - startedAt,
      promptTokens: 0, completionTokens: 0, totalTokens: 0, reasoningTokens: null,
      costUsd: null, costSource: "unknown", completedAt: new Date().toISOString(),
      factMatches: [], factCoveragePercent: 0,
      validationError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runBenchmark() {
  const apiKey = ENV.openRouterApiKey;
  if (!apiKey || apiKey.startsWith("test-")) {
    console.error("ERRO: OPENROUTER_API_KEY não configurada ou inválida no .env.");
    process.exit(1);
  }

  console.log("===============================================================================");
  console.log("INICIANDO BENCHMARK COMPARATIVO DE MODELOS (POSTSPARK - NOVEMBRO 2026)");
  console.log(`Modelos: ${TEST_MODELS.map((m) => `${m.name} (${m.slug})`).join(" | ")}`);
  const cases = process.argv.includes("--smoke") ? TEST_CASES.slice(0, 1) : TEST_CASES;
  console.log(`Casos de Teste: ${cases.length} briefs | Total de execuções: ${TEST_MODELS.length * cases.length}`);
  console.log("===============================================================================\n");

  const results: ExecutionBenchmarkRecord[] = [];

  for (const model of TEST_MODELS) {
    console.log(`\n-------------------------------------------------------------------------------`);
    console.log(`Avaliando modelo: ${model.name} (${model.slug}) [reasoning: ${model.reasoningEffort}]`);
    console.log(`-------------------------------------------------------------------------------`);

    for (const testCase of cases) {
      process.stdout.write(`  [${testCase.id}] Executando brief: "${testCase.title}"... `);
      const record = await executeSingleCall(model, testCase);
      results.push(record);

      if (record.status === "success") {
        console.log(
          `✓ SUCESSO (${(record.latencyMs / 1000).toFixed(2)}s | ` +
            `${record.totalTokens} tokens (r: ${record.reasoningTokens}) | $${record.costUsd?.toFixed(5) ?? "desconhecido"} (${record.costSource}) | ` +
            `Fatos: ${record.factCoveragePercent}%)`
        );
      } else {
        console.log(`✗ ERRO (${(record.latencyMs / 1000).toFixed(2)}s): ${record.validationError}`);
      }
      // Intervalo de cortesia
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  const directory = join(process.cwd(), "artifacts/benchmarks");
  mkdirSync(directory, { recursive: true });
  const outputPath = join(directory, `model-calls-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(outputPath, JSON.stringify({
    measurement: "isolated_editorial_call_v2", fullStudioJourney: false,
    note: "Tempo até resposta completa e validada. Custos por chamada; estimativas usam preços de referência. Não mede custo por post, revisão, mídia, persistência ou reabertura. Registros antigos não são comparáveis ao cronômetro V2.",
    results,
  }, null, 2), { encoding: "utf8", mode: 0o600 });
  if (results.some(result => result.status === "error")) process.exitCode = 1;
  console.log(`\n===============================================================================`);
  console.log(`Benchmark concluído com sucesso! Resultados gravados em:\n${outputPath}`);
  console.log(`===============================================================================\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runBenchmark().catch(() => {
    console.error("Falha na execução do benchmark. Confira a configuração do provedor.");
    process.exitCode = 1;
  });
}
