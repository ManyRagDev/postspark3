/** Live provider + production orchestrator; no catalogue publication, billing mutation or user post writes. */
import "dotenv/config";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { generatePostVariations } from "../../server/ai/generationOrchestrator";
import { prepareGenerationPlan } from "../../server/ai/generationPipeline";
import { invokeLLM } from "../../server/_core/llm";
import { deriveVariableContentContract } from "../../shared/variableContent";
import { arsenalHash } from "../../shared/arsenalContent";
const records = [];
for (const prompt of [
  "Crie um post sobre café com apenas uma frase curta, sem título, sem CTA e sem lista.",
  "Crie um post com uma lista de exatamente 15 dicas curtas de preparo de café. Sem título e sem CTA. Cada dica deve ter até 5 palavras.",
  "Crie um post sobre café para quem está começando a preparar em casa. Organize o conteúdo conforme a necessidade do briefing.",
  "Crie um post com uma lista de dicas curtas de preparo de café. Escolha a quantidade conforme a necessidade do conteúdo.",
]) {
  const contract = deriveVariableContentContract(prompt),
    events: unknown[] = [];
  const start = Date.now();
  const outcome = await generatePostVariations(
    {
      userUuid: "variable-content-local-probe",
      request: {
        inputType: "text",
        content: prompt,
        platform: "instagram",
        postMode: "static",
        creationMode: "ideation",
      },
      siteIntelligence: null,
      executionBrief: null,
      arsenalCards: [],
      variableContentContract: contract,
      plan: await prepareGenerationPlan({ sourceContent: prompt }),
      deadlineMs: Date.now() + 150000,
    },
    {
      generate: invokeLLM,
      clock: Date.now,
      trace: { id: randomUUID(), recordEvent: e => events.push(e) },
      loadRecentPosts: async () => [],
      assessOriginality: async ({ candidates }) => ({
        assessments: (candidates ?? []).map(() => ({
          score: 50,
          maxCandidateSimilarity: 0,
          maxSiteSimilarity: 0,
          maxHistorySimilarity: 0,
          closestSource: "none" as const,
          fallbackUsed: true,
        })),
        embeddings: [],
        fallbackUsed: true,
      }),
    }
  );
  const result = {
    source: "live-provider-production-orchestrator",
    prompt,
    contract,
    status: outcome.status,
    durationMs: Date.now() - start,
    metrics: outcome.metrics,
    output:
      outcome.status === "approved"
        ? outcome.snapshots.map(v => ({
            content: v.catalogSelectionV2?.content,
            userContentHash: v.catalogSelectionV2?.userContentHash,
          }))
        : outcome.status === "rejected"
          ? outcome.issues
          : outcome.error,
    events,
  };
  records.push(result);
  console.log(
    JSON.stringify({
      status: result.status,
      durationMs: result.durationMs,
      contractHash: arsenalHash(contract),
    })
  );
  await fs.mkdir("artifacts/arsenal-v2", { recursive: true });
  await fs.writeFile(
    "artifacts/arsenal-v2/variable-free-generation.json",
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        scope:
          "Provider/canonical generation only. Originality is an isolated double; no browser, billing or saved post verification.",
        records,
      },
      null,
      2
    )
  );
  if (outcome.status !== "approved") process.exitCode = 1;
}
