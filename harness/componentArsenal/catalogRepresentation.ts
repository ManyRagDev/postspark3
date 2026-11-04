import { arsenalHash } from "../../shared/arsenalContent";
import {
  assemblyIdentity,
  createComponentDefinition,
  type ComponentDefinitionV1,
} from "../../shared/componentAssembly";
import { authorRecipe, REFERENCES, type AuthoredUnit } from "./authoring";
import { deriveDesignGuidance } from "./designGuidance";
import type { ComponentPackage } from "./extract";
import type { DesignGuidance } from "../../shared/designGuidance";
import { applyAuthoredFamilyLayout } from "../../server/designCatalog/authoredFamilyLayouts";

/** Curatorial vocabulary belongs to authoring, never to a selection whitelist. */
const familyDescriptions: Record<
  string,
  { summary: string; motifs: string[] }
> = {
  "mosaic-grid": {
    summary:
      "Título amplo sobre três cartões independentes alinhados. Os cartões organizam três ideias paralelas; as duas linhas de cada cartão pertencem à mesma ideia.",
    motifs: ["three-native-cards", "large-heading", "parallel-ideas"],
  },
  versus: {
    summary:
      "Duas áreas contrapostas para lados de uma comparação, com título compartilhado. O contraste entre os lados é parte da composição, sem impor tema ou tom.",
    motifs: ["opposed-panels", "shared-heading", "comparison"],
  },
  "data-punch": {
    summary:
      "Valor numérico de grande destaque acompanhado de título e explicação. A métrica deve vir do insumo; seu tamanho visual não autoriza inventar números.",
    motifs: ["prominent-metric", "supporting-explanation"],
  },
  "minimal-air": {
    summary:
      "Hierarquia tipográfica contida com poucas regiões e respiro; favorece uma mensagem curta e apoio conciso, conforme capacidade das caixas.",
    motifs: ["restrained-type", "open-spacing"],
  },
  "brutal-split": {
    summary:
      "Composição dividida, contraste forte entre áreas e título de impacto. Os blocos de texto mantêm funções distintas dentro da divisão nativa.",
    motifs: ["split-composition", "strong-contrast"],
  },
  "kinetic-type": {
    summary:
      "Tipografia expressiva como protagonista; preservar relações entre fragmentos e efeitos do título. A escala visual não significa espaço para explicação longa.",
    motifs: ["expressive-type", "typographic-motion"],
  },
  "stroke-impact": {
    summary:
      "Título de impacto com contorno tipográfico; preservar contraste e desenho do contorno nas adaptações de hierarquia.",
    motifs: ["outlined-type", "large-heading"],
  },
  "cinematic-depth": {
    summary:
      "Imagem e atmosfera de pôster com hierarquia textual de cinema. A mídia faz parte da mensagem e depende de imagem adequada ao briefing.",
    motifs: ["cinematic-poster", "image-led-hierarchy"],
  },
  "chromatic-block": {
    summary:
      "Blocos cromáticos estruturam a composição e a hierarquia do título e apoio. Manter o contraste das áreas, sem deduzir tom editorial das cores.",
    motifs: ["chromatic-panels", "graphic-hierarchy"],
  },
  "glitch-signal": {
    summary:
      "Interferência gráfica e tipografia marcada estruturam o sinal visual; efeitos são parte do desenho, sem obrigar linguagem informal.",
    motifs: ["signal-interference", "expressive-type"],
  },
};

