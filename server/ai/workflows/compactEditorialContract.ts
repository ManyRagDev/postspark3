import { profileHandleInstructions } from "./profileHandlePolicy";
import { materialGenerationIntent } from "@shared/generationPlan";
import { positiveEditorialInstructions } from "@shared/compactEditorialContract";
import type { ReviewSourceEvidenceV10 } from "@shared/proposalReviewV10";
import type { ProposalExecutionInput } from "./proposalGraph";
import { editorialContextV9 } from "./editorialContextV9";
import { resolvedEditorialContext } from "./editorialContextV8";
import { buildSourceEvidenceV10 } from "./reviewEvidenceV10";

export { positiveEditorialInstructions };
/** Visual references may guide appearance but cannot establish factual claims. */
export function compactEditorialEvidenceKind(evidence: Pick<ReviewSourceEvidenceV10, "kind" | "origin">): ReviewSourceEvidenceV10["kind"] {
  return evidence.origin.endsWith(":visual_reference") ? "guidance" : evidence.kind;
}
type EditorialInput = Pick<ProposalExecutionInput, "prompt" | "editorialContext" | "generationIntent" | "executionBrief" | "tone" | "platform" | "postMode" | "projectSnapshot" | "projectDossier" | "sourceReferences" | "contextContent" | "reviewExecutionConfig">;

export function usesCompactEditorialContract(input: Pick<ProposalExecutionInput, "reviewExecutionConfig">) {
  const config = input.reviewExecutionConfig;
  return config?.version === 5 && "automaticReviewVersion" in config && config.automaticReviewVersion === 4;
}

/** This admission marker keeps historical author/reviewer prompts immutable. */
export function usesTextFlexibility(input: Pick<ProposalExecutionInput, "reviewExecutionConfig">) {
  const config = input.reviewExecutionConfig;
  return config?.version === 5 && "textFlexibilityVersion" in config && config.textFlexibilityVersion === 1;
}

export const textFlexibilityEditorialInstruction = "Oriente a extensão pelas faixas consultivas chars/lines de cada campo ou item; o encaixe real é medido localmente. Campos opcionais podem ficar vazios. A legenda aprofunda a mensagem, preservando o destino exigido dos fatos e condições.";

/** One lossless projection for creator and reviewer. IDs remain those of V10's
 * authoritative evidence; shared text does not merge origins or grant authority. */
export function buildCompactEditorialContract(input: EditorialInput, evidenceInventory?: readonly ReviewSourceEvidenceV10[]) {
  const context = input.editorialContext?.version === 3 ? input.editorialContext : editorialContextV9(input);
  const resolved = resolvedEditorialContext(context);
  const instructions = resolved.instructions;
  const explicitObjective = input.executionBrief?.objective || instructions.objective;
  const objective = explicitObjective || input.generationIntent?.objective;
  const known = new Map<string, string>([[input.prompt, "request"]]);
  const sourceEvidence = (evidenceInventory ?? buildSourceEvidenceV10(context)).map(({id,kind,origin,text}) => {
    const textRef = known.get(text);
    if (!textRef) known.set(text, id);
    return {id,kind: compactEditorialEvidenceKind({kind,origin}),origin,...(textRef ? {textRef} : {text})};
  });
  const project = resolved.project;
  const intentRequirements = (materialGenerationIntent(input.generationIntent)?.requirements ?? []).filter(requirement => requirement.origin === "explicit");
  return {
    version: 1 as const,
    request: input.prompt,
    objective: objective ? {text: objective, origin: explicitObjective ? "explicit" as const : "inferred" as const} : {textRef: "request", origin: "request" as const},
    direction: {
      advisory: true as const,
      ...(instructions.tone || input.generationIntent?.tone.description ? {tone: instructions.tone || input.generationIntent?.tone.description} : {}),
      ...(instructions.audience ? {audience: instructions.audience} : {}),
      ...(instructions.callToAction ? {callToAction: instructions.callToAction} : {}),
      ...(instructions.brandEssence ? {brandEssence: instructions.brandEssence} : {}),
      ...(project?.name || project?.niche ? {brand: {name: project.name, niche: project.niche}} : {}),
    },
    ...(input.executionBrief?.interventionLevel ? {intervention: input.executionBrief.interventionLevel} : {}),
    requirements: resolved.requirements.map(({id,kind,scope,value}) => ({id,kind,scope,value})),
    ...(intentRequirements.length ? {intentRequirements} : {}),
    sourceEvidence,
    ...(usesTextFlexibility(input) ? {textFlexibility: {version: 1 as const, instruction: textFlexibilityEditorialInstruction}} : {}),
    ...(profileHandleInstructions(input) ? {profileHandles: profileHandleInstructions(input)} : {}),
  };
}
