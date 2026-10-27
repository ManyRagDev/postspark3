import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { arsenalHash } from "@shared/arsenalContent";
import {
  componentDefinitionV1Schema,
  componentCardV1Schema,
} from "@shared/componentAssembly";
import { resolveCompleteDesignOffers } from "@shared/completeDesignOffers";
import { getDb } from "../db";
import { ENV } from "../_core/env";

export type CatalogRow = {
  component_id: string;
  definition_hash: string;
  card: unknown;
  design_components: {
    status: string;
    definition_hash: string;
    source: unknown;
  };
  definition?: unknown;
  assets?: unknown[];
};
export type CatalogSnapshot = { rows: CatalogRow[] };
export type CatalogManifest = {
  revision: string;
  formatVersion: 1;
  hash: string;
  dirty: boolean;
  summary: Record<
    "approved" | "experimental",
    { staticOfferCount: number; carouselOfferCount: number }
  >;
};
const context = new AsyncLocalStorage<{ revision: string }>();
const downloads = new Map<string, Promise<CatalogSnapshot>>();
const memory = new Map<string, CatalogSnapshot>();
const publicationContext = new AsyncLocalStorage<boolean>();
export const versionedCatalogEnabled = () =>
  (ENV.localDemandEnabled || Boolean(context.getStore())) && !publicationContext.getStore();
/** A multi-component import validates staging and publishes only after the entire batch succeeds. */
export async function withCatalogPublication<T>(
  work: () => Promise<T>
): Promise<T> {
  if (publicationContext.getStore() || !ENV.localDemandEnabled) return work();
  const result = await publicationContext.run(true, work);
  await publishCatalog();
  return result;
}
export function withCatalogRevision<T>(revision: string, work: () => T): T {
  return context.run({ revision }, work);
}
export function pinnedCatalogRevision() {
  return context.getStore()?.revision;
}
const projectKey = () => arsenalHash(ENV.supabaseUrl);
export function validateCatalogSnapshot(
  snapshot: CatalogSnapshot,
  full = false
) {
  if (!Array.isArray(snapshot.rows))
    throw new Error("catalog_snapshot_invalid");
  for (const row of snapshot.rows) {
    const c = componentCardV1Schema.parse(row.card);
    if (
      c.id !== row.component_id ||
      c.hash !== row.definition_hash ||
      row.design_components.definition_hash !== c.hash
    )
      throw new Error("catalog_snapshot_identity_mismatch");
    if (full) {
      const d = componentDefinitionV1Schema.parse(row.definition);
      if (
        d.id !== c.id ||
        d.hash !== c.hash ||
        arsenalHash(row.design_components.source) !== arsenalHash(d.source) ||
        arsenalHash(d.completeDesign) !== arsenalHash(c.completeDesign) ||
        arsenalHash(d.roles) !== arsenalHash(c.roles) ||
        arsenalHash(d.aspectRatios) !== arsenalHash(c.aspectRatios)
      )
        throw new Error("catalog_snapshot_identity_mismatch");
      if (
        d.assets.some(
          a =>
            !row.assets?.some(stored => arsenalHash(stored) === arsenalHash(a))
        )
      )
        throw new Error("catalog_snapshot_assets_mismatch");
    }
  }
  return snapshot;
}
export async function readCatalogManifest(): Promise<CatalogManifest> {
  const { data, error } = await getDb().rpc("catalog_manifest");
  if (error) throw error;
  if (!data?.revision || data.formatVersion !== 1)
    throw new Error("catalog_publication_required");
  if (data.dirty) throw new Error("catalog_publication_required");
  return data;
}
export async function readCatalogSnapshot(
  revision?: string
): Promise<CatalogSnapshot> {
  const rev =
    revision ??
    pinnedCatalogRevision() ??
    (await readCatalogManifest()).revision;
  if (!/^\d+$/.test(rev)) throw new Error("catalog_revision_invalid");
  const key = `${projectKey()}-v1-${rev}`;
  if (memory.has(key)) return memory.get(key)!;
  if (downloads.has(key)) return downloads.get(key)!;
  const work = (async () => {
    const directory = join(process.cwd(), ".postspark-local", "catalog"),
      file = join(directory, `${key}.json`);
    try {
      const cached = JSON.parse(await readFile(file, "utf8"));
      if (
        cached.revision === rev &&
        cached.hash === arsenalHash(cached.snapshot)
      )
        return validateCatalogSnapshot(cached.snapshot);
    } catch {
      /* Missing/corrupt/unwritable cache is recoverable. */
    }
    const { data, error } = await getDb()
      .from("catalog_revisions")
      .select("snapshot,content_hash")
      .eq("revision", rev)
      .single();
    if (error) throw error;
    const snapshot = validateCatalogSnapshot(data.snapshot);
    if (arsenalHash(snapshot) !== data.content_hash)
      throw new Error("catalog_snapshot_hash_mismatch");
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(
        temp,
        JSON.stringify({ revision: rev, hash: data.content_hash, snapshot }),
        { mode: 0o600 }
      );
      await rename(temp, file);
    } catch {
      console.warn(
        "[catalog] Cache local indisponível; dados mantidos em memória."
      );
    }
    return snapshot;
  })();
  downloads.set(key, work);
  try {
    const snapshot = await work;
    memory.set(key, snapshot);
    if (memory.size > 3) memory.delete(memory.keys().next().value!);
    return snapshot;
  } finally {
    downloads.delete(key);
  }
}
export async function publishCatalog() {
  const { data, error } = await getDb().rpc("catalog_staged_snapshot");
  if (error) throw error;
  const snapshot = validateCatalogSnapshot({ rows: data.rows }, true);
  const { filterCompleteDesignRows } = await import("./completeDesignStore");
  const summary = {} as CatalogManifest["summary"];
  for (const scope of ["approved", "experimental"] as const) {
    const cards = filterCompleteDesignRows(snapshot.rows, {
      aspectRatio: "4:5",
      postMode: "carousel",
      slideCount: 3,
      text: "",
      experimental: scope === "experimental",
    });
    summary[scope] = {
      staticOfferCount: resolveCompleteDesignOffers(cards, {
        slideCount: 1,
        contentMode: "compose",
      }).length,
      carouselOfferCount: resolveCompleteDesignOffers(cards, {
        slideCount: 3,
        contentMode: "compose",
      }).length,
    };
  }
  const published = await getDb().rpc("catalog_publish", {
    p_source_revision: data.sourceRevision,
    p_rows: snapshot.rows,
    p_summary: summary,
    p_hash: arsenalHash({
      rows: snapshot.rows.map(({ definition, assets, ...row }) => row),
    }),
  });
  if (published.error) throw published.error;
  return String(published.data);
}
export async function publishCatalogIfEnabled() {
  if (versionedCatalogEnabled()) await publishCatalog();
}

