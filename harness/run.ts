/**
 * Orquestrador do harness. É o ORÁCULO das etapas E2 a E5.
 *
 *   pnpm harness                 → perfil `baseline` (mede o estado atual)
 *   pnpm harness --profile e2    → portão da prova de encaixe
 *   pnpm harness --profile e3    → encaixe em produção
 *   pnpm harness --profile e5    → cor garantida
 *   pnpm harness --family editorial-poster --json relatorio.json
 *
 * Sai com código 0 (aprovado) ou 1 (reprovado). Um agente executor NUNCA deve
 * declarar uma etapa concluída sem este comando verde no perfil da etapa.
 *
 * NUNCA degrada silenciosamente: fonte faltando aborta com a lista do que falta.
 */

import { writeFileSync } from "node:fs";
import { composeVariation, directCreative } from "@shared/creative";
import { FAMILIES } from "@shared/creative/families";
import { DEFAULT_DESIGN_TOKENS, type AspectRatio, type PostVariation } from "@shared/postspark";
import { buildCorpus, type CorpusItem } from "./corpus";
import { baselineHeadline, fitText } from "./fit";
import { checkAvailability, missingFontsReport } from "./fonts/registry";
import { fontkitMeasurer } from "./measure/fontkitMeasurer";
import { boxOf, contrastChecks, diversity, outOfCanvas, overlaps, safeAreaViolations } from "./metrics";
import { extractSlots } from "./slots";
import { HEADLINE_CEILING_PX, LEGIBILITY_FLOOR_PX, profileByName } from "./thresholds";
import type { Measurer } from "./measure/types";

interface Args {
  profile: string;
  families: string[];
  aspectRatios: AspectRatio[];
  perLength: number;
  json?: string;
  seed: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const familyArg = get("--family");
  const ratioArg = get("--aspect");
  return {
    profile: get("--profile") ?? "baseline",
    families: familyArg ? familyArg.split(",") : FAMILIES.map((f) => f.id),
    aspectRatios: (ratioArg ? ratioArg.split(",") : ["1:1"]) as AspectRatio[],
    perLength: Number(get("--per-length") ?? 3),
    json: get("--json"),
    seed: Number(get("--seed") ?? 7),
  };
}

interface CaseResult {
  familyId: string;
  aspectRatio: AspectRatio;
  itemId: string;
  chars: number;
  origin: CorpusItem["origin"];
  headlineFont: string;
  slotDeclared: boolean;
  slotWidthPx: number;
  verticalBudgetPx: number | null;
  baselineFontPx: number | null;
  baselineLinesNeeded: number | null;
  baselineTruncatedLines: number | null;
  fitFontPx: number | null;
  fitLines: number | null;
  fitsAboveFloor: boolean | null;
  overflowingWords: string[];
  bodyFitsAboveFloor: boolean | null;
  overlapPairs: number;
  worstOverlapPx: number;
  outOfCanvasCount: number;
  safeAreaViolationCount: number;
  minContrast: number | null;
  skipped?: string;
}

function baseVariation(id: string, text: string, aspectRatio: AspectRatio): PostVariation {
  return {
    id,
    headline: text,
    body: "A maioria dos times corrige o sintoma e ignora a causa. Comece pelo diagnóstico.",
    caption: "",
    hashtags: ["#operacoes"],
    callToAction: "Veja o diagnóstico",
    tone: "profissional",
    platform: "instagram",
    imagePrompt: "",
    backgroundColor: "",
    textColor: "",
    accentColor: "",
    layout: "minimal",
    aspectRatio,
    template: "simple",
    copyAngle: { type: "beneficio", label: "Benefício", badge: "Operações", stickerText: "Prático" },
  } as PostVariation;
}

