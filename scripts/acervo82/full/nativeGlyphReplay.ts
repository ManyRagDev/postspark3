/** Captured-copy replay; explicit local fixture and existing font assets only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { completeDesignFields, instantiateCompleteDesign } from '../../../shared/completeDesignGeneration';
import { arsenalHash } from '../../../shared/arsenalContent';
import { readArsenalComposition } from '../../../shared/designArsenal';
import { resolveArsenalGeometry, measureArsenalElement } from '../../../shared/arsenalGeometry';
import { NATIVE_GLYPH_MANIFEST_HASH } from '../../../shared/nativeGlyphProjection';
import { createComponentTextMeasurer } from '../../../server/ai/componentTextMeasurer';
import { inspectProposalScenes } from '../../../server/ai/workflows/proposalGraph';
import { renderReviewScenes, closeReviewRenderer } from '../../../server/ai/workflows/proposalRenderer';
import { ENV } from '../../../server/_core/env';
import { INITIAL_POST } from '../../../client/src/pages/CanvasLab/components/types';
import { putArsenalComposition } from '../../../client/src/pages/CanvasLab/lib/arsenalComposition';
import { canvasModelToSavePayload, normalizeCanvasModel } from '../../../client/src/pages/CanvasLab/lib/saveAdapter';
const args=process.argv.slice(2), fixture=args[args.indexOf('--fixture')+1], output=args[args.indexOf('--output')+1];
assert(args.includes('--fixture')&&args.includes('--output'),'explicit --fixture and --output required');
const hashes=new Map<string,string>(), sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const read=async(file:string)=>{const bytes=await fs.readFile(file);hashes.set(file,sha(bytes));return bytes;};
const capture=JSON.parse((await read(fixture)).toString()), id=capture.request.id;
assert.equal(id,'f9ed8300-0474-4fa6-b8b9-c893db02bdd2');
const result=(key:string)=>capture.operations.find((operation:any)=>operation.operation_key===key).result;
const recovery=result(`p-${id}-0:delivery_recovery:candidate`), definition=result('prepare:definitions').find((definition:any)=>definition.id===recovery.plan.pages[0].componentId);
const original=JSON.parse(result(`p-${id}-0:copy`).choices[0].message.content);
const recipe=JSON.parse((await read('artifacts/acervo82/full/build-08/recipes/acervo82-r9-14.json')).toString());
assert.equal(arsenalHash(recipe),definition.source.recipeHash);
assert.equal(recipe.scene.layers.find((layer:any)=>layer.id==='text-11-0').text,'➔');
const stage=JSON.parse((await read('artifacts/acervo82/full/staged.json')).toString());
const load=async(asset:any)=>{const bytes=await read(path.join(stage.build,'assets',asset.sha256));assert.equal(sha(bytes),asset.sha256);return bytes;};
globalThis.fetch=async()=>{throw new Error('offline_replay_network_forbidden');};
const measure=await createComponentTextMeasurer(definition.assets,load);
const fieldIds=new Set(completeDesignFields(definition,1).map(field=>field.id));
const projected=structuredClone(original);
projected.slides[0].values=projected.slides[0].values.filter((value:any)=>fieldIds.has(value.fieldId));
assert.equal(projected.caption,original.caption);assert.deepEqual(projected.hashtags,original.hashtags);
assert.deepEqual(projected.slides[0].values,original.slides[0].values.filter((value:any)=>fieldIds.has(value.fieldId)));
const compose=(copy:any,marker?:1)=>instantiateCompleteDesign({definition,...copy.slides[0],nativeGlyphProjection:marker,runId:id,slot:0,slide:0,planHash:arsenalHash(recovery.plan),experimental:true});
const before=inspectProposalScenes([compose(original)],[definition],measure,true,true), after=inspectProposalScenes([compose(projected,1)],[definition],measure,true,true);
assert(before.findings.some(finding=>finding.rule==='overflow'&&finding.target.endsWith(':text-11-0')));
assert.deepEqual(after.findings,[]);
const scene=after.slides[0].composition, glyph=scene.elements.find(element=>element.id==='text-11-0')!;
assert.equal(glyph.text,'➔');assert.equal(glyph.bindingId,null);assert.equal(glyph.fixedTextRole,'ornament');
const post=putArsenalComposition({...structuredClone(INITIAL_POST),currentSlideIndex:0},scene);
const payload=canvasModelToSavePayload(post,{inputType:'text',inputContent:capture.request.input.content});
const reopened=normalizeCanvasModel(JSON.parse(JSON.stringify(payload.canvasModel)));
const stored=readArsenalComposition(reopened.slides[0].composition);
assert.deepEqual(stored.origin,scene.origin);
assert.deepEqual(resolveArsenalGeometry(stored,{measureText:measure,allowReduction:false,allowSubpixelTextOverflow:true}).elements,scene.elements);
await fs.mkdir(output,{recursive:true});
if(args.includes('--render')){
 ENV.reviewRendererBundle=process.env.REVIEW_RENDERER_BUNDLE??'/tmp/postspark-278a-renderer.js';
 ENV.reviewChromiumExecutablePath=process.env.REVIEW_CHROMIUM_EXECUTABLE_PATH??'/home/emanuel/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
 try{const images=await renderReviewScenes({actor:'offline-native-glyph',compositions:[before.slides[0].composition,scene],definitions:[definition],loadAssetBytes:load});
 for(let i=0;i<images.length;i++)await fs.writeFile(path.join(output,i?'after.png':'before.png'),Buffer.from(images[i].dataUri.split(',')[1],'base64'));
 }finally{await closeReviewRenderer();}
}
for(const[file,digest]of hashes)assert.equal(sha(await fs.readFile(file)),digest);
const old=before.slides[0].composition.elements.find(element=>element.id==='text-11-0')!, m=measureArsenalElement(glyph,measure);
const report={requestId:id,definitionId:definition.id,definitionHash:definition.hash,manifestHash:NATIVE_GLYPH_MANIFEST_HASH,originalGlyph:glyph.text,
 before:{text:old.text,box:{width:old.width,height:old.height},fontSize:old.fontSize,findings:before.findings},after:{box:{width:glyph.width,height:glyph.height},fontSize:glyph.fontSize,measurement:{height:m.height,lineWidths:m.lines.map(line=>line.width)},findings:after.findings},
 retainedFieldIds:[...fieldIds],captionAndHealthyCopyUnchanged:true,canvasPersistenceAndReopenIdentical:true,providerCalls:0,dbWrites:0,inputHashes:Object.fromEntries(hashes),
 limitation:'Replays captured copy and restores its original decorative arrow. The failed attempt had not generated its photo; replay does not replace provider review or show a newly purchased image.'};
await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
