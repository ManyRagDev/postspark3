import type { ComponentCardV1 } from "@shared/componentAssembly";
import { completeDesignFields } from "@shared/completeDesignGeneration";
import { planningFactText } from "@shared/compactGenerationIntent";
import type { GenerationIntent } from "@shared/generationPlan";
import { designHasPhotographicContent } from "@shared/designSelection";
import type { DesignFamilyRepertoire } from "@shared/designRepertoire";

type Fact = NonNullable<GenerationIntent["designRequirements"]>["requiredFacts"][number];
type Profile = NonNullable<GenerationIntent["compositionDirections"]>[number]["profile"];
type TextField = ReturnType<typeof completeDesignFields>[number];
type FieldCapacity = TextField & { characters: number; authoredCharacters: number; items: number[] };
const comparisonSource = /^block:comparison:(\d+):(left|right)\.(label|text)$/;
const ctaContentId = "required-cta";

function fieldCapacities(card: ComponentCardV1): FieldCapacity[] {
  return completeDesignFields(card).map(field => {
    const mechanics = card.mechanics?.fields.find(candidate => candidate.source === field.source);
    const regions = card.capacity.textRegions.filter(region => region.source === field.source);
    const estimate = (region: typeof regions[number], size: number) => size > 0
      ? Math.floor(region.width / (size * 0.55)) * Math.max(1, Math.floor(region.height / (size * 1.15)))
      : 0;
    const authored = regions.map((region, index) => mechanics?.targets[index]?.charsEstimate ?? estimate(region, region.fontSize));
    const elastic = regions.map((region, index) => Math.max(authored[index], estimate(region, region.minFontSize)));
    const fragments = mechanics?.distribution === "typographic_fragments" ||
      regions.some(region => (region.fragmentCount ?? region.minWords) > 1);
    const capacity = (values: number[]) => fragments
      ? values.reduce((sum, value) => sum + value, 0)
      : Math.min(...values, Infinity);
    const items = field.kind === "list" ? elastic.slice(0, field.cardinality?.max) : [];
    return {
      ...field, items,
      authoredCharacters: regions.length ? capacity(authored) : 0,
      characters: items.length ? items.reduce((sum, value) => sum + value, 0) : regions.length ? capacity(elastic) : 0,
    };
  });
}

/** A shared source edited as one paragraph is one field, even with many boxes. */
function comparisonSlots(fields: FieldCapacity[]) {
  const pairs = new Map<string, { label?: FieldCapacity; body?: FieldCapacity }>();
  for (const field of fields) {
    const parts = field.source.match(comparisonSource);
    if (!parts || !field.characters) continue;
    const key = parts[1] + ":" + parts[2];
    const pair = pairs.get(key) ?? {};
    if (parts[3] === "label") pair.label = field;
    else pair.body = field;
    pairs.set(key, pair);
  }
  const native = Array.from(pairs).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .flatMap(([, pair]) => pair.body ? [{ label: pair.label, body: pair.body, limit: pair.body.characters }] : []);
  if (native.length >= 2) return native;
  return fields.filter(field => field.role === "body" && field.kind === "text" && field.characters)
    .map(body => ({ label: undefined, body, limit: body.characters }));
}

const factLength = (fact: Fact) => planningFactText(fact.text).length;
const charsFor = (facts: Fact[]) => facts.reduce((sum, fact) => sum + factLength(fact), Math.max(0, facts.length - 1));