function runCase(
  familyId: string,
  item: CorpusItem,
  aspectRatio: AspectRatio,
  seed: number,
  measurer: Measurer,
): { result: CaseResult; variation: PostVariation } {
  const family = FAMILIES.find((f) => f.id === familyId);
  if (!family) throw new Error(`Família "${familyId}" não existe em shared/creative/families.ts`);

  const base = baseVariation(`${familyId}-${item.id}`, item.text, aspectRatio);
  const direction = directCreative(base, null, seed);
  base.creativeDirection = { ...direction, familyId, axes: family.axes, seed };

  const variation = composeVariation(base, DEFAULT_DESIGN_TOKENS);
  const extraction = extractSlots(variation, aspectRatio);
  const headlineSlot = extraction.slots.find((s) => s.name === "headline")!;
  const bodySlot = extraction.slots.find((s) => s.name === "body")!;
  const headlineFont = variation.headlineFontFamily ?? DEFAULT_DESIGN_TOKENS.typography.fontFamily;
  const bodyFont = variation.bodyFontFamily ?? DEFAULT_DESIGN_TOKENS.typography.fontFamily;

  const contrasts = contrastChecks(variation);
  // CR-003: o gate de AA mede pares de TEXTO (decorativos ficam fora).
  const textContrasts = contrasts.filter((c) => !c.decorative);
  const minContrast = textContrasts.length
    ? Math.min(...textContrasts.map((c) => c.ratio))
    : null;

  const shell: CaseResult = {
    familyId,
    aspectRatio,
    itemId: item.id,
    chars: item.chars,
    origin: item.origin,
    headlineFont,
    slotDeclared: headlineSlot.declared,
    slotWidthPx: headlineSlot.widthPx,
    verticalBudgetPx: headlineSlot.verticalBudgetPx,
    baselineFontPx: null,
    baselineLinesNeeded: null,
    baselineTruncatedLines: null,
    fitFontPx: null,
    fitLines: null,
    fitsAboveFloor: null,
    overflowingWords: [],
    bodyFitsAboveFloor: null,
    overlapPairs: 0,
    worstOverlapPx: 0,
    outOfCanvasCount: 0,
    minContrast,
  };

  if (!measurer.supports(headlineFont)) {
    return { result: { ...shell, skipped: `fonte ausente: ${headlineFont}` }, variation };
  }
  if (bodySlot.declared && !measurer.supports(bodyFont)) {
    return { result: { ...shell, skipped: `fonte ausente: ${bodyFont}` }, variation };
  }

  const style = {
    fontFamily: headlineFont,
    lineHeight: 1.15,
    textTransform: "none" as const,
  };

  const baseline = baselineHeadline(
    {
      text: item.text,
      maxWidth: headlineSlot.widthPx,
      style,
      aspectRatio: aspectRatio as "1:1" | "5:6" | "9:16",
      familyMultiplier: variation.headlineFontSize ?? 1,
    },
    measurer,
  );

  const budget = headlineSlot.verticalBudgetPx;
  const fit =
    budget === null
      ? null
      : fitText(
          {
            text: item.text,
            maxWidth: headlineSlot.widthPx,
            maxHeight: budget,
            style,
            ceilingPx: HEADLINE_CEILING_PX,
            floorPx: LEGIBILITY_FLOOR_PX,
          },
          measurer,
        );

  // Corpo: mesma busca de encaixe, com o texto e a fonte reais do body — não
  // mais um chute de "3 linhas na fonte do título" (achado registrado nesta
  // entrega: essa estimativa antiga produzia falso-positivo de sobreposição
  // assim que uma família passou a declarar body livre).
  const bodyText = variation.body ?? "";
  const bodyStyle = { fontFamily: bodyFont, lineHeight: 1.5, textTransform: "none" as const };
  const bodyBudget = bodySlot.verticalBudgetPx;
  const bodyFit =
    bodySlot.declared && bodyBudget !== null && bodyText.trim().length > 0
      ? fitText(
          {
            text: bodyText,
            maxWidth: bodySlot.widthPx,
            maxHeight: bodyBudget,
            style: bodyStyle,
            ceilingPx: 22,
            floorPx: LEGIBILITY_FLOOR_PX * 0.7,
          },
          measurer,
        )
      : null;

  // Geometria: usa a altura do encaixe quando existe, senão a do baseline.
  const headlineHeight = fit
    ? fit.heightPx
    : baseline.linesNeeded * baseline.fontSizePx * style.lineHeight;
  const bodyHeight = bodyFit ? bodyFit.heightPx : baseline.fontSizePx * 3;
  const boxes = extraction.slots
    .map((slot) => boxOf(slot, slot.name === "headline" ? headlineHeight : bodyHeight))
    .filter((b): b is NonNullable<typeof b> => b !== null);
  const overlapPairs = overlaps(boxes);
  const outside = outOfCanvas(boxes, extraction);
  const safeArea = safeAreaViolations(boxes, extraction, aspectRatio as "1:1" | "5:6" | "9:16");

  return {
    result: {
      ...shell,
      baselineFontPx: Math.round(baseline.fontSizePx * 10) / 10,
      baselineLinesNeeded: baseline.linesNeeded,
      baselineTruncatedLines: baseline.truncated,
      fitFontPx: fit ? Math.round(fit.fontSizePx * 10) / 10 : null,
      fitLines: fit?.lineCount ?? null,
      fitsAboveFloor: fit?.fitsAboveFloor ?? null,
      overflowingWords: fit?.overflowingWords ?? [],
      bodyFitsAboveFloor: bodyFit?.fitsAboveFloor ?? null,
      overlapPairs: overlapPairs.length,
      worstOverlapPx: overlapPairs.reduce((m, p) => Math.max(m, p.verticalPx), 0),
      outOfCanvasCount: outside.length,
      safeAreaViolationCount: safeArea.length,
      minContrast,
    },
    variation,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const thresholds = profileByName(args.profile);

  const availability = checkAvailability();
  const corpus = await buildCorpus(args.perLength);

  const results: CaseResult[] = [];
  const byFamily: Record<string, PostVariation[]> = {};

  for (const familyId of args.families) {
    for (const aspectRatio of args.aspectRatios) {
      for (const item of corpus.items) {
        const { result, variation } = runCase(
          familyId,
          item,
          aspectRatio,
          args.seed,
          fontkitMeasurer,
        );
        results.push(result);
        (byFamily[familyId] ??= []).push(variation);
      }
    }
  }

  const measured = results.filter((r) => !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const withBudget = measured.filter((r) => r.verticalBudgetPx !== null);

  // CR-003: "truncamento" mede o CAMINHO PRODUTIVO (resolvedor canônico):
  // casos em que texto QUEBRÁVEL não cabe na caixa nem no piso (o produto
  // teria que cortar). Palavras irrecuperáveis (overflowingWords — adversariais
  // por construção) ficam numa métrica separada, tolerada pelo piso de 95%.
  const fitFailures = withBudget.filter((r) => r.fitsAboveFloor === false);
  const unbreakable = withBudget.filter((r) => r.overflowingWords.length > 0);
  const truncated = fitFailures.filter((r) => r.overflowingWords.length === 0);
  const overlapping = measured.filter((r) => r.overlapPairs > 0);
  const outside = measured.filter((r) => r.outOfCanvasCount > 0);
  const safeArea = measured.filter((r) => r.safeAreaViolationCount > 0);
  const lowContrast = measured.filter(
    (r) => r.minContrast !== null && r.minContrast < thresholds.minContrastRatio,
  );  const undeclaredSlots = measured.filter((r) => !r.slotDeclared);

  const rate = (n: number, total: number) => (total === 0 ? 0 : n / total);

  const summary = {
    perfil: thresholds.profile,
    executadoEm: new Date().toISOString(),
    medidor: fontkitMeasurer.id,
    corpus: {
      total: corpus.items.length,
      comAncoraReal: corpus.hasRealAnchor,
      sintéticos: corpus.items.filter((i) => i.origin === "sintetico").length,
      adversariais: corpus.items.filter((i) => i.origin === "adversarial").length,
      reais: corpus.items.filter((i) => i.origin === "real").length,
    },
    casos: {
      total: results.length,
      medidos: measured.length,
      pulados: skipped.length,
      comOrcamentoVertical: withBudget.length,
    },
    taxas: {
      truncamento: rate(truncated.length, withBudget.length),
      encaixeAcimaDoPiso:
        withBudget.length === 0
          ? null
          : rate(withBudget.length - fitFailures.length, withBudget.length),
      quebrasIrrecuperaveis: rate(unbreakable.length, withBudget.length),
      sobreposicao: rate(overlapping.length, measured.length),
      foraDoCanvas: rate(outside.length, measured.length),
      foraDaSafeArea: rate(safeArea.length, measured.length),
      tituloPosicionadoPorGrade: rate(undeclaredSlots.length, measured.length),
    },
    fontes: {
      presentes: availability.present.map((f) => f.family),
      ausentes: availability.missing.map((f) => f.family),
    },
    diversidade: Object.fromEntries(
      Object.entries(byFamily).map(([id, vars]) => [id, diversity(vars.slice(0, 4))]),
    ),
  };

  const falhas: string[] = [];
  // Nenhum perfil, nem o `baseline`, pode passar sem ter medido nada.
  // Um relatório vazio é a forma mais perigosa de falso verde.
  if (measured.length === 0) {
    falhas.push("nenhum caso foi medido — relatório vazio não é aprovação");
  }
  // Caso pulado reprova em TODOS os perfis, `baseline` inclusive.
  // Um baseline parcial é pior que nenhum: a E3 mira "18,1% → 0%", e essa
  // meta só significa alguma coisa se os dois lados mediram o mesmo conjunto.
  if (skipped.length > 0) {
    falhas.push(
      `${skipped.length} caso(s) não medidos — cobertura parcial não é aprovação`,
    );
  }
  if (summary.taxas.truncamento > thresholds.maxTruncationRate) {
    falhas.push(
      `truncamento ${(summary.taxas.truncamento * 100).toFixed(1)}% > ${(thresholds.maxTruncationRate * 100).toFixed(1)}%`,
    );
  }
  if (thresholds.minFitAboveFloorRate > 0) {
    if (summary.taxas.encaixeAcimaDoPiso === null) {
      falhas.push(
        `encaixe não pôde ser medido: nenhum título tem orçamento vertical derivável ` +
          `(todos posicionados por grade). Migre os slots para freePosition antes deste perfil.`,
      );
    } else if (summary.taxas.encaixeAcimaDoPiso < thresholds.minFitAboveFloorRate) {
      falhas.push(
        `encaixe acima do piso ${(summary.taxas.encaixeAcimaDoPiso * 100).toFixed(1)}% < ${(thresholds.minFitAboveFloorRate * 100).toFixed(1)}%`,
      );
    }
  }
  if (summary.taxas.sobreposicao > thresholds.maxOverlapRate) {
    falhas.push(`sobreposição ${(summary.taxas.sobreposicao * 100).toFixed(1)}%`);
  }
  if (summary.taxas.foraDoCanvas > thresholds.maxOutOfCanvasRate) {
    falhas.push(`fora do canvas ${(summary.taxas.foraDoCanvas * 100).toFixed(1)}%`);
  }
  if (summary.taxas.foraDaSafeArea > thresholds.maxSafeAreaViolationsRate) {
    falhas.push(`fora da safe area ${(summary.taxas.foraDaSafeArea * 100).toFixed(1)}%`);
  }
  if (thresholds.minContrastRatio > 0 && lowContrast.length > 0) {
    falhas.push(`${lowContrast.length} caso(s) abaixo de ${thresholds.minContrastRatio}:1 de contraste`);
  }

  // ── Relatório ──────────────────────────────────────────────────────────
  const pct = (v: number | null) => (v === null ? "n/d (sem orçamento vertical)" : `${(v * 100).toFixed(1)}%`);
  console.log(`\n── HARNESS · perfil "${thresholds.profile}" · medidor ${fontkitMeasurer.id} ──\n`);
  console.log(
    `corpus: ${summary.corpus.total} itens ` +
      `(${summary.corpus.sintéticos} sintéticos, ${summary.corpus.adversariais} adversariais, ${summary.corpus.reais} reais)` +
      `${corpus.hasRealAnchor ? "" : "  ⚠ SEM âncora real — rode `pnpm harness:corpus`"}`,
  );
  console.log(`casos: ${summary.casos.medidos} medidos, ${summary.casos.pulados} pulados\n`);
  console.log(`  truncamento (caminho produtivo) . ${pct(summary.taxas.truncamento)}`);
  console.log(`  encaixe acima do piso .......... ${pct(summary.taxas.encaixeAcimaDoPiso)}`);
  console.log(`  quebras irrecuperáveis .......... ${pct(summary.taxas.quebrasIrrecuperaveis)}`);
  console.log(`  sobreposição ................... ${pct(summary.taxas.sobreposicao)}`);
  console.log(`  fora do canvas ................. ${pct(summary.taxas.foraDoCanvas)}`);
  console.log(`  fora da safe area .............. ${pct(summary.taxas.foraDaSafeArea)}`);
  console.log(`  título posicionado por grade ... ${pct(summary.taxas.tituloPosicionadoPorGrade)}`);

  if (availability.missing.length > 0) {
    console.log(`\n${missingFontsReport(availability.missing)}`);
  }
  if (skipped.length > 0) {
    const fontes = [...new Set(skipped.map((s) => s.skipped))];
    console.log(`\n⚠ ${skipped.length} caso(s) PULADOS — resultado é parcial:`);
    fontes.forEach((f) => console.log(`   ${f}`));
  }

  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ summary, results }, null, 2), "utf8");
    console.log(`\nrelatório completo: ${args.json}`);
  }

  if (falhas.length > 0) {
    console.log(`\n❌ REPROVADO no perfil "${thresholds.profile}":`);
    falhas.forEach((f) => console.log(`   • ${f}`));
    process.exit(1);
  }

  // Perfil que pula casos não pode ser declarado aprovado sem ressalva.
  if (skipped.length > 0 && thresholds.profile !== "baseline") {
    console.log(
      `\n❌ REPROVADO: ${skipped.length} caso(s) não foram medidos. ` +
        `Perfil "${thresholds.profile}" exige cobertura total.`,
    );
    process.exit(1);
  }

  console.log(`\n✅ APROVADO no perfil "${thresholds.profile}"\n`);
}

main().catch((error) => {
  console.error("\n❌ harness abortou:", error instanceof Error ? error.message : error);
  process.exit(1);
});
