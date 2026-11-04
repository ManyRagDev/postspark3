import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { prepareSharedBudget } from "./sharedBudget";
import { parseMatrixArgs, matrixPlan } from "./core";
import { generationMatrixCorpus } from "./corpus";
import { writeJson } from "./journal";
import {
  readSnapshotFile,
  describeSnapshotFile,
  overlayCatalogs,
  verifyJourneyCatalogAlignment,
} from "./catalogAlignment";

/** Generates the exact approval packet; never invokes live.ts or the application. */
async function main() {
  const args = process.argv.slice(2),
    values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (
      ![
        "--origin",
        "--out",
        "--revised-snapshot",
        "--catalog-revision",
      ].includes(args[i]) ||
      !args[i + 1] ||
      values.has(args[i])
    )
      throw new Error("invalid_next_round_argument");
    values.set(args[i], args[i + 1]);
  }
  if (
    !values.has("--origin") ||
    !values.has("--out") ||
    !values.has("--revised-snapshot")
  )
    throw new Error("prepare_requires_origin_output_revised_snapshot");
  const origin = resolve(values.get("--origin")!),
    output = resolve(values.get("--out")!);
  const baseline = join(origin, "operator/catalog-baseline.json"),
    revisedPackage = resolve(values.get("--revised-snapshot")!),
    revised = join(output, "catalog-revised-overlay.json");
  const budgetFile = join(output, "shared-budget.json"),
    matrixCampaignId = "r9-matrix-20261101",
    journeyCampaignId = "r9-local-20261101";
  const cases = generationMatrixCorpus.filter(c =>
    ["serious-implicit", "five-items"].includes(c.id)
  );
  const journeys = cases.map(c => ({
    id: c.mode === "static" ? "static-gemini" : "carousel-gpt",
    postMode: c.mode,
    choice: (c.mode === "static" ? "gemini" : "gpt") as "gemini" | "gpt",
    contentHash: createHash("sha256").update(c.content.trim()).digest("hex"),
  }));
  await mkdir(output, { recursive: true, mode: 0o700 });
  const packageManifest = JSON.parse(
    await readFile(join(dirname(revisedPackage), "manifest.json"), "utf8")
  );
  const overlay = overlayCatalogs(
    await readSnapshotFile(baseline),
    await readSnapshotFile(
      join(packageManifest.previousPackage, "catalog-rows.json")
    ),
    await readSnapshotFile(revisedPackage)
  );
  const catalogAlignment = await verifyJourneyCatalogAlignment({
    remote: overlay,
    overlay,
    revisedPackage: await readSnapshotFile(revisedPackage),
  });
  await writeJson(revised, overlay);
  await writeJson(
    join(output, "catalog-alignment-offline.json"),
    catalogAlignment
  );
  const matrixArgs = [
    "--live",
    "--shared-budget",
    budgetFile,
    "--campaign-id",
    matrixCampaignId,
    "--baseline-snapshot",
    baseline,
    "--revised-snapshot",
    revised,
    "--cases",
    "serious-implicit,five-items",
    "--include-drafts",
    "--max-usd",
    "10",
    "--max-calls",
    "320",
    "--out",
    join(output, "matrix"),
  ];
  const budget = await prepareSharedBudget({
    file: budgetFile,
    origin,
    maxUsd: 10,
    maxCalls: 320,
    matrixCampaignId,
    journeyCampaignId,
    journeys,
    permittedRunIds: matrixPlan(parseMatrixArgs(matrixArgs)).map(e => e.runId),
    catalogSnapshots: { baseline, revised },
    revisedPackage: await describeSnapshotFile(revisedPackage),
  });
  const localArgs = [
    "--live",
    "--shared-budget",
    budgetFile,
    "--campaign-id",
    journeyCampaignId,
    "--max-usd",
    "10",
    "--max-calls",
    "320",
    "--catalog-revision",
    values.get("--catalog-revision") ?? "REQUIRES_VERIFIED_R9_STAGED_REVISION",
    "--port",
    "3000",
  ];
  const committed = budget.calls.reduce(
    (sum, c) => sum + (c.actualUsd ?? c.reservedUsd),
    0
  );
  const plan = {
    version: 1,
    protocolVersion: 3,
    authorization: "PENDING_SPECIFIC_APPROVAL_DO_NOT_EXECUTE",
    generatedAt: new Date().toISOString(),
    paidCallsDuringPreparation: 0,
    purpose:
      "Eight new clean-protocol matrix executions plus two real authenticated localhost journeys; historical outcomes remain inconclusive.",
    budget: {
      file: budgetFile,
      totalUsd: 10,
      totalCalls: 320,
      inheritedCalls: budget.calls.length,
      inheritedCommittedUsd: committed,
      additionalUsdAvailable: 10 - committed,
      additionalCallsAvailable: 320 - budget.calls.length,
      originalEvidence: budget.origin,
    },
    data: {
      revisedPackageSnapshot: revisedPackage,
      catalogAlignment,
      briefs: cases,
      baselineSnapshot: baseline,
      revisedSnapshot: revised,
      applicationJourneys: journeys,
      realAccountAndSparks: true,
      accountCreation: false,
      remotePublication: false,
    },
    matrix: matrixPlan(parseMatrixArgs(matrixArgs)),
    commands: {
      matrix: {
        program: "node",
        args: [
          "--import",
          "dotenv/config",
          "--import",
          "tsx",
          "server/benchmarks/generationMatrix/run.ts",
          ...matrixArgs,
        ],
      },
      localApp: {
        program: "node",
        args: [
          "--import",
          "dotenv/config",
          "--import",
          "tsx",
          "server/benchmarks/generationMatrix/localAppBootstrap.ts",
          ...localArgs,
        ],
      },
    },
    executionOrder: [
      "After explicit approval: verify frozen R9 revision and unchanged pipeline; run the eight-entry matrix.",
      "Inspect global remaining budget, then start instrumented localhost app. Workers inherit the same guard and file lock.",
      "Root submits exactly one static/Gemini and one five-slide carousel/GPT with the supplied synthetic texts, through existing authenticated UI.",
      "Verify gallery, CanvasLab edit/save/reopen/export and persisted billing/receipts. Record real outputs independently of the blind matrix.",
      "If budget is denied, stop all new paid dispatches. Never discard unknown receipts or reset budget for another process.",
    ],
    limitations: [
      "The eight prior planned arms did not complete a fair comparison; their spend still counts in full.",
      "A numeric cap cannot guarantee all ten generations complete. In-flight unknown costs retain the full reservation.",
      "Only preparation was performed. No app, login, account, post, Sparks reservation or paid provider call was started.",
      "Application transport is instrumented in backend and workers; browser actions are performed by root after approval, against the expected Supabase project.",
    ],
  };
  await writeJson(join(output, "approval-plan.json"), plan);
  const shell = (text: string) => `'${text.replace(/'/g, `'"'"'`)}'`;
  const commands = Object.entries(plan.commands)
    .map(
      ([name, c]) =>
        `${name}:\n\n\`\`\`bash\n${[c.program, ...c.args].map(shell).join(" ")}\n\`\`\``
    )
    .join("\n\n");
  await writeFile(
    join(output, "README.md"),
    `# Proposta pendente de aprovação — não executar\n\n8 execuções novas (dois briefings × Gemini/GPT × estratégias 1/2) e duas jornadas reais autenticadas no localhost: post único com Gemini e carrossel de cinco slides com GPT. Usar os textos sintéticos do JSON, sem projeto/insumo privado adicional. Não criar conta nem publicar remotamente. As jornadas usam os Sparks normais da conta existente.\n\nTeto ACUMULADO proposto: US$ 10 e 320 chamadas. Inclui integralmente ${budget.calls.length} chamadas anteriores e US$ ${committed.toFixed(10)} comprometidos; sobra US$ ${(10 - committed).toFixed(10)} e ${320 - budget.calls.length} chamadas. As quatro reservas sem recibo continuam incluídas.\n\nO ledger compartilhado é a fonte autoritativa entre matriz, backend e workers. IDs de campanha separam os novos braços; resultados/configurações antigos não são herdados. A primeira recusa do orçamento encerra novos envios. O bootstrap não modifica produto, .env ou segredos; os controles são temporários no processo e herdados pelos workers.\n\nA execução permanece pendente de autorização específica. Confirmar a revisão staged R9 no argumento --catalog-revision antes do bootstrap. Os comandos abaixo foram apenas preparados.\n\n${commands}\n\nAs evidências históricas continuam inconclusivas. Uma nova fase não apaga falhas, custos nem recibos desconhecidos da fase anterior.\n`,
    { mode: 0o600 }
  );
  process.stdout.write(
    `Prepared only: ${join(output, "approval-plan.json")}\n`
  );
}
void main().catch(error => {
  console.error(
    error instanceof Error ? error.message : "next_round_preparation_failed"
  );
  process.exitCode = 1;
});
