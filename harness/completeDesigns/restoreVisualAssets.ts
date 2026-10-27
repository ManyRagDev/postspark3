/** Curated restorations are additive immutable revisions. Historical recipes stay untouched. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyArsenalAsset } from "../../server/designCatalog/arsenalAssets";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  createComponentDefinition,
  assemblyIdentity,
} from "../../shared/componentAssembly";
import { arsenalPieceSchema } from "../../shared/designArsenal";
import type { AssetFile, ComponentPackage } from "../componentArsenal/extract";

const restorations = {
  "0623fb1c14937cd1e67e980b566710ba": {
    file: "paper-stack-background.png",
    summary:
      "Pilha irregular de papel com textura, grampos metálicos e sombra sobre grade laranja. Título preto condensado em quatro regiões; realces lilás e coral; chamada lateral e fita de encerramento.",
    motifs: ["stacked-paper", "paper-texture", "orange-grid", "condensed-type"],
    keepShapes: [
      "realce-roxo",
      "realce-laranja",
      "marcador-roxo-1",
      "marcador-roxo-2",
      "marcador-laranja-1",
      "marcador-laranja-2",
    ],
    limitation:
      "Fundo restaurado por edição assistida da referência; pequenas diferenças de textura permanecem. Tipografia editável aproxima a fonte original; não é uma reprodução pixel a pixel.",
  },
  "481adc75c3b7da8d267aeef293da71a6": {
    file: "retro-computer-background.png",
    summary:
      "Fotografia de computador e teclado retrô com volume, perspectiva e luz quente sobre papel creme. Mensagem serifada lilás/coral na tela verde escura e apoio em quadro inferior.",
    motifs: [
      "photographic-object",
      "retro-computer",
      "warm-paper",
      "screen-title",
    ],
    keepShapes: [],
    limitation:
      "Fotografia de fundo restaurada por edição assistida; pequenas diferenças locais permanecem. Tipografia editável aproxima a referência, sem deformação em perspectiva das letras.",
  },
} as const;

export async function restoreVisualAssets(result: {
  package: ComponentPackage;
  assetFiles: AssetFile[];
}): Promise<void> {
  const p = result.package;
  const key = p.source.referenceId as keyof typeof restorations;
  const restoration = restorations[key];
  if (!restoration) return;
  const bytes = await readFile(
    resolve("designs/recovered-assets", restoration.file)
  );
  const { manifest } = await verifyArsenalAsset(bytes, {});
  const file: AssetFile = {
    manifest,
    bytes,
    relativePath: `assets/${manifest.sha256}`,
    sourceHash: manifest.sha256,
    sourceFamily: "",
    sourceWeight: 400,
    resolvedWeight: 400,
    sourceUrl: null,
    adjustment:
      "Raster de decoração restaurado a partir da referência; texto permanece em camadas nativas.",
  };
  result.assetFiles.push(file);
  const { bytes: _, ...assetFile } = file;
  p.assetFiles.push(assetFile);
  p.components = p.components.map(component => {
    const c = structuredClone(component),
      fragment = c.fragment;
    const preserved = new Set(
      fragment.instances
        .filter(
          i =>
            c.pieces[i.pieceHash].kind === "text" ||
            (restoration.keepShapes as readonly string[]).includes(i.id)
        )
        .map(i => i.id)
    );
    fragment.instances = fragment.instances.filter(i => preserved.has(i.id));
    fragment.bindings = fragment.bindings
      .filter(b => b.kind !== "media")
      .map(b => ({
        ...b,
        targetIds: b.targetIds.filter(id => preserved.has(id)),
      }))
      .filter(b => b.targetIds.length);
    fragment.relations = fragment.relations.filter(
      r =>
        r.outputs.every(o => preserved.has(o.targetId)) &&
        r.inputs.every(id => preserved.has(id))
    );
    fragment.mediaSlots = [];
    fragment.intentionalOverlaps = fragment.intentionalOverlaps.filter(pair =>
      pair.every(
        id => preserved.has(id) || fragment.groups.some(g => g.id === id)
      )
    );
    const raster = arsenalPieceSchema.parse({
      kind: "media",
      imageAssetId: manifest.id,
      fill: fragment.artboard.background,
      stroke: null,
      strokeWidth: 0,
      cornerRadius: 0,
      points: [],
      fontFamily: "Arial",
      fontAssetId: null,
      fontSize: 12,
      fontWeight: 400,
      align: "left",
      lineHeight: 1,
      letterSpacing: 0,
      fixedText: null,
    });
    const rasterHash = arsenalHash(raster);
    c.pieces = Object.fromEntries(
      fragment.instances.map(i => [i.pieceHash, c.pieces[i.pieceHash]])
    );
    c.pieces[rasterHash] = raster;
    fragment.instances.unshift({
      id: "restored-background",
      pieceHash: rasterHash,
      parentId: null,
      zIndex: -10000,
      x: 0,
      y: 0,
      width: fragment.artboard.width,
      height: fragment.artboard.height,
      rotation: 0,
      opacity: 1,
    });
    fragment.assetIds.push(manifest.id);
    c.assets.push(manifest);
    c.colorRoles = Object.fromEntries(
      fragment.instances.map(i => [i.id, "preserve" as const])
    );
    if (key === "0623fb1c14937cd1e67e980b566710ba") {
      // Authored adjacent baseline boxes overlap slightly; single-line ink remains separate.
      fragment.lineBoxOverlaps = [
        ...(fragment.lineBoxOverlaps ?? []),
        ...[
          ["titulo-linha-1", "titulo-linha-2"],
          ["titulo-linha-2", "titulo-linha-3"],
          ["titulo-linha-3", "titulo-linha-4"],
        ].map(([a, b]) => ({
          a,
          b,
          maxOverlapFraction: 0.12,
          singleLineOnly: true as const,
        })),
      ];
    } else {
      const before = fragment.instances.find(i => i.id === "linha-trouxe"),
        after = fragment.instances.find(i => i.id === "linha-muita");
      if (before && after) {
        before.width = Math.min(before.width, after.x - before.x - 3);
        for (const r of fragment.relations)
          if (
            r.kind === "textFit" &&
            r.outputs.some(o => o.targetId === before.id)
          )
            r.parameters.maxWidth = before.width;
      }
    }
    const old = c.completeDesign!.designGuidance;
    c.description = restoration.summary;
    c.completeDesign = {
      ...c.completeDesign!,
      baselineVerified: false,
      designGuidance: {
        version: 1,
        summary: restoration.summary,
        motifs: [...restoration.motifs],
        preserve: [
          "Preservar a camada raster de fundo e suas proporções; o texto é editável separadamente.",
          ...(old?.preserve ?? []).filter(
            s => !/simplific|vetor|cinza/i.test(s)
          ),
        ].slice(0, 20),
        contentRules: old?.contentRules ?? [],
        mediaRules: [],
        knownLimitations: [
          restoration.limitation,
          ...(old?.knownLimitations ?? []).map(
            note =>
              `Registro da conversão anterior, preservado para auditoria (a restauração substitui a simplificação do fundo): ${note}`
          ),
        ],
        ...(key === "0623fb1c14937cd1e67e980b566710ba"
          ? {
              requiredTextTargets: [
                "titulo-linha-1",
                "titulo-linha-2",
                "titulo-linha-3",
                "titulo-linha-4",
              ],
            }
          : {}),
        ...(old?.original ? { original: old.original } : {}),
      },
    };
    fragment.limitations = [
      "Texto editável e fundo raster imutável. Encaixe respeita as caixas autoradas.",
      restoration.limitation,
    ];
    const { hash: ignored, id: previousId, ...definition } = c;
    const revised = createComponentDefinition({
      ...definition,
      id: assemblyIdentity(["visual-restoration-1", arsenalHash(definition)]),
    });
    for (const adaptation of p.authorship.formatAdaptations ?? []) {
      if (adaptation.componentId === previousId)
        adaptation.componentId = revised.id;
      if (adaptation.sourceComponentId === previousId)
        adaptation.sourceComponentId = revised.id;
    }
    return revised;
  });
  p.authorship.limitations.push(
    `Restauração raster ${manifest.sha256}; textos nativos; ${restoration.limitation}`
  );
}
