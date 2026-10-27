import {publishCatalogIfEnabled} from "./versionedCatalog";
import { componentDefinitionV1Schema, compactComponentCard, componentCardV1Schema, componentKinds, type ComponentDefinitionV1, type ComponentCardV1 } from "../../shared/componentAssembly";
import type { StudioPreferences } from "../../shared/studioPreferences";
import { arsenalHash } from "../../shared/arsenalContent";
import { getDb } from "../db";
import { z } from "zod";

export const COMPONENT_DESCRIPTOR_VERSION = "component-structural-v1";
/** Explicit normalized geometric features; no embeddings, training or approximate index. */
export function describeComponent(c: ComponentDefinitionV1) {
  const v=c.fragment,W=v.artboard.width,H=v.artboard.height,items=v.instances;
  const text=items.filter(i=>c.pieces[i.pieceHash].kind==="text"),media=items.filter(i=>c.pieces[i.pieceHash].kind==="media");
  const mean=(xs:number[])=>xs.reduce((s,n)=>s+n,0)/Math.max(1,xs.length);
  const features=[W/H/2,text.length/20,media.length/4,v.groups.length/10,v.bindings.length/20,v.relations.length/40,
    mean(text.map(i=>i.x/W)),mean(text.map(i=>i.y/H)),mean(text.map(i=>i.width/W)),mean(text.map(i=>i.height/H)),
    mean(text.map(i=>c.pieces[i.pieceHash].fontSize/W*5)),mean(text.map(i=>Math.abs(Math.sin(i.rotation*Math.PI/180)))),
    items.filter(i=>c.pieces[i.pieceHash].kind==="rect").length/20,items.filter(i=>c.pieces[i.pieceHash].kind==="polygon").length/20,
    items.filter(i=>c.pieces[i.pieceHash].kind==="line").length/20,mean(text.map(i=>Number(c.pieces[i.pieceHash].align==="center"))),
    ...[text,media].flatMap(set=>Array.from({length:16},(_,cell)=>{
      const x=(cell%4+.5)*W/4,y=(Math.floor(cell/4)+.5)*H/4;
      return Number(set.some(i=>x>=i.x&&x<=i.x+i.width&&y>=i.y&&y<=i.y+i.height));
    }))];
  const structure=features.map(n=>Number(Math.max(0,Math.min(1,n)).toFixed(6)));
  return {version:COMPONENT_DESCRIPTOR_VERSION,structure,algorithm:"exact-normalized-l1-v1"};
}
function sourceKey(c:ComponentDefinitionV1) {
  return c.source.kind==="recipe"?`recipe:${c.source.referenceId}`:`catalog:${c.source.versionId}:${c.source.variantKey}`;
}
function requestsRestrainedStyle(text:string) {
  return /\b(minimalis\w*|discret\w*|sobri(?:[oa]s?|edade)|clean|sem (?:ornamentos?|enfeites|decoracao))\b/i.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g,""));
}
function requestsExpressiveStyle(text:string) {
  if(requestsRestrainedStyle(text))return false;
  return /\b(express\w*|criativ\w*|ousad\w*|editorial|impactante|vibrante)\b/i.test(text);
}
export async function prepareComponentDraft(value:unknown,actor:string) {
  const definition=componentDefinitionV1Schema.parse(value),db=getDb();
  if(definition.assets.some(a=>a.kind!=="catalog"))throw new Error("Componentes usam assets catalog verificados");
  if(definition.assets.length){
    const found=await db.from("design_catalog_assets").select("id,manifest").in("id",definition.assets.map(a=>a.id));
    if(found.error||definition.assets.some(a=>!found.data?.some((r:any)=>r.id===a.id&&arsenalHash(r.manifest)===arsenalHash(a))))throw new Error("Assets não verificados antes do import");
  }
  const stored=await db.from("design_components").upsert({id:definition.id,definition_hash:definition.hash,definition,status:"draft",kind:definition.kind,source_key:sourceKey(definition),roles:definition.roles,densities:definition.densities,aspect_ratios:definition.aspectRatios,actor_id:actor},{onConflict:"id",ignoreDuplicates:true}).select("id");
  if(stored.error)throw stored.error;
  const actual=await db.from("design_components").select("definition_hash,status").eq("id",definition.id).single();
  if(actual.error||actual.data.definition_hash!==definition.hash)throw new Error("Componente existente diverge do pacote");
  if(actual.data.status!=="draft"){await publishCatalogIfEnabled();return {id:definition.id,hash:definition.hash,idempotent:true};}
  if(definition.assets.length){
    const links=await db.from("design_component_assets").upsert(definition.assets.map(a=>({component_id:definition.id,asset_id:a.id})),{onConflict:"component_id,asset_id",ignoreDuplicates:true});if(links.error)throw links.error;
  }
  const descriptor=describeComponent(definition),card=compactComponentCard(definition);
  const index=await db.from("design_component_search_documents").upsert({component_id:definition.id,definition_hash:definition.hash,descriptor_version:COMPONENT_DESCRIPTOR_VERSION,projected:JSON.stringify(descriptor.structure),descriptor,card},{onConflict:"component_id",ignoreDuplicates:true});if(index.error)throw index.error;
  const previous=await db.from("design_component_evidence").select("id").eq("component_id",definition.id).eq("definition_hash",definition.hash).eq("kind","technical").limit(1);if(previous.error)throw previous.error;
  if(!previous.data?.length){const evidence=await db.from("design_component_evidence").insert({component_id:definition.id,definition_hash:definition.hash,kind:"technical",decision:"verified",actor_id:actor,metrics:{descriptorVersion:COMPONENT_DESCRIPTOR_VERSION,piecesVerified:true,assetsVerified:true,graphVerified:true}});if(evidence.error)throw evidence.error;}
  await publishCatalogIfEnabled();
  return {id:definition.id,hash:definition.hash,idempotent:!stored.data?.length};
}
export async function hydrateComponents(ids:string[],experimental=false):Promise<ComponentDefinitionV1[]> {
  if(!ids.length)return[];
  let q=getDb().from("design_components").select("id,definition_hash,definition").in("id",Array.from(new Set(ids)));
  q=experimental?q.in("status",["approved","draft"]):q.eq("status","approved");
  const r=await q.abortSignal(AbortSignal.timeout(8000));if(r.error)throw r.error;
  const definitions=(r.data??[]).map((row:any)=>{const c=componentDefinitionV1Schema.parse(row.definition);if(c.id!==row.id||c.hash!==row.definition_hash)throw new Error("component_store_hash_mismatch");return c;});
  if(definitions.length!==new Set(ids).size)throw new Error("Componente selecionado indisponível");
  return ids.map(id=>definitions.find((c:ComponentDefinitionV1)=>c.id===id)!);
}
type ComponentQuery={preferences?:StudioPreferences;brandFonts?:string[];aspectRatio:string;postMode:"static"|"carousel";text:string;styleText?:string;slideCount:number;experimental:boolean};
/** Query descriptors express desired geometry on the same 48 documented axes. */
export function componentQueryDescriptor(input:ComponentQuery,kind:string,role:string) {
  const chars=input.text.trim().length/Math.max(1,input.postMode==="carousel"?input.slideCount:1);
  const quiet=role==="development"||role==="closing",fields=chars>220?3:2;
  const expressive=requestsExpressiveStyle(input.styleText??input.text);
  const media=kind==="media"?1:0,split=/\b(compar\w*|versus|lado a lado|split)\b/i.test(input.text);
  const aspect={"1:1":1,"4:5":.8,"5:6":5/6,"9:16":9/16}[input.aspectRatio]??1;
  const x=split?.15:expressive?.16:.08,y=role==="closing"?.3:.12,w=split?.4:expressive?.68:.84,h=quiet?.3:expressive?.32:.23;
  const text=kind==="content"||kind==="typography";
  const geometry=[aspect/2,text?fields/20:0,media/4,kind==="content"?.2:.1,text?fields/20:media/20,text?fields/40:0,
    text?x:0,text?y:0,text?w:0,text?h:0,text?(quiet?.13:expressive?.34:.25):0,expressive?.18:quiet?0:.03,kind==="background"?.05:0,0,0,0];
  const grids=["text","media"].flatMap(type=>Array.from({length:16},(_,cell)=>{
    const cx=(cell%4+.5)/4,cy=(Math.floor(cell/4)+.5)/4;
    if(type==="media")return Number(media>0&&cx>.1&&cx<.9&&cy>.2&&cy<.8);
    return Number(text&&cx>=x&&cx<=x+w&&cy>=y&&cy<=y+h);
  }));
  return {version:COMPONENT_DESCRIPTOR_VERSION,structure:geometry.concat(grids).map(n=>Number(Math.max(0,Math.min(1,n)).toFixed(6))),basis:{role,kind,charsPerSlide:Math.ceil(chars),split,expressive}};
}
export async function retrieveComponentCardsForGeneration(input:ComponentQuery):Promise<ComponentCardV1[]> {
  const roles=input.postMode==="static"?["static"]:["cover","development","closing",...(/\b(lista|passos|dicas|itens)\b/i.test(input.text)?["list"]:[]),...(/\b(compar\w*|versus|lado a lado)\b/i.test(input.text)?["comparison"]:[]),"example"];
  const queries=componentKinds.flatMap(kind=>(kind==="content"?roles:[input.postMode==="static"?"static":"cover"]).map(role=>({kind,role})));
  const searched=await Promise.all(queries.map(async({kind,role})=>{
    const descriptor=componentQueryDescriptor(input,kind,role);
    type SearchRow={component_id:string;definition_hash:string;card:ComponentCardV1;source_key?:string};
    const search=async(density:string|null):Promise<SearchRow[]>=>{
      const preferences=input.preferences?.enabled?input.preferences:undefined;
      const r=await getDb().rpc(preferences?"design_component_search_v5":"design_component_search_v4",{...(preferences?{p_language:preferences.language,p_intensity:preferences.intensity==="auto"?null:preferences.intensity}:{}),p_kind:kind,p_aspect:input.aspectRatio,p_roles:[role],p_density:density,p_experimental:input.experimental,p_anchor:JSON.stringify(descriptor.structure),p_limit:5,p_fonts:kind==="typography"&&input.brandFonts?.length?input.brandFonts:null}).abortSignal(AbortSignal.timeout(8000));
      if(r.error)throw r.error;
      return r.data??[];
    };
    if(kind!=="content")return search(null);
    const preferAuthored=(!input.preferences?.enabled||input.preferences.intensity==="auto"||input.preferences.intensity==="expressive")&&input.preferences?.language!=="restrained"&&!requestsRestrainedStyle(input.styleText??input.text)&&["static","cover","development","closing","example"].includes(role);
    // Query authored candidates directly so expressive designs are not hidden by the initial rank.
    const preparedCovers=async():Promise<SearchRow[]>=>{
      if(!preferAuthored || !["static","cover"].includes(role))return [];
      // Authored assembly covers carry usable headline/body/CTA regions. A low
      // structural distance alone was hiding them behind headline-only posters.
      let query=getDb().from("design_component_search_documents")
        .select("component_id,definition_hash,card,design_components!inner(status,source_key)")
        .eq("card->>kind","content")
        .contains("card->roles",JSON.stringify([role])).contains("card->aspectRatios",JSON.stringify([input.aspectRatio]))
        .contains("card->visualTraits->treatments",JSON.stringify(["assembly-authored"]))
        .in("design_components.status",input.experimental?["approved","draft"]:["approved"]);
      if(input.preferences?.enabled&&input.preferences.language)query=query.contains("card->visualTraits->languages",JSON.stringify([input.preferences.language]));
      const r=await query.order("component_id").limit(5).abortSignal(AbortSignal.timeout(8000));
      if(r.error)throw r.error;
      return (r.data??[]).map((row:SearchRow&{design_components:{source_key:string}})=>({...row,source_key:row.design_components.source_key}));
    };
    const [ranked,authored,quiet,prepared]=await Promise.all([
      search(null),preferAuthored?search("expressive"):Promise.resolve([]),
      role==="cover"||role==="static"?search("quiet"):Promise.resolve([]),
      preparedCovers(),
    ]);
    const identity=(row:SearchRow)=>row.source_key??row.component_id;
    const expressive=[...prepared,...authored,...ranked].filter(row=>row.card.densities?.includes("expressive"));
    const ordered=preferAuthored?[...expressive,...ranked]:ranked;
    const seen=new Set<string>();
    const diverse=ordered.filter(row=>{const key=identity(row);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,5);
    const quietRow=quiet.find(row=>!seen.has(identity(row)));
    return quietRow?[...diverse.slice(0,4),quietRow]:diverse;
  }));
  // Source deduplication is query-local: the same authored origin may have distinct role capabilities.
  const cards=Array.from(new Map(searched.flat().map(row=>{
    if(row.card.id!==row.component_id||row.card.hash!==row.definition_hash)throw new Error("Índice de componentes divergente");
    return [row.component_id,row.card] as const;
  })).values());
  // Only compact derived metadata is hydrated here; pieces/assets remain selected-only.
  if(cards.length){
    const traits=await getDb().from("design_component_search_documents").select("component_id,definition_hash,visual_traits").in("component_id",cards.map(c=>c.id)).abortSignal(AbortSignal.timeout(8000));
    if(traits.error)throw traits.error;
    for(const card of cards){
      const row=traits.data?.find((r:{component_id:string})=>r.component_id===card.id);
      if(row&&row.definition_hash!==card.hash)throw new Error("Visual traits hash mismatch");
      if(row?.visual_traits)card.visualTraits=componentCardV1Schema.shape.visualTraits.parse(row.visual_traits);
    }
  }
  if(!cards.some(c=>c.kind==="content"))throw new Error("Catálogo de componentes sem conteúdo compatível publicado");
  return cards;
}
export async function retrieveComponentsForGeneration(input:ComponentQuery):Promise<ComponentDefinitionV1[]> {
  return hydrateComponents((await retrieveComponentCardsForGeneration(input)).map(c=>c.id),input.experimental);
}
type ComponentVisualReview={component_id:string;definition_hash:string;kind:"human"|"agent_visual";decision:"approved"|"rejected";created_at:string;id:string};
/** Mirrors the database publication rule; a human decision takes precedence. */
export function effectiveComponentReview(reviews:ComponentVisualReview[],id:string,hash:string) {
  const current=reviews.filter(e=>e.component_id===id&&e.definition_hash===hash)
    .sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
  return current.find(e=>e.kind==="human")??current.find(e=>e.kind==="agent_visual")??null;
}
export async function listComponents(offset=0,includeArchived=false,filters:{kind?:string;status?:string;search?:string}={}) {
  let query=getDb().from("design_components").select("id,definition_hash,definition,status,source_key,created_at",{count:"exact"});
  if(filters.status)query=query.eq("status",filters.status);
  else if(!includeArchived)query=query.neq("status","archived");
  if(filters.kind)query=query.eq("kind",filters.kind);
  if(filters.search?.trim())query=query.ilike("definition->>label",`%${filters.search.trim().replace(/[\\%_]/g,"\\$&")}%`);
  const r=await query.order("source_key").order("id").range(offset,offset+49);if(r.error)throw r.error;
  const ids=(r.data??[]).map((row:{id:string})=>row.id);
  const reviews=ids.length?await getDb().from("design_component_evidence").select("id,component_id,definition_hash,kind,decision,created_at").in("kind",["human","agent_visual"]).in("component_id",ids).order("created_at",{ascending:false}).order("id",{ascending:false}):{data:[],error:null};
  if(reviews.error)throw reviews.error;
  return {entries:(r.data??[]).map((row:{id:string;definition_hash:string})=>({...row,review:effectiveComponentReview(reviews.data??[],row.id,row.definition_hash)})),total:r.count??0};
}
export async function reviewComponent(input:{id:string;hash:string;pngHash:string;briefingHash:string;decision:"approved"|"rejected";notes:string},actor:string) {
  const r=await getDb().from("design_components").select("definition_hash").eq("id",input.id).single();if(r.error||r.data.definition_hash!==input.hash)throw new Error("Prévia não corresponde ao componente");
  const e=await getDb().from("design_component_evidence").insert({component_id:input.id,definition_hash:input.hash,kind:"human",decision:input.decision,png_hash:input.pngHash,briefing_hash:input.briefingHash,actor_id:actor,metrics:{notes:input.notes,source:"admin_review"}});if(e.error)throw e.error;
}
const sha256=z.string().regex(/^[a-f0-9]{64}$/);
const agentComponentReviewSchema=z.object({id:z.string().uuid(),hash:sha256,pngHash:sha256,briefingHash:sha256,decision:z.enum(["approved","rejected"]),reviewer:z.string().trim().min(1).max(200),notes:z.string().max(4000)}).strict();
/** Internal service operation for an actual PNG/brief review, never exposed as a public LLM tool. */
export async function recordAgentComponentReview(value:z.input<typeof agentComponentReviewSchema>,actor:string) {
  const input=agentComponentReviewSchema.parse(value),actorId=z.string().uuid().parse(actor);
  const r=await getDb().from("design_components").select("definition_hash").eq("id",input.id).single();
  if(r.error||r.data.definition_hash!==input.hash)throw new Error("Prévia não corresponde ao componente");
  const e=await getDb().from("design_component_evidence").insert({component_id:input.id,definition_hash:input.hash,kind:"agent_visual",decision:input.decision,png_hash:input.pngHash,briefing_hash:input.briefingHash,actor_id:actorId,metrics:{notes:input.notes,source:"agent_visual_review",reviewer:input.reviewer}});
  if(e.error)throw e.error;
}
export async function publishComponent(id:string,status:"approved"|"archived") {
  const r=await getDb().from("design_components").update({status}).eq("id",id).select("id").single();if(r.error)throw r.error;await publishCatalogIfEnabled();return r.data;
}

/** Admin review context independent of pagination/filters; no aesthetic approval is inferred. */
export async function componentReviewContext(id:string){
 const target=(await hydrateComponents([id],true))[0],aspect=target.aspectRatios[0],context=new Map<string,ComponentDefinitionV1>([[id,target]]);
 const roles=["static","cover","development","closing"];
 await Promise.all(roles.map(async role=>{
  const query=()=>getDb().from("design_components").select("id,source_key,definition").eq("kind","content").in("status",["draft","approved"]).contains("aspect_ratios",[aspect]).contains("roles",[role]);
  let rows=await query().eq("source_key",sourceKey(target)).order("id").limit(16);
  if(rows.error)throw rows.error;
  const compatible=(r:{definition:unknown})=>componentDefinitionV1Schema.parse(r.definition).densities.some(d=>target.densities.includes(d));
  let picked=rows.data?.filter(compatible).sort((a:{definition:unknown},b:{definition:unknown})=>Number(componentDefinitionV1Schema.parse(b.definition).source.variantKey.includes("-curated-"))-Number(componentDefinitionV1Schema.parse(a.definition).source.variantKey.includes("-curated-")))[0];
  if(!picked){rows=await query().order("source_key").order("id").limit(16);if(rows.error)throw rows.error;picked=rows.data?.find(compatible)??rows.data?.[0];}
  if(picked){const c=componentDefinitionV1Schema.parse(picked.definition);context.set(c.id,c);}
 }));
 return {target,context:Array.from(context.values())};
}
