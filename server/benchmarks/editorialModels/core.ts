import { z } from "zod";
import type { EditorialBenchmarkCase, ExpectedFact } from "./corpus";

export const BENCHMARK_MODELS = [
  {
    id: "openai/gpt-5-mini",
    defaultEnabled: false,
    nativeStructuredOutput: true,
    requireParameters: false,
    reasoningEffort: "minimal",
    inputUsdPerMillion: 0.25,
    outputUsdPerMillion: 2,
  },
  {
    id: "qwen/qwen3.6-flash",
    defaultEnabled: false,
    nativeStructuredOutput: true,
    requireParameters: true,
    reasoningEffort: "none",
    inputUsdPerMillion: 0.1875,
    outputUsdPerMillion: 1.125,
  },
  {
    id: "deepseek/deepseek-v3.2",
    defaultEnabled: false,
    nativeStructuredOutput: false,
    requireParameters: false,
    reasoningEffort: "none",
    inputUsdPerMillion: 0.2088,
    outputUsdPerMillion: 0.3096,
  },
  {
    id: "z-ai/glm-4.7",
    defaultEnabled: false,
    nativeStructuredOutput: true,
    requireParameters: true,
    reasoningEffort: "none",
    inputUsdPerMillion: 0.4,
    outputUsdPerMillion: 1.75,
  },
  {
    id: "openai/gpt-5.4-mini",
    defaultEnabled: true,
    nativeStructuredOutput: true,
    requireParameters: false,
    reasoningEffort: "minimal",
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 4.5,
  },
  {
    id: "qwen/qwen3.8-flash",
    defaultEnabled: true,
    nativeStructuredOutput: true,
    requireParameters: true,
    reasoningEffort: "none",
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.47,
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    defaultEnabled: true,
    nativeStructuredOutput: true,
    requireParameters: true,
    reasoningEffort: "none",
    inputUsdPerMillion: 0.11,
    outputUsdPerMillion: 0.33,
  },
  {
    id: "z-ai/glm-5.3-flash",
    defaultEnabled: true,
    nativeStructuredOutput: true,
    requireParameters: true,
    reasoningEffort: "low",
    inputUsdPerMillion: 0.075,
    outputUsdPerMillion: 0.25,
  },
  {
    id: "google/gemini-3.8-flash",
    defaultEnabled: true,
    nativeStructuredOutput: false,
    requireParameters: false,
    reasoningEffort: "low",
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 3.75,
  },
] as const;

export type BenchmarkModel = (typeof BENCHMARK_MODELS)[number];

const VariationSchema = z.object({
  tone: z.string().min(1).max(80),
  headline: z.string().min(1).max(100),
  body: z.string().min(1).max(320),
  cta: z.string().min(1).max(160),
  assumptions: z.array(z.string().min(1).max(500)).max(5),
}).strict();

export const EditorialResponseSchema = z.object({
  literalClaim: z.string().min(1).max(400),
  confirmedFacts: z.array(z.string().min(1).max(240)).max(12),
  unknowns: z.array(z.string().min(1).max(240)).max(12),
  allowedInferences: z.array(z.string().min(1).max(240)).max(8),
  semanticVariationBudget: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  variations: z.array(VariationSchema).length(3),
}).strict();

export type EditorialResponse = z.infer<typeof EditorialResponseSchema>;

export const EDITORIAL_JSON_SCHEMA = {
  name: "postspark_editorial_benchmark",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "literalClaim",
      "confirmedFacts",
      "unknowns",
      "allowedInferences",
      "semanticVariationBudget",
      "variations",
    ],
    properties: {
      literalClaim: { type: "string", minLength: 1, maxLength: 400 },
      confirmedFacts: { type: "array", maxItems: 12, items: { type: "string", minLength: 1, maxLength: 240 } },
      unknowns: { type: "array", maxItems: 12, items: { type: "string", minLength: 1, maxLength: 240 } },
      allowedInferences: { type: "array", maxItems: 8, items: { type: "string", minLength: 1, maxLength: 240 } },
      semanticVariationBudget: { type: "integer", enum: [1, 2, 3] },
      variations: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["tone", "headline", "body", "cta", "assumptions"],
          properties: {
            tone: { type: "string", minLength: 1, maxLength: 80 },
            headline: { type: "string", minLength: 1, maxLength: 100 },
            body: { type: "string", minLength: 1, maxLength: 320 },
            cta: { type: "string", minLength: 1, maxLength: 160 },
            assumptions: { type: "array", maxItems: 5, items: { type: "string", minLength: 1, maxLength: 500 } },
          },
        },
      },
    },
  },
} as const;

