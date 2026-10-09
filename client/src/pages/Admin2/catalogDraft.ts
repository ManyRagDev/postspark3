import {
  CATALOG_COMPILER,
  catalogBlueprintSchema,
  type CatalogBlueprint,
  type CatalogPiece,
} from "@shared/designCatalog";
import type { RecreationRecipe } from "@shared/designRecreation";
import type { ReferenceSceneLayer } from "@shared/referenceReconstruction";
import { canvasTypography } from "../CanvasLab/lib/catalogTypography";

const piece = (
  role: "headline" | "body",
  y: number,
  height: number
): CatalogPiece => ({
  key: role,
  role,
  box: { x: 0.08, y, width: 0.84, height },
  fontFamily: role === "headline" ? "Anton" : "Inter",
  fontWeight: role === "headline" ? 400 : 400,
  fontSize: role === "headline" ? 44 : 16,
  minFontSize: role === "headline" ? 20 : 11,
  align: "left",
  effect: "none",
  confidenceScore: 1,
  constraints: { requires: [], conflictsWith: [] },
});
export function manualCatalogDraft(
  style: "editorial" | "card" | "bottom" = "editorial"
): CatalogBlueprint {
  const headline = piece("headline", style === "bottom" ? 0.48 : 0.12, 0.28);
  const body = piece(
    "body",
    style === "bottom" ? 0.79 : 0.5,
    style === "bottom" ? 0.15 : 0.32
  );
  if (style === "card") headline.effect = "box-brutal";
  return {
    schemaVersion: 1,
    compilerVersion: CATALOG_COMPILER,
    name:
      style === "card"
        ? "Título em tarja"
        : style === "bottom"
          ? "Leitura na base"
          : "Hierarquia editorial",
    description:
      "Título dominante e apoio separado, com áreas proporcionais e tipografia adaptável.",
    tags: ["editorial", "hierarquia"],
    intents: ["informar"],
    formats: ["1:1", "4:5", "9:16"],
    postMode: "static",
    media: style === "bottom" ? "optional" : "none",
    maxHeadlineChars: 100,
    maxBodyChars: 260,
    pieces: [headline, body],
    sourceRecipeId: null,
    sourceHash: null,
    limitations: [],
  };
}
type Box = CatalogPiece["box"];
export type RecipeGroups = {
  headlineIds: string[];
  bodyIds: string[];
  ignored: Array<{ id: string; reason: string }>;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const area = (b: Box) => b.width * b.height;
const intersection = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
function layerBox(recipe: RecreationRecipe, layer: ReferenceSceneLayer): Box {
  const { widthPx: w, heightPx: h } = recipe.scene.source;
  const x = clamp(layer.x / w, 0, 1),
    y = clamp(layer.y / h, 0, 1);
  return {
    x,
    y,
    width: Math.max(0, Math.min(1, (layer.x + layer.width) / w) - x),
    height: Math.max(0, Math.min(1, (layer.y + layer.height) / h) - y),
  };
}
function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map(b => b.x)),
    y = Math.min(...boxes.map(b => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map(b => b.x + b.width)) - x,
    height: Math.max(...boxes.map(b => b.y + b.height)) - y,
  };
}
function supports(
  recipe: RecreationRecipe,
  text: ReferenceSceneLayer
): ReferenceSceneLayer[] {
  const b = layerBox(recipe, text);
  return recipe.scene.layers
    .filter(l => {
      if (
        !["rect", "polygon"].includes(l.kind) ||
        l.opacity < 0.2 ||
        l.zIndex >= text.zIndex
      )
        return false;
      const s = layerBox(recipe, l);
      return (
        area(s) < 0.65 &&
        area(s) <= area(b) * 15 &&
        intersection(b, s) >= area(b) * 0.55
      );
    })
    .sort((a, b) => area(layerBox(recipe, a)) - area(layerBox(recipe, b)));
}
function accessoryReason(
  recipe: RecreationRecipe,
  layer: ReferenceSceneLayer,
  maxFont: number
): string | null {
  const text = layer.text?.trim() ?? "";
  const label = words(`${layer.id} ${layer.role}`);
  if (/^@|https?:\/\/|www\.|\b[\w-]+\.(com|net|org|io|co)\b/i.test(text))
    return "Assinatura ou endereço";
  if (
    /(^|[-_\s])(footer|rodape|logo|handle|credit|copyright|watermark)([-_\s]|$)/.test(
      label
    )
  )
    return "Crédito, marca ou rodapé";
  if (/^\d{1,2}$/.test(text) || /^(next slide|swipe|arraste)/i.test(text))
    return "Navegação ou numeração";
  // Small words attached to a surface (ABOUT, for example) belong to the motif.
  if (supports(recipe, layer).length) return null;
  const b = layerBox(recipe, layer);
  if (b.y > 0.86 && layer.fontSize < maxFont * 0.5)
    return "Texto acessório na margem";
  if (layer.fontSize < maxFont * 0.24 && b.height < 0.05)
    return "Observação de baixa proeminência";
  return null;
}
function neighbours(
  recipe: RecreationRecipe,
  a: ReferenceSceneLayer,
  b: ReferenceSceneLayer
): boolean {
  const x = layerBox(recipe, a),
    y = layerBox(recipe, b);
  const overlapX = Math.max(
    0,
    Math.min(x.x + x.width, y.x + y.width) - Math.max(x.x, y.x)
  );
  const overlapY = Math.max(
    0,
    Math.min(x.y + x.height, y.y + y.height) - Math.max(x.y, y.y)
  );
  const gapY = Math.max(0, x.y - y.y - y.height, y.y - x.y - x.height);
  const gapX = Math.max(0, x.x - y.x - y.width, y.x - x.x - x.width);
  return (
    (overlapX >= Math.min(x.width, y.width) * 0.4 &&
      gapY <= Math.min(0.055, Math.max(x.height, y.height) * 1.25)) ||
    (overlapY >= Math.min(x.height, y.height) * 0.4 && gapX <= 0.045)
  );
}
function cluster(
  recipe: RecreationRecipe,
  seed: ReferenceSceneLayer,
  candidates: ReferenceSceneLayer[]
): ReferenceSceneLayer[] {
  const found = [seed];
  for (let changed = true; changed; ) {
    changed = false;
    for (const item of candidates)
      if (
        !found.includes(item) &&
        found.some(l => neighbours(recipe, l, item))
      ) {
        found.push(item);
        changed = true;
      }
  }
  return found.sort((a, b) => a.y - b.y || a.x - b.x);
}
/** Suggestion only: the curator can move every layer, including small labels, between groups. */
export function suggestRecipeGroups(recipe: RecreationRecipe): RecipeGroups {
  const texts = recipe.scene.layers.filter(
    l => l.kind === "text" && l.text?.trim()
  );
  const maxFont = Math.max(1, ...texts.map(l => l.fontSize));
  const reasons = new Map(
    texts.map(l => [l.id, accessoryReason(recipe, l, maxFont)])
  );
  const eligible = texts.filter(l => !reasons.get(l.id));
  const dominant = eligible.filter(l => l.fontSize >= maxFont * 0.58);
  const score = (l: ReferenceSceneLayer) =>
    l.fontSize * Math.sqrt(l.width * l.height);
  const seed = [...dominant].sort((a, b) => score(b) - score(a))[0];
  if (!seed)
    return {
      headlineIds: [],
      bodyIds: [],
      ignored: texts.map(l => ({
        id: l.id,
        reason: reasons.get(l.id) ?? "Selecionar manualmente",
      })),
    };
  const headline = cluster(recipe, seed, dominant);
  const rest = eligible.filter(l => !headline.includes(l));
  const bodySeed = [...rest].sort((a, b) => score(b) - score(a))[0];
  const body = bodySeed ? cluster(recipe, bodySeed, rest) : [];
  const used = new Set([...headline, ...body].map(l => l.id));
  return {
    headlineIds: headline.map(l => l.id),
    bodyIds: body.map(l => l.id),
    ignored: texts
      .filter(l => !used.has(l.id))
      .map(l => ({
        id: l.id,
        reason: reasons.get(l.id) ?? "Fora dos blocos principais",
      })),
  };
}
function mediaAreas(
  recipe: RecreationRecipe
): NonNullable<CatalogBlueprint["extraction"]>["mediaAreas"] {
  const result: NonNullable<CatalogBlueprint["extraction"]>["mediaAreas"] = [];
  for (const m of recipe.missingElements) {
    if (!m.box || m.role === "texture" || m.role === "logo") continue;
    const text = words(m.description);
    if (
      /papel|paper|prancheta|clipboard|textura|texture/.test(text) ||
      !/foto|photo|cena|person|pessoa|imagem|image|ilustra|illustrat|edificio|building/.test(
        text
      )
    )
      continue;
    const box = {
      ...m.box,
      width: Math.min(m.box.width, 1 - m.box.x),
      height: Math.min(m.box.height, 1 - m.box.y),
    };
    if (box.width < 0.05 || box.height < 0.03) continue;
    result.push({
      box,
      placement: area(box) > 0.85 ? "background" : "reserved",
    });
  }
  if (result.some(m => m.placement === "background"))
    return result.filter(m => m.placement === "background").slice(0, 1);
  return result
    .filter(
      (m, i) =>
        !result.some(
          (other, j) =>
            j < i && intersection(m.box, other.box) > area(m.box) * 0.8
        )
    )
    .slice(0, 8);
}
function motifEffect(
  recipe: RecreationRecipe,
  layers: ReferenceSceneLayer[],
  limitations: string[]
): CatalogPiece["effect"] {
  const shapes = new Map<string, ReferenceSceneLayer>();
  for (const layer of layers)
    for (const shape of supports(recipe, layer).slice(0, 1))
      shapes.set(shape.id, shape);
  if (shapes.size) {
    limitations.push(
      "Superfícies do grupo aproximadas por um efeito nativo vinculado ao texto; destaques parciais e cores por trecho não são copiados."
    );
    if (shapes.size > 1) return "strip-line";
    const shape = Array.from(shapes.values())[0];
    const radius =
      recipe.adaptation?.layerStyles.find(s => s.layerId === shape.id)
        ?.cornerRadiusPx ?? 0;
    return shape.strokeWidth > 0
      ? "box-brutal"
      : radius > Math.min(shape.width, shape.height) * 0.35
        ? "box-pill"
        : "box-card";
  }
  const b = union(layers.map(l => layerBox(recipe, l)));
  if (
    recipe.missingElements.some(
      m =>
        m.box &&
        /papel|paper|prancheta|clipboard/.test(words(m.description)) &&
        m.role !== "texture" &&
        !/textura|texture/.test(words(m.description)) &&
        area(m.box) < 0.8 &&
        intersection(b, m.box) >= area(b) * 0.55
    )
  ) {
    limitations.push(
      "Suporte de papel aproximado por cartão vinculado ao texto; bordas rasgadas, volume e textura ficam de fora."
    );
    return "box-card";
  }
  return layers.some(l => l.extrusion)
    ? "shadow"
    : layers.some(l => l.strokeWidth)
      ? "outline"
      : "none";
}
function capacity(p: CatalogPiece, height: number, headline: boolean): number {
  const pad = p.effect.startsWith("box-")
    ? 18
    : p.effect === "strip-line"
      ? 8
      : 3;
  const metrics = canvasTypography("editorial-poster");
  const columns = Math.floor(
    Math.max(0, p.box.width * 360 - pad * 2) / (p.minFontSize * 0.65)
  );
  const lines = Math.floor(
    Math.max(0, p.box.height * height - pad * 2) /
      (p.minFontSize *
        (headline ? metrics.headlineLineHeight : metrics.bodyLineHeight))
  );
  return Math.max(
    headline ? 10 : 0,
    Math.min(headline ? 160 : 400, columns * lines)
  );
}
/** Geometry is a reusable area, not the bounding box of one original line. */
export function draftFromRecipe(
  recipe: RecreationRecipe,
  headlineIds: string | string[],
  bodyIds: string | string[] = []
): CatalogBlueprint {
  const hids = typeof headlineIds === "string" ? [headlineIds] : headlineIds;
  const bids = typeof bodyIds === "string" ? [bodyIds] : bodyIds;
  if (
    !hids.length ||
    new Set([...hids, ...bids]).size !== hids.length + bids.length
  )
    throw new Error(
      "Selecione um título e use cada camada em apenas um grupo."
    );
  const find = (ids: string[]) =>
    ids.map(id => {
      const l = recipe.scene.layers.find(l => l.id === id && l.kind === "text");
      if (!l)
        throw new Error("Selecione camadas de texto reto da receita atual.");
      return l;
    });
  const groups = [find(hids), find(bids)];
  const sourceRatio =
    recipe.scene.source.widthPx / recipe.scene.source.heightPx;
  const format = (["1:1", "4:5", "9:16"] as const).reduce((best, f) => {
    const ratio = (v: string) =>
      v === "1:1" ? 1 : v === "4:5" ? 4 / 5 : 9 / 16;
    return Math.abs(ratio(f) - sourceRatio) <
      Math.abs(ratio(best) - sourceRatio)
      ? f
      : best;
  });
  const height = format === "1:1" ? 360 : format === "4:5" ? 450 : 640;
  const limits = [
    "Linhas agrupadas por função visual; créditos, observações e rodapés não selecionados ficam de fora.",
    "Tipografia dominante por grupo; variações internas de peso, cor, rotação e entrelinha são aproximadas. Cores vêm do post/marca.",
    "Formato inicial é o mais próximo da referência. Limites de caracteres são estimativas; o compilador sempre mede o texto real.",
  ];
  const media = mediaAreas(recipe);
  if (media.length)
    limits.push(
      "Áreas de mídia reservadas como guias. Fotos não são copiadas nem preenchidas automaticamente pelo catálogo V1."
    );
  const boxes = groups.map(g =>
    g.length ? union(g.map(l => layerBox(recipe, l))) : null
  );
  if (!boxes[0] || area(boxes[0]) <= 0)
    throw new Error("O título selecionado está fora da prancheta.");
  if (!boxes[1]) {
    const h = boxes[0];
    const ceiling = Math.min(
      0.95,
      ...media
        .filter(m => m.placement === "reserved" && m.box.y >= h.y + h.height)
        .map(m => m.box.y - 0.025)
    );
    const y = h.y + h.height + 0.035;
    if (ceiling - y >= 0.12)
      boxes[1] = {
        x: h.x,
        y,
        width: h.width,
        height: Math.min(0.2, ceiling - y),
      };
    else if (h.y >= 0.22)
      boxes[1] = {
        x: h.x,
        y: Math.max(0.04, h.y - 0.22),
        width: h.width,
        height: 0.16,
      };
    else
      throw new Error(
        "Selecione um apoio ou ajuste a composição: não há área livre para um texto novo sem invadir a mídia."
      );
    limits.push(
      "Sem apoio original selecionado: reservada uma área livre para conteúdo novo, sujeita à revisão do curador."
    );
  }
  const raw = boxes as Box[];
  const pieces = groups.map((g, index): CatalogPiece => {
    const representative = [...g].sort(
      (a, b) => b.fontSize * b.width - a.fontSize * a.width
    )[0];
    const size = representative
      ? (representative.fontSize * 360) / recipe.scene.source.widthPx
      : 16;
    const headline = index === 0;
    return {
      ...piece(headline ? "headline" : "body", raw[index].y, raw[index].height),
      box: raw[index],
      fontFamily: representative?.fontFamily ?? "Arial",
      fontWeight: representative?.fontWeight ?? 400,
      fontSize: clamp(size, headline ? 24 : 14, headline ? 96 : 36),
      minFontSize: headline ? clamp(size * 0.5, 16, 32) : 11,
      align: representative?.align ?? groups[0][0].align,
      effect: g.length ? motifEffect(recipe, g, limits) : "none",
      confidenceScore: g.length
        ? Math.min(...g.map(l => l.confidenceScore))
        : 0.5,
    };
  });
  // Split the available space along the separation already present in the reference.
  const centers = raw.map(b => ({
    x: b.x + b.width / 2,
    y: b.y + b.height / 2,
  }));
  const horizontal =
    Math.abs(centers[0].x - centers[1].x) >
      Math.abs(centers[0].y - centers[1].y) * 1.4 &&
    intersection(raw[0], raw[1]) === 0;
  const axis = horizontal ? "x" : "y";
  const extent = horizontal ? "width" : "height";
  const first = centers[0][axis] <= centers[1][axis] ? 0 : 1;
  const second = 1 - first;
  const edge = clamp(
    (raw[first][axis] + raw[first][extent] + raw[second][axis]) / 2,
    0.12,
    0.88
  );
  pieces.forEach((p, index) => {
    const pad = p.effect.startsWith("box-")
      ? 18
      : p.effect === "strip-line"
        ? 8
        : 3;
    const desiredWidth = Math.max(
      raw[index].width + (pad * 2) / 360,
      index === 0 ? 0.52 : 0.42
    );
    const desiredHeight = Math.max(
      raw[index].height + (pad * 2) / height,
      (p.fontSize * (index === 0 ? 2.5 : 3.6) + pad * 2) / height
    );
    const bounds = { x: 0.03, y: 0.03, right: 0.97, bottom: 0.97 };
    if (horizontal) {
      if (index === first) bounds.right = edge - 0.012;
      else bounds.x = edge + 0.012;
    } else {
      if (index === first) bounds.bottom = edge - 0.012;
      else bounds.y = edge + 0.012;
    }
    for (const m of media.filter(m => m.placement === "reserved")) {
      if (intersection(raw[index], m.box) > 0.002) continue; // Foreground text intentionally overlaps: keep its hierarchy.
      if (
        m.box.y >= raw[index].y + raw[index].height &&
        m.box.x < raw[index].x + raw[index].width &&
        m.box.x + m.box.width > raw[index].x
      )
        bounds.bottom = Math.min(bounds.bottom, m.box.y - 0.012);
    }
    const width = Math.min(desiredWidth, bounds.right - bounds.x),
      boxHeight = Math.min(desiredHeight, bounds.bottom - bounds.y);
    if (width < 0.05 || boxHeight < 0.03)
      throw new Error(
        "Área insuficiente entre os grupos. Revise as camadas selecionadas."
      );
    p.box = {
      x: clamp(centers[index].x - width / 2, bounds.x, bounds.right - width),
      y: clamp(
        centers[index].y - boxHeight / 2,
        bounds.y,
        bounds.bottom - boxHeight
      ),
      width,
      height: boxHeight,
    };
  });
  const used = new Set([...hids, ...bids]);
  const draft: CatalogBlueprint = {
    ...manualCatalogDraft(),
    name: recipe.title.slice(0, 100),
    formats: [format],
    pieces,
    description: `${horizontal ? "Título e apoio em áreas laterais" : first === 0 ? "Título dominante acima do apoio" : "Chamada acima de um título dominante"}, com linhas agrupadas, espaço para adaptar a mensagem e ${pieces.some(p => p.effect.startsWith("box-") || p.effect === "strip-line") ? "superfícies vinculadas ao texto" : "hierarquia tipográfica"}.`,
    tags: [
      "editorial",
      "hierarquia",
      ...(pieces.some(p => p.effect !== "none") ? ["destaque"] : []),
      ...(media.length ? ["midia"] : []),
    ],
    media: media.length ? "optional" : "none",
    maxHeadlineChars: capacity(pieces[0], height, true),
    maxBodyChars: capacity(pieces[1], height, false),
    sourceRecipeId: recipe.id,
    sourceHash:
      recipe.scene.source.originalHash ?? recipe.scene.source.preparedHash,
    limitations: Array.from(new Set(limits)).slice(0, 30),
    extraction: {
      version: 1,
      headlineLayerIds: hids,
      bodyLayerIds: bids,
      ignoredLayerIds: recipe.scene.layers
        .filter(l => l.kind === "text" && !used.has(l.id))
        .map(l => l.id),
      inferredBodyArea: !bids.length,
      mediaAreas: media,
    },
  };
  return catalogBlueprintSchema.parse(draft);
}
