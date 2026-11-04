import { arsenalHash } from "@shared/arsenalContent";
import { getDb } from "../db";
import type { CatalogRow } from "./versionedCatalog";

/** A source version has at most one immutable release. No release means the
 * first import must use the full snapshot protocol; read errors never fall back. */
export async function readCatalogStagingBase(sourceRevision: string) {
  const { data, error } = await getDb()
    .from("catalog_revisions")
    .select("revision,source_revision,content_hash")
    .eq("source_revision", sourceRevision)
    .abortSignal(AbortSignal.timeout(12_000))
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (
    !/^[1-9]\d*$/.test(String(data.revision)) ||
    String(data.source_revision) !== sourceRevision ||
    !/^[a-f0-9]{64}$/.test(data.content_hash)
  ) throw new Error("catalog_staging_base_invalid");
  return { revision: String(data.revision), hash: data.content_hash as string };
}

/** Full definitions/assets are immutable at a revision. Matching card, identity
 * and publication metadata can reuse its stored row; SQL still compares that
 * entire reconstructed row with the current canonical definition and assets. */
export function catalogStageDeltaRows(rows: CatalogRow[], baseRows: CatalogRow[]) {
  const base = new Map(baseRows.map(row => [row.component_id, arsenalHash(row)]));
  const ids = new Set(rows.map(row => row.component_id));
  if (baseRows.some(row => !ids.has(row.component_id)))
    throw new Error("catalog_staging_base_mismatch");
  return rows.filter(({ definition, assets, ...row }) =>
    base.get(row.component_id) !== arsenalHash(row)
  );
}
