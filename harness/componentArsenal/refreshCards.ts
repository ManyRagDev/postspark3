import {publishCatalogIfEnabled} from "../../server/designCatalog/versionedCatalog";
/** Idempotently refresh derived search cards, preserving canonical definitions and descriptors. */
import fs from "node:fs/promises";
import { getDb } from "../../server/db";
import { componentDefinitionV1Schema, compactComponentCard } from "../../shared/componentAssembly";
import { arsenalHash } from "../../shared/arsenalContent";
import { COMPONENT_DESCRIPTOR_VERSION, describeComponent } from "../../server/designCatalog/componentStore";
const actor=process.argv[2];
if(!actor)throw new Error("Informe administrador responsável");
const db=getDb(),admin=await db.from("profiles").select("role").eq("id",actor).single();
if(admin.error||admin.data?.role!=="admin")throw new Error("Administrador não verificado");
let checked=0,updated=0;
for(let offset=0;;offset+=100){
 const rows=await db.from("design_components").select("id,definition_hash,definition").in("status",["draft","approved"]).order("id").range(offset,offset+99);
 if(rows.error)throw rows.error;
 const indexes=await db.from("design_component_search_documents").select("component_id,definition_hash,descriptor_version,descriptor,card,visual_traits").in("component_id",(rows.data??[]).map((r:{id:string})=>r.id));
 if(indexes.error)throw indexes.error;
 const pending:Array<{id:string;hash:string;card:ReturnType<typeof compactComponentCard>}>=[];
 for(const row of rows.data??[]){
  const definition=componentDefinitionV1Schema.parse(row.definition);
  if(definition.id!==row.id||definition.hash!==row.definition_hash)throw new Error("Hash canônico divergente");
  const index=indexes.data?.find((i:{component_id:string})=>i.component_id===row.id);
  if(!index||index.definition_hash!==definition.hash||index.descriptor_version!==COMPONENT_DESCRIPTOR_VERSION||arsenalHash(index.descriptor)!==arsenalHash(describeComponent(definition)))throw new Error("Índice estrutural divergente");
  const card=compactComponentCard(definition);checked++;
  if(arsenalHash(index.visual_traits)===arsenalHash(card.visualTraits))continue;
  pending.push({id:row.id,hash:definition.hash,card});
 }
 for(let i=0;i<pending.length;i+=6)await Promise.all(pending.slice(i,i+6).map(async row=>{
  const result=await db.from("design_component_search_documents").update({visual_traits:row.card.visualTraits}).eq("component_id",row.id).eq("definition_hash",row.hash).select("component_id");
  if(result.error||result.data?.length!==1)throw new Error(`Atualização derivada não confirmada: ${result.error?.code??"rows"} ${result.error?.message??result.data?.length}`);
  updated++;
 }));
 if((rows.data?.length??0)<100)break;
}
const report={checked,updated,definitionChanges:0,descriptorChanges:0,actor,createdAt:new Date().toISOString()};
await fs.mkdir("artifacts/component-arsenal/art-direction",{recursive:true});
await fs.writeFile("artifacts/component-arsenal/art-direction/CARD_REFRESH.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report));

await publishCatalogIfEnabled();
