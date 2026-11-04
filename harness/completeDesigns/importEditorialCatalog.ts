/** Author a JSON document, verify locally, then publish explicitly. This command
 * changes only the editorial registry; component definitions stay immutable. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { arsenalHash } from "../../shared/arsenalContent";
import { componentCardV1Schema } from "../../shared/componentAssembly";
import {
  canonicalizeEditorialCatalogDocument,
  editorialCatalogDocumentSchema,
  editorialCatalogHash,
  frozenEditorialCatalogSchema,
  type EditorialCatalogDocument,
  type FrozenEditorialCatalog,
} from "../../shared/editorialIntent";
import type { CatalogSnapshot } from "../../server/designCatalog/versionedCatalog";

export interface EditorialCatalogImportOptions {
  catalogRevision: string;
  file: string;
  snapshotFile?: string;
  publish: boolean;
}

export function parseEditorialCatalogImportArgs(args: string[]): EditorialCatalogImportOptions {
  const values = new Map<string, string>();
  let publish = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--publish" && !publish) {
      publish = true;
      continue;
    }
    if (!["--catalog-revision", "--file", "--snapshot"].includes(flag) || values.has(flag))
      throw new Error(`Unknown or duplicate option: ${flag}`);
    const value = args[++index];
    if (!value?.trim() || value.startsWith("--"))
      throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  const catalogRevision = values.get("--catalog-revision") ?? "";
  if (!/^[1-9]\d*$/.test(catalogRevision) || BigInt(catalogRevision) > BigInt("9223372036854775807"))
    throw new Error("--catalog-revision must be a positive bigint revision");
  const file = values.get("--file");
  if (!file) throw new Error("--file is required");
  return { catalogRevision, file, snapshotFile: values.get("--snapshot"), publish };
}

/** A cache envelope proves its own integrity, not that it is the active remote
 * revision. Publication independently checks the server's immutable manifest. */
export function parseEditorialSnapshotEnvelope(value: unknown, catalogRevision: string): CatalogSnapshot {
  if (!value || typeof value !== "object") throw new Error("editorial_snapshot_invalid");
  const envelope = value as { revision?: unknown; hash?: unknown; snapshot?: unknown };
  if (envelope.revision !== catalogRevision) throw new Error("editorial_snapshot_revision_mismatch");
  if (!envelope.snapshot || typeof envelope.snapshot !== "object" ||
    !Array.isArray((envelope.snapshot as CatalogSnapshot).rows))
    throw new Error("editorial_snapshot_invalid");
  if (typeof envelope.hash !== "string" || !/^[a-f0-9]{64}$/.test(envelope.hash) ||
    envelope.hash !== arsenalHash(envelope.snapshot))
    throw new Error("editorial_snapshot_hash_mismatch");
  return envelope.snapshot as CatalogSnapshot;
}

/** Check the supplied revision's real cards, never family names or a fixed seed. */
export function validateEditorialCatalogSources(value: unknown, snapshot: CatalogSnapshot): EditorialCatalogDocument {
  const document = canonicalizeEditorialCatalogDocument(editorialCatalogDocumentSchema.parse(value));
  if (!snapshot || !Array.isArray(snapshot.rows)) throw new Error("editorial_snapshot_invalid");
  const cards = new Map<string, { card: ReturnType<typeof componentCardV1Schema.parse>; status: string }>();
  for (const row of snapshot.rows) {
    const card = componentCardV1Schema.parse(row.card);
    if (card.id !== row.component_id || card.hash !== row.definition_hash ||
      row.design_components?.definition_hash !== card.hash)
      throw new Error("editorial_snapshot_identity_mismatch");
    if (cards.has(card.id)) throw new Error(`editorial_snapshot_duplicate_source:${card.id}`);
    cards.set(card.id, { card, status: row.design_components.status });
  }
  for (const design of document.designs) {
    const source = cards.get(design.sourceId);
    if (!source || source.card.hash !== design.sourceHash)
      throw new Error(`editorial_source_identity_mismatch:${design.sourceId}`);
    if (!source.card.completeDesign || source.card.completeDesign.designGuidance?.carouselVariant)
      throw new Error(`editorial_source_not_original_design:${design.sourceId}`);
    if (source.status !== "approved" && source.status !== "draft")
      throw new Error(`editorial_source_unavailable:${design.sourceId}`);
  }
  return document;
}

