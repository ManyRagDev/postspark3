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
  media: string[];
  character: string[];
  customization: string[];
  limitations: string[];
  unknowns: string[];
}

const unique = (values: string[]) => Array.from(new Set(values)).sort();
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
    capacity: unique(
      text.map(
        region =>
          `${region.source}: ${Math.floor(region.width / region.fontSize)} em wide × ${Math.floor(region.height / region.fontSize)} em high at authored font size (geometry, not a character limit)`
      )
    ),
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
    character: unique([
      ...(card.visualTraits?.languages ?? []),
      ...(card.visualTraits?.treatments ?? []),
      ...card.densities.map(density => `density: ${density}`),
      `decoration: ${card.decorativeIntensity < 0.25 ? "sparse" : card.decorativeIntensity < 0.6 ? "moderate" : "abundant"}`,
      ...(specificDescription &&
      !specificDescription.startsWith("Design completo: fundo, fontes, camadas")
        ? [specificDescription]
        : []),
    ]),
    customization: [
      "fill declared text and media fields; preserve authored geometry",
    ],
    limitations: unique(card.limitations),
    unknowns: [
      "cross-format reflow and undeclared adaptations are not verified",
      ...(!regions.length ? ["spatial layout"] : []),
    ],
  };
}

/** The LLM still gets the identifiers and execution-relevant selection facts.
 * Full definitions are hydrated by the existing pipeline after its choice. */
export function designSelectionCard(card: ComponentCardV1) {
  return {
    id: card.id,
    family: card.completeDesign?.family,
    roles: card.roles,
    colors: card.completeDesign?.colors,
    mediaSlotCount: card.mediaSlots.length,
    profile: describeCompleteDesign(card),
  };
}
