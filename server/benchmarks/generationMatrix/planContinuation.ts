import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadContinuationOrigin } from "./campaignAnalysis";
import { writeJson } from "./journal";
import { reserveQuote, type PriceQuote } from "./budget";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--from" || args[2] !== "--out")
    throw new Error(
      "Usage: planContinuation.ts --from ORIGINAL_DIRECTORY --out NEW_PLAN_DIRECTORY"
    );
  const source = resolve(args[1]),
    output = resolve(args[3]);
  if (source === output || output.startsWith(source + "/"))
    throw new Error(
      "Continuation evidence must use a new directory outside the original campaign"
    );
  const { analysis, manifest } = await loadContinuationOrigin(source);
  const prices = JSON.parse(
    await readFile(join(source, "operator", "prices.json"), "utf8")
  ) as PriceQuote[];
  const reviewQuote = prices.find(
    p => p.id === manifest.ancillaryModels.review
  );
  const minReviewReservationUsd = reviewQuote
    ? reserveQuote(
        {
          model: reviewQuote.id,
          messages: [{ image_url: "one-review-image-bound" }],
          max_tokens: 9216,
        },
        reviewQuote
      ).usd
    : null;
  const refs = (name: string, ref: any) =>
    "revision" in ref
      ? [`--${name}-revision`, String(ref.revision)]
      : [`--${name}-snapshot`, ref.snapshot];
  const argv = [
    "--live",
    "--continue-from",
    source,
    "--max-usd",
    String(analysis.limits.usd),
    "--max-calls",
    String(analysis.limits.calls),
    ...refs(
      "baseline",
      manifest.entries.find((e: any) => e.strategy === 1).catalog
    ),
    ...refs(
      "revised",
      manifest.entries.find((e: any) => e.strategy === 2).catalog
    ),
    "--cases",
    Array.from(
      new Set<string>(manifest.entries.map((e: any) => e.caseId))
    ).join(","),
    "--seed",
    manifest.seed,
    "--repeats",
    String(Math.max(...manifest.entries.map((e: any) => e.repeat))),
    "--out",
    output + "-execution",
  ];
  const plan = {
    ...analysis,
    generatedAt: new Date().toISOString(),
    liveStarted: false,
    paidCallsMadeByPlanning: 0,
    additionalAuthorization:
      "Coordinate before launching; this artifact never dispatches inference.",
    protocol: 2,
    minReviewReservationUsd,
    canReserveOneReview:
      minReviewReservationUsd !== null &&
      analysis.remaining.usd >= minReviewReservationUsd,
    continuationArguments: argv,
    requiredManualOptions: [
      "Preserve --include-drafts if used in the original run.",
      "Supply the same --image-file and --source-url if present originally; immutable input hashes must match.",
    ],
    nextSteps: [
      "Keep original artifacts/ledger intact and label the first phase as interrupted.",
      "Identify unknown receipts externally if possible; do not release reservations based on estimates or absence of a response.",
      "Only untouched arms are eligible for a separate protocol2 phase. Completed/uncertain paid effects are not rerun.",
      "The executor inherits every original ledger entry and requires the same TOTAL limits. It stops before preparation if the remaining budget cannot reserve a review.",
      "No claim that all eight arms were fully exercised, or that the interrupted data is a clean model comparison.",
    ],
  };
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeJson(join(output, "continuation-plan.json"), plan);
  const text = `# Campanha interrompida — evidência preservada\n\n${analysis.exercised}/${analysis.planned} braços tiveram chamadas pagas; ${analysis.ready} propostas prontas.\n\n- Chamadas usadas: ${analysis.limits.calls - analysis.remaining.calls}/${analysis.limits.calls}; restam ${analysis.remaining.calls}.\n- Custo confirmado: US$ ${analysis.knownUsd.toFixed(9)}.\n- Reservas sem recibo: US$ ${analysis.unknownReservedUsd.toFixed(9)} (${analysis.unknownCalls.length} chamadas).\n- Saldo conservador: US$ ${analysis.remaining.usd.toFixed(9)}.\n- Reserva mínima para uma revisão: ${minReviewReservationUsd === null ? "cotação ausente" : "US$ " + minReviewReservationUsd.toFixed(9)}; saldo suficiente: ${plan.canReserveOneReview ? "sim" : "não"}.\n\nNenhum custo desconhecido foi liberado e nenhum efeito foi repetido. A nova fase aceita somente braços intocados, herda o ledger integral e conserva o teto total. Os argumentos de execução estão no JSON; não foram executados.\n\n${analysis.units.map(u => `- ${u.id}: ${u.calls} chamadas; resultado original ${u.originalOverallStatus ?? "sem resultado terminal"}.`).join("\n")}\n\nOs dados antigos continuam sendo uma campanha interrompida, não uma comparação limpa. Para custo individual, a [API de gerações](https://openrouter.ai/docs/api/api-reference/generations/get-generation) exige o generation ID. A [atividade agregada](https://openrouter.ai/docs/api/api-reference/analytics/get-user-activity-grouped-by-endpoint) exige chave de gerenciamento e não identifica sozinha essas quatro operações.\n`;
  await writeFile(join(output, "README.md"), text, { mode: 0o600 });
  process.stdout.write(
    `Plano somente: ${join(output, "continuation-plan.json")}\n`
  );
}
void main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "continuation_plan_failed"}\n`
  );
  process.exitCode = 1;
});
