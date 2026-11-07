/** Replays captured reviewer output offline. It never revises copy/art, calls a
 * provider, updates a database, or changes the historical request's status. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveArsenalGeometry } from "../../../shared/arsenalGeometry";
import { createComponentTextMeasurer } from "../../../server/ai/componentTextMeasurer";
import { arsenalHash } from "../../../shared/arsenalContent";
import { generationIntentSchema, materialGenerationIntent } from "../../../shared/generationPlan";
import { decodeReviewV10, normalizeReviewV10 } from "../../../server/ai/workflows/proposalReviewPolicyV10";
import { normalizeAutomaticReviewResponse } from "../../../server/ai/workflows/automaticReviewProtocol";
import { buildReviewEvidenceAliases, reviewEvidenceAnchors } from "../../../server/ai/workflows/reviewEvidence";
import { buildSourceEvidenceV10, reviewTextUnitsV10 } from "../../../server/ai/workflows/reviewEvidenceV10";

const root=fileURLToPath(new URL("../../../",import.meta.url));
const session="artifacts/acervo82/full/sessions/automatic-stack-20261106";
export const replayRequestId="c37e1c2c-c79c-48dc-9176-e742024d0634";
const proposalId=`p-${replayRequestId}-0-fb1`;
type Fixture={operations:any[];snapshot:any;wires:Record<string,any>;resolvedCompositions:any[]};
const payload=(wire:any)=>{
  const content=wire.request.messages.find((m:any)=>m.role==="user")?.content;
  return JSON.parse(typeof content==="string"?content:content.find((part:any)=>part.type==="text").text);
};
export async function readAutomaticReviewReplayFixture():Promise<Fixture> {
  const json=async(file:string)=>JSON.parse(await readFile(path.join(root,file),"utf8"));
  const operations=await json(`${session}/carousel-v2/operations.json`),snapshot=await json(`${session}/carousel-v2/snapshot.json`);
  const reviews=operations.filter((op:any)=>op.operation_key.startsWith(`${proposalId}:review`));
  const wires:Record<string,any>={};
  for(const op of reviews){
    assert.match(op.result.id,/^[a-zA-Z0-9-]+$/);
    wires[op.result.id]=await json(`${session}/wire/${op.result.id}.json`);
  }
  const candidate=operations.find((op:any)=>op.operation_key===`${proposalId}:candidate`).result;
  const stage=await json("artifacts/acervo82/full/staged.json");
  const assets=Array.from(new Map(candidate.compositions.flatMap((scene:any)=>scene.assets).map((asset:any)=>[asset.id,asset])).values());
  const measureText=await createComponentTextMeasurer(assets as any[],asset=>readFile(path.join(root,stage.build,"assets",asset.sha256)));
  const resolvedCompositions=candidate.compositions.map((scene:any)=>resolveArsenalGeometry(scene,{measureText,allowReduction:true,elasticReduction:true,allowSubpixelTextOverflow:snapshot.generationConfig.layoutFitPolicy==="subpixel_v1"}));
  return {operations,snapshot,wires,resolvedCompositions};
}
function outcome(work:()=>any) {
  try {const record=work();return {status:record.status,findings:record.findings,discardedFields:record.discardedFields};}
  catch(error:any) {return {status:"rejected",error:error.message,violation:error.violation??null};}
}
/** The control mutates only a simulated reviewer assertion, not the captured
 * artwork or facts. It tests the local veto; it is not a new semantic judgment. */
