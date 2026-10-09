/** Offline, deterministic draft preparation. Never connects to a database or publishes. */
import fs from "node:fs/promises";
import path from "node:path";
import { readCorpus, readSource, capabilities, familyCoverage, sha256 } from "./inventory";
import { extractRecipeComponents } from "./extract";
import { AUTHORING_VERSION } from "./authoring";
import { EXTRACTOR_VERSION } from "./extract";

const output=path.resolve(process.argv[2]??`artifacts/component-arsenal/prepared-${new Date().toISOString().replace(/[:.]/g,"-")}`);
try{await fs.access(path.join(output,"inventory.json"));throw new Error(`Artefato existente é imutável: ${output}. Prepare em um novo diretório.`)}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
await fs.mkdir(path.join(output,"packages"),{recursive:true});
await fs.mkdir(path.join(output,"assets"),{recursive:true});
const records=await readCorpus(),rows:Array<Record<string,unknown>>=[],allAssetIds=new Set<string>(),allComponentIds=new Set<string>(),componentCounts:Record<string,number>={};let adaptedComponents=0;
for(const record of records){
  const {recipe}=await readSource(record),capability=capabilities(recipe);
  try{
    const result=await extractRecipeComponents(record,recipe);
    for(const asset of result.assetFiles){
      const filename=path.join(output,asset.relativePath);
      try{const existing=await fs.readFile(filename);if(sha256(existing)!==asset.manifest.sha256)throw new Error(`Asset corrompido:${filename}`)}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;await fs.writeFile(filename,asset.bytes)}
      allAssetIds.add(asset.manifest.id);
    }
    for(const c of result.package.components){allComponentIds.add(c.id);const key=`${record.category}:${c.fragment.aspectRatio}`;componentCounts[key]=(componentCounts[key]??0)+1;}
    adaptedComponents+=result.package.authorship.formatAdaptations?.length??0;
    const file=`packages/${record.fileHash}.json`;await fs.writeFile(path.join(output,file),JSON.stringify(result.package,null,2)+"\n");
    rows.push({...record,capabilities:capability,package:file,status:record.destination==="font-study"?"retained-font-study":record.destination==="media-reference"?"media-draft-prepared":"components-draft-prepared",componentIds:result.package.components.map(c=>c.id),componentKinds:result.package.components.map(c=>c.kind),fontAdjustments:result.package.assetFiles.filter(a=>a.adjustment),automaticGenerationEligible:false,approval:"pending-component-review"});
  }catch(e){rows.push({...record,capabilities:capability,status:"blocked",reason:e instanceof Error?e.message:String(e),automaticGenerationEligible:false,approval:"pending"})}
}
const inventory={format:"postspark.component-arsenal.inventory",schemaVersion:1,extractorVersion:EXTRACTOR_VERSION,authoringVersion:AUTHORING_VERSION,
  sourceCount:records.length,originalCorpusCount:records.filter(r=>r.category!=="editor-extension").length,editorExtensionCount:records.filter(r=>r.category==="editor-extension").length,distinctRecipeHashes:new Set(records.map(r=>r.fileHash)).size,sourcePreservation:"verified-before-and-after",components:allComponentIds.size,assets:allAssetIds.size,
  sourceFamilies:familyCoverage(records),componentCountsByOriginAndFormat:componentCounts,portraitAdaptationComponents:adaptedComponents,rows,blocked:rows.filter(r=>r.status==="blocked").length,eligible:0,published:0,
  limitations:["Draft preparation does not establish visual fidelity, flexible-layout quality or production eligibility.","Source approval is historical evidence, not component publication.","Stroke Impact and Cinematic Depth are explicit new ports of the official renderer; browser comparison and approval remain pending.","Source media is demonstration only and is never automatically included in component assets."]};
for(const record of records)await readSource(record);
await fs.writeFile(path.join(output,"inventory.json"),JSON.stringify(inventory,null,2)+"\n");
const md=`# Inventário de componentes\n\n${inventory.sourceCount} receitas; ${inventory.distinctRecipeHashes} hashes únicos; ${inventory.components} componentes candidatos; ${inventory.assets} assets de fonte; ${inventory.blocked} bloqueios.\n\n**Nenhum componente foi publicado ou declarado elegível.** A aprovação da receita original não autoriza automaticamente sua derivação.\n\n## Famílias oficiais\n\n${inventory.sourceFamilies.map(f=>`- ${f.name}: ${f.recipes.length} receitas; ${f.status}`).join("\n")}\n\n## Impedimentos\n\n${rows.filter(r=>r.status==="blocked").map(r=>`- ${r.title}: ${r.reason}`).join("\n")||"Nenhuma falha de preparação; revisão visual e ensaios de conteúdo ainda pendentes."}\n\n${inventory.limitations.map(l=>`- ${l}`).join("\n")}\n`;
await fs.writeFile(path.join(output,"REPORT.md"),md);
console.log(JSON.stringify({output,recipes:inventory.sourceCount,components:inventory.components,assets:inventory.assets,blocked:inventory.blocked,published:0,eligible:0}));
