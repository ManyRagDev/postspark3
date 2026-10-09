/** Offline conversion of the original compositors. Product presets are never mutated. */
import { readFileSync } from "node:fs";
import { GlobalFonts } from "@napi-rs/canvas";
import { FAMILIES } from "../../shared/creative/families";
import { mulberry32, hashString } from "../../shared/creative/seed";
import { DEFAULT_DESIGN_TOKENS, type AspectRatio, type LayoutPosition, type PostVariation } from "../../shared/postspark";
import { HEADLINE_CEILING_PX, BODY_CEILING_PX } from "../../shared/typography/constants";
import { BASELINE_FONTS, pathFor } from "../../shared/typography/fonts/registry";
import { OFFICIAL_FAMILIES_META, type VisualFamilyId } from "../../client/src/pages/CanvasLab/components/types";
import { layoutRichText } from "../../client/src/pages/CanvasLab/lib/richTextLayout";
import { referenceFontFamily } from "../../client/src/pages/CanvasLab/lib/referenceFonts";
import { recreationRecipeSchema, type RecreationRecipe } from "../../shared/designRecreation";
import type { ReferenceFontAsset, ReferenceSceneLayer } from "../../shared/referenceReconstruction";
import { recipeFromSpec, sha256, type CompactSpec, localFontPool } from "../designBatch/builder";
import { installNativeSurface } from "../designBatch/native";

export const CONVERTER_VERSION = "native-families-1";
export const FORMATS: AspectRatio[] = ["1:1", "5:6", "9:16"];
export const SAMPLES: Record<string, { headline: string; body: string; sections?: string[] }> = {
  "editorial-poster": { headline: "Ideias que ficam.", body: "Um novo olhar para o que importa." },
  "chromatic-block": { headline: "Faça acontecer.", body: "Sua próxima ideia começa agora." },
  "brutal-split": { headline: "Mude o ponto de vista.", body: "" },
  "glitch-signal": { headline: "O futuro está aqui.", body: "Explore. Crie. Reinvente." },
  "glass-veil": { headline: "Clareza em cada detalhe.", body: "Espaço para respirar. Foco no essencial." },
  "kinetic-type": { headline: "Crie novas possibilidades", body: "Dê movimento às suas ideias." },
  "data-punch": { headline: "das ideias começam com uma pergunta.", body: "72%", sections: ["72%"] },
  "versus": { headline: "Antes e depois", body: "", sections: ["ANTES\nSem direção", "DEPOIS\nCom intenção"] },
  "quote-authority": { headline: "Criar é enxergar possibilidades.", body: "Uma ideia de cada vez." },
  "minimal-air": { headline: "Menos, com intenção.", body: "Deixe o essencial aparecer." },
  "mosaic-grid": { headline: "Da ideia à ação", body: "", sections: ["01\nObserve", "02\nExperimente", "03\nCompartilhe"] },
  "duotone-wash": { headline: "Uma nova perspectiva.", body: "A cor também conta a sua história." },
};

export function embeddedFonts(): Map<string, ReferenceFontAsset> {
  const pool = localFontPool(["artifacts/design-recreation/batch-2026-09-30"]);
  for (const entry of BASELINE_FONTS) {
    const bytes = readFileSync(pathFor(entry.family)!);
    // The two display fonts exist as regular only; request that exact face.
    const weights = ["Anton", "Archivo Black"].includes(entry.family) ? [400] : [400, 500, 600, 700, 800];
    for (const weight of weights) {
      const key = `${entry.family}:${weight}`;
      if (!pool.has(key)) pool.set(key, { family: entry.family, weight, sourceUrl: null, mimeType: "font/ttf", dataUrl: `data:font/ttf;base64,${bytes.toString("base64")}`, sha256: sha256(bytes), license: "open-source" });
    }
  }
  installNativeSurface();
  for (const font of pool.values()) {
    const alias = referenceFontFamily({ fonts: [font] } as RecreationRecipe["scene"], font.family, font.weight);
    if (!GlobalFonts.register(Buffer.from(font.dataUrl!.split(",")[1], "base64"), alias)) throw Error(`Fonte indisponível: ${font.family}`);
  }
  return pool;
}