export function buildEditorialMessages(testCase: EditorialBenchmarkCase) {
  return [
    {
      role: "system",
      content: `Você é o editor de copy do PostSpark para português brasileiro.

Planeje o significado antes de estilizar. A mensagem deve ser compreendida na primeira leitura e soar fluida, humana e premium. Trate como fato confirmado apenas o que está explícito no briefing. Identifique o que não foi informado e mantenha essas lacunas fora das afirmações públicas. Uma metáfora ou elipse só funciona quando o próprio conteúdo torna seu referente e seu nexo recuperáveis.

As três opções são direções editoriais e visuais, não três teses obrigatórias. semanticVariationBudget mede quantas afirmações factuais independentes o briefing sustenta; mudança de tom não aumenta esse número. Quando o insumo sustentar uma única proposição, mantenha essa proposição e varie apenas ênfase, ritmo ou tom. allowedInferences aceita somente enquadramentos culturais ou linguísticos que não criem condição comercial, escopo de serviço, resultado, prazo ou comportamento não informado. Headline, corpo e CTA devem funcionar como uma unidade. Escreva com naturalidade, concisão e precisão.

Use exatamente estes nomes de propriedades na raiz do JSON: literalClaim, confirmedFacts, unknowns, allowedInferences, semanticVariationBudget e variations. Cada item de variations usa tone, headline, body, cta e assumptions. Preencha todos os campos semânticos antes das três variações. Retorne somente o objeto JSON solicitado.`,
    },
    {
      role: "user",
      content: `Briefing:\n${testCase.brief}\n\nProduza o plano semântico interno e três opções de post estático para Instagram. Registre em assumptions qualquer inferência editorial usada por cada opção.`,
    },
  ];
}

export function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) return withoutFence;
  return withoutFence.slice(start, end + 1);
}

export function parseEditorialResponse(content: string): {
  valid: boolean;
  value?: EditorialResponse;
  errors: string[];
} {
  try {
    const parsed: unknown = JSON.parse(extractJsonObject(content));
    const result = EditorialResponseSchema.safeParse(parsed);
    if (result.success) return { valid: true, value: result.data, errors: [] };
    return {
      valid: false,
      errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "JSON inválido"],
    };
  }
}

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function measureFactCoverage(response: EditorialResponse, expectedFacts: ExpectedFact[]) {
  const publicCopy = response.variations
    .map((variation) => `${variation.headline}\n${variation.body}\n${variation.cta}`)
    .join("\n");
  const normalizedCopy = normalize(publicCopy);
  const facts = expectedFacts.map((fact) => ({
    label: fact.label,
    present: fact.anyOf.some((candidate) => normalizedCopy.includes(normalize(candidate))),
  }));
  return {
    facts,
    rate: facts.length === 0 ? null : facts.filter((fact) => fact.present).length / facts.length,
  };
}

export function estimateCostUsd(input: {
  model: BenchmarkModel;
  promptTokens: number;
  completionTokens: number;
}) {
  return (
    (input.promptTokens / 1_000_000) * input.model.inputUsdPerMillion +
    (input.completionTokens / 1_000_000) * input.model.outputUsdPerMillion
  );
}

export function shuffledAnonymousLabels(models: readonly BenchmarkModel[], random = Math.random) {
  const shuffled = [...models];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return Object.fromEntries(shuffled.map((model, index) => [model.id, `Modelo ${String.fromCharCode(65 + index)}`]));
}
