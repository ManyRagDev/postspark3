import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { arsenalHash } from "@shared/arsenalContent";
import {
  componentCardV1Schema,
  type ComponentCardV1,
} from "@shared/componentAssembly";
import type { FrozenEditorialCatalog } from "@shared/editorialIntent";
import {
  createEmbeddingEngine,
  type EmbeddingEngine,
} from "../ai/editorialAffinity/embeddingEngine";
import {
  readModelManifest,
  verifyModelFiles,
} from "../ai/editorialAffinity/bundle";
import { affinityHash } from "../ai/editorialAffinity/contracts";
import { ENV } from "../_core/env";

export interface SourceSearchDocument {
  id: string;
  sourceHash: string;
  textHash: string;
  text: string;
}
export interface FamilySearchIndex {
  version: 1;
  modelFingerprint: string;
  documents: Array<SourceSearchDocument & { vector: number[] }>;
  hash: string;
}
export function sourceSearchDocument(
  card: ComponentCardV1,
  catalog: FrozenEditorialCatalog | null
): SourceSearchDocument {
  const annotation = catalog?.document.designs.find(
    d => d.sourceId === card.id && d.sourceHash === card.hash
  );
  const intents =
    catalog?.document.intents.filter(i =>
      annotation?.intentIds.includes(i.id)
    ) ?? [];
  const guidance = card.completeDesign?.designGuidance;
  // Retrieval describes positive capabilities. Full prohibitions, examples and
  // preservation rules remain in the canonical JEV/planner profiles; including
  // "sem fotografia" as a positive photo match reverses their meaning here.
  const text = Array.from(
    new Set(
      [
        card.label,
        card.description,
        guidance?.summary,
        ...intents.map(i => i.label),
        ...(guidance?.familyIdentity?.essential ?? []),
        ...(card.visualTraits?.languages ?? []),
        ...(card.visualTraits?.treatments ?? []).filter(
          t => !/\bsem\b/i.test(t)
        ),
        ...(guidance?.motifs ?? []),
        ...(card.mediaSlots.length
          ? [
              "Fotografia protagonista em espaço nativo, acompanhada por mensagem breve.",
            ]
          : []),
      ].filter((v): v is string => Boolean(v?.trim()))
    )
  )
    .join("\n")
    .normalize("NFC");
  return {
    id: card.id,
    sourceHash: card.hash,
    textHash: arsenalHash(text),
    text,
  };
}
export function searchDocuments(
  cards: ComponentCardV1[],
  catalog: FrozenEditorialCatalog | null
) {
  return cards
    .filter(
      c => c.completeDesign && !c.completeDesign.designGuidance?.carouselVariant
    )
    .map(c => sourceSearchDocument(c, catalog))
    .sort((a, b) => a.id.localeCompare(b.id));
}
/** All text is represented. Segmentation never silently drops the end of a rule. */
export function embeddingChunks(text: string) {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining) {
    let length = Math.min(400, remaining.length);
    if (length < remaining.length) {
      const space = remaining.lastIndexOf(" ", length);
      if (space > length / 2) length = space;
    }
    chunks.push(remaining.slice(0, length));
    remaining = remaining.slice(length).trim();
  }
  if (!chunks.length || chunks.length > 128)
    throw new Error("family_retrieval_text_limit");
  return chunks;
}
export async function embedSearchText(
  engine: EmbeddingEngine,
  text: string,
  kind: "query" | "reference",
  signal?: AbortSignal
) {
  const chunks = embeddingChunks(text);
  if (kind === "query" && chunks.length > 16)
    throw new Error("family_retrieval_query_limit");
  const result = await engine.embed(chunks, {
    kind,
    overflow: "reject",
    signal,
  });
  const vector = Array.from(
    { length: engine.metadata.dimensions },
    (_, i) =>
      result.vectors.reduce((sum, v) => sum + v[i], 0) / result.vectors.length
  );
  const norm = Math.hypot(...vector);
  if (
    !Number.isFinite(norm) ||
    norm < 1e-12 ||
    result.inputs.some(i => i.truncated)
  )
    throw new Error("family_retrieval_vector_invalid");
  return vector.map(v => v / norm);
}
export function validateSearchIndex(
  value: FamilySearchIndex,
  fingerprint?: string
) {
  const { hash, ...basis } = value;
  if (
    value.version !== 1 ||
    hash !== arsenalHash(basis) ||
    (fingerprint && fingerprint !== value.modelFingerprint) ||
    new Set(value.documents.map(d => d.id)).size !== value.documents.length ||
    value.documents.some(
      d =>
        d.textHash !== arsenalHash(d.text) ||
        d.vector.length !== 384 ||
        d.vector.some(v => !Number.isFinite(v)) ||
        Math.abs(Math.hypot(...d.vector) - 1) > 0.001
    )
  )
    throw new Error("family_retrieval_index_invalid");
  return value;
}
export async function buildSearchIndex(
  documents: SourceSearchDocument[],
  engine: EmbeddingEngine,
  previous?: FamilySearchIndex
) {
  if (previous) validateSearchIndex(previous, engine.metadata.fingerprint);
  const rows: FamilySearchIndex["documents"] = [];
  const vectors = new Map(
    previous?.documents.map(d => [d.textHash, d.vector] as const)
  );
  for (const document of documents) {
    const vector =
      vectors.get(document.textHash) ??
      (await embedSearchText(engine, document.text, "reference"));
    vectors.set(document.textHash, vector);
    rows.push({ ...document, vector });
  }
  const basis = {
    version: 1 as const,
    modelFingerprint: engine.metadata.fingerprint,
    documents: rows,
  };
  return validateSearchIndex({ ...basis, hash: arsenalHash(basis) });
}

