import { arsenalHash } from "@shared/arsenalContent";
import type { ComponentDefinitionV1 } from "@shared/componentAssembly";
import type { ArsenalComposition } from "@shared/designArsenal";
import type { InvokeParams } from "../../_core/llm";
import { generationPinnedTaskModelCallOptions } from "../generationModel";
import type { CopyResponse, ProposalExecutionInput, ProposalGraphDeps } from "./proposalGraph";
import { visualTextRepairPrompt, visualTextRepairSystemPrompt, type TargetedCopyRepairTarget } from "./compactProposalCopy";

export function usesVisualTextRepair(input: Pick<ProposalExecutionInput,"reviewExecutionConfig">) {
  return input.reviewExecutionConfig?.version === 5 && input.reviewExecutionConfig.visualTextRepairVersion === 1;
}

/** Render only the affected slides. The corrector sees the same measured draft
 * as the editor, while geometry and the catalogue stay outside the AI payload.
 * Render before starting the paid operation, so a local renderer failure cannot
 * be mistaken for an uncertain provider effect. */
export async function visualTextRepairCall(input: ProposalExecutionInput, deps: ProposalGraphDeps,
  definitions: ComponentDefinitionV1[], compositions: ArsenalComposition[], targets: TargetedCopyRepairTarget[], copy: CopyResponse) {
  const config=input.reviewExecutionConfig;
  if(config?.version!==5 || !usesVisualTextRepair(input) || !config.taskModelConfig) throw new Error("visual_text_repair_config_missing");
  const slideIndices=Array.from(new Set(targets.map(target=>target.slideIndex))).sort((a,b)=>a-b);
  if(!slideIndices.length || slideIndices.some(index=>!compositions[index]||!definitions[index])) throw new Error("visual_text_repair_targets_missing");
  input.signal?.throwIfAborted();
  const deadlineMs=Math.min(input.deadlineMs??Infinity,Date.now()+30_000);
  if(deadlineMs<=Date.now())throw new Error("generation_deadline_exceeded");
  const signal=AbortSignal.any([...(input.signal?[input.signal]:[]),AbortSignal.timeout(Math.max(1,deadlineMs-Date.now()))]);
  const renderer=deps.renderReviewScenes??(await import("./proposalRenderer")).renderReviewScenes;
  const scenes=await renderer({compositions:slideIndices.map(index=>compositions[index]),definitions:slideIndices.map(index=>definitions[index]),actor:deps.actor,signal,deadlineMs});
  scenes.sort((a,b)=>a.slideIndex-b.slideIndex);
  if(scenes.length!==slideIndices.length || scenes.some((scene,index)=>scene.slideIndex!==index||scene.renderer!=="CanvasPostStage"||scene.width<256||scene.height<256||scene.width>4096||scene.height>4096||!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(scene.dataUri)) || scenes.reduce((n,scene)=>n+scene.dataUri.length,0)>16_000_000)throw new Error("visual_text_repair_renderer_unavailable");
  const messages:InvokeParams["messages"]=[
    {role:"system",content:visualTextRepairSystemPrompt(input)},
    {role:"user",content:[{type:"text",text:visualTextRepairPrompt(input,definitions,targets,copy)},
      ...scenes.flatMap((scene,index)=>[{type:"text" as const,text:`Rascunho do slide ${slideIndices[index]}; corrija os campos autorizados considerando a composição.`},
        {type:"image_url" as const,image_url:{url:scene.dataUri,detail:"high" as const}}])]},
  ];
  return {options:generationPinnedTaskModelCallOptions(config.taskModelConfig),messages,
    evidence:{version:1 as const,slides:scenes.map((scene,index)=>({slideIndex:slideIndices[index],hash:arsenalHash(scene.dataUri)}))}};
}
