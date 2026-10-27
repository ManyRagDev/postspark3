import type { ComponentCardV1 } from "./componentAssembly";
import type { CreativeFamily } from "./creative/types";

/** Selection is a projection of the design, never another executable document.
 * Missing information stays unknown. Example copy, names and topic labels do not
 * define where a composition may be used. */
export interface DesignSelectionProfile {
  version: 1;
  evidence: "catalog" | "family-definition";
  composition: string[];
  typography: string[];
  palette: string[];
  content: string[];
  capacity: string[];
  editorial: string[];
  media: string[];
  character: string[];
  customization: string[];
  limitations: string[];
  unknowns: string[];
}

const unique = (values: string[]) => Array.from(new Set(values)).sort();

/** Advisory geometry only. A word partition adds boxes; repeated whole-field
 * targets do not add independent writing space. Neither field count nor fragment
 * count tells the selector how much explanation a design can hold.
 */
export function designTextBudgets(card: ComponentCardV1) {
  const bySource = new Map<string, typeof card.capacity.textRegions>();
  for (const region of card.capacity.textRegions)
    bySource.set(region.source, [
      ...(bySource.get(region.source) ?? []),
      region,
    ]);
  return Array.from(bySource, ([source, regions]) => {
    const characters = regions.map(
      region =>
        Math.floor(region.width / (region.fontSize * 0.55)) *
        Math.max(1, Math.floor(region.height / (region.fontSize * 1.2)))
    );
    const partitioned = regions.some(region => region.minWords > 1);
    return {
      source,
      estimatedCharacters: partitioned
        ? characters.reduce((sum, value) => sum + value, 0)
        : Math.min(...characters),
      distribution: partitioned ? "word_partition" : "whole_value_per_target",
      advisory: true,
    };
  });
}
const position = (center: number, names: string[]) =>
  names[center < 1 / 3 ? 0 : center > 2 / 3 ? 2 : 1];

/** Basic families get the same vocabulary, without inventing measured capacity
 * or promoting them into the complete-design generation pipeline. */
export function describeBasicDesign(
  family: CreativeFamily
): DesignSelectionProfile {
  return {
    version: 1,
    evidence: "family-definition",
    composition: [family.axes.composition],
    typography: [family.axes.typography],
    palette: [family.axes.color],
    content: [
      family.fit.needsSections
        ? "multiple content sections"
        : "headline and supporting text",
      ...(family.fit.needsNumber ? ["prominent number"] : []),
    ],
    capacity: [
      "declared headline range (not measured): " +
        JSON.stringify({
          minCharacters: family.fit.minHeadlineChars,
          maxCharacters: family.fit.maxHeadlineChars,
        }),
    ],
    media: [
      family.fit.needsImage
        ? "image required by definition"
        : "image support not verified",
    ],
    editorial: [
      "editorial capacity not measured; do not assume room for an argument from the family name",
    ],
    character: [family.axes.ornaments, family.axes.texture],
    customization: [
      "parameterized composition; use only the capabilities of its renderer",
    ],
    limitations: [],
    unknowns: [
      "capacity and adaptations require verification in the target renderer",
    ],
  };
}

/** Numeric geometry is interpreted here, not by Jev. No raw scene, media prompt,
 * sample text, communicative-purpose label or historical popularity is sent. */