type TextOptions = {
  id: string; text: string; x: number; y: number; width: number; height: number;
  family: string; weight?: number; size: number; fill: string;
  align?: "left" | "center" | "right"; rotation?: number; lineHeight?: number;
  field?: string; label?: string; group?: string; opacity?: number;
  extrusion?: ReferenceSceneLayer["extrusion"];
};

export function convertFamily(familyId: string, format: AspectRatio, fonts: Map<string, ReferenceFontAsset>, sourceHash: string, at: string) {
  const family = FAMILIES.find(f => f.id === familyId);
  if (!family) throw Error(`Família desconhecida: ${familyId}`);
  const canvasId = (familyId === "glitch-signal" ? "cyber-glitch" : familyId) as VisualFamilyId;
  const meta = OFFICIAL_FAMILIES_META[canvasId];
  const sample = SAMPLES[familyId];
  const W = 720, H = Math.round(W * Number(format.split(":")[1]) / Number(format.split(":")[0])), scale = 2;
  const tokens = structuredClone(DEFAULT_DESIGN_TOKENS);
  // Explicit demonstration palette, not an instruction to replace the user's brand.
  tokens.colors = { background: meta.defaultPalette.background, text: meta.defaultPalette.text, primary: meta.defaultPalette.accent, secondary: meta.defaultPalette.text, card: meta.defaultPalette.surface ?? meta.defaultPalette.background };
  const variation = { id: `native-${familyId}-${format}`, headline: sample.headline, body: sample.body, aspectRatio: format } as PostVariation;
  const seed = hashString(variation.id);
  const output = family.compose({ variation, tokens, rand: mulberry32(seed), aspectRatio: format, doc: { width: W / scale, height: H / scale }, pxX: p => p * W / 100 / scale, pxY: p => p * H / 100 / scale });
  const differences: string[] = [];
  const notes = [
    `Origem: shared/creative/families.ts (${familyId}); SHA-256 ${sourceHash}.`,
    `Conversor ${CONVERTER_VERSION}; seed ${seed}; formato ${format}. Parâmetros originais completos no pacote de backup/baseline.`,
    "Paleta de demonstração: OFFICIAL_FAMILIES_META; tipografia e geometria: compositor original. Não é uma captura do editor atual.",
    "Receita V3 importável no Admin2. Campos multilinha usam lista de linhas; edição flexível ainda não está implementada no painel.",
    "Conteúdo ilustrativo. O dado 72% é fictício e não representa pesquisa ou resultado real.",
  ];
  const spec: CompactSpec = { stem: variation.id.replace(":", "-"), title: `${family.label} · ${format}`, width: W, height: H, background: tokens.colors.background, notes, layers: [], groups: [] };
  const group = (id: string, label: string) => {
    if (!spec.groups.some(g => g.id === id)) spec.groups.push({ id, label, transform: { x: 0, y: 0, rotationDeg: 0 } });
    return id;
  };
  const rect = (id: string, x: number, y: number, width: number, height: number, fill: string, options: Partial<CompactSpec["layers"][number]> = {}) => {
    spec.layers.push({ id, kind: "rect", x, y, width, height, fill, groupId: group("surface", "Superfícies e mídia"), ...options });
  };
  const text = (o: TextOptions) => {
    const weight = ["Anton", "Archivo Black"].includes(o.family) ? 400 : o.weight ?? 700;
    const font = fonts.get(`${o.family}:${weight}`);
    if (!font) throw Error(`Fonte não incorporada: ${o.family}:${weight}`);
    const alias = referenceFontFamily({ fonts: [font] } as RecreationRecipe["scene"], font.family, font.weight);
    const config = { width: o.width - 4, fontFamily: alias, fontStyle: String(weight), fill: o.fill, align: o.align ?? "left", lineHeight: o.lineHeight ?? 1.15, wrap: false };
    const wrapWords = (size: number) => {
      const measure = (value: string) => Math.max(0, ...layoutRichText({ ...config, text: value, fontSize: size }).lines.map(l => l.width));
      let widestWord = 0;
      const lines: string[] = [];
      for (const paragraph of o.text.split(/\r?\n/)) {
        let line = "";
        for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
          widestWord = Math.max(widestWord, measure(word));
          const candidate = line ? `${line} ${word}` : word;
          if (line && measure(candidate) > config.width) { lines.push(line); line = word; }
          else line = candidate;
        }
        lines.push(line);
      }
      const value = lines.join("\n");
      return { value, widestWord, layout: layoutRichText({ ...config, text: value, fontSize: size }) };
    };
    let size = o.size;
    let measured = wrapWords(size);
    // This resolves the initial snapshot, not a live editing constraint.
    while ((measured.layout.height > o.height || measured.widestWord > config.width) && size > 20) {
      size -= 1;
      measured = wrapWords(size);
    }
    const { layout } = measured;
    if (layout.height > o.height + .01 || measured.widestWord > config.width) throw Error(`${familyId}/${format}/${o.id}: conteúdo de demonstração não cabe.`);
    const r = (o.rotation ?? 0) * Math.PI / 180;
    const actualTop = (o.height - layout.height) / 2;
    const ids: string[] = [];
    for (const [index, line] of layout.lines.entries()) {
      const content = measured.value.slice(line.start, line.end).trim();
      if (!content) continue;
      const id = `${o.id}-${index + 1}`;
      ids.push(id);
      const localY = actualTop + line.y;
      spec.layers.push({ id, kind: "text", text: content, x: o.x - localY * Math.sin(r), y: o.y + localY * Math.cos(r), width: o.width, height: line.height + .01,
        fontFamily: o.family, fontWeight: weight, fontSize: size, lineHeight: config.lineHeight, fill: o.fill, align: config.align, rotationDeg: o.rotation ?? 0, opacity: o.opacity ?? 1, extrusion: o.extrusion ?? null,
        groupId: group(o.group ?? o.id, o.label ?? o.id), fieldId: o.field, fieldLabel: o.label, minScale: .7 });
    }
    return ids;
  };
  const box = (slot: LayoutPosition) => {
    if (!slot.freePosition || !slot.width || !slot.height) throw Error("Geometria original incompleta");
    return { x: (slot.freePosition.x - slot.width / 2) * W / 100, y: (slot.freePosition.y - slot.height / 2) * H / 100, width: slot.width * W / 100, height: slot.height * H / 100 };
  };

  const media = Boolean(family.fit.needsImage || output.splitImagePosition || familyId === "editorial-poster");
  if (media) {
    const split = familyId === "brutal-split";
    rect("media", 0, split && output.splitImagePosition === "bottom" ? H / 2 : 0, W, split ? H / 2 : H, tokens.colors.card, { mediaId: "photo", role: "Fotografia substituível" });
  }
  if (output.bgOverlay || familyId === "editorial-poster") {
    const overlay = output.bgOverlay ?? { color: tokens.colors.background, opacity: .6 };
    rect("overlay", 0, 0, W, H, overlay.color ?? tokens.colors.background, { opacity: overlay.opacity ?? .45, groupId: group("background", "Tratamento de fundo") });
  }
  if (familyId === "glass-veil") {
    const width = W * .88, height = H * .86, x = (W - width) / 2, y = (H - height) / 2;
    rect("card-shadow", x + 5, y + 16, width, height, "#000000", { opacity: .25, cornerRadiusPx: 48 });
    rect("glass", x, y, width, height, tokens.colors.text, { opacity: .08, cornerRadiusPx: 48 });
    rect("glass-border", x, y, width, height, tokens.colors.background, { opacity: .22, cornerRadiusPx: 48, strokeColor: tokens.colors.primary, strokeWidth: 2 });
    differences.push("Vidro: transparência e borda vetoriais; desfoque da foto e sombra suave não são suportados pelo V3. Sombra plana aproximada.");
  }
  if (familyId === "brutal-split") {
    const titleY = output.splitImagePosition === "top" ? H / 2 : 0;
    rect("split-panel", 0, titleY, W, H / 2, tokens.colors.background, { strokeColor: tokens.colors.text, strokeWidth: 6 });
  }
  if (familyId === "duotone-wash") differences.push("Duotone: sobreposição cromática preservada; filtros saturation/contrast/multiply ficam no baseline e não são aplicados à mídia pelo V3.");

  const headlineBox = box(output.layoutSettings!.headline!);
  const upper = output.typography?.textTransform === "uppercase";
  const headlineText = upper ? sample.headline.toUpperCase() : sample.headline;
  const headlineFamily = output.headlineFontFamily ?? tokens.typography.fontFamily;
  const headlineFill = output.headlineColor ?? output.textColor ?? tokens.colors.text;
  const titleIds: string[] = [];

  if (familyId === "kinetic-type") {
    // Preserve the original segments and rotations; bind each once, without repeating the full headline.
    const segments = output.textElements ?? [];
    let remainder = sample.headline;
    const parts: Array<{ text: string; rotation: number; family: string; color: string }> = [];
    for (const el of segments) {
      const i = remainder.toLowerCase().indexOf(el.text.toLowerCase());
      if (i < 0) throw Error("Segmentação cinética não corresponde ao texto de origem");
      remainder = remainder.slice(i + el.text.length).trim();
      parts.push({ text: el.text, rotation: el.rotation ?? 0, family: el.styles.fontFamily, color: el.styles.color });
    }
    if (remainder) parts.push({ text: remainder, rotation: 0, family: headlineFamily, color: headlineFill });
    const top = H * .18, bottom = H * .66, band = (bottom - top) / parts.length;
    parts.forEach((p, i) => titleIds.push(...text({ id: `kinetic-${i}`, text: p.text.toUpperCase(), x: W * .1, y: top + i * band, width: W * .8, height: band * .86, family: p.family, size: (i % 2 ? 44 : 56) * scale, fill: p.color, rotation: p.rotation, field: "headline", group: "headline", label: "Título cinético · linhas" })));
    differences.push("Cinética: segmentos e rotações originais mantidos; fluxo vertical adaptado para não duplicar o título completo nem sobrepor as partes.");
  } else {
    titleIds.push(...text({ id: "headline", text: headlineText, ...headlineBox, family: headlineFamily, size: HEADLINE_CEILING_PX * (output.headlineFontSize ?? 1) * scale, fill: headlineFill, align: output.layoutSettings?.headline?.textAlign, field: "headline", label: "Título · linhas" }));
  }
  if (familyId === "glitch-signal") {
    const offsets = (output.textElements ?? []).filter(l => l.id.startsWith("cd-glitch-"));
    for (const id of titleIds) {
      const layer = spec.layers.find(l => l.id === id)!;
      const off = offsets[0];
      if (off) layer.extrusion = { color: off.styles.color, offsetX: (off.x - .1 * W / scale) * scale, offsetY: (off.y - .45 * H / scale) * scale, steps: 1 };
      if (offsets[1]) { layer.strokeColor = offsets[1].styles.color; layer.strokeWidth = .6; }
    }
    differences.push("Glitch: cópias decorativas viraram extrusão curta e contorno vinculados às letras, evitando texto antigo após edição. Deslocamentos originais completos preservados no baseline.");
  }
  if (output.layoutSettings?.body && sample.body && output.ornaments?.body !== "hide") {
    let bodyBox = box(output.layoutSettings.body);
    if (familyId === "kinetic-type") bodyBox = { x: W * .1, y: H * .73, width: W * .8, height: H * .15 };
    text({ id: "body", text: sample.body, ...bodyBox, family: output.bodyFontFamily ?? "Inter", weight: 400, size: BODY_CEILING_PX * (output.bodyFontSize ?? 1) * scale, fill: output.bodyColor ?? output.textColor ?? tokens.colors.text, align: output.layoutSettings.body.textAlign, lineHeight: 1.5, field: "body", label: "Apoio · linhas" });
  }
  if (output.layoutSettings?.sectionLayouts) {
    const slots = Object.values(output.layoutSettings.sectionLayouts);
    const items = sample.sections!;
    const top = box(slots[0]).y, height = box(slots[0]).height, left = W * .08, gap = W * .03;
    // The old helper defaults to three columns even for Versus. The content determines the count here.
    const width = (W * .84 - gap * (items.length - 1)) / items.length;
    if (items.length !== slots.length) differences.push("Versus: grade original de três slots adaptada a dois lados de comparação; geometria original no baseline.");
    items.forEach((content, i) => {
      const x = left + i * (width + gap), g = group(`section-${i + 1}`, `Bloco ${i + 1}`);
      rect(`section-card-${i}`, x, top, width, height, tokens.colors.card, { cornerRadiusPx: 18, strokeColor: tokens.colors.primary, strokeWidth: 1.5, groupId: g });
      text({ id: `section-${i}`, text: content, x: x + 12, y: top + 10, width: width - 24, height: height - 20, family: "Inter", size: 32, fill: tokens.colors.text, align: "center", field: `section-${i}`, label: `Bloco ${i + 1} · linhas`, group: g });
    });
  }

  for (const el of output.textElements ?? []) {
    if (familyId === "kinetic-type" || el.id.startsWith("cd-glitch-")) continue;
    if (typeof el.width !== "number" || !Number.isFinite(el.width)) throw Error(`Largura não materializada: ${familyId}/${el.id}`);
    const width = el.width * scale, size = parseFloat(el.styles.fontSize) * scale;
    let height = size * 1.3, y = el.y * scale;
    if (el.id === "cd-stat") { height = H * .23; y = H * .17; }
    const groupId = group(el.id, el.id === "cd-stat" ? "Dado em destaque" : "Detalhe tipográfico");
    if (el.id === "cd-sticker-rot") rect("sticker", el.x * scale - 10, y - 8, width + 20, height + 16, tokens.colors.primary, { rotationDeg: el.rotation, groupId });
    const fill = el.id === "cd-sticker-rot" ? tokens.colors.background : el.styles.color;
    text({ id: el.id, text: el.text, x: el.x * scale, y, width, height, family: el.styles.fontFamily, weight: Number(el.styles.fontWeight) || 400, size: el.id === "cd-stat" ? 116 : size, fill, align: el.styles.textAlign, rotation: el.rotation, opacity: Number(el.styles.opacity ?? 1), field: el.id.includes("quote-") ? undefined : el.id, label: el.id === "cd-stat" ? "Dado ilustrativo · substituir" : "Rótulo", group: groupId });
  }
  if (output.ornaments?.accentBar === "keep") {
    const slot = output.layoutSettings?.accentBar;
    const width = (slot?.width ?? 12) * W / 100;
    const x = slot?.freePosition ? slot.freePosition.x * W / 100 - width / 2 : W * .08;
    // Attach to the measured headline extent instead of crossing its declared slot.
    const y = Math.max(...titleIds.map(id => { const l = spec.layers.find(l => l.id === id)!; return l.y! + l.height!; })) + 12;
    spec.layers.push({ id: "accent-bar", kind: "line", x, y, width, height: 3, points: [0, 0, width, 0], strokeColor: tokens.colors.primary, strokeWidth: 3, groupId: group("headline", "Título · linhas") });
  }
  // Empty groups cannot survive the strict matrix schema.
  spec.groups = spec.groups.filter(g => spec.layers.some(l => l.groupId === g.id));
  spec.notes!.push(...differences);
  let recipe = recipeFromSpec(spec, fonts);
  recipe.id = sha256(`${CONVERTER_VERSION}/${familyId}/${format}/${sourceHash}`).slice(0, 32);
  recipe.createdAt = at;
  recipe.model = `offline/${CONVERTER_VERSION}`;
  recipe.scene.decoderVersion = CONVERTER_VERSION;
  // Source is code, not a photographed reference; its hash lives in provenance notes/manifest.
  recipe.scene.source.originalHash = null;
  recipe.notes = recipe.notes.filter(n => !n.startsWith("Curadoria manual offline"));
  recipe.notes.unshift("Conversão de família nativa. Aparência adaptada ao contrato V3; originais preservados em backup. Aprovação visual pendente.");
  recipe = recreationRecipeSchema.parse(recipe);
  const fontDifferences = meta.defaultFont !== headlineFamily ? `Fonte do compositor: ${headlineFamily}; preset atual do editor: ${meta.defaultFont}.` : null;
  return { recipe, baseline: { familyId, canvasId, label: family.label, format, seed, input: { variation, tokens }, output, axes: family.axes, fit: family.fit, carousel: family.carousel, currentEditorMetadata: meta }, trace: { converter: CONVERTER_VERSION, familyId, canvasId, sourceHash, format, origin: "creative-compositor", paletteOrigin: "editor-demo-palette", differences, fontDifferences, mediaRequired: family.fit.needsImage === true, contentRequirements: family.fit.needsNumber ? ["supplied-number"] : family.fit.needsSections ? ["sections"] : [], status: "converted-awaiting-visual-review" } };
}
