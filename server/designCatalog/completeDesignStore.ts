import {readCatalogSnapshot,versionedCatalogEnabled,readCatalogDefinition,pinnedCatalogRevision,readCatalogManifest} from "./versionedCatalog";
import { arsenalHash } from "@shared/arsenalContent";
import { GenerationFailureError } from "@shared/generationFailure";
import { hydrateComponents } from "./componentStore";
import {
  normalizeDesignColor,
  normalizeDesignFont,
} from "../../shared/completeDesigns";
import {
  componentCardV1Schema,
  componentDefinitionV1Schema,
  componentSourceV1Schema,
  type ComponentCardV1,
} from "../../shared/componentAssembly";
import { getDb } from "../db";

/** Read compact cards and source identity only. Whole definitions/assets are hydrated after selection. */
export async function retrieveCompleteDesignCards(input: {
  aspectRatio: string;
  postMode: "static" | "carousel";
  text: string;
  styleText?: string;
  brandColors?: string[];
  brandFonts?: string[];
  slideCount: number;
  experimental: boolean;
}): Promise<ComponentCardV1[]> {
  if(versionedCatalogEnabled())return filterCompleteDesignRows((await readCatalogSnapshot()).rows,input);
  const signal=AbortSignal.timeout(8000),rows:any[]=[];
  for (let offset = 0; ; offset += 100) {
    const result = await getDb()
      .from("design_component_search_documents")
      .select(
        "component_id,definition_hash,card,design_components!inner(status,definition_hash,source:definition->source)"
      )
      .eq("card->>kind", "content")
      .not("card->completeDesign", "is", null)
      .in(
        "design_components.status",
        input.experimental ? ["draft", "approved", "archived"] : ["approved", "archived"]
      )
      .order("component_id")
      .range(offset, offset + 99)
      .abortSignal(signal);
    if (result.error) throw result.error;
    rows.push(...(result.data??[]));
    if ((result.data?.length ?? 0) < 100) break;
  }
  return filterCompleteDesignRows(rows,input);
}

export function filterCompleteDesignRows(rows:any[],input:{
  aspectRatio: string;
  postMode: "static" | "carousel";
  text: string;
  styleText?: string;
  brandColors?: string[];
  brandFonts?: string[];
  slideCount: number;
  experimental: boolean;
}):ComponentCardV1[]{
 const cards:ComponentCardV1[]=[],statuses=new Map<string,string>(),revisions=new Map<string,{revision:number;cards:ComponentCardV1[]}>();
    for (const row of rows) {
      const status=(Array.isArray(row.design_components)?row.design_components[0]:row.design_components)?.status;
      if(!["approved","archived",...(input.experimental?["draft"]:[])].includes(status))continue;
      const card = componentCardV1Schema.parse(row.card);
      if (
        card.id !== row.component_id ||
        card.hash !== row.definition_hash ||
        !card.completeDesign
      )
        throw new Error("complete_design_index_mismatch");
      const joined = Array.isArray(row.design_components)
        ? row.design_components[0]
        : row.design_components;
      if (joined?.definition_hash !== card.hash)
        throw new Error("complete_design_index_mismatch");
      statuses.set(card.id, joined?.status);
      const source = componentSourceV1Schema.parse(joined?.source);
      const identity = JSON.stringify([
        source.kind,
        source.kind === "recipe" ? source.referenceId : source.versionId,
        source.variantKey,
      ]);
      const previous = revisions.get(identity),
        revision = card.completeDesign.authorshipRevision ?? 0;
      if (!previous || revision > previous.revision)
        revisions.set(identity, { revision, cards: [card] });
      else if (revision === previous.revision) previous.cards.push(card);
    }
  // Select the current authored revision before eligibility. An invalid or incompatible
  // new revision must not revive a stale capability claim. Drafts can supersede only
  // inside the experimental query above; approved-only selection never sees them.
  for (const current of Array.from(revisions.values())) {
    if (new Set(current.cards.map(card => `${card.id}:${card.hash}`)).size > 1)
      throw new Error("complete_design_authorship_revision_ambiguous");
    cards.push(current.cards[0]);
  }
  const compatible = cards.filter(
    c =>
      statuses.get(c.id) !== "archived" &&
      (input.experimental || statuses.get(c.id) === "approved") &&
      c.completeDesign?.baselineVerified === true &&
      c.aspectRatios.includes(
        input.aspectRatio as ComponentCardV1["aspectRatios"][number]
      ) &&
      (input.brandColors ?? []).every(color =>
        c.completeDesign?.colors?.some(
          stored => normalizeDesignColor(stored) === normalizeDesignColor(color)
        )
      ) &&
      (input.brandFonts ?? []).every(font =>
        [...c.fontFamilies, ...(c.sourceFontFamilies ?? [])].some(
          stored => normalizeDesignFont(stored) === normalizeDesignFont(font)
        )
      )
  );
  // Completeness is resolved by exact source/hash/mode in completeDesignOffers.
  // Keep children for that resolver; static never receives a derived variant.
  return compatible.filter(c => input.postMode !== "static" ||
    (!c.completeDesign?.designGuidance?.carouselVariant && c.roles.includes("static")))
    .sort((a,b) => a.id.localeCompare(b.id));
}

/** Selected definitions must still own their exact verified asset manifests.
 * This is a read gate; the commit keeps its independent transactional check. */
export async function hydrateCompleteDesignComponents(ids:string[],experimental=false) {
  if(versionedCatalogEnabled()) {
    const {rows}=await readCatalogSnapshot();
    const revision=pinnedCatalogRevision()??(await readCatalogManifest()).revision;
    const definitions=await Promise.all(ids.map(async id=>{
      const row=rows.find(r=>r.component_id===id);
      if(!row||!(row.design_components.status==='approved'||experimental&&row.design_components.status==='draft')) throw new GenerationFailureError('catalog_component_ineligible','catalog',false);
      return await readCatalogDefinition(revision,id,row.definition_hash) as ReturnType<typeof componentDefinitionV1Schema.parse>;
    }));
    return definitions;
  }
  let definitions: Awaited<ReturnType<typeof hydrateComponents>>;
  try { definitions=await hydrateComponents(ids,experimental); }
  catch(error) { if(error instanceof Error && ["Componente selecionado indisponível","component_store_hash_mismatch"].includes(error.message)) throw new GenerationFailureError("catalog_component_ineligible","catalog",false); throw error; }
  const assets=Array.from(new Map(definitions.flatMap(d=>d.assets.map(a=>[a.id,a] as const))).values());
  if(!assets.length)return definitions;
  const [links,stored]=await Promise.all([
    getDb().from("design_component_assets").select("component_id,asset_id").in("component_id",ids).abortSignal(AbortSignal.timeout(8000)),
    getDb().from("design_catalog_assets").select("id,manifest").in("id",assets.map(a=>a.id)).abortSignal(AbortSignal.timeout(8000)),
  ]);
  if(links.error)throw links.error;if(stored.error)throw stored.error;
  if(definitions.some(d=>d.assets.some(a=>!links.data?.some((row:{component_id:string;asset_id:string})=>row.component_id===d.id&&row.asset_id===a.id)||!stored.data?.some((row:{id:string;manifest:unknown})=>row.id===a.id&&arsenalHash(row.manifest)===arsenalHash(a)))))
    throw new GenerationFailureError("catalog_component_ineligible","catalog",false);
  return definitions;
}