export function describeCompleteDesign(
  card: ComponentCardV1
): DesignSelectionProfile {
  const regions = card.regions ?? [];
  const composition = unique(
    regions.map(region => {
      const horizontal = position(region.x + region.width / 2, [
        "left",
        "center",
        "right",
      ]);
      const vertical = position(region.y + region.height / 2, [
        "top",
        "middle",
        "bottom",
      ]);
      const size =
        region.width >= 0.75
          ? "wide"
          : region.width <= 0.35
            ? "narrow"
            : "medium-width";
      return `${region.kind}: ${size}, ${vertical}-${horizontal}${Math.abs(region.rotation) > 3 ? ", rotated" : ""}`;
    })
  );
  const text = card.capacity.textRegions;
  const dominant = text.filter(
    region => region.fontSize / card.capacity.height >= 0.065
  );
  const content = unique(
    card.fields
      .filter(field => field.kind !== "media")
      .map(field => {
        // These are binding roles (headline/body/list), not example text or topics.
        const role = field.source
          .replace(/^block:/, "")
          .replace(/:\d+(?=:|$)/g, "");
        return `${role}: ${field.kind}${field.required ? " required" : " optional"}${field.cardinality ? `; ${field.cardinality.min}–${field.cardinality.max} items` : ""}`;
      })
  );
  const specificDescription = card.description.trim();
  const guidance = card.completeDesign?.designGuidance;
  const fieldSources = unique(text.map(region => region.source));
  const supportingFields = card.fields.filter(field =>
    /body|items|list|comparison|attribution|metric/.test(field.source)
  );
  const budgets = designTextBudgets(card);
  const supportingCharacters = budgets
    .filter(budget =>
      /body|items|list|comparison|attribution|metric/.test(budget.source)
    )
    .reduce((sum, budget) => sum + budget.estimatedCharacters, 0);
  return {
    version: 1,
    evidence: "catalog",
    composition: composition.length
      ? composition
      : ["spatial layout not documented"],
    typography: unique([
      ...(card.sourceFontFamilies?.length
        ? card.sourceFontFamilies
        : card.fontFamilies),
      ...(dominant.length ? ["large display text relative to the canvas"] : []),
    ]),
    palette: unique(card.completeDesign?.colors ?? []),
    content,
    capacity: unique([
      ...text.map(
        region =>
          `${region.source}: ${Math.floor(region.width / region.fontSize)} em wide × ${Math.floor(region.height / region.fontSize)} em high at authored font size (geometry, not a character limit)${region.minWords > 1 ? `; native word partition: ${region.minWords} fragments share this canonical field; short text can leave a slice empty. Prefer sufficient supplied words when rewriting is allowed; never expand visual_only text to fill a layout` : ""}`
      ),
      ...budgets.map(
        budget =>
          `${budget.source}: approximately ${budget.estimatedCharacters} characters across the canonical field at authored font size; ${budget.distribution}; advisory geometry, not a hard text limit`
      ),
    ]),
    media: card.mediaSlots.length
      ? [
          `${card.mediaSlots.length} native image slots`,
          ...unique(
            card.mediaSlots.map(
              slot =>
                `${slot.function}; ${slot.policy}; ${slot.deferred ? "image to provide" : "embedded image"}`
            )
          ),
        ]
      : ["no native image slots"],
    editorial: [
      `${fieldSources.length} independent text fields; split fragments of one field are not additional facts or slide sections`,
      `${supportingFields.length} body/list/data fields; ${supportingFields.length ? "assess their authored space against the explanation required by the brief" : "headline-led layout; do not assume capacity for detailed explanations"}`,
      `Approximately ${supportingCharacters} supporting characters in total at authored font size. Several small label boxes are not equivalent to explanatory paragraphs. Compare this budget with ALL essential source facts before choosing the design; a caption cannot make up for facts omitted from the art`,
      "Compare the information needed on each slide with native fields; titles alone must not replace the argument or essential facts",
      ...(guidance?.contentRules ?? []),
    ],
    character: unique([
      ...(card.visualTraits?.languages ?? []),
      ...(card.visualTraits?.treatments ?? []),
      ...card.densities.map(density => `density: ${density}`),
      `decoration: ${card.decorativeIntensity < 0.25 ? "sparse" : card.decorativeIntensity < 0.6 ? "moderate" : "abundant"}`,
      ...(specificDescription &&
      !specificDescription.startsWith("Design completo: fundo, fontes, camadas")
        ? [specificDescription]
        : []),
      ...(guidance ? [guidance.summary, ...guidance.motifs] : []),
    ]),
    customization: [
      "fill declared text and media fields; preserve authored geometry",
      ...(guidance?.preserve ?? []),
      ...(guidance?.mediaRules.flatMap(rule =>
        rule.instructions.map(instruction => `${rule.slotId}: ${instruction}`)
      ) ?? []),
    ],
    limitations: unique([
      ...card.limitations,
      ...(guidance?.knownLimitations ?? []),
    ]),
    unknowns: [
      "cross-format reflow and undeclared adaptations are not verified",
      ...(!regions.length ? ["spatial layout"] : []),
    ],
  };
}

