import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import { planningFactText } from "@shared/compactGenerationIntent";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import type { CopyResponse, ProposalExecutionInput } from "./proposalGraph";

type DesignField = ReturnType<typeof completeDesignFields>[number];
type Comparison = { slideIndex: number; fieldId: string; source: string; labels: Array<string | null> };

export function usesArtworkBriefCopy(input: ProposalExecutionInput) {
  return input.reviewExecutionConfig?.version === 5 && input.reviewExecutionConfig.artworkBriefPolicyVersion === 1 &&
    !!input.generationIntent?.designRequirements && input.generationIntent.adaptation !== "literal" &&
    input.executionBrief?.interventionLevel !== "visual_only";
}

function fieldAssignment(input: ProposalExecutionInput, slideIndex: number, fieldId: string) {
  return input.narrativePlan?.pages.find(page => page.slideIndex === slideIndex)
    ?.assignments.find(assignment => assignment.fieldId === fieldId);
}

function comparisonBody(input: ProposalExecutionInput, slideIndex: number, field: DesignField): Comparison | undefined {
  if (field.role !== "body" || field.kind !== "text") return;
  const requirements = input.generationIntent?.designRequirements;
  if (!requirements?.requiresComparison) return;
  const ids = fieldAssignment(input, slideIndex, field.id)?.contentIds ?? [];
  const groups = new Map<number, string | null>();
  for (const fact of requirements.requiredFacts) {
    if (fact.comparisonGroup === null || !ids.includes(fact.contentId)) continue;
    if (fact.role === "label") groups.set(fact.comparisonGroup, planningFactText(fact.text));
    else if (!groups.has(fact.comparisonGroup)) groups.set(fact.comparisonGroup, null);
  }
  if (groups.size >= 2) {
    const labels = Array.from(groups).sort(([a], [b]) => a - b).map(([, label]) => label);
    return { slideIndex, fieldId: field.id, source: field.source, labels };
  }
}

export function bodyComparisons(input: ProposalExecutionInput, definitions: ComponentDefinitionV1[]) {
  if (!usesArtworkBriefCopy(input)) return [];
  const config = input.reviewExecutionConfig;
  return definitions.flatMap((definition, index) =>
    completeDesignFields(definition, config?.version === 5 ? config.nativeGlyphProjection : undefined)
      .flatMap(field => comparisonBody(input, index, field) ?? []));
}

export function artworkFieldBrief(input: ProposalExecutionInput, slideIndex: number, field: DesignField) {
  if (!usesArtworkBriefCopy(input)) return {};
  const ids = fieldAssignment(input, slideIndex, field.id)?.contentIds ?? [];
  const onArt = input.generationIntent?.requirements.filter(requirement =>
    requirement.kind !== "execution" && requirement.surface === "art" && ids.includes(requirement.id))
    .map(requirement => requirement.description) ?? [];
  const comparison = comparisonBody(input, slideIndex, field);
  return {
    ...(onArt.length ? { requiredOnArt: onArt } : {}),
    ...(comparison ? { comparisonAlternatives: comparison.labels } : {}),
  };
}

export const artworkCopyInstructions =
  "Entregue cada requiredOnArt nos campos da lâmina indicada, inclusive a ação do CTA de encerramento. A legenda é complementar. " +
  "Se comparisonAlternatives estiver presente, organize o corpo do campo em uma linha por alternativa, na ordem indicada. Comece cada linha pelo rótulo seguido de dois-pontos; sem rótulo, comece por um marcador. " +
  "Separe as alternativas com \\n na mesma string JSON. Mantenha preço e benefícios na linha da alternativa correspondente e deixe a quebra visual adicional a cargo do encaixe.";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function comparisonRows(value: string, labels: Comparison["labels"]) {
  const text = value.trim();
  if (!labels.every((label): label is string => Boolean(label))) {
    const rows = text.split(/\r?\n/).map(row => row.trim()).filter(Boolean);
    return rows.length === labels.length && rows.every(row => /^(?:[-•*]\s+|[^:]{1,80}:\s*)\S/.test(row)) ? rows : undefined;
  }
  const pattern = new RegExp("(?:^|[\\s|·;])(?:[-•*]\\s*)?(" + labels.map(escapeRegExp).join("|") + ")\\s*[:–—-]\\s*", "giu");
  const starts = Array.from(text.matchAll(pattern));
  if (starts.length !== labels.length || starts[0]?.index !== 0 ||
      starts.some((match, index) => match[1].toLocaleLowerCase("pt-BR") !== labels[index].toLocaleLowerCase("pt-BR"))) return;
  const rows = starts.map((match, index) => {
    const detail = text.slice(match.index + match[0].length, starts[index + 1]?.index)
      .replace(/[\s|·;]+$/, "").replace(/\s+/g, " ").trim();
    return detail && match[1] + ": " + detail;
  });
  if (rows.every(Boolean)) return rows;
}

export function separateComparisonCopy(copy: CopyResponse, comparisons: Comparison[]) {
  for (const { slideIndex, fieldId, labels } of comparisons) {
    const field = copy.slides[slideIndex]?.values.find(row => row.fieldId === fieldId);
    if (typeof field?.value !== "string") continue;
    const rows = comparisonRows(field.value, labels);
    if (rows) field.value = rows.join("\n");
  }
}

export function comparisonCopyIssues(copy: CopyResponse, comparisons: Comparison[]) {
  return comparisons.flatMap(({ slideIndex, fieldId, labels }) => {
    const value = copy.slides[slideIndex]?.values.find(row => row.fieldId === fieldId)?.value;
    const rows = typeof value === "string" ? comparisonRows(value, labels) : undefined;
    return rows && rows.join("\n") === value ? [] : [`comparison_rows_missing:slide-${slideIndex + 1}:${fieldId}`];
  });
}

const closingActions = [
  [/\bsalvar\b/i, /\b(?:salv(?:ar|e|em)|guard(?:ar|e|em)|favorit(?:ar|e|em))\b/i],
  [/\bcompartilhar\b/i, /\b(?:compartilh(?:ar|e|em)|envi(?:ar|e|em))\b/i],
  [/\bcomentar\b/i, /\bcoment(?:ar|e|em)\b/i],
  [/\bseguir\b/i, /\b(?:seguir|siga|sigam)\b/i],
  [/\b(?:inscrever-se|se inscrever)\b/i, /\b(?:inscrev(?:a|am)-se|inscrever-se|se inscrever)\b/i],
];

export function closingActionMatches(value: string, quote: string) {
  return closingActions.every(([requested, action]) => !requested.test(quote) ||
    Array.from(value.matchAll(new RegExp(action.source, "gi"))).some(match =>
      !/\b(?:não|nunca)\s*$/i.test(value.slice(0, match.index))));
}

/** This short source-backed inflection fits CTA fields that accepted longer navigation copy. */
export function saveGuideCta(quote: string) {
  const article = quote.match(/\b(?:convidando|convite)\s+(?:a|para)\s+salvar\s+(o|este|esse)\s+guia[.!?]?$/i)?.[1];
  return article ? "Salve " + article.toLocaleLowerCase("pt-BR") + " guia" : undefined;
}
