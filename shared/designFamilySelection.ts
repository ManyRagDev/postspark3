import { arsenalHash } from "./arsenalContent";
import { assemblyIdentity, type ComponentCardV1 } from "./componentAssembly";
import type { DesignFamilyRepertoire } from "./designRepertoire";
import type { EditorialCatalogDocument, FrozenEditorialCatalog } from "./editorialIntent";

type CountRange = { min: number; max: number };

/** First election describes a family. Exact compositions remain in repertoires
 * for the subsequent choice; this profile cannot prescribe a slide sequence. */
export interface FamilySelectionProfile {
  version: 4;
  kind: "editorial_family";
  family: string;
  aesthetic: {
    languages: string[];
    treatments: string[];
    motifs: string[];
    fonts: string[];
    densities: string[];
    identity: { essential: string[]; optional: string[]; adaptable: string[] };
  };
  editorial: {
    catalogHash: string | null;
    intents: EditorialCatalogDocument["intents"];
    rationales: string[];
  };
  structure: {
    capacityRule: "ranges_across_root_designs_not_additive";
    textBlocks: CountRange;
    listBlocks: CountRange;
    listItemsPerBlock: CountRange | null;
    mediaSlots: CountRange;
    relationships: string[];
  };
  availability: { roles: string[]; functions: string[] };
}

export interface FamilySelectionCandidate {
  id: string;
  signature: string;
  family: string;
  repertoires: DesignFamilyRepertoire[];
  profile: FamilySelectionProfile;
}

export const familySelectionProfileLegend =
  "Family profile v4 elects an editorial/aesthetic family before choosing compositions. " +
  "Aesthetic traits and available functions are possibilities within the family, not simultaneous requirements or topic/tone restrictions. " +
  "Essential identity and adaptable traits are shared by all offered roots; optional traits may differ between roots. " +
  "Editorial intentions are source-hash-verified affinities: a family need not perform all of them. Absence is unknown, not prohibition. " +
  "Structure ranges describe individual root compositions, never totals across alternatives or across pages. " +
  "Different range maxima may belong to different roots and cannot be combined into a fictional composition. " +
  "Text blocks count canonical values, not typographic fragments; listItemsPerBlock concerns one native list, not all lists combined. " +
  "A null listItemsPerBlock means no known uniform list-cardinality evidence; do not infer a restriction. " +
  "Available roles/functions summarize offered members without prescribing sequence, geometry, fields or component choice. " +
  "Choose one family here; exact composition, media compatibility and native capacities are verified in the next phase.";

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const unique = (values: string[]) => Array.from(new Set(values.filter(value => value.length > 0))).sort(compare);
const range = (values: number[]): CountRange => ({ min: Math.min(...values), max: Math.max(...values) });
const shared = (groups: string[][]): string[] => unique(groups[0].filter(value => groups.every(group => group.includes(value))));

function rootFor(repertoire: DesignFamilyRepertoire): ComponentCardV1 {
  const root = repertoire.slides.flatMap(slide => slide.variants).find(card =>
    card.id === repertoire.sourceId && card.hash === repertoire.sourceHash &&
    card.completeDesign?.family === repertoire.family &&
    !card.completeDesign.designGuidance?.carouselVariant
  );
  if (!root) throw new Error("family_selection_source_identity_mismatch");
  return root;
}