export function replayAutomaticReviewFixture(fixture:Fixture) {
  const before=arsenalHash(fixture);
  const candidate=fixture.operations.find(op=>op.operation_key===`${proposalId}:candidate`)?.result;
  assert(candidate); assert.equal(candidate.proposalId,proposalId.replace(/-fb1$/, ""));
  const context=fixture.operations.find(op=>op.operation_key==="prepare:selection_input")?.result.editorialContext;
  const siblings=fixture.snapshot.snapshot.proposals.filter((p:any)=>p.slot!==0);
  assert.equal(siblings.length,2); assert(siblings.every((p:any)=>p.status==="ready"));
  const aliases=buildReviewEvidenceAliases(reviewEvidenceAnchors(candidate.copy,fixture.resolvedCompositions));
  const units=reviewTextUnitsV10(candidate.copy,aliases);
  const reviews=fixture.operations.filter(op=>op.operation_key.startsWith(`${proposalId}:review`)).sort((a,b)=>a.operation_key.includes(":review:")?-1:b.operation_key.includes(":review:")?1:a.operation_key.localeCompare(b.operation_key));
  assert.equal(reviews.length,2);
  const results=reviews.map(op=>{
    const wire=fixture.wires[op.result.id], durable=op.result.__proposalReview;
    assert.equal(wire.requestId,replayRequestId);
    assert.equal(op.result.choices[0].message.content,wire.response.choices[0].message.content);
    assert.equal(context.hash,durable.sourceContextHash);
    assert.deepEqual(units,durable.textUnitInventory);
    assert.deepEqual(aliases.inventory,durable.anchorInventory);
    assert.deepEqual(aliases.aliasMap,durable.aliasMap);
    assert.deepEqual(buildSourceEvidenceV10(context),durable.evidenceInventory);
    const data=payload(wire), generationIntent=materialGenerationIntent(generationIntentSchema.parse(data.generationIntent))!;
    assert.deepEqual(generationIntent.requirements,[]);
    assert.deepEqual(data.checkInventories.intentChecks,[]);
    const {response,discarded}=decodeReviewV10(op.result.choices[0].message.content);
    const options={units,aliases,context,generationIntent,copy:candidate.copy,compositions:fixture.resolvedCompositions,inputHash:durable.inputHash,round:durable.round,operationKeys:op.operation_key.includes(":review_evidence_repair:")?[reviews[0].operation_key,op.operation_key]:[op.operation_key],discardedFields:discarded};
    const original=outcome(()=>normalizeReviewV10({...options,response}));
    assert.equal(original.status,"rejected");
    assert.equal(original.violation?.rule,"intent_requirement_coverage");
    const normalize=(value:typeof response)=>normalizeAutomaticReviewResponse(value,{generationIntent,units,contextRequirementIds:context.requirements.map((r:any)=>r.id)});
    const decodedHash=arsenalHash(response);
    const normalized=normalize(response);
    assert.equal(arsenalHash(response),decodedHash);
    const after=outcome(()=>normalizeReviewV10({...options,response:normalized.response,discardedFields:[...discarded,...normalized.discardedFields]}));
    assert.equal(after.status,"passed",JSON.stringify(after));
    const integrated=outcome(()=>normalizeReviewV10({...options,response,automaticReviewVersion:2}));
    assert.deepEqual(integrated,after);
    assert.deepEqual(normalized.response.unitChecks,response.unitChecks);
    assert.deepEqual(normalized.response.findings,response.findings);
    assert.deepEqual(normalized.response.sequenceAssessment,response.sequenceAssessment);
    const negative=structuredClone(normalized.response), target=negative.unitChecks.find(check=>units.find(unit=>unit.id===check.unitId)?.scope==="art")!;
    target.verdict="unsupported";target.editorialBasis=null;target.evidenceIds=[];
    target.explanation="Controle negativo offline: o revisor identifica afirmação factual sem suporte.";
    negative.findings.push({category:"unsupported_claim",unitId:target.unitId,slideIndex:null,observedInImage:"",expected:"Preservar somente o alcance sustentado pela fonte.",evidenceIds:[],explanation:target.explanation,consequence:"false_claim",certainty:"established"});
    const neg=normalize(negative);
    assert.deepEqual(neg.response.findings,negative.findings);
    assert.equal(neg.response.unitChecks.find(check=>check.unitId===target.unitId)?.verdict,"unsupported");
    const negativeOutcome=outcome(()=>normalizeReviewV10({...options,response:neg.response,discardedFields:neg.discardedFields}));
    assert.equal(negativeOutcome.status,"correction_required");
    const incomplete=structuredClone(normalized.response);incomplete.unitChecks.pop();
    const missing=normalize(incomplete);
    const missingOutcome=outcome(()=>normalizeReviewV10({...options,response:missing.response,discardedFields:missing.discardedFields}));
    assert.notEqual(missingOutcome.status,"passed");
    return {operationKey:op.operation_key,providerId:op.result.id,rawResponseHash:arsenalHash(op.result.choices[0].message.content),durableContextHash:arsenalHash(durable),original,normalized:after,discardedFields:normalized.discardedFields,negativeFactualControl:negativeOutcome,missingUnitControl:missingOutcome};
  });
  assert.equal(arsenalHash(fixture),before);
  return {version:1,requestId:replayRequestId,proposalId,mode:"offline_captured_receipt_replay",passed:true,externalCalls:0,databaseUpdates:0,originalRequestStatus:fixture.snapshot.snapshot.overallStatus,originalSlotStatus:fixture.snapshot.snapshot.proposals[0].status,copyHash:arsenalHash(candidate.copy),compositionsHash:arsenalHash(candidate.compositions),resolvedCompositionsHash:arsenalHash(fixture.resolvedCompositions),geometryEvidence:"Real Fontkit with hash-verified local fonts; reconstructed aliases and units exactly match captured durable inventory",sourceContextHash:context.hash,verifiedInventory:{slides:fixture.resolvedCompositions.length,units:units.length,anchors:aliases.inventory.length},unchangedReadySiblings:siblings.map((p:any)=>({slot:p.slot,status:p.status,hash:arsenalHash(p)})),replayInputsHash:before,inputArtifactsUnchanged:true,copyUnchanged:true,artworkUnchanged:true,results,limitation:"Replay da validação local sobre julgamentos reais já capturados. Não é nova revisão visual/modelo, não torna o pedido histórico ready e não substitui os controles técnicos da jornada. Controles negativos alteram somente as respostas simuladas do revisor."};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  assert(args.length===0||args.length===2&&args[0]==="--output","Use --output PATH");
  globalThis.fetch=async()=>{throw new Error("offline_replay_blocks_network");};
  const result=replayAutomaticReviewFixture(await readAutomaticReviewReplayFixture());
  const output=path.resolve(args[1]??"/tmp/automatic-review-replay.json");
  await writeFile(output,JSON.stringify(result,null,2));
  console.log(JSON.stringify({passed:result.passed,requestId:result.requestId,reviews:result.results.length,externalCalls:0,databaseUpdates:0,output}));
}
