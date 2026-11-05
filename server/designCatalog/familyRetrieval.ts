import { familyAxes, familyDistance, familyTie, requestedIntentAffinity, type FamilyNeutrality } from "@shared/familyNeutrality";
import { arsenalHash } from "@shared/arsenalContent";
import type { FamilySelectionCandidate } from "@shared/designFamilySelection";
import type { GenerationIntent } from "@shared/generationPlan";
import type { FrozenEditorialCatalog } from "@shared/editorialIntent";
import {
  FAMILY_RETRIEVAL_POLICY as policy,
  familyRetrievalPolicyHash,
  type FamilyRetrievalReceipt,
} from "@shared/familyRetrieval";
import {
  embedSearchText,
  sourceSearchDocument,
  type FamilySearchIndex,
} from "./familySearchIndex";
import type { EmbeddingEngine } from "../ai/editorialAffinity/embeddingEngine";

export function familyCorpusHash(families: FamilySelectionCandidate[]) {
  return arsenalHash(
    families
      .map(f => ({
        id: f.id,
        signature: f.signature,
        profileHash: arsenalHash(f.profile),
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}
export function familySearchQuery(
  intent: GenerationIntent,
  catalog: FrozenEditorialCatalog | null,
  visualPreference = ""
) {
  const requested = new Set(
    intent.editorial?.signals
      .filter(s => s.state !== "forbidden")
      .map(s => s.intentId)
  );
  // No catalogue is inserted into this query. Explicit exclusions stay in the
  // media/format gates and the JEV context, not positive lexical search terms.
  return [
    intent.objective,
    intent.tone.description,
    ...(catalog?.document.intents
      .filter(i => requested.has(i.id))
      .map(i => i.label) ?? []),
    visualPreference,
  ]
    .filter(Boolean)
    .join("\n")
    .normalize("NFC")
    .trim();
}
/** Keep explicit visual preferences in retrieval even if interpretation focuses on the message. */
export function familyVisualQuery(visual:{enabled?:boolean;language?:string|null},brief:string,neutral:boolean) {
  const saved=visual.enabled?visual.language??'':'';
  if(!neutral)return saved;
  const explicit=brief.match(/(?:preferência visual|direção visual|estética|estilo visual|paleta)\s*:\s*([^\n]{1,340})/i)?.[1];
  return [saved,explicit?.trim()].filter(Boolean).join(' ');
}
const stop = new Set(
  "a o as os de do da dos das em no na nos nas para por com um uma e ou que se ao aos sobre the and of to for with design composição post peça".split(
    " "
  )
);
function tokens(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !stop.has(t));
}
export interface RetrievalArguments {
  families: FamilySelectionCandidate[];
  neutrality?: FamilyNeutrality;
  intent: GenerationIntent;
  catalog: FrozenEditorialCatalog | null;
  visualPreference?: string;
  mixedMedia?: boolean;
  semantic?: { engine: EmbeddingEngine; index: FamilySearchIndex };
  signal?: AbortSignal;
}
export async function retrieveFamilyCandidates(
  args: RetrievalArguments
): Promise<FamilyRetrievalReceipt> {
  const { families, intent, catalog } = args;
  const query = familySearchQuery(intent, catalog, args.visualPreference);
  const documents = families.map(f => {
    const roots = f.repertoires.map(r => {
      const root = r.slides
        .flatMap(s => s.variants)
        .find(c => c.id === r.sourceId && c.hash === r.sourceHash)!;
      return sourceSearchDocument(root, catalog, args.neutrality ? 2 : 1);
    });
    return {
      family: f,
      roots,
      text: Array.from(new Set(roots.map(r => r.text))).join("\n"),
    };
  });
  const needsSearch = families.length > policy.initialFamilies;
  if (needsSearch && !args.semantic)
    throw new Error("family_retrieval_index_required");
  const semantic = args.semantic;
  const indexBySource = new Map(
    semantic?.index.documents.map(d => [d.id, d]) ?? []
  );
  if (semantic)
    for (const { roots } of documents)
      for (const root of roots) {
        const indexed = indexBySource.get(root.id);
        if (
          !indexed ||
          indexed.sourceHash !== root.sourceHash ||
          indexed.textHash !== root.textHash
        )
          throw new Error("family_retrieval_index_stale");
      }
  const vector = semantic
    ? await embedSearchText(semantic.engine, query, "query", args.signal)
    : null;
  const terms = Array.from(new Set(tokens(query))),
    corpus = documents.map(d => tokens(d.text));
  const averageLength =
    corpus.reduce((sum, t) => sum + t.length, 0) / Math.max(1, corpus.length);
  const frequencies = new Map(
    terms.map(term => [term, corpus.filter(t => t.includes(term)).length])
  );
  const requested = new Set(
    intent.editorial?.signals
      .filter(s => s.state === "requested")
      .map(s => s.intentId)
  );
  const suggested = new Set(
    intent.editorial?.signals
      .filter(s => s.state === "suggested")
      .map(s => s.intentId)
  );
  const independentlyRequired = Math.max(
    0,
    ...intent.requirements
      .filter(r => r.kind !== "execution")
      .map(r => r.itemCount ?? 0)
  );
  const rows = documents.map(({ family, roots }, i) => {
    const words = corpus[i];
    const lexical = terms.reduce((sum, term) => {
      const tf = words.filter(t => t === term).length;
      const idf = Math.log(
        1 +
          (families.length - frequencies.get(term)! + 0.5) /
            (frequencies.get(term)! + 0.5)
      );
      return (
        sum +
        (idf * tf * 2.2) /
          (tf +
            1.2 * (0.25 + (0.75 * words.length) / Math.max(1, averageLength)))
      );
    }, 0);
    // One family gets one result. More authored alternatives do not add votes.
    const similarity = vector
      ? Math.max(
          ...roots.map(root => {
            const target = indexBySource.get(root.id)!.vector;
            return vector.reduce((sum, v, d) => sum + v * target[d], 0);
          })
        )
      : null;
    const editorial = args.neutrality ? requestedIntentAffinity(family.profile.editorial.intents.map(i=>i.id),requested,suggested) : family.profile.editorial.intents.reduce(
      (sum, item) =>
        sum + (requested.has(item.id) ? 1 : suggested.has(item.id) ? 0.25 : 0),
      0
    );
    const structure = family.profile.structure;
    const structural = args.neutrality ? (independentlyRequired > 1 && structure.listItemsPerBlock?.max && structure.listItemsPerBlock.max >= independentlyRequired ? 1 : 0) :
      (independentlyRequired > 1 &&
      structure.listItemsPerBlock?.max &&
      structure.listItemsPerBlock.max >= independentlyRequired
        ? 2
        : 0) +
      (intent.content.length > 1 && structure.textBlocks.max > 1 ? 1 : 0);
    return {
      id: family.id,
      lexical,
      semantic: similarity,
      editorial,
      structural,
      reason: "relevance",
      score: 0,
      tie: args.neutrality ? familyTie(args.neutrality.seed,family.family) : arsenalHash({ query, id: family.id }),
      axes: familyAxes(family.repertoires[0].slides[0].variants.find(c=>c.id===family.repertoires[0].sourceId)!),
      traits: new Set([
        ...family.profile.aesthetic.motifs,
        ...family.profile.aesthetic.languages,
        ...family.profile.editorial.intents.map(i => i.id),
      ]),
      photo: family.repertoires.some(r =>
        r.slides.some(s => s.variants.some(c => c.mediaSlots.length))
      ),
    };
  });
  // Reciprocal rank fusion: lexical, semantic, editorial and structural signals
  // remain advisory and cannot exclude an untagged source or a different topic.
  for (const channel of [
    "lexical",
    "semantic",
    "editorial",
    "structural",
  ] as const) {
    const ordered = [...rows]
      .filter(r => r[channel] !== null && (r[channel] as number) > 0)
      .sort(
        (a, b) =>
          (b[channel] as number) - (a[channel] as number) ||
          a.tie.localeCompare(b.tie)
      );
    let rank = 0;
    ordered.forEach((row, position) => {
      // Equal affinity is equal evidence; an ID tiebreak must not manufacture
      // editorial preference among families carrying the same annotations.
      if (position && row[channel] !== ordered[position - 1][channel])
        rank = position;
      row.score += 1 / (60 + rank + 1);
    });
  }
  rows.sort((a, b) => b.score - a.score || a.tie.localeCompare(b.tie));
  const selected: typeof rows = [];
  const add = (row: (typeof rows)[number] | undefined, reason: string) => {
    if (row && !selected.includes(row)) {
      row.reason = reason;
      selected.push(row);
    }
  };
  if (args.mixedMedia)
    for (const photo of [true, false])
      add(
        rows.find(r => r.photo === photo),
        "media_coverage"
      );
  for (const row of rows) {
    if (selected.length >= Math.min(20, rows.length)) break;
    add(row, "relevance");
  }
  while (selected.length < Math.min(policy.initialFamilies, rows.length)) {
    const covered = new Set(selected.flatMap(r => Array.from(r.traits)));
    const diverse = rows
      .filter(r => !selected.includes(r))
      .sort(
        (a, b) =>
          (args.neutrality ? Math.min(...selected.map(s=>familyDistance(b.axes,s.axes))) - Math.min(...selected.map(s=>familyDistance(a.axes,s.axes))) : Array.from(b.traits).filter(t => !covered.has(t)).length -
            Array.from(a.traits).filter(t => !covered.has(t)).length) ||
          b.score - a.score ||
          a.tie.localeCompare(b.tie)
      )[0];
    add(diverse, "diversity");
  }
  const initialIds = selected.map(r => r.id);
  const additional = rows
    .filter(r => !selected.includes(r))
    .slice(0, policy.additionalFamilies);
  const recovered = [...selected, ...additional].map(
    ({ id, lexical, semantic, editorial, structural, reason }) => ({
      id,
      lexical,
      semantic,
      editorial,
      structural,
      reason,
    })
  );
  return {
    version: 1,
    ...(args.neutrality ? {neutrality: args.neutrality} : {}),
    policyHash: familyRetrievalPolicyHash(Boolean(args.neutrality)),
    catalogHash: familyCorpusHash(families),
    query,
    queryHash: arsenalHash(query),
    indexHash: semantic?.index.hash ?? null,
    modelFingerprint: semantic?.engine.metadata.fingerprint ?? null,
    eligibleFamilies: families.length,
    initialIds,
    additionalIds: additional.map(r => r.id),
    expanded: false,
    recovered,
    transport: { batches: 0, bytes: 0, largestRequestBytes: 0 },
  };
}
export function assertFamilyRetrieval(
  receipt: FamilyRetrievalReceipt,
  families: FamilySelectionCandidate[],
  query: string
) {
  const ids = [...receipt.initialIds, ...receipt.additionalIds],
    allowed = new Set(families.map(f => f.id));
  if (
    receipt.version !== 1 ||
    (receipt.neutrality && (receipt.neutrality.version !== 1 || !receipt.neutrality.seed)) ||
    receipt.policyHash !== familyRetrievalPolicyHash(Boolean(receipt.neutrality)) ||
    receipt.catalogHash !== familyCorpusHash(families) ||
    receipt.query !== query ||
    receipt.queryHash !== arsenalHash(query) ||
    receipt.eligibleFamilies !== families.length ||
    receipt.initialIds.length !==
      Math.min(policy.initialFamilies, families.length) ||
    receipt.additionalIds.length > policy.additionalFamilies ||
    ids.length > policy.maxFamilies ||
    new Set(ids).size !== ids.length ||
    ids.some(id => !allowed.has(id)) ||
    arsenalHash([...receipt.recovered.map(r => r.id)].sort()) !==
      arsenalHash([...ids].sort()) ||
    (families.length > policy.initialFamilies &&
      (!receipt.indexHash || !receipt.modelFingerprint))
  )
    throw new Error("family_retrieval_receipt_invalid");
}