/** The LLM still gets the identifiers and execution-relevant selection facts.
 * Full definitions are hydrated by the existing pipeline after its choice. */
export function designSelectionCard(card: ComponentCardV1) {
  const { original: _provenance, ...guidance } =
    card.completeDesign?.designGuidance ?? {};
  return {
    id: card.id,
    family: card.completeDesign?.family,
    roles: card.roles,
    colors: card.completeDesign?.colors,
    mediaSlotCount: card.mediaSlots.length,
    designGuidance: card.completeDesign?.designGuidance ? guidance : undefined,
    profile: describeCompleteDesign(card),
  };
}

export interface RecentDesignSelection {
  requestId: string;
  selections: Array<{ family: string; designIds: string[] }>;
}

const overlap = (a: string[], b: string[]) => {
  const left = new Set(a),
    right = new Set(b);
  const union = new Set([...Array.from(left), ...Array.from(right)]);
  return union.size
    ? Array.from(left).filter(value => right.has(value)).length / union.size
    : 0;
};

/** Motifs describe visual construction, never restrict designs to subject matter.
 * Prefer authored evidence; historical family names are deliberately excluded. */
export function designMotifs(card: ComponentCardV1): string[] {
  const declared = card.completeDesign?.designGuidance?.motifs;
  return unique(
    (declared?.length ? declared : (card.visualTraits?.treatments ?? [])).map(
      value =>
        value
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\b(?:papel|scrapbook|paper)\b/g, "paper")
          .replace(/\b(?:janela|navegador|browser|window)\b/g, "window")
          .trim()
    )
  );
}

export function designVisualSimilarity(
  a: ComponentCardV1,
  b: ComponentCardV1
): number {
  const left = describeCompleteDesign(a),
    right = describeCompleteDesign(b);
  const authored = Boolean(
    a.completeDesign?.designGuidance?.motifs.length &&
      b.completeDesign?.designGuidance?.motifs.length
  );
  const motif = overlap(designMotifs(a), designMotifs(b));
  const structure = overlap(left.composition, right.composition);
  const type = overlap(left.typography, right.typography);
  const media = Number(
    Boolean(a.mediaSlots.length) === Boolean(b.mediaSlots.length)
  );
  return authored
    ? 0.65 * motif + 0.15 * structure + 0.1 * type + 0.1 * media
    : 0.35 * motif + 0.35 * structure + 0.2 * type + 0.1 * media;
}

/** Advisory recency penalty, bounded below a meaningful suitability-score gap. */
export function designRecencyPenalty(
  card: ComponentCardV1,
  recent: RecentDesignSelection[]
): number {
  return recent
    .slice(0, 5)
    .reduce(
      (maximum, run, index) =>
        Math.max(
          maximum,
          Math.max(
            0,
            ...run.selections.map(choice =>
              choice.designIds.includes(card.id)
                ? 0.3 / (index + 1)
                : choice.family === card.completeDesign?.family
                  ? 0.22 / (index + 1)
                  : 0
            )
          )
        ),
      0
    );
}

/** Embedded photographs also obey an explicit no-photo request; textures do not. */
export function designHasPhotographicContent(card: ComponentCardV1): boolean {
  return (card.completeDesign?.designGuidance?.motifs ?? []).some(motif =>
    [
      "photographic-object",
      "photographic-scene",
      "photographic-portrait",
    ].includes(motif.toLowerCase().trim())
  );
}