export interface EditorialCatalogImportDependencies {
  readDocument(file: string): Promise<unknown>;
  readLocalSnapshot(revision: string, file?: string): Promise<unknown>;
  readRemoteSnapshot(revision: string): Promise<{ snapshot: CatalogSnapshot; hash: string }>;
  publish(revision: string, document: EditorialCatalogDocument): Promise<FrozenEditorialCatalog>;
}

export async function runEditorialCatalogImport(
  options: EditorialCatalogImportOptions,
  dependencies: EditorialCatalogImportDependencies
) {
  // Recheck programmatic callers and fail malformed input before any remote read.
  const checked = parseEditorialCatalogImportArgs([
    "--catalog-revision", options.catalogRevision, "--file", options.file,
    ...(options.snapshotFile ? ["--snapshot", options.snapshotFile] : []),
    ...(options.publish ? ["--publish"] : []),
  ]);
  const candidate = editorialCatalogDocumentSchema.parse(await dependencies.readDocument(checked.file));
  let snapshot: CatalogSnapshot;
  if (checked.publish) {
    // An optional local snapshot is an additional check, never publication authority.
    if (checked.snapshotFile) validateEditorialCatalogSources(candidate,
      parseEditorialSnapshotEnvelope(await dependencies.readLocalSnapshot(checked.catalogRevision, checked.snapshotFile), checked.catalogRevision));
    const remote = await dependencies.readRemoteSnapshot(checked.catalogRevision);
    if (remote.hash !== arsenalHash(remote.snapshot)) throw new Error("editorial_remote_snapshot_hash_mismatch");
    snapshot = remote.snapshot;
  } else {
    snapshot = parseEditorialSnapshotEnvelope(
      await dependencies.readLocalSnapshot(checked.catalogRevision, checked.snapshotFile), checked.catalogRevision);
  }
  const document = validateEditorialCatalogSources(candidate, snapshot);
  const hash = editorialCatalogHash(document);
  const summary = { catalogRevision: checked.catalogRevision, hash, intents: document.intents.length, designs: document.designs.length };
  if (!checked.publish) return { ...summary, mode: "verify-local" as const, published: false, remoteCalls: 0 };
  const stored = frozenEditorialCatalogSchema.parse(await dependencies.publish(checked.catalogRevision, document));
  if (stored.catalogRevision !== checked.catalogRevision || stored.hash !== hash)
    throw new Error("editorial_publication_identity_mismatch");
  return { ...summary, mode: "publish" as const, published: true, editorialRevision: stored.revision };
}

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(path.resolve(file), "utf8"));
const dependencies: EditorialCatalogImportDependencies = {
  readDocument: readJson,
  async readLocalSnapshot(revision, snapshotFile) {
    if (snapshotFile) return readJson(snapshotFile);
    const { ENV } = await import("../../server/_core/env");
    if (!ENV.supabaseUrl) throw new Error("Provide --snapshot or configure SUPABASE_URL to select the project's local cache");
    const file = path.join(process.cwd(), ".postspark-local", "catalog", `${arsenalHash(ENV.supabaseUrl)}-v1-${revision}.json`);
    try { return await readJson(file); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new Error("Local snapshot is absent; provide --snapshot with a {revision,hash,snapshot} cache envelope. No remote calls were made.");
      throw error;
    }
  },
  async readRemoteSnapshot(revision) {
    const { readCatalogManifest, readCatalogSnapshot } = await import("../../server/designCatalog/versionedCatalog");
    const manifest = await readCatalogManifest(revision);
    return { hash: manifest.hash, snapshot: await readCatalogSnapshot(revision) };
  },
  async publish(revision, document) {
    const { publishEditorialCatalog } = await import("../../server/designCatalog/editorialCatalog");
    return publishEditorialCatalog(revision, document);
  },
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseEditorialCatalogImportArgs(process.argv.slice(2));
    console.log(JSON.stringify(await runEditorialCatalogImport(options, dependencies)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
