import kit from "./assemblyPilotKit.json";
import fontManifest from "./arsenalBundledAssets.json";
import {
  arsenalHash,
  readContentSource,
  visualSourcesFor,
  type DesignContent,
} from "./arsenalContent";
import { aspectRatioHeight } from "./aspectRatios";
import {
  ARSENAL_VARIABLE_COMPILER,
  arsenalAssetSchema,
  type ArsenalAsset,
  type ArsenalInstance,
  type ArsenalRelation,
  type PieceDefinitionV2,
  type ResolvedVariantDefinitionV2,
} from "./designArsenal";
import type { ArsenalOffer } from "./arsenalGeneration";
import type { ArsenalSearchHit } from "./arsenalCatalog";

export type AssemblyModule = "paper" | "window" | "ribbons";
type Background = "grid" | "playful" | "quiet";
type Typography = keyof typeof kit.typography;
export interface AssemblyPlan {
  id: string;
  background: Background;
  module: AssemblyModule;
  typography: Typography;
  score: number;
  queryHash: string;
}
export interface AssemblyRetrieval {
  method: "component-feature-cosine-v1";
  kitHash: string;
  queryHash: string;
  queryVector: number[];
  searched: number;
  plans: AssemblyPlan[];
  cards: ArsenalSearchHit[];
}
export const ASSEMBLY_KIT_HASH = arsenalHash(kit);
const labels = {
  paper: "Papel",
  window: "Janela",
  ribbons: "Tarjas",
  grid: "Grade",
  playful: "Formas",
  quiet: "Editorial",
};
const uuid = (value: string) => {
  const h = arsenalHash(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const identity = (p: AssemblyPlan) => ({
  versionId: uuid(ASSEMBLY_KIT_HASH + p.id),
  variantKey: p.id,
});
export const assemblyCandidateId = (p: AssemblyPlan) =>
  `${identity(p).versionId}:${p.id}`;
const label = (p: AssemblyPlan) =>
  `${labels[p.module]} · ${labels[p.background]} · ${kit.typography[p.typography].label}`;
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
// Versioned, interpretable feature search for this bounded pilot. Not a learned embedding.
// Axes: analysis, education, expression, trust, promotion, technology.
const concepts = [
  /prec[oç]|descont|histor|compar|dad[oa]|anal|price|discount/,
  /ensin|dica|apren|explic|guia|educ|learn/,
  /criativ|ideia|arte|movimento|express|creative/,
  /segur|confi|transpar|real|credib|trust/,
  /produto|compr|oferta|vend|promoc|product|sale/,
  /app|aplicativo|tecnolog|monitor|digital|software/,
];
const vectors: Record<AssemblyModule, number[]> = {
  paper: [0.8, 1, 0.6, 0.8, 0.5, 0.4],
  window: [1, 0.5, 0.5, 0.9, 0.7, 1],
  ribbons: [0.4, 0.7, 1, 0.6, 1, 0.5],
};
const cosine = (a: number[], b: number[]) =>
  a.reduce((s, v, i) => s + v * b[i], 0) /
  (Math.hypot(...a) * Math.hypot(...b) || 1);

export function retrieveAssemblyPlans(brief: string): AssemblyRetrieval {
  const text = normalize(brief),
    queryVector = concepts.map(r => (r.test(text) ? 1 : 0.1)),
    queryHash = arsenalHash(brief);
  const pool: AssemblyPlan[] = [];
  for (const module of Object.keys(vectors) as AssemblyModule[])
    for (const background of ["grid", "playful", "quiet"] as Background[])
      for (const typography of Object.keys(kit.typography) as Typography[]) {
        const style =
          background === "quiet"
            ? [0.9, 0.7, 0.2, 1, 0.5, 0.6]
            : background === "playful"
              ? [0.3, 0.5, 1, 0.4, 0.9, 0.8]
              : [0.8, 1, 0.7, 0.7, 0.7, 0.7];
        const score =
          0.8 * cosine(queryVector, vectors[module]) +
          0.2 * cosine(queryVector, style);
        pool.push({
          id: `assembly-${module}-${background}-${typography}`,
          module,
          background,
          typography,
          score,
          queryHash,
        });
      }
  const selected: AssemblyPlan[] = [];
  while (selected.length < 5) {
    const ranked = pool
      .filter(p => !selected.some(s => s.id === p.id))
      .map(p => ({
        p,
        rank:
          p.score -
          (selected.some(s => s.module === p.module) ? 0.32 : 0) -
          (selected.some(s => s.background === p.background) ? 0.12 : 0) -
          (selected.some(s => s.typography === p.typography) ? 0.09 : 0),
      }))
      .sort((a, b) => b.rank - a.rank || a.p.id.localeCompare(b.p.id));
    selected.push(ranked[0].p);
  }
  return {
    method: "component-feature-cosine-v1",
    kitHash: ASSEMBLY_KIT_HASH,
    queryHash,
    queryVector,
    searched: pool.length,
    plans: selected,
    cards: selected.map(p => ({
      candidateId: assemblyCandidateId(p),
      ...identity(p),
      blueprintId: uuid(p.id),
      version: 1,
      definitionHash: ASSEMBLY_KIT_HASH,
      variantHash: arsenalHash(p),
      distance: 1 - p.score,
      card: {
        name: label(p),
        description: `Combinação experimental de três origens: fundo ${labels[p.background]}, conjunto ${labels[p.module]}, fonte ${kit.typography[p.typography].label}. Superfícies acompanham o conteúdo e blocos fluem verticalmente.`,
        tags: [p.module, p.background, p.typography],
        intentions: ["headline-body", "list", "comparison"],
        aspectRatio: "4:5",
        compilerVersion: ARSENAL_VARIABLE_COMPILER,
        capabilities: [
          "text",
          "rect",
          "line",
          "polygon",
          "groups",
          "relations",
        ],
        fields: [
          "headline",
          "body",
          "eyebrow",
          "callToAction",
          "label",
          "sectionLabel",
        ].map(source => ({
          source,
          kind: "text" as const,
          required: false,
          cardinality: null,
        })),
        hasMedia: false,
        brandPolicy: null,
        fontFamilies: [kit.typography[p.typography].label, "Inter"],
        limitations: [
          "Piloto administrativo sem foto; ainda não publicado no catálogo.",
          "Use uma mensagem visual dominante, apoio breve e detalhes na legenda, salvo pedido explícito diferente.",
          "O layout será construído para os blocos efetivamente gerados; encaixe verificado no CanvasLab.",
        ],
      },
    })),
  };
}

export function chooseAssemblyPlans(
  result: AssemblyRetrieval,
  requested: string,
  used: string[]
): AssemblyPlan[] {
  const selected = result.plans.find(p => assemblyCandidateId(p) === requested);
  if (!selected) return [];
  return [...result.plans]
    .sort(
      (a, b) =>
        Number(used.includes(a.module)) - Number(used.includes(b.module)) ||
        Number(b.id === selected.id) - Number(a.id === selected.id) ||
        b.score - a.score
    )
    .slice(0, 3);
}

function asset(id: string): ArsenalAsset {
  const f = (fontManifest as Record<string, any>)[id];
  if (!f) throw Error("Fonte do piloto ausente");
  const { path, sourceUrl, ...manifest } = f;
  return arsenalAssetSchema.parse(manifest);
}
function sourceMeta(content: DesignContent, source: string) {
  const match = source.match(/^content:([^:]+):(.+)$/);
  const block =
    content.schemaVersion === 3
      ? content.blocks.find(b => b.id === match?.[1])
      : undefined;
  return block?.type === "text"
    ? block.role
    : match?.[2] === "value"
      ? "headline"
      : source === "headline"
        ? "headline"
        : "body";
}

/** Materializes a candidate for this content, retaining relations for subsequent editing.
 * No text is rewritten/truncated and no copy of the reference text is used. */
export function assembleOffer(
  plan: AssemblyPlan,
  content: DesignContent,
  aspect: ResolvedVariantDefinitionV2["aspectRatio"] = "4:5"
): ArsenalOffer {
  const W = 1080,
    H = aspectRatioHeight(aspect, W),
    pieces: Record<string, PieceDefinitionV2> = {},
    instances: ArsenalInstance[] = [],
    relations: ArsenalRelation[] = [],
    bindings: ResolvedVariantDefinitionV2["bindings"] = [];
  const head = asset(kit.typography[plan.typography].assetId);
  const body = asset(
    Object.values(fontManifest).find(
      f => f.sourceFamily === "Inter" && f.weight === 400
    )!.id
  );
  const assets = Array.from(new Map([head, body].map(a => [a.id, a])).values());
  const group = "assembly-content";
  const piece = (overrides: Partial<PieceDefinitionV2>): PieceDefinitionV2 => ({
    kind: "rect",
    fill: "#111111",
    stroke: null,
    strokeWidth: 0,
    cornerRadius: 0,
    points: [],
    fontFamily: "Arial",
    fontAssetId: null,
    fontSize: 36,
    fontWeight: 400,
    align: "center",
    lineHeight: 1.2,
    letterSpacing: 0,
    fixedText: null,
    ...overrides,
  });
  function add(
    id: string,
    definition: PieceDefinitionV2,
    geo: Partial<ArsenalInstance> = {}
  ) {
    const hash = arsenalHash(definition);
    pieces[hash] = definition;
    instances.push({
      id,
      pieceHash: hash,
      parentId: group,
      zIndex: 0,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rotation: 0,
      opacity: 1,
      ...geo,
    });
  }
  let background = "#EDECE6";
  if (plan.background !== "quiet") {
    const bg = kit.backgrounds[plan.background];
    background = bg.fill;
    for (const l of bg.layers) {
      const s = W / bg.width,
        sy = H / bg.height;
      add(
        "bg-" + l.id,
        piece({
          kind: l.kind as PieceDefinitionV2["kind"],
          fill: l.fill,
          stroke: l.strokeColor,
          strokeWidth: l.strokeWidth * s,
          points: l.points.map((p, i) => p * (i % 2 ? sy : s)),
          cornerRadius: 0,
        }),
        {
          parentId: null,
          zIndex: -100,
          x: l.x * s,
          y: l.y * sy,
          width: Math.max(1, l.width * s),
          height: Math.max(1, l.height * sy),
          rotation: l.rotationDeg,
          opacity: l.opacity,
        }
      );
    }
  }
  const textIds: string[] = [];
  const sources = visualSourcesFor(content);
  const roleSize = (role: string) =>
    role === "headline"
      ? 112
      : role === "eyebrow" || role === "sectionLabel"
        ? 24
        : role === "callToAction"
          ? 30
          : 34;
  for (const [idx, source] of Array.from(sources.entries())) {
    const value = readContentSource(content, source);
    if (!(Array.isArray(value) ? value.length : String(value ?? "").trim()))
      continue;
    const id = `text-${idx}`,
      role = sourceMeta(content, source),
      isHead = role === "headline",
      size = roleSize(role),
      font = isHead ? head : body;
    const isRibbon = plan.module === "ribbons";
    const fill = isRibbon && isHead ? "#FFFFFF" : "#171717";
    add(
      id,
      piece({
        kind: "text",
        fill,
        fontFamily: font.family!,
        fontAssetId: font.id,
        fontWeight: font.weight!,
        fontSize: size,
        lineHeight: isHead ? 1.1 : 1.35,
        align: "center",
      }),
      { x: 164, y: 160, width: 752, height: size * 1.35, zIndex: 30 + idx * 2 }
    );
    textIds.push(id);
    bindings.push({
      id,
      source,
      kind: Array.isArray(value) ? "list" : "text",
      label: role,
      required: false,
      targetIds: [id],
      cardinality: Array.isArray(value) ? { min: 0, max: 10000 } : null,
      prefix: "",
      gap: 20,
    });
    relations.push({
      id: `fit-${id}`,
      version: 1,
      kind: "textFit",
      enabled: true,
      inputs: [],
      outputs: [
        { targetId: id, properties: ["x", "width", "height", "fontSize"] },
      ],
      parameters: {
        anchor: "center",
        maxWidth: 752,
        maxHeight: isHead ? H * 0.43 : H * 0.48,
        minFontSize: isHead ? 72 : 28,
      },
    });
    if (
      isRibbon ||
      (plan.module === "paper" && isHead) ||
      role === "callToAction"
    ) {
      const surface = `surface-${idx}`,
        bg = isHead
          ? isRibbon
            ? "#244FDA"
            : "#C2A7DB"
          : role === "callToAction"
            ? "#E5E0CF"
            : "#F3F3F1";
      add(
        surface,
        piece({ fill: bg, cornerRadius: role === "callToAction" ? 8 : 0 }),
        { zIndex: 29 + idx * 2 }
      );
      relations.push({
        id: `surface-${id}`,
        version: 1,
        kind: "surfaceFit",
        enabled: true,
        inputs: [id],
        outputs: [
          { targetId: surface, properties: ["x", "y", "width", "height"] },
        ],
        parameters: {
          padding: { left: 18, right: 18, top: 14, bottom: 14 },
          minWidth: 1,
          minHeight: 1,
        },
      });
    }
  }
  // A one-dimensional flow for the first slice. Each block remains independently editable.
  if (textIds.length) {
    relations.push({
      id: "content-flow",
      version: 1,
      kind: "verticalFlow",
      enabled: true,
      inputs: textIds,
      outputs: textIds.map(id => ({ targetId: id, properties: ["y"] })),
      parameters: { startY: 160, gap: 54 },
    });
    relations.push({
      id: "content-size",
      version: 1,
      kind: "surfaceFit",
      enabled: true,
      inputs: textIds,
      outputs: [{ targetId: group, properties: ["height"] }],
      parameters: {
        padding: { left: 0, right: 0, top: 160, bottom: 96 },
        minWidth: 1080,
        minHeight: 500,
      },
    });
    relations.push({
      id: "content-center",
      version: 1,
      kind: "anchor",
      enabled: true,
      inputs: ["assembly-frame", group],
      outputs: [{ targetId: group, properties: ["y"] }],
      parameters: {
        axis: "y",
        referenceEdge: "center",
        targetEdge: "center",
        offset: 0,
      },
    });
  }
  if (plan.module !== "ribbons") {
    const fill = kit.modules[plan.module].fill;
    const panels =
      plan.module === "paper"
        ? [
            ["paper-back", -2, "#F8F5E9", -15],
            ["paper-shadow", 0, "#B9B4A8", -12],
            ["panel", 0, fill, -10],
          ]
        : [
            ["window-shadow", 0, "#111111", -12],
            ["panel", 0, fill, -10],
          ];
    for (const [id, rotation, color, z] of panels) {
      add(
        String(id),
        piece({
          fill: String(color),
          stroke: plan.module === "window" ? "#111111" : null,
          strokeWidth: plan.module === "window" ? 5 : 0,
          cornerRadius: plan.module === "paper" ? 22 : 0,
        }),
        { rotation: Number(rotation), zIndex: Number(z) }
      );
      relations.push({
        id: `fit-${id}`,
        version: 1,
        kind: "surfaceFit",
        enabled: true,
        inputs: textIds,
        outputs: [
          { targetId: String(id), properties: ["x", "y", "width", "height"] },
        ],
        parameters: {
          padding: {
            left: id === "panel" ? 52 : 42,
            right: id === "panel" ? 52 : 62,
            top: plan.module === "window" ? 94 : 52,
            bottom: id === "panel" ? 44 : 58,
          },
          minWidth: 856,
          minHeight: 400,
        },
      });
    }
    if (plan.module === "window") {
      add("window-divider", piece({ fill: "#111111" }), {
        x: 112,
        width: 856,
        height: 5,
        zIndex: 0,
      });
      relations.push({
        id: "window-divider-anchor",
        version: 1,
        kind: "anchor",
        enabled: true,
        inputs: ["panel"],
        outputs: [{ targetId: "window-divider", properties: ["y"] }],
        parameters: {
          axis: "y",
          referenceEdge: "start",
          targetEdge: "start",
          offset: 62,
        },
      });
      for (const [i, color] of Array.from(
        ["#EF420C", "#E9B708", "#46AF45"].entries()
      )) {
        add(
          `control-${i}`,
          piece({
            fill: color,
            stroke: "#111111",
            strokeWidth: 2,
            cornerRadius: 14,
          }),
          { x: 140 + i * 42, width: 25, height: 25, zIndex: 1 }
        );
        relations.push({
          id: `control-anchor-${i}`,
          version: 1,
          kind: "anchor",
          enabled: true,
          inputs: ["panel"],
          outputs: [{ targetId: `control-${i}`, properties: ["y"] }],
          parameters: {
            axis: "y",
            referenceEdge: "start",
            targetEdge: "start",
            offset: 20,
          },
        });
      }
    }
  }
  const variant: ResolvedVariantDefinitionV2 = {
    variantKey: plan.id,
    aspectRatio: aspect,
    compilerVersion: ARSENAL_VARIABLE_COMPILER,
    artboard: { width: W, height: H, background },
    instances,
    groups: [
      {
        id: "assembly-frame",
        label: "Área de composição",
        parentId: null,
        zIndex: -90,
        x: 0,
        y: 0,
        width: W,
        height: H,
        rotation: 0,
        opacity: 1,
        scale: 1,
      },
      {
        id: group,
        label: "Composição combinada",
        parentId: null,
        zIndex: 0,
        x: 0,
        y: 0,
        width: W,
        height: H,
        rotation: 0,
        opacity: 1,
        scale: 1,
      },
    ],
    bindings,
    relations,
    assetIds: assets.map(a => a.id),
    capabilities: ["text", "rect", "line", "polygon", "groups", "relations"],
    intentionalOverlaps: [],
    limitations: [
      "Composição experimental por componentes; não é publicação de uma receita do catálogo.",
      "Piloto sem mídia e sem aplicação automática de identidade de marca; cores preservadas dos componentes.",
    ],
  };
  const sourceIds = Array.from(
    new Set([
      kit.modules[plan.module].sourceId,
      plan.background === "grid"
        ? "paper"
        : plan.background === "playful"
          ? "window"
          : "minimal-air",
      plan.typography,
    ])
  );
  return {
    name: label(plan),
    description: "Composição experimental com relações persistidas.",
    pieces,
    assets,
    candidate: {
      ...identity(plan),
      candidateId: assemblyCandidateId(plan),
      blueprintId: uuid(plan.id),
      version: 1,
      definitionHash: ASSEMBLY_KIT_HASH,
      variantHash: arsenalHash(variant),
      compilerVersion: ARSENAL_VARIABLE_COMPILER,
      assembly: {
        version: 1,
        planId: plan.id,
        label: label(plan),
        componentIds: [
          `background:${plan.background}`,
          `module:${plan.module}`,
          `typography:${plan.typography}`,
        ],
        sourceHashes: sourceIds.map(
          id => (kit.sources as Record<string, { sha256: string }>)[id].sha256
        ),
        kitHash: ASSEMBLY_KIT_HASH,
        queryHash: plan.queryHash,
        retrievalMethod: "component-feature-cosine-v1",
        retrievalScore: plan.score,
        experimental: true,
      },
      variant,
    },
  };
}
