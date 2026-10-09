/** One concrete three-direction sequence review. No LLM/image generation or publication. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas,GlobalFonts,loadImage } from '@napi-rs/canvas';
import { getDb } from '../../server/db';
import { assemblyIdentity,componentDefinitionV1Schema,compactComponentCard,materializeAssemblyPlan,compositionFromAssemblyBundle,validateAssemblyPlan,type AssemblyPlanV1,type ComponentDefinitionV1 } from '../../shared/componentAssembly';
import { arsenalHash } from '../../shared/arsenalContent';
import { resolveArsenalGeometry } from '../../shared/arsenalGeometry';
import { createComponentTextMeasurer } from '../../server/ai/componentTextMeasurer';
import { auditAssemblyArtDirection } from '../../server/ai/assemblyArtDirection';
import { diagnosticFromComposition } from './preview';
import { renderRecipe } from '../designBatch/native';
import type { ComponentPackage } from './extract';
const corpus=path.resolve(process.argv[2]??'artifacts/component-arsenal/revision-8-vocabulary-final'),output=path.resolve(process.argv[3]??'artifacts/component-arsenal/art-direction'),local=process.argv.includes('--local');
const inventory=JSON.parse(await fs.readFile(path.join(corpus,'inventory.json'),'utf8'));
const packages:ComponentPackage[]=await Promise.all(inventory.rows.filter((r:any)=>r.package).map((r:any)=>fs.readFile(path.join(corpus,r.package),'utf8').then(JSON.parse)));
const referenceIds=['0623fb1c14937cd1e67e980b566710ba','1c2fb00a82a764bab2f4374d03f67886','c5d8dcc1ddabea113d4f4a5ea76cde0d'];
const selectedPackages=referenceIds.map(id=>packages.find(p=>p.source.referenceId===id)!);
const groups=selectedPackages.map(p=>(['cover','development','closing'] as const).map(role=>[...p.components].sort((a,b)=>Number(b.source.variantKey.includes('-curated-'))-Number(a.source.variantKey.includes('-curated-'))).find(c=>c.kind==='content'&&c.fragment.aspectRatio==='4:5'&&c.roles.includes(role)&&c.densities.includes('expressive'))!));
if(groups.some(g=>g.some(c=>!c)))throw new Error('Authored sequence missing');
const ids=groups.flat().map(c=>c.id),rows=local?{error:null,data:groups.flat().map(c=>({id:c.id,definition_hash:c.hash,definition:c,status:'local-draft'}))}:await getDb().from('design_components').select('id,definition_hash,definition,status').in('id',ids);
if(rows.error||rows.data?.length!==ids.length)throw new Error('Catalog sources missing');
const definitions:ComponentDefinitionV1[]=rows.data.map((row:any)=>{const c=componentDefinitionV1Schema.parse(row.definition);if(c.hash!==row.definition_hash||!groups.flat().some(local=>local.id===c.id&&local.hash===c.hash))throw new Error('Catalog/package mismatch');return c;});
const sample=[
 {headline:'Uma ideia ganha força com direção visual',body:'Escolha uma mensagem clara e dê espaço para que ela possa ser entendida.'},
 {headline:'Contraste e ritmo ajudam a organizar mensagens',body:'Organize a hierarquia, destaque o essencial e preserve todas as informações relevantes ao assunto.'},
 {headline:'Experimente estas ideias no seu próximo post',body:'Revise a leitura e escolha uma ação concreta para continuar esta conversa com clareza.'},
];
const plan:AssemblyPlanV1={schemaVersion:1,postMode:'carousel',aspectRatio:'4:5',variations:groups.map((group,slot)=>({id:`direction-${slot}`,direction:{label:['Papel editorial','Janelas gráficas','Tipografia extrudada'][slot],palette:{background:group[0].fragment.artboard.background,text:'#111111',accent:['#B46F3A','#E76F22','#6895DB'][slot]},typographyComponentId:null,intent:{language:(['editorial','graphic','typographic'] as const)[slot],hierarchy:'headline',recurringComponentIds:[],mediaRole:'none',rhythm:group.map((_,i)=>({slideId:`slide-${slot}-${i}`,emphasis:(['hero','reading','closing'] as const)[i],density:i===1?'balanced':'expressive'}))}},caption:'Ensaio de direção de arte; conferência humana pendente.',hashtags:[],slides:group.map((c,i)=>({id:`slide-${slot}-${i}`,role:(['cover','development','closing'] as const)[i],density:i===1?'balanced':'expressive',content:{schemaVersion:3,blocks:[{id:'headline',type:'text',role:'headline',text:sample[i].headline},{id:'body',type:'text',role:'body',text:sample[i].body},{id:'cta',type:'text',role:'callToAction',text:'Experimente estas ideias no seu próximo post.'}].filter(b=>c.fragment.bindings.some(binding=>binding.source===`block:${b.role}:0:text`)) as any,caption:'',hashtags:[]},components:[{id:c.id,hash:c.hash}],mediaPrompts:[]}))}))};
const audit=[...validateAssemblyPlan(plan,definitions,{postMode:'carousel',slideCount:3}),...auditAssemblyArtDirection(plan,definitions.map(compactComponentCard))];
if(audit.length)throw new Error(audit.join('\n'));
const assets=new Map(selectedPackages.flatMap(p=>p.assetFiles.map(a=>[a.manifest.id,a] as const)));
const bytes=async(a:any)=>fs.readFile(path.join(corpus,assets.get(a.id)!.relativePath));
const measure=await createComponentTextMeasurer(Array.from(assets.values()).map(a=>a.manifest),bytes);
for(const a of assets.values())GlobalFonts.register(await bytes(a.manifest),a.manifest.family!);
const runId=assemblyIdentity(['art-direction-review',arsenalHash(plan)]),bundle=materializeAssemblyPlan(plan,definitions,{traceId:runId,runId,experimental:true});
await fs.mkdir(output,{recursive:true});
const canvas=createCanvas(936,1266),ctx=canvas.getContext('2d');ctx.fillStyle='#181B23';ctx.fillRect(0,0,936,1266);
const checks=[];
for(const v of bundle.variations)for(const [index,slide] of v.slides.entries()){
 const c=resolveArsenalGeometry(compositionFromAssemblyBundle(slide.bundle),{measureText:measure,allowReduction:true});
 const p=selectedPackages[v.slot],scene=diagnosticFromComposition(p,c),png=renderRecipe({...p.sourceSnapshot.recipe,scene,matrix:undefined,adaptation:undefined},{wrap:true});
 const filename=`direction-${v.slot+1}-slide-${index+1}.png`;await fs.writeFile(path.join(output,filename),png);
 const x=12+index*308,y=12+v.slot*418;ctx.fillStyle='#FFFFFF';ctx.font='13px sans-serif';ctx.fillText(`${v.direction.label} · ${slide.role}`,x,y+15);ctx.drawImage(await loadImage(png),x,y+25,300,375);
 checks.push({slot:v.slot,slideId:slide.id,role:slide.role,density:slide.density,componentIds:slide.bundle.candidates[0].componentAssembly?.componentIds,issues:c.issues,png:filename});
}
await fs.writeFile(path.join(output,'SEQUENCES.png'),canvas.toBuffer('image/png'));
const report={schemaVersion:1,source:local?'local-candidate':'connected-catalog',allowReduction:true,llmCalls:0,planAudit:audit,checks,approval:'human-review-pending',browser:'unavailable',definitionHashes:local?'verified-local':'matched-local-and-database'};
await fs.writeFile(path.join(output,'SEQUENCE_REVIEW.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(output,'REVIEW.html'),`<!doctype html><meta charset="utf-8"><title>Direção de arte · revisão</title><style>body{background:#181b23;color:white;font:16px system-ui;max-width:1100px;margin:32px auto}img{width:100%}pre{white-space:pre-wrap}</style><h1>Três direções · capa, desenvolvimento e encerramento</h1><p>${local?'Candidatos locais, importação ainda pendente.':'Componentes reais recuperados do banco.'} Ensaio determinístico sem LLM. Não substitui conferência no Stage autenticado nem aprovação humana. Issues permanecem declaradas.</p><img src="SEQUENCES.png" alt="Nove slides em três sequências"><pre>${JSON.stringify(report,null,2).replace(/</g,'&lt;')}</pre>`);
console.log(JSON.stringify({auditIssues:audit.length,slides:checks.length,slidesWithIssues:checks.filter(c=>c.issues.length).length,output}));
