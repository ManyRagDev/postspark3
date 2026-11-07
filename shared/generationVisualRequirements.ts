import { arsenalHash } from "./arsenalContent";
import { activeArsenalMedia, type ArsenalComposition } from "./designArsenal";
import type { ComponentCardV1, ComponentDefinitionV1 } from "./componentAssembly";
import type { DesignFamilyRepertoire } from "./designRepertoire";

export interface GenerationVisualRequirements {
  version: 1;
  chromaticPortal?: { quote: string };
}

/** Detect only affirmative, concrete directions in the creator's own briefing. */
export function readGenerationVisualRequirements(briefing: string): GenerationVisualRequirements | undefined {
  const directions = briefing.normalize("NFC").split(/[.!?;\n]+/);
  const quote = directions.map(direction => direction.trim()).find(direction =>
    direction.length <= 400 &&
    /^(?:quero|queremos|use|utilize|inclua|crie|componha|mostre)\b/i.test(direction) &&
    /\bportal\b/i.test(direction) &&
    (/^(?:quero|queremos|use|utilize|inclua|crie|componha|mostre)\s+(?:(?:um|o)\s+)?portal\b/i.test(direction) ||
      /\b(?:fundo|composição|layout|moldura|direção visual)\b/i.test(direction)) &&
    /(?:cromátic[oa]|transição\s+(?:de\s+cores|cromática)|gradiente)/i.test(direction) &&
    !/\b(?:sem\s+(?:um\s+)?portal|não\s+(?:quero|use|utilize|inclua)|evite)\b/i.test(direction)
  );
  return quote ? { version: 1, chromaticPortal: { quote } } : undefined;
}

export function repertoireMeetsVisualRequirements(
  repertoire: DesignFamilyRepertoire,
  requirements?: GenerationVisualRequirements
): boolean {
  return repertoire.slides.every(slide =>
    slide.variants.some(card => meetsGenerationVisualRequirements(card, requirements))
  );
}

export function meetsGenerationVisualRequirements(
  card: ComponentCardV1,
  requirements?: GenerationVisualRequirements
): boolean {
  return !requirements?.chromaticPortal ||
    Boolean(card.completeDesign?.designGuidance?.visualFeatures?.chromaticPortal);
}

export function rendersChromaticPortal(definition: ComponentDefinitionV1, composition: ArsenalComposition): boolean {
  const layers = definition.completeDesign?.designGuidance?.visualFeatures?.chromaticPortal;
  const assembly = composition.origin.componentAssembly;
  const componentIndex = assembly?.componentIds.indexOf(definition.id) ?? -1;
  if (!layers || new Set(layers).size !== 2 || componentIndex < 0 ||
    assembly?.componentHashes[componentIndex] !== definition.hash) return false;
  return layers.every(id => {
    const instance = definition.fragment.instances.find(candidate => candidate.id === id);
    const assetId = instance && definition.pieces[instance.pieceHash]?.imageAssetId;
    const resolvedId = composition.origin.blueprintId === definition.id &&
      composition.base.instances.some(candidate => candidate.id === id)
      ? id : `c${componentIndex}-${arsenalHash(id).slice(0, 20)}`;
    const element = composition.elements.find(candidate => candidate.id === resolvedId);
    return Boolean(assetId && element?.kind === "media" && element.imageAssetId === assetId &&
      element.opacity > 0 && !activeArsenalMedia(composition, element));
  });
}
