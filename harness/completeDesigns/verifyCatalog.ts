/** Read-only connected verification of the prepared whole-design package. No generation or publication. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {componentDefinitionV1Schema,type ComponentDefinitionV1} from '../../shared/componentAssembly';
import {arsenalHash} from '../../shared/arsenalContent';
import {hydrateComponents} from '../../server/designCatalog/componentStore';
import {retrieveCompleteDesignCards} from '../../server/designCatalog/completeDesignStore';
const root=path.resolve(process.argv[2]);
const inventory=JSON.parse(await fs.readFile(path.join(root,'inventory.json'),'utf8'));
const definitions:ComponentDefinitionV1[]=[];
for(const row of inventory.rows.filter((r:any)=>r.package)){
 const p=JSON.parse(await fs.readFile(path.join(root,row.package),'utf8'));
 if(arsenalHash(p.sourceSnapshot.recipe)!==p.source.recipeHash)throw new Error('Source snapshot mismatch');
 definitions.push(...p.components.map((c:unknown)=>componentDefinitionV1Schema.parse(c)));
}
const stored=await hydrateComponents(definitions.map(c=>c.id),true);
if(stored.some(c=>!c.completeDesign||!definitions.some(local=>local.id===c.id&&local.hash===c.hash)))throw new Error('Connected design differs from prepared definition');
const query={aspectRatio:'4:5',postMode:'static' as const,text:'design editorial',slideCount:1};
const [preview,published]=await Promise.all([retrieveCompleteDesignCards({...query,experimental:true}),retrieveCompleteDesignCards({...query,experimental:false})]);
if(preview.some(c=>!c.completeDesign?.baselineVerified))throw new Error('Unverified baseline offered');
const report={schemaVersion:1,readOnly:true,verifiedDefinitions:stored.length,baselineVerified:stored.filter(c=>c.completeDesign?.baselineVerified).length,
 previewCandidates:preview.length,previewFamilies:new Set(preview.map(c=>c.completeDesign?.family)).size,publishedCandidates:published.length,
 externalModelCalls:0,hashes:stored.map(c=>({id:c.id,hash:c.hash})),sample:preview.map(c=>({id:c.id,label:c.label,family:c.completeDesign?.family}))};
await fs.writeFile(path.join(root,'CATALOG_CHECK.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,hashes:undefined,sample:undefined}));
