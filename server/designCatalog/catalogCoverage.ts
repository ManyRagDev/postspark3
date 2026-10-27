import {readCatalogSnapshot,versionedCatalogEnabled} from "./versionedCatalog";
import { arsenalHash } from "@shared/arsenalContent";
import { componentCardV1Schema, componentSourceV1Schema, type ComponentCardV1 } from "@shared/componentAssembly";
import { normalizeDesignColor, normalizeDesignFont } from "@shared/completeDesigns";
import { catalogCoverageSchema, sealElectionReceipt, type CatalogCoverage } from "@shared/designElection";
import { getDb } from "../db";
import type { retrieveCompleteDesignCards } from "./completeDesignStore";

export type CatalogRequest = Parameters<typeof retrieveCompleteDesignCards>[0];
export interface CoveredCatalog { version: 1; cards: ComponentCardV1[]; coverage: CatalogCoverage; selectionProfileVersion?: 2 }
type Registered = {
  id: string; definition_hash: string; status: string; aspect_ratios: string[]; roles: string[];
  source: unknown;
  design: NonNullable<ComponentCardV1["completeDesign"]>;
};
type Indexed = { component_id: string; definition_hash: string; card: unknown };
const scope = (input: CatalogRequest) => ({
  experimental: input.experimental, aspectRatio: input.aspectRatio, postMode: input.postMode,
  brandColors: input.brandColors ?? [], brandFonts: input.brandFonts ?? [],
});
export const catalogScopeHash = (input: CatalogRequest) => arsenalHash(scope(input));

/** All registered complete designs, including excluded drafts/archives. No scene or asset bytes. */
async function readInventory(signal: AbortSignal):Promise<{registered:Registered[];indexed:Indexed[]}> {
  if(versionedCatalogEnabled()) {
    const {rows}=await readCatalogSnapshot();
    return {registered:rows.map(r=>{const d=componentCardV1Schema.parse(r.card);return {id:r.component_id,definition_hash:r.definition_hash,status:r.design_components.status,aspect_ratios:d.aspectRatios as string[],roles:d.roles as string[],source:r.design_components.source,design:d.completeDesign!};}),indexed:rows.map(r=>({component_id:r.component_id,definition_hash:r.definition_hash,card:r.card}))};
  }
  const registered: Registered[] = [], indexed: Indexed[] = [];
  for (let offset = 0; ; offset += 100) {
    const r = await getDb().from("design_components")
      .select("id,definition_hash,status,aspect_ratios,roles,source:definition->source,design:definition->completeDesign")
      .eq("kind", "content").not("definition->completeDesign", "is", null)
      .order("id").range(offset, offset + 99).abortSignal(signal);
    if (r.error) throw r.error;
    registered.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 100) break;
  }
  for (let offset = 0; ; offset += 100) {
    const r = await getDb().from("design_component_search_documents")
      .select("component_id,definition_hash,card")
      .eq("card->>kind", "content").not("card->completeDesign", "is", null)
      .order("component_id").range(offset, offset + 99).abortSignal(signal);
    if (r.error) throw r.error;
    indexed.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 100) break;
  }
  return { registered, indexed };
}