function pairComparisonFacts(slots: ReturnType<typeof comparisonSlots>, alternatives: Fact[][]) {
  if (slots.length < Math.max(2, alternatives.length)) return;
  const fits = alternatives.map((alternative, index) => {
    const candidates = slots.map(slot => {
      const labels = slot.label ? alternative.filter(fact => fact.role === "label") : [];
      const details = alternative.filter(fact => !labels.includes(fact));
      return { slot, labels, details };
    });
    return [candidates[index], ...candidates.filter((_, i) => i !== index)]
      .filter(({ slot, labels, details }) => charsFor(labels) <= (slot.label?.characters ?? 0) && charsFor(details) <= slot.limit);
  });
  const matches = new Map<typeof slots[number], { index: number; labels: Fact[]; details: Fact[] }>();
  const place = (index: number, visited: Set<typeof slots[number]>): boolean => fits[index].some(candidate => {
    const { slot } = candidate;
    if (visited.has(slot)) return false;
    visited.add(slot);
    const previous = matches.get(slot);
    if (previous && !place(previous.index, visited)) return false;
    matches.set(slot, { ...candidate, index });
    return true;
  });
  if (fits.every((_, index) => place(index, new Set()))) return matches;
}

export function checkPageCapacity(card: ComponentCardV1, intent: GenerationIntent, slideIndex: number, slideCount: number) {
  const issues: string[] = [];
  const assignments = new Map<string, { contentIds: string[]; instruction: string; itemCount?: number }>();
  const requirements = intent.designRequirements;
  let comparisonLayout = false;
  if (!requirements) return { issues, assignments, comparisonLayout };
  if (requirements.forbidsPhotography && (card.mediaSlots.length > 0 || designHasPhotographicContent(card)))
    issues.push("photography_forbidden");
  const compareOn = slideCount === 1 ? 0 : 1;
  const last = slideCount - 1;
  const needsCta = requirements.requiresTextCta && slideIndex === last;
  const needsComparison = requirements.requiresComparison && slideIndex === compareOn;
  const art = new Set(intent.requirements.filter(requirement => requirement.surface === "art").map(requirement => requirement.id));
  const facts = requirements.requiredFacts.filter(fact => art.has(fact.contentId));
  const pageFacts = facts.filter((fact, index) => slideIndex === (
    fact.comparisonGroup !== null ? compareOn :
    fact.slideIndex ?? (last > 1 ? 1 + index % (last - 1) : 0)
  ));
  if (!needsComparison && !needsCta && !pageFacts.length) return { issues, assignments, comparisonLayout };

  const fields = fieldCapacities(card);
  const usedCharacters = new Map<string, number>();
  const assign = (field: FieldCapacity, facts: Fact[], itemCount?: number, guidance?: string) => {
    if (!facts.length) return;
    const previous = assignments.get(field.id);
    const instruction = guidance ?? ("Inclua neste campo " + facts.map(fact => planningFactText(fact.text)).join(" · ") + ". Preserve cada condição e a associação com a alternativa correspondente.");
    assignments.set(field.id, {
      contentIds: [...(previous?.contentIds ?? []), ...facts.map(fact => fact.contentId)],
      instruction: [previous?.instruction, instruction].filter(Boolean).join(" ").slice(0, 1600),
      ...(itemCount !== undefined ? { itemCount } : {}),
    });
    usedCharacters.set(field.id, (usedCharacters.get(field.id) ?? 0) + charsFor(facts) + Number(Boolean(previous)));
  };
  if (needsCta) {
    const minimum = Math.max(3, requirements.textCta?.length ?? 0);
    const cta = fields.filter(field => field.role === "callToAction" && field.kind === "text" &&
      field.authoredCharacters > 2 && field.characters >= minimum)
      .sort((a, b) => b.characters - a.characters)[0];
    if (!cta) issues.push("text_cta_capacity");
    else assignments.set(cta.id, {
      contentIds: [ctaContentId],
      instruction: requirements.textCta
        ? "Exiba exatamente " + JSON.stringify(requirements.textCta) + " como chamada final."
        : "Escreva a chamada textual de encerramento pedida no briefing.",
    });
  }
  if (needsComparison) {
    const slots = comparisonSlots(fields);
    const groups = new Map<number, Fact[]>();
    for (const fact of pageFacts) {
      if (fact.comparisonGroup !== null)
        groups.set(fact.comparisonGroup, [...(groups.get(fact.comparisonGroup) ?? []), fact]);
    }
    const alternatives = Array.from(groups).sort(([a], [b]) => a - b).map(([, facts]) => facts);
    const matches = pairComparisonFacts(slots, alternatives);
    comparisonLayout = Boolean(matches);
    if (matches) {
      for (const slot of slots) {
        const match = matches.get(slot);
        if (!match) continue;
        if (slot.label) assign(slot.label, match.labels);
        assign(slot.body, match.details);
      }
    } else if (alternatives.length) {
      const facts = alternatives.flat();
      const list = fields.find(field => field.kind === "list" && field.items.length >= alternatives.length &&
        (field.cardinality?.min ?? 1) <= alternatives.length &&
        alternatives.every((group, index) => charsFor(group) <= field.items[index]));
      const body = fields.filter(field => field.role === "body" && field.kind === "text" &&
        field.characters >= charsFor(facts)).sort((a, b) => b.characters - a.characters)[0];
      const field = list ?? body;
      if (!field) issues.push("comparison_fact_capacity");
      else {
        const groups = alternatives.map(group => group.map(fact => planningFactText(fact.text)).join(": "));
        const instruction = (list ? "Use um item por alternativa, nesta ordem. " : "Use uma frase por alternativa, nesta ordem. ") +
          groups.join(" | ") + ". Preserve o nome, os valores e os benefícios junto à alternativa correspondente.";
        assign(field, facts, list ? alternatives.length : undefined, instruction);
      }
    }
  }
  const independentFacts = pageFacts.filter(fact => fact.comparisonGroup === null);
  for (const fact of independentFacts.sort((a, b) => factLength(b) - factLength(a))) {
    const options = fields.filter(field => field.role !== "callToAction" && (
      fact.role === "headline" ? field.role === "headline" :
      fact.role === "label" ? field.role === "label" || field.role === "sectionLabel" || field.role === "body" :
      field.role === "body" || field.kind === "list"
    ));
    const fit = options.filter(field => {
      const used = usedCharacters.get(field.id) ?? 0;
      const required = used + Number(used > 0) + factLength(fact);
      return field.kind === "list" ? field.items.some(limit => limit >= required) : field.characters >= required;
    }).sort((a, b) => b.characters - a.characters)[0];
    if (!fit) issues.push("required_fact_capacity");
    else assign(fit, [fact]);
  }
  return { issues: Array.from(new Set(issues)), assignments, comparisonLayout };
}

