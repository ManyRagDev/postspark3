import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseMatrixArgs, matrixPlan } from "./core";
import { writeJson } from "./journal";
import { generationMatrixCorpus } from "./corpus";

async function main() {
  const options = parseMatrixArgs(process.argv.slice(2));
  await mkdir(options.output, { recursive: true, mode: 0o700 });
  if (!options.live) {
    const catalogValidation = options.validateCatalogs
      ? await (await import("./live")).validateMatrixCatalogs(options)
      : undefined;
    const preparationValidation = options.selectionReplay
      ? await (await import("./live")).validateSelectionContinuation(options)
      : undefined;
    const identityCampaign = options.selectionReplay
      ? (
          await (
            await import("./selectionContinuation")
          ).loadSelectionContinuation(options.selectionReplay)
        ).identityCampaignId
      : options.campaignId;
    const plan = {
      live: false,
      paidCalls: 0,
      sourceReads: 0,
      catalogValidation,
      preparationValidation,
      note: options.validateCatalogs
        ? "Somente validação de catálogos/definições imutáveis. Nenhuma chamada de IA."
        : "Planejamento apenas. Nenhum modelo, renderer, catálogo remoto ou fonte externa foi executado.",
      options,
      corpus: generationMatrixCorpus.filter(c =>
        options.caseIds.includes(c.id)
      ),
      matrix: matrixPlan({ ...options, campaignId: identityCampaign }),
    };
    await writeJson(join(options.output, "dry-run.json"), plan);
    process.stdout.write(
      `Dry-run: ${plan.matrix.length} execuções planejadas. ${join(options.output, "dry-run.json")}\n`
    );
  } else {
    const { runLiveMatrix } = await import("./live");
    const result = await runLiveMatrix(options);
    process.stdout.write(
      `${result.operationalFailures ? "Falha operacional do harness" : result.interruption ? "Campanha interrompida: " + result.interruption.reason : options.selectionReplay || options.continueFrom ? "Fase de continuação encerrada" : "Ensaio encerrado"}: ${result.results.length} execuções nesta fase, ${result.renderedReady} propostas prontas renderizadas, ${result.calls} chamadas no total, US$ ${result.knownUsd.toFixed(4)} com recibo. Avaliação: ${join(options.output, "blind.html")}\n`
    );
    if (result.interruption) process.exitCode = 2;
    if (result.operationalFailures) process.exitCode = 3;
  }
}
void main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
