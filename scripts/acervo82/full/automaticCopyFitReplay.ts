/** Offline replay of captured static-v2 copy against its exact immutable definitions/fonts. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { instantiateCompleteDesign, completeDesignFields } from "../../../shared/completeDesignGeneration";
import { resolveArsenalGeometry, measureArsenalElement } from "../../../shared/arsenalGeometry";
import { partitionArsenalReadinessIssues } from "../../../shared/arsenalReadiness";
import { createComponentTextMeasurer } from "../../../server/ai/componentTextMeasurer";
import { compactCopyPrompt, enrichTargetedCopyRepairTargets, targetedCopyRepairSchema, targetedCopyRepairPrompt, applyTargetedCopyRepair } from "../../../server/ai/workflows/compactProposalCopy";
const base = "artifacts/acervo82/full/sessions/automatic-stack-20261106";
const json = async (file: string) => JSON.parse(await fs.readFile(file, "utf8"));
const ops = await json(`${base}/static-v2/operations.json`);
const definitions = ops.find((op: any) => op.operation_key === "prepare:definitions").result;
const plan = ops.find((op: any) => op.operation_key === "prepare:selection").result;
const stage = await json("artifacts/acervo82/full/staged.json");
const wires = await Promise.all((await fs.readdir(`${base}/wire`)).map(file => json(`${base}/wire/${file}`)));
const requestId = "059eeecc-dff4-43b6-8193-07069a9f4a15";
globalThis.fetch = async () => { throw new Error("offline_replay_blocks_network"); };
const proof: any[] = [];
for (const [slot, definition] of definitions.entries()) {
  const raw = ops.find((op: any) => op.operation_key === `p-${requestId}-${slot}:copy`).result;
  const copy = JSON.parse(raw.choices[0].message.content);
  const repair = ops.find((op: any) => op.operation_key === `p-${requestId}-${slot}-fb1:copy_recovery`).result;
  const wire = wires.find(wire => wire.response.id === repair.id);
  const oldTargets = JSON.parse(wire.request.messages.at(-1).content).targets;
  const copyWire = wires.find(wire => wire.response.id === raw.id);
  const oldPrompt = JSON.parse(copyWire.request.messages.at(-1).content);
  const input: any = { requestId, runId: requestId, proposalId: `replay-${slot}`, slot, prompt: oldPrompt.request, contextContent: oldPrompt.factualContext, sourceReferences: oldPrompt.sources, selectedDefinition: definition, postMode: "static", narrativePlan: plan.slots[slot], generationIntent: { content: [{id:"idea-1",meaning:"Convite para conhecer o espaço da Lume."},{id:"idea-2",meaning:"Café artesanal como identidade da casa."},{id:"idea-3",meaning:"Funcionamento de segunda a sexta, das 8h às 18h."}] } };
  const measureText = await createComponentTextMeasurer(definition.assets, asset => fs.readFile(path.join(stage.build, "assets", asset.sha256)));
  const inspect = (value: any) => {
    const baseScene = instantiateCompleteDesign({definition,values:value.slides[0].values,mediaPrompts:[],runId:requestId,slot,slide:0,planHash:"a".repeat(64),experimental:true});
    const scene = resolveArsenalGeometry(baseScene,{measureText,allowReduction:true,elasticReduction:true,allowSubpixelTextOverflow:true});
    const issues = [...partitionArsenalReadinessIssues(scene.issues).blocking];
    for (const element of scene.elements.filter(element => element.kind === "text")) {
      const box=definition.fragment.instances.find((instance: any)=>instance.id===element.id);
      const target=box?{...element,width:box.width,height:box.height}:element;
      const measured=measureArsenalElement(target,measureText);
      if(measured.height>target.height+0.5||measured.lines.some(line=>line.width>target.width+0.5))issues.push(`measured:${element.id}`);
    }
    return {scene,issues:Array.from(new Set(issues))};
  };
  const before=inspect(copy);
  const targets=enrichTargetedCopyRepairTargets(input,[definition],copy,oldTargets,[before.scene],measureText);
  const proposed: Record<string,string> = slot===0 ? {"field-0":"Café artesanal","field-3":"Lume · Café","field-4":"Conheça"} : slot===1 ? {"field-0":"","field-1":"Conheça a Lume"} : {"field-0":"","field-1":"","field-2":"","field-3":"","field-8":"Lume","field-10":copy.slides[0].values.find((row:any)=>row.fieldId==="field-10").value,"field-16":"Visite"};
  const patches={patches:targets.map(target=>({slideIndex:0,fieldId:target.fieldId,itemIndex:null,value:slot===1&&target.fieldId==="field-1"?"W".repeat(80):proposed[target.fieldId],alternatives:slot===1&&target.fieldId==="field-1"?[proposed[target.fieldId]]:target.fieldId==="field-0"&&slot===0?["Lume"]:[]}))};
  const selections: any[]=[];
  const result=applyTargetedCopyRepair(copy,targets,patches,[definition],(candidate,target)=>{
    const inspected=inspect(candidate),field=completeDesignFields(definition).find(field=>field.id===target.fieldId)!;
    const ids=definition.fragment.bindings.filter((binding:any)=>binding.source===field.source).flatMap((binding:any)=>binding.targetIds);
    const fitting=!inspected.issues.some(issue=>!issue.startsWith("collision:")&&ids.includes(issue.split(":").at(-1)));
    selections.push({fieldId:target.fieldId,value:candidate.slides[0].values.find((row:any)=>row.fieldId===target.fieldId).value,fitting});return fitting;
  });
  const after=inspect(result);
  if(slot===1)assert(selections.some(selection=>!selection.fitting), "must reject the unfitting alternative using real Fontkit");
  assert(before.issues.length>0);assert.deepEqual(after.issues,[],`${definition.label}: ${after.issues.join(",")}`);
  assert.equal(result.caption,copy.caption);assert.deepEqual(result.hashtags,copy.hashtags);
  const allowed=new Set(targets.map(target=>target.fieldId));for(const row of copy.slides[0].values)if(!allowed.has(row.fieldId))assert.deepEqual(result.slides[0].values.find((r:any)=>r.fieldId===row.fieldId),row);
  assert.deepEqual(after.scene.pieces,before.scene.pieces);assert.deepEqual(after.scene.base.instances,before.scene.base.instances);
  const payload=compactCopyPrompt(input,[definition]);assert(!payload.includes('"instruction"'));assert(!payload.includes('"ideas"')||JSON.parse(payload).slides[0].ideas.length===3);
  const rawRepairAccepted=targetedCopyRepairSchema(targets,[definition]).safeParse(JSON.parse(repair.choices[0].message.content)).success;
  proof.push({slot,design:definition.label,paidCalls:0,originalIssues:before.issues,replayedOldRepairAcceptedByNewBounds:rawRepairAccepted,repairTargets:targets.map(({fieldId,maxCharacters,fit})=>({fieldId,maxCharacters,fit})),selections,finalIssues:after.issues,healthyFieldsPreserved:true,geometryPreserved:true,originalPromptBytes:Buffer.byteLength(copyWire.request.messages.at(-1).content),compactPromptBytes:Buffer.byteLength(payload),repairPromptBytes:Buffer.byteLength(targetedCopyRepairPrompt(input,[definition],targets)),limitation:"Alternatives are authored offline to verify the repair contract/Fontkit, not a new model result. Full factual review remains mandatory in the real pipeline."});
}
const output={version:1,requestId,paidCalls:0,passed:true,cases:proof};
await fs.writeFile("/tmp/automatic-copy-fit-replay.json",JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
