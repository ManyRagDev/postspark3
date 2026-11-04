import { getDb } from "../db";
import type { CatalogRow } from "./versionedCatalog";

const pageSize = 25;
const projection =
  "id,definition_hash,definition,status,design_component_search_documents(card),design_component_assets(design_catalog_assets(manifest))";

type ReadResult<T> = { data: T | null; error: unknown; status?: number };
function transientReadFailure(error: unknown, status?: number): boolean {
  // Authorization and other client errors are definitive, even if a response
  // also carries a misleading transient-looking message.
  if (status !== undefined && status >= 400 && status < 500) return false;
  if (status !== undefined && status >= 500 && status < 600) return true;
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; name?: string; message?: string };
  return value.code === "PGRST002" || value.name === "TimeoutError" ||
    /\b(?:TimeoutError|fetch failed|failed to fetch)\b/i.test(value.message ?? "");
}

function one(value: any): any {
  if (!Array.isArray(value)) return value;
  if (value.length > 1) throw new Error("catalog_snapshot_relation_invalid");
  return value[0] ?? null;
}

/** Administrative staging only. Bound each response instead of aggregating the
 * full catalog into one database JSONB value. Monotonic source revisions reject
 * a mixed read; catalog_stage checks the same revision again under its lock. */
export async function readCatalogStagingSource(): Promise<{
  sourceRevision: string;
  rows: CatalogRow[];
}> {
  const db = getDb();
  let retriesRemaining = 4;
  const read = async <T>(query: (signal: AbortSignal) => PromiseLike<ReadResult<T>>): Promise<ReadResult<T>> => {
    // One retry per GET, shared across both bookends and every page. A new
    // signal gives that retry its own bounded deadline; writes never use this.
    for (let attempt = 0; ; attempt++) {
      let failure: unknown;
      let status: number | undefined;
      try {
        const result = await query(AbortSignal.timeout(12_000));
        if (!result.error) return result;
        failure = result.error;
        status = result.status;
      } catch (error) { failure = error; }
      if (attempt > 0 || retriesRemaining === 0 || !transientReadFailure(failure, status))
        throw failure;
      retriesRemaining--;
    }
  };
  const sourceRevision = async () => {
    const result = await read<{ source_revision: string | number }>(signal => db
      .from("catalog_state")
      .select("source_revision")
      .eq("id", true)
      .abortSignal(signal)
      .single());
    const revision = String(result.data?.source_revision);
    if (!/^[1-9]\d*$/.test(revision))
      throw new Error("catalog_source_revision_invalid");
    return revision;
  };
  const before = await sourceRevision();
  const rows: CatalogRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const result = await read<any[]>(signal => {
      let query = db
        .from("design_components")
        .select(projection)
        .eq("kind", "content")
        .order("id", { ascending: true })
        .limit(pageSize);
      if (cursor) query = query.gt("id", cursor);
      return query.abortSignal(signal);
    });
    const page = result.data ?? [];
    for (const entry of page) {
      if (typeof entry.id !== "string" || (cursor && entry.id <= cursor))
        throw new Error("catalog_snapshot_page_invalid");
      cursor = entry.id;
      // Match catalog_staged_snapshot's content/completeDesign predicate.
      if (entry.definition?.completeDesign == null) continue;
      const card = one(entry.design_component_search_documents)?.card ?? null;
      const assets = (entry.design_component_assets ?? []).map((link: any) => {
        const manifest = one(link.design_catalog_assets)?.manifest;
        if (!manifest) throw new Error("catalog_snapshot_assets_mismatch");
        return manifest;
      });
      assets.sort((a: any, b: any) => a.id.localeCompare(b.id));
      rows.push({
        component_id: entry.id,
        definition_hash: entry.definition_hash,
        card,
        definition: entry.definition,
        assets,
        design_components: {
          status: entry.status,
          definition_hash: entry.definition_hash,
          source: entry.definition.source,
        },
      });
    }
    if (page.length < pageSize) break;
  }
  if ((await sourceRevision()) !== before)
    throw new Error("catalog_publication_conflict");
  return { sourceRevision: before, rows };
}