/** Pure reconciliation also used by controlled tests; invalid data is never a suitability veto. */
export function reconcileCatalogCoverage(input: CatalogRequest, inventory: Awaited<ReturnType<typeof readInventory>>, stable = true): CoveredCatalog {
  const cards: ComponentCardV1[] = [], issues: CatalogCoverage["issues"] = [];
  if (!stable) issues.push({ code: "catalog_changed_during_read", id: null });
  const indexed = new Map<string, Indexed>();
  for (const row of inventory.indexed) {
    if (indexed.has(row.component_id)) issues.push({ code: "duplicate_index_identity", id: row.component_id });
    indexed.set(row.component_id, row);
  }
  const groups = new Map<string, Registered[]>();
  const identities = new Map<string, string>();
  const seen = new Set<string>();
  for (const row of inventory.registered) {
    if (seen.has(row.id)) issues.push({ code: "duplicate_registered_identity", id: row.id });
    seen.add(row.id);
    const source = componentSourceV1Schema.parse(row.source);
    const key = JSON.stringify([source.kind, source.kind === "recipe" ? source.referenceId : source.versionId, source.variantKey]);
    identities.set(row.id, key);
    // A draft cannot supersede an approved revision outside experimental mode.
    if (input.experimental || row.status !== "draft") groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const current = new Set<string>();
  for (const members of Array.from(groups.values())) {
    const revision = Math.max(...members.map(r => r.design.authorshipRevision ?? 0));
    const latest = members.filter(r => (r.design.authorshipRevision ?? 0) === revision);
    if (latest.length !== 1) issues.push({ code: "authorship_revision_ambiguous", id: latest[0]?.id ?? null });
    latest.forEach(r => current.add(r.id));
  }
  const entries: CatalogCoverage["entries"] = inventory.registered.map(row => {
    const indexedRow = indexed.get(row.id);
    const parsed = indexedRow ? componentCardV1Schema.safeParse(indexedRow.card) : null;
    const card = parsed?.success ? parsed.data : null;
    const indexState = !indexedRow ? "missing" as const : !card || card.id !== row.id || card.hash !== row.definition_hash || indexedRow.definition_hash !== row.definition_hash || !card.completeDesign ||
      arsenalHash(card.completeDesign) !== arsenalHash(row.design) ||
      arsenalHash([...card.aspectRatios].sort()) !== arsenalHash([...row.aspect_ratios].sort()) ||
      arsenalHash([...card.roles].sort()) !== arsenalHash([...row.roles].sort()) ? "mismatch" as const : "present" as const;
    const reasons: string[] = [];
    if (row.status === "draft" && !input.experimental) reasons.push("draft_not_enabled");
    else if (!current.has(row.id)) reasons.push("superseded_authorship");
    if (row.status === "archived") reasons.push("archived");
    if (!['draft', 'approved', 'archived'].includes(row.status)) reasons.push("status_not_eligible");
    if (row.design.baselineVerified !== true) reasons.push("baseline_not_verified");
    if (!row.aspect_ratios.includes(input.aspectRatio)) reasons.push("aspect_ratio_mismatch");
    if ((input.brandColors ?? []).some(color => !row.design.colors?.some(c => normalizeDesignColor(c) === normalizeDesignColor(color)))) reasons.push("brand_color_mismatch");
    if (input.postMode === "static" && (row.design.designGuidance?.carouselVariant || !row.roles.includes("static"))) reasons.push("not_a_static_source");
    let disposition: CatalogCoverage["entries"][number]["disposition"] = reasons.length ? "excluded" : "eligible_card";
    if (!reasons.length && indexState !== "present") {
      disposition = "blocked";
      reasons.push(indexState === "missing" ? "index_missing" : "index_identity_mismatch");
      issues.push({ code: reasons[0], id: row.id });
    } else if (!reasons.length && card) {
      if ((input.brandFonts ?? []).some(font => ![...card.fontFamilies, ...(card.sourceFontFamilies ?? [])].some(f => normalizeDesignFont(f) === normalizeDesignFont(font)))) {
        disposition = "excluded"; reasons.push("brand_font_mismatch");
      } else cards.push(card);
    }
    return {
      id: row.id, hash: row.definition_hash, label: card?.label ?? row.design.family,
      family: row.design.family, status: row.status, authorshipRevision: row.design.authorshipRevision ?? 0,
      sourceKey: identities.get(row.id)!, isVariant: Boolean(row.design.designGuidance?.carouselVariant),
      indexState, disposition, reasons,
    };
  });
  for (const row of inventory.indexed) if (!seen.has(row.component_id)) issues.push({ code: "index_without_registered_design", id: row.component_id });
  const coverage = catalogCoverageSchema.parse(sealElectionReceipt({
    version: 1 as const, capturedAt: new Date().toISOString(),
    consistency: stable ? "stable_double_read" as const : "changed_during_read" as const,
    scopeHash: catalogScopeHash(input), inventoryHash: arsenalHash(inventory),
    entries, indexed: inventory.indexed.map(r => ({ id: r.component_id, hash: r.definition_hash, cardHash: arsenalHash(r.card) })), issues,
  }));
  return { version: 1, cards: cards.sort((a,b) => a.id.localeCompare(b.id)), coverage };
}

/** Optimistic stability check, not a transactional PostgreSQL snapshot. Changes fail before AI. */
export async function retrieveCoveredCatalog(input: CatalogRequest): Promise<CoveredCatalog> {
  const signal = AbortSignal.timeout(8000);
  const first = await readInventory(signal);
  const second = await readInventory(signal);
  return reconcileCatalogCoverage(input, first, arsenalHash(first) === arsenalHash(second));
}