function describeFamily(
  family: string,
  repertoires: DesignFamilyRepertoire[],
  catalog: FrozenEditorialCatalog | null
): FamilySelectionProfile {
  // Uniform carousels repeat their root; repeated references never add capacity.
  const roots = Array.from(new Map(repertoires.map(repertoire => {
    const root = rootFor(repertoire);
    return [`${root.id}:${root.hash}`, root] as const;
  })).values());
  const guidance = roots.map(root => root.completeDesign!.designGuidance);
  const matched = catalog?.document.designs.filter(design =>
    roots.some(root => root.id === design.sourceId && root.hash === design.sourceHash)
  ) ?? [];
  const intentIds = new Set(matched.flatMap(design => design.intentIds));
  const lists = roots.flatMap(root => root.fields.filter(field => field.kind === "list"));
  const knownLists = lists.flatMap(field => field.cardinality ? [field.cardinality] : []);
  const fieldCount = (root: ComponentCardV1, kind: "text" | "list") =>
    new Set(root.fields.filter(field => field.kind === kind).map(field => field.source)).size;
  const functions = repertoires.flatMap(repertoire => repertoire.slides.flatMap(slide => slide.variants.flatMap(card => {
    const variant = card.completeDesign?.designGuidance?.carouselVariant;
    return variant?.version === 3 &&
      variant.sourceId === repertoire.sourceId && variant.sourceHash === repertoire.sourceHash &&
      variant.contentMode === repertoire.contentMode && variant.role === slide.role && card.roles.includes(slide.role)
      ? [variant.function] : [];
  })));
  return {
    version: 4,
    kind: "editorial_family",
    family,
    aesthetic: {
      languages: unique(roots.flatMap(root => root.visualTraits?.languages ?? [])),
      treatments: unique(roots.flatMap(root => root.visualTraits?.treatments ?? [])),
      motifs: unique(guidance.flatMap(value => value?.motifs ?? [])),
      fonts: unique(roots.flatMap(root => root.sourceFontFamilies ?? root.fontFamilies)),
      densities: unique(roots.flatMap(root => root.densities)),
      identity: {
        essential: shared(guidance.map(value => value?.familyIdentity?.essential ?? [])),
        optional: unique(guidance.flatMap(value => value?.familyIdentity?.optional ?? [])),
        adaptable: shared(guidance.map(value => value?.familyIdentity?.adaptable ?? [])),
      },
    },
    editorial: {
      catalogHash: catalog?.hash ?? null,
      intents: (catalog?.document.intents ?? []).filter(intent => intentIds.has(intent.id))
        .map(intent => ({ ...intent })).sort((a, b) => compare(a.id, b.id)),
      rationales: unique(matched.map(design => design.rationale)),
    },
    structure: {
      capacityRule: "ranges_across_root_designs_not_additive",
      textBlocks: range(roots.map(root => fieldCount(root, "text"))),
      listBlocks: range(roots.map(root => fieldCount(root, "list"))),
      listItemsPerBlock: lists.length && knownLists.length === lists.length
        ? { min: Math.min(...knownLists.map(list => list.min)), max: Math.max(...knownLists.map(list => list.max)) }
        : null,
      mediaSlots: range(roots.map(root => new Set(root.mediaSlots.map(slot => slot.id)).size)),
      relationships: unique(guidance.flatMap(value => value?.fieldRelationships?.map(relation => relation.kind) ?? [])),
    },
    availability: {
      roles: unique(repertoires.flatMap(repertoire => repertoire.slides.map(slide => slide.role))),
      functions: unique(functions),
    },
  };
}

/** No enumeration, merging or materialization of child compositions occurs here. */
export function buildFamilySelectionCandidates(
  repertoires: DesignFamilyRepertoire[],
  catalog: FrozenEditorialCatalog | null = null
): FamilySelectionCandidate[] {
  const groups = new Map<string, Map<string, DesignFamilyRepertoire>>();
  for (const repertoire of repertoires) {
    const group = groups.get(repertoire.family) ?? new Map<string, DesignFamilyRepertoire>();
    const memberId = repertoire.defaultOffer.offerId;
    const existing = group.get(memberId);
    if (existing && (existing.signature !== repertoire.signature || arsenalHash(existing) !== arsenalHash(repertoire)))
      throw new Error("family_selection_member_identity_conflict");
    group.set(memberId, repertoire);
    groups.set(repertoire.family, group);
  }
  return Array.from(groups).sort(([a], [b]) => compare(a, b)).map(([family, group]) => {
    const members = Array.from(group.values()).sort((a, b) => compare(a.defaultOffer.offerId, b.defaultOffer.offerId));
    const profile = describeFamily(family, members, catalog);
    const signature = arsenalHash({
      version: 1,
      family,
      members: members.map(repertoire => ({ id: repertoire.defaultOffer.offerId, signature: repertoire.signature })),
      profile,
    });
    return { id: assemblyIdentity(["editorial-family-selection-v1", signature]), signature, family, repertoires: members, profile };
  });
}
