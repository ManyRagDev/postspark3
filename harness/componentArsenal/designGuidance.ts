import type { RecreationRecipe } from "../../shared/designRecreation";
import type { ComponentDefinitionV1 } from "../../shared/componentAssembly";
import type { AuthoredUnit } from "./authoring";
import type { OriginalReference } from "./inventory";
import { referenceProfiles } from "./referenceProfiles";

export function authoredCapabilities(recipe: RecreationRecipe, units: AuthoredUnit[]) {
  const roles: ComponentDefinitionV1["roles"] = ["static"];
  const evidence: string[] = ["static: composição inteira com geometria autorada"];
  if (units.some(u => u.kind === "text" && u.role === "headline")) {
    roles.push("cover"); evidence.push("cover: campo de título nativo");
  }
  const bodies = units.filter(u => u.kind === "text" && u.role === "body");
  if (bodies.length || units.some(u => u.kind === "list")) {
    roles.push("development"); evidence.push("development: campo nativo de apoio ou lista; a capacidade depende da geometria e cada copy exige preflight");
  }
  if (units.some(u => u.kind === "list")) {
    roles.push("list"); evidence.push("list: itens independentes com cardinalidade e slots nativos");
  }
  if (units.some(u => u.kind === "text" && u.role === "callToAction")) {
    roles.push("closing"); evidence.push("closing: campo nativo de chamada à ação");
  } else if (bodies.length || units.some(u => u.kind === "text" && u.role === "headline")) {
    roles.push("closing"); evidence.push("closing: convite pode usar título/apoio editável; sem caixa de CTA dedicada, conservar capacidade nativa");
  }
  if ((recipe.matrix?.media.length ?? 0) > 0 || units.some(u => u.kind === "list")) {
    roles.push("example"); evidence.push("example: mídia ou itens independentes autorados permitem mostrar um exemplo; não há aprovação narrativa automática");
  }
  const textLayers = recipe.scene.layers.filter(l => l.kind === "text");
  const textArea = textLayers.reduce((sum, l) => sum + l.width * l.height, 0) /
    (recipe.scene.source.widthPx * recipe.scene.source.heightPx);
  const densities: ComponentDefinitionV1["densities"] = [
    textLayers.length <= 3 && textArea <= .3 ? "quiet" :
      textLayers.length >= 10 || textArea >= .55 ? "expressive" : "balanced",
  ];
  evidence.push(`density:${densities[0]}: ${textLayers.length} regiões de texto; área somada das caixas ${(textArea * 100).toFixed(1)}% da prancheta (não é limite de palavras nem aprovação de encaixe)`);
  return { roles, densities, evidence };
}

/** Keep every note/lacuna visible in the operational definition. Oversized
 * authorship fails explicitly instead of quietly losing historical information. */
function boundedRules(values: string[], maximum: number): string[] {
  const rules = [...new Set(values.filter(Boolean))];
  if (rules.length > maximum || rules.some(rule => rule.length > 1000))
    throw new Error("Contrato de autoria excede capacidade de designGuidance; requer curadoria explícita");
  return rules;
}

export function deriveDesignGuidance(recipe: RecreationRecipe, units: AuthoredUnit[], original?: OriginalReference, referenceId?: string) {
  const capabilities = authoredCapabilities(recipe, units);
  const layers = recipe.scene.layers;
  const media = recipe.matrix?.media ?? [];
  const mediaNotes = recipe.notes.filter(note => /foto|retrato|recorte|imagem|mídia|midia|distor|perspectiv|cover|quadro|monitor/i.test(note));
  const contentNotes = recipe.notes.filter(note => /título|titulo|lista|ênfase|enfase|campo|marcador|linha|geometria/i.test(note));
  const motifs = [
    layers.some(l => l.kind === "polygon") ? "polígonos autorados" : "",
    layers.some(l => l.kind === "rect") ? "superfícies retangulares" : "",
    layers.some(l => l.rotationDeg !== 0) ? "camadas inclinadas" : "",
    layers.some(l => l.extrusion) ? "extrusão tipográfica" : "",
    media.length ? "fotografia em slots nativos" : "composição sem slot de fotografia",
  ].filter(Boolean);
  const title = units.filter(u => u.role === "headline").flatMap(u => u.layerIds).length;
  const description = `${title} regiões de título, ${units.filter(u => u.role === "body" && u.kind === "text").length} apoios textuais, ${units.filter(u => u.kind === "list").length} listas semânticas e ${media.length} slots de mídia. ${layers.length} camadas em ${recipe.scene.source.widthPx}×${recipe.scene.source.heightPx}; fontes ${[...new Set(recipe.scene.fonts.map(f => f.family))].join(", ")}.`;
  const summary = referenceId && referenceProfiles[referenceId] ? `${referenceProfiles[referenceId].summary} ${description}` : description;
  if (summary.length > 1000) throw new Error("Resumo específico excede capacidade de designGuidance");
  return {
    version: 1 as const,
    summary,
    motifs: referenceId && referenceProfiles[referenceId] ? referenceProfiles[referenceId].motifs : motifs,
    preserve: ["Conservar geometria, hierarquia, fontes incorporadas, cores e ornamentos nativos; não substituir a composição pela imagem original.", ...capabilities.evidence],
    contentRules: boundedRules([
      ...units.filter(u => u.kind === "list").map(u => `${u.source}: ${u.cardinality!.min}–${u.cardinality!.max} itens independentes nas caixas ${u.layerIds.join(", ")}; prefixo ${JSON.stringify(u.prefix ?? "")}; não concatenar nem redistribuir palavras entre itens.`),
      ...contentNotes,
    ], 20),
    mediaRules: media.map(m => ({ slotId: m.layerId, instructions: boundedRules([
      `Preencher somente o slot nativo ${m.label}; enquadramento cover, ponto focal autorado ${m.positionX},${m.positionY}. A imagem original inteira é evidência, nunca fotografia de preenchimento.`,
      ...mediaNotes.map(note => `Nota de autoria do design: ${note}`),
    ], 20) })),
    knownLimitations: boundedRules([
      ...recipe.notes,
      ...recipe.missingElements.map(m => `${m.essential ? "Lacuna essencial" : "Lacuna"}: ${m.description}. Motivo: ${m.reason}${m.role ? `. Papel: ${m.role}` : ""}${m.box ? `. Área: ${JSON.stringify(m.box)}` : ""}.`),
    ], 30),
    ...(original ? { original: { sha256: original.sha256, width: original.width, height: original.height, fileName: original.fileName } } : {}),
  };
}