const engines = new Map<string, Promise<EmbeddingEngine>>();
export async function searchEngine(directory = ENV.designRetrievalDirectory) {
  if (!directory) throw new Error("family_retrieval_index_required");
  const key = resolve(directory);
  let loaded = engines.get(key);
  if (!loaded) {
    loaded = (async () => {
      const modelDirectory = join(key, "model"),
        manifest = await readModelManifest(modelDirectory);
      if (
        manifest.dimensions !== 384 ||
        manifest.queryPrefix !== "query: " ||
        manifest.referencePrefix !== "passage: "
      )
        throw new Error("family_retrieval_model_invalid");
      await verifyModelFiles(modelDirectory, manifest);
      return createEmbeddingEngine({
        ...manifest,
        modelPath: modelDirectory,
        artifactHash: affinityHash(manifest),
        threads: 1,
        maxPending: 8,
      });
    })();
    engines.set(key, loaded);
    void loaded.catch(() => engines.delete(key));
  }
  return loaded;
}
export async function closeSearchEngines() {
  const pending = Array.from(engines.values());
  engines.clear();
  await Promise.all(pending.map(async p => (await p).dispose()));
}
export function searchIndexFile(
  revision: string,
  editorialHash: string | null,
  directory = ENV.designRetrievalDirectory
) {
  if (!directory) throw new Error("family_retrieval_index_required");
  const key = arsenalHash({
    project: ENV.supabaseUrl,
    revision,
    editorialHash,
  });
  return join(resolve(directory), "indexes", `${key}.json`);
}
export async function readSearchIndex(
  revision: string,
  catalog: FrozenEditorialCatalog | null,
  directory?: string
) {
  const engine = await searchEngine(directory);
  return {
    engine,
    index: validateSearchIndex(
      JSON.parse(
        await readFile(
          searchIndexFile(revision, catalog?.hash ?? null, directory),
          "utf8"
        )
      ),
      engine.metadata.fingerprint
    ),
  };
}
/** Publication prepares immutable revision-specific files. Request handling never builds vectors for the catalogue. */
export async function prepareCatalogSearchIndex(
  revision: string,
  directory = ENV.designRetrievalDirectory
) {
  if (!directory) return;
  const [{ readCatalogSnapshot }, { readEditorialCatalog }] = await Promise.all(
    [import("./versionedCatalog"), import("./editorialCatalog")]
  );
  const [snapshot, catalog, engine] = await Promise.all([
    readCatalogSnapshot(revision),
    readEditorialCatalog(revision),
    searchEngine(directory),
  ]);
  const cards = snapshot.rows
    .filter(r => ["approved", "draft"].includes(r.design_components.status))
    .map(r => componentCardV1Schema.parse(r.card));
  const documents = searchDocuments(cards, catalog),
    file = searchIndexFile(revision, catalog?.hash ?? null, directory);
  let previous: FamilySearchIndex | undefined;
  try {
    previous = validateSearchIndex(
      JSON.parse(await readFile(file, "utf8")),
      engine.metadata.fingerprint
    );
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  const index = await buildSearchIndex(documents, engine, previous);
  await mkdir(join(resolve(directory), "indexes"), {
    recursive: true,
    mode: 0o700,
  });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(index), { mode: 0o600 });
  await rename(temporary, file);
  return {
    hash: index.hash,
    sources: index.documents.length,
    modelFingerprint: index.modelFingerprint,
  };
}
