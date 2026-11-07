/** Captured-data diagnostic only. Requires private focused captures + staged font
 * assets. No provider calls, DB access, production mutation or readiness claims.
 * Run from the repository with the offline network blocker (see report.command). */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeDesignFields, instantiateCompleteDesign } from '../../../shared/completeDesignGeneration';
import { compactComponentCard } from '../../../shared/componentAssembly';
import { designTextBudgetsV3 } from '../../../shared/designSelection';
import { arsenalWorldGeometry, measureArsenalElement, resolveArsenalGeometry } from '../../../shared/arsenalGeometry';
import { partitionArsenalReadinessIssues, subpixelTextOverflowLimit } from '../../../shared/arsenalReadiness';
import { createComponentTextMeasurer } from '../../../server/ai/componentTextMeasurer';
import { enrichTargetedCopyRepairTargets, applyTargetedCopyRepair } from '../../../server/ai/workflows/compactProposalCopy';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const session = 'artifacts/acervo82/full/sessions/automatic-focused-20261106';
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const observed = new Map<string, string>();
async function bytes(file: string) {
  const result = await readFile(path.resolve(root, file));
  const digest = hash(result);
  if (observed.has(file)) assert.equal(digest, observed.get(file), `input_changed:${file}`);
  observed.set(file, digest);
  return result;
}
async function json(file: string) { return JSON.parse((await bytes(file)).toString('utf8')); }
const stage = await json('artifacts/acervo82/full/staged.json');
const proof: any[] = [];
globalThis.fetch = async () => { throw new Error('offline_geometry_replay_blocks_network'); };
for (const spec of [{kind:'static',slot:2,requestId:'bce0f360-6a25-4f34-8884-11614f0bc7ce'}, {kind:'carousel',slot:0,requestId:'f6001566-01d8-44c6-bc81-1e9b1c44dead'}]) {
  const ops = await json(`${session}/${spec.kind}/operations.json`);
  const snapshot = await json(`${session}/${spec.kind}/snapshot.json`);
  const get = (key:string) => {const op=ops.find((op:any)=>op.operation_key===key); assert(op,`missing_operation:${key}`);return op.result;};
  const proposalId = `p-${spec.requestId}-${spec.slot}`;
  const recovery = get(`${proposalId}:delivery_recovery:candidate`);
  const allDefinitions = get('prepare:definitions');
  const definitions = recovery.plan.pages.map((page:any)=>allDefinitions.find((d:any)=>d.id===page.componentId));
  assert(definitions.every(Boolean));
  const raw = get(`${proposalId}:copy`), repair = get(`${proposalId}-fb1:copy_recovery`);
  const wire = await json(`${session}/wire/${repair.id}.json`);
  const originalWire = await json(`${session}/wire/${raw.id}.json`);
  assert.deepEqual(wire.response.choices,repair.choices);
  assert.deepEqual(originalWire.response.choices,raw.choices);
  const capturedTargets = JSON.parse(wire.request.messages.at(-1).content).targets;
  const originalCopy = JSON.parse(raw.choices[0].message.content);
  // Use the exact persisted recovery candidate; assert no hidden copy transformation.
  const copy = recovery.copy;
  assert.deepEqual(copy.slides.map((s:any)=>s.values), originalCopy.slides.map((s:any)=>s.values));
  const candidate = get(`${proposalId}-fb1:candidate`);
  const assetList:any[] = Array.from(new Map(definitions.flatMap((d:any)=>d.assets).map((a:any)=>[a.id,a])).values());
  const measureText = await createComponentTextMeasurer(assetList,async asset=>{
    const data=await bytes(path.join(stage.build,'assets',asset.sha256));assert.equal(hash(data),asset.sha256);return data;
  });
  const subpixel = snapshot.generationConfig.layoutFitPolicy==='subpixel_v1';
  function inspect(value:any,allowReduction=true) {
    return definitions.map((definition:any,slide:number)=>{
      const source=instantiateCompleteDesign({definition,...value.slides[slide],runId:spec.requestId,slot:spec.slot,slide,planHash:'a'.repeat(64),experimental:true});
      const scene=resolveArsenalGeometry(source,{measureText,allowReduction,elasticReduction:allowReduction,allowSubpixelTextOverflow:subpixel});
      const blocking=[...partitionArsenalReadinessIssues(scene.issues).blocking];
      // Same authored-box + world-scale check as proposalGraph.inspectScenes.
      for (const target of definition.completeDesign?.designGuidance?.requiredTextTargets??[]) {
        const element=scene.elements.find(e=>e.id===target);
        if(element?.kind==='text'&&!element.text?.trim())blocking.push(`required_text_fragment:${target}`);
      }
      for(const element of scene.elements.filter(e=>e.kind==='text')) {
        const box=definition.fragment.instances.find((i:any)=>i.id===element.id);
        const target=box?{...element,width:box.width,height:box.height}:element;
        const measured=measureArsenalElement(target,measureText);
        const tolerance=subpixel?subpixelTextOverflowLimit(arsenalWorldGeometry(element,scene.groups).scale):0.01;
        if(measured.height>target.height+tolerance||measured.lines.some(line=>line.width>target.width+tolerance))blocking.push(`overflow:${element.id}`);
      }
      return {scene,blocking:Array.from(new Set(blocking))};
    });
  }
  const initial=inspect(copy), authored=inspect(copy,false);
  const input:any={narrativePlan:recovery.plan};
  const targets=enrichTargetedCopyRepairTargets(input,definitions,copy,capturedTargets,initial.map((s:any)=>s.scene),measureText);
  for(let i=0;i<targets.length;i++) {
    assert.equal(targets[i].maxCharacters,capturedTargets[i].maxCharacters,'captured_limit_mismatch');
    assert.deepEqual(targets[i].fit,capturedTargets[i].fit,'captured_fit_mismatch');
  }
  function fieldResult(value:any,slide:number,fieldId:string) {
    const definition=definitions[slide],field=completeDesignFields(definition).find(f=>f.id===fieldId)!;
    const bindingIds=definition.fragment.bindings.filter((b:any)=>b.source===field.source).map((b:any)=>b.id);
    const inspected=inspect(value)[slide];
    const elements=inspected.scene.elements.filter(e=>bindingIds.includes(e.bindingId??''));
    const ids=elements.map(e=>e.id);
    const canonical=value.slides[slide].values.find((row:any)=>row.fieldId===fieldId).value;
    if(typeof canonical==='string'&&elements.every(e=>e.contentFragment)&&elements.length>0)assert.equal(elements.map(e=>e.text).join(''),canonical,'word_partition_must_preserve_canonical_text');
    return {slideIssues:inspected.blocking,fits:!inspected.blocking.some(issue=>!issue.startsWith('collision:')&&ids.includes(issue.split(':').at(-1)!)),
      issues:inspected.blocking.filter(issue=>ids.includes(issue.split(':').at(-1)!)),
      fragments:elements.map(element=>{
        const box=definition.fragment.instances.find((i:any)=>i.id===element.id)!;
        const measured=measureArsenalElement({...element,width:box.width,height:box.height},measureText);
        const rawElement=authored[slide].scene.elements.find(e=>e.id===element.id)!;
        const relation=definition.fragment.relations.find((r:any)=>r.kind==='textFit'&&r.outputs.some((o:any)=>o.targetId===element.id));
        const tokenWidths=element.text.split(/\s+/).filter(Boolean).map(token=>({token,width:Math.max(...measureText({text:token,width:1e6,fontSize:element.fontSize,fontFamily:element.fontFamily,fontStyle:String(element.fontWeight),fill:element.fill,lineHeight:element.lineHeight,letterSpacing:element.letterSpacing}).lines.map(line=>line.width))}));
        return {id:element.id,text:element.text,fragment:element.contentFragment??null,fontFamily:element.fontFamily,fontWeight:element.fontWeight,
          authoredFontSize:rawElement.fontSize,resolvedFontSize:element.fontSize,minFontSize:relation?.parameters.minFontSize,elasticTokenFloor:Math.max(12,Math.floor((relation?.parameters.minFontSize??0)*.8)),
          box:{x:box.x,y:box.y,width:box.width,height:box.height},lineHeight:element.lineHeight,
          fitParameters:relation?.parameters,measured:{height:measured.height,lines:measured.lines.map(line=>({text:line.text,width:line.width}))},tokenWidths};
      })};
  }
  const choices:any[]=[];
  const repaired=applyTargetedCopyRepair(copy,targets,JSON.parse(repair.choices[0].message.content),definitions,(value,target)=>{
    const measured=fieldResult(value,target.slideIndex,target.fieldId);choices.push({slideIndex:target.slideIndex,fieldId:target.fieldId,value:value.slides[target.slideIndex].values.find((r:any)=>r.fieldId===target.fieldId).value,fits:measured.fits,issues:measured.issues});return measured.fits;
  });
  assert.deepEqual(repaired,candidate.copy,'exact_captured_repair_selection');
  const rows=targets.map(target=>{
    const slide=target.slideIndex,definition=definitions[slide],field=completeDesignFields(definition).find(f=>f.id===target.fieldId)!;
    const controls=spec.kind==='static'?(target.fieldId==='field-0'?['','Lume']:['Conheça a','Venha à','Conheça','Visite a Lume','Conheça a Lume']):(slide===0?['Leia todo dia','Leia um pouco']:['Comece aos pou','Comece devagar','Comece pequeno','Poucos minutos','Comece aos poucos']);
    return {slideIndex:slide,fieldId:target.fieldId,design:definition.label,definitionHash:definition.hash,source:field.source,
      capturedTarget:target,budget:designTextBudgetsV3(compactComponentCard(definition)).find(b=>b.source===field.source),
      mechanics:compactComponentCard(definition).mechanics?.fields.find(f=>f.source===field.source),
      original:{value:target.current,length:typeof target.current==='string'?target.current.length:null,...fieldResult(copy,slide,target.fieldId)},
      controls:controls.map(text=>{const changed=structuredClone(candidate.copy);changed.slides[slide].values.find((r:any)=>r.fieldId===target.fieldId).value=text;return {text,length:text.length,schemaAllowsLength:!target.maxCharacters||text.length<=target.maxCharacters,...fieldResult(changed,slide,target.fieldId)};})};
  });
  proof.push({...spec,layoutFitPolicy:snapshot.generationConfig.layoutFitPolicy,originalCopyId:raw.id,repairId:repair.id,
    originalSlideIssues:initial.map((s:any)=>s.blocking),capturedRepair:JSON.parse(repair.choices[0].message.content),selection:choices,
    exactCapturedRepairSelection:true,canonicalCopyPreservedThroughRecovery:true,rows,
    finalSlideIssues:inspect(candidate.copy).map((s:any)=>s.blocking),
    originalAuthoredSlideIssues:authored.map((s:any)=>s.blocking)});
}
for(const [file,digest] of observed)assert.equal(hash(await readFile(path.resolve(root,file))),digest,`original_mutated:${file}`);
const output=process.argv[process.argv.indexOf('--output')+1];
assert(process.argv.includes('--output')&&output,'explicit --output required');
assert(!observed.has(path.relative(root,path.resolve(output))),'never overwrite observed inputs');
const report={version:1,command:'node --require ./scripts/testing/block-network.cjs --import tsx scripts/acervo82/full/focusedGeometryReplay.ts --output /tmp/focused-geometry-replay.json',externalCalls:0,dbWrites:0,originalsUnchanged:true,inputs:Array.from(observed,([file,sha256])=>({file,sha256})),cases:proof,
  limitation:'Offline geometry and captured provider-response replay. Manually authored controls prove physical fit only; they are not provider output, new factual review, ready proposals or published results.'};
await writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({output,originalsUnchanged:true,cases:proof.map(c=>({kind:c.kind,selection:c.selection,rows:c.rows.map((r:any)=>({slide:r.slideIndex,field:r.fieldId,originalFits:r.original.fits,maxCharacters:r.capturedTarget.maxCharacters,controls:r.controls.map((v:any)=>({text:v.text,length:v.length,fits:v.fits,schemaAllowsLength:v.schemaAllowsLength}))}))}))},null,2));
