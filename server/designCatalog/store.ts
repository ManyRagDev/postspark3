import { createHash, randomUUID } from "node:crypto";
import {
  catalogBlueprintSchema,
  type CatalogBlueprint,
  type CatalogEntry,
} from "@shared/designCatalog";
import { getDb } from "../db";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const contentHash = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
export function catalogError(error: any): Error {
  const code = String(error?.code ?? "unknown");
  return new Error(
    ["42P01", "PGRST205", "PGRST202"].includes(code)
      ? "Catálogo indisponível: aplique a migration 0018_design_catalog.sql no Supabase."
      : `Falha no catálogo (${code}).`
  );
}
function rowEntry(row: any): CatalogEntry {
  const definition = catalogBlueprintSchema.parse(row.definition);
  if (contentHash(definition) !== row.content_hash)
    throw new Error("catalog_hash_mismatch");
  return {
    id: row.id,
    blueprintId: row.blueprint_id,
    version: row.version,
    status: row.status,
    contentHash: row.content_hash,
    definition,
    createdAt: row.created_at,
  };
}
export async function listCatalog(
  approvedOnly = false,
  offset = 0
): Promise<CatalogEntry[]> {
  let q = getDb()
    .from("design_catalog_versions")
    .select("*")
    .eq("definition->>schemaVersion", "1")
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + 199);
  if (approvedOnly) q = q.eq("status", "approved");
  const { data, error } = await q.abortSignal(
    AbortSignal.timeout(approvedOnly ? 2500 : 8000)
  );
  if (error) throw catalogError(error);
  return (data ?? []).map(rowEntry);
}
export async function getCatalogVersion(id: string): Promise<CatalogEntry> {
  const { data, error } = await getDb()
    .from("design_catalog_versions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw catalogError(error);
  return rowEntry(data);
}
export async function saveCatalogDraft(
  definition: CatalogBlueprint,
  actor: string,
  blueprintId?: string
) {
  const traceId = randomUUID();
  const checked = catalogBlueprintSchema.parse(definition);
  const { data, error } = await getDb().rpc("design_catalog_create", {
    p_id: randomUUID(),
    p_blueprint_id: blueprintId ?? randomUUID(),
    p_hash: contentHash(checked),
    p_definition: checked,
    p_pieces: checked.pieces.map(p => ({
      key: p.key,
      hash: contentHash(p),
      definition: p,
    })),
    p_actor: actor,
    p_trace: traceId,
  });
  if (error) throw catalogError(error);
  return { entry: await getCatalogVersion(data), traceId };
}
export async function changeCatalogStatus(
  id: string,
  status: "approved" | "archived",
  actor: string
) {
  // Parse the exact stored version before making it eligible for generation.
  await getCatalogVersion(id);
  const traceId = randomUUID();
  const { error } = await getDb().rpc("design_catalog_status", {
    p_id: id,
    p_status: status,
    p_actor: actor,
    p_trace: traceId,
  });
  if (error) throw catalogError(error);
  return { traceId };
}