export function comparisonSlotPreference(card: ComponentCardV1, intent: GenerationIntent, slot: number, slideCount: number) {
  if (!intent.designRequirements?.requiresComparison) return 0;
  const page = slideCount === 1 ? 0 : 1;
  return Number(checkPageCapacity(card, intent, page, slideCount).comparisonLayout === (slot === 0));
}

export function repertoireCapacityIssues(repertoire: DesignFamilyRepertoire, intent: GenerationIntent) {
  return repertoire.slides.flatMap(slide => {
    const results = slide.variants.map(card => checkPageCapacity(card, intent, slide.slideIndex, repertoire.slides.length));
    return results.some(result => !result.issues.length) ? [] : Array.from(new Set(results.flatMap(result => result.issues)));
  });
}

export function matchesCompositionProfile(card: ComponentCardV1, profile: Profile, slideCount: number) {
  const fields = completeDesignFields(card);
  switch (profile) {
    case "columns": return fields.some(field => comparisonSource.test(field.source)) ||
      card.completeDesign?.designGuidance?.selection?.axes?.organization === "comparison";
    case "stacked": return fields.filter(field => field.kind === "text" && field.role === "body").length >= 2;
    case "paired_rows": return fields.some(field => field.kind === "list" && (field.cardinality?.max ?? 0) >= 2);
    case "sequence": return slideCount > 1 && card.roles.includes("development");
    case "list": return fields.some(field => field.kind === "list");
    case "hierarchy": return fields.some(field => field.role === "headline") && fields.some(field => field.role === "body");
    case "typographic": return card.visualTraits?.languages.includes("typographic") ?? !card.mediaSlots.length;
    case "media": return card.mediaSlots.length > 0;
  }
}