export function rebuildCatalogRepresentation(
  source: ComponentDefinitionV1,
  pkg: ComponentPackage,
  previous?: ComponentDefinitionV1
): { definition: ComponentDefinitionV1; units: AuthoredUnit[] } {
  const recipe = pkg.sourceSnapshot.recipe;
  const authored = REFERENCES[pkg.source.referenceId]
    ? authorRecipe(pkg.source, recipe)
    : pkg.authorship.units.map(u => ({
        ...u,
        kind: u.kind ?? ("text" as const),
      }));
  const ids = new Set(source.fragment.instances.map(i => i.id));
  const units = authored.filter(u => u.layerIds.every(id => ids.has(id)));
  const covered = new Set(units.flatMap(u => u.layerIds));
  if (
    source.fragment.bindings
      .filter(b => b.kind !== "media")
      .some(b => b.targetIds.some(id => !covered.has(id)))
  )
    throw new Error("representation_native_targets_unmapped");
  const next = structuredClone(source),
    pieces = { ...next.pieces };
  next.fragment.bindings = [
    ...units.map((u, index) => ({
      id: `semantic-${index}`,
      label: `${u.role}: ${u.fields.length ? u.fields.join(", ") : u.layerIds.join(", ")}`,
      source: u.source,
      kind: u.kind,
      required: u.required,
      targetIds: u.layerIds,
      cardinality: u.cardinality ?? null,
      prefix: u.prefix ?? "",
      gap: 0,
      ...(u.kind === "list" ? { listMode: "native-slots" as const } : {}),
    })),
    ...source.fragment.bindings.filter(b => b.kind === "media"),
  ];
  // Later approved revisions can change a headline's line division. Recipe samples
  // are historical evidence, not permission to undo the currently frozen geometry.
  for (const unit of units.filter(
    u => u.kind === "text" && u.layerIds.length > 1
  )) {
    const fragments = unit.layerIds.map(id => {
      const instance = source.fragment.instances.find(i => i.id === id)!;
      return source.pieces[instance.pieceHash].contentFragment;
    });
    if (
      fragments.every(
        (f, index) => f?.count === unit.layerIds.length && f.index === index
      ) &&
      fragments[0]?.weights
    )
      unit.weights = fragments[0].weights.slice();
  }
  for (const unit of units)
    for (const [index, id] of Array.from(unit.layerIds.entries())) {
      const instance = next.fragment.instances.find(i => i.id === id)!;
      const { contentFragment: _fragment, ...piece } =
        pieces[instance.pieceHash];
      const changed = {
        ...piece,
        ...(unit.kind === "text" && unit.layerIds.length > 1
          ? {
              contentFragment: {
                unit: "words" as const,
                index,
                count: unit.layerIds.length,
                weights: unit.weights,
              },
            }
          : {}),
      };
      const hash = arsenalHash(changed);
      pieces[hash] = changed;
      instance.pieceHash = hash;
    }
  const guidance = deriveDesignGuidance(
    recipe,
    units,
    pkg.source.original,
    pkg.source.referenceId
  ) as DesignGuidance;
  const family = source.completeDesign!.family;
  const profile = familyDescriptions[family];
  const window = source.fragment.instances.some(i => /^control-\d/.test(i.id));
  const paper = source.fragment.instances.some(i =>
    /paper|papel|folha/.test(i.id)
  );
  if (profile) {
    guidance.summary = profile.summary;
    guidance.motifs = profile.motifs;
  } else if (window || paper) {
    guidance.summary =
      `${window ? "Janela com moldura, controles e organização de conteúdo no painel nativo. " : ""}${paper ? "Camadas de papel sobrepostas preservam a assinatura editorial. " : ""}${guidance.summary}`.slice(
        0,
        1000
      );
    guidance.motifs = Array.from(
      new Set([
        ...guidance.motifs,
        ...(window ? ["native-window-frame", "window-controls"] : []),
        ...(paper ? ["layered-paper"] : []),
      ])
    ).slice(0, 12);
  }
  guidance.representation = {
    version: 3,
    sourceId: source.id,
    sourceHash: source.hash,
    method: "native_semantics_rebuild",
  };
  guidance.familyIdentity = {
    essential: guidance.motifs.length
      ? guidance.motifs
      : ["native-composition", "native-typographic-hierarchy"],
    optional: [
      "Campos de apoio opcionais podem ficar vazios quando não pertinentes.",
    ],
    adaptable: [
      "Texto e mídia apenas nos campos declarados.",
      "Ritmo por escolha entre composições do repertório; geometria fixa dentro de cada composição.",
    ],
  };
  guidance.fieldRelationships = units
    .filter(u => u.kind === "list")
    .map(u => ({
      kind: "independent_items",
      sources: [u.source],
      label:
        "Cada item permanece completo em seu slot nativo; não distribuir palavras entre itens.",
    }));
  for (const u of units.filter(
    u => u.role === "headline" && u.layerIds.length > 1
  ))
    guidance.fieldRelationships.push({
      kind: "emphasis",
      sources: [u.source],
      label: `Título único distribuído entre ${u.layerIds.join(", ")}; conferir peso, cor e capacidade de cada fragmento.`,
    });
  if (family === "versus")
    guidance.fieldRelationships.push({
      kind: "contrast",
      sources: units.filter(u => u.role === "body").map(u => u.source),
      label:
        "As áreas esquerda e direita representam lados distintos da comparação.",
    });
  if (family === "data-punch") {
    const binding = next.fragment.bindings.find(b =>
      b.targetIds.some(id => /stat|metric|numero|number/i.test(id))
    );
    if (binding)
      binding.label =
        "Métrica central: número ou valor factual do briefing, com unidade quando couber";
  }
  if (family === "f65e1862777e3c9e201442396155f3fa")
    guidance.knownLimitations = [
      ...guidance.knownLimitations,
      "O realce amarelo sobre a fotografia tem posição fixa; não acompanha automaticamente o objeto de uma imagem substituta.",
    ].slice(0, 30);
  next.completeDesign = {
    ...source.completeDesign!,
    authorshipRevision: (source.completeDesign?.authorshipRevision ?? 1) + 1,
    designGuidance: guidance,
  };
  if (units.some(u => u.kind === "list") && !next.roles.includes("list"))
    next.roles.push("list");
  if (family === "versus" && !next.roles.includes("comparison"))
    next.roles.push("comparison");
  next.pieces = pieces;
  if (["mosaic-grid", "6da56cf3eb349b1ef42ab98eaf610f05"].includes(family))
    applyAuthoredFamilyLayout(next, "native");
  const { hash: _hash, id: _id, ...definition } = next;
  const create = () =>
    createComponentDefinition({
      ...definition,
      id: assemblyIdentity([
        "catalog-representation-v3",
        source.id,
        arsenalHash(definition),
      ]),
    });
  const first = create();
  // Reuse exact immutable rows for unchanged sources; changed authorship advances
  // beyond the previous staged package so the catalog reader supersedes it.
  if (previous && previous.hash !== first.hash)
    definition.completeDesign!.authorshipRevision = Math.max(
      definition.completeDesign!.authorshipRevision!,
      (previous.completeDesign?.authorshipRevision ?? 1) + 1
    );
  return {
    definition: previous?.hash === first.hash ? previous : create(),
    units,
  };
}