/** Definitions are fetched only after selection, immutable and shared across requests. */
const definitionDownloads = new Map<string, Promise<unknown>>();
export async function readCatalogDefinition(
  revision: string,
  id: string,
  hash: string
) {
  if (
    !/^\d+$/.test(revision) ||
    !/^[-a-f0-9]{36}$/.test(id) ||
    !/^[-a-f0-9]{64}$/.test(hash)
  )
    throw new Error("catalog_definition_identity_invalid");
  const key = `${projectKey()}-${revision}-${id}-${hash}`;
  const existing = definitionDownloads.get(key);
  if (existing) return existing;
  const work = (async () => {
    const directory = join(
        process.cwd(),
        ".postspark-local",
        "catalog",
        "definitions"
      ),
      file = join(directory, `${key}.json`);
    const check = (row: CatalogRow) => {
      validateCatalogSnapshot({ rows: [row] }, true);
      if (row.component_id !== id || row.definition_hash !== hash)
        throw new Error("catalog_definition_identity_mismatch");
      return componentDefinitionV1Schema.parse(row.definition);
    };
    try {
      const cached = JSON.parse(await readFile(file, "utf8"));
      if (arsenalHash(cached.row) === cached.checksum) return check(cached.row);
    } catch {}
    const { data, error } = await getDb()
      .from("catalog_revision_definitions")
      .select("payload")
      .eq("revision", revision)
      .eq("component_id", id)
      .eq("definition_hash", hash)
      .single();
    if (error) throw error;
    const result = check(data.payload);
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(
        temp,
        JSON.stringify({
          row: data.payload,
          checksum: arsenalHash(data.payload),
        }),
        { mode: 0o600 }
      );
      await rename(temp, file);
    } catch {
      console.warn("[catalog] Definição usada sem cache de disco.");
    }
    return result;
  })();
  definitionDownloads.set(key, work);
  try {
    return await work;
  } finally {
    definitionDownloads.delete(key);
  }
}
