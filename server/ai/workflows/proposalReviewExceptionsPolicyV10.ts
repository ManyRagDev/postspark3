import { compactEditorialEvidenceKind } from "./compactEditorialContract";
import { arsenalHash } from "@shared/arsenalContent";
import { proposalReviewExceptionsResponseV10Schema, proposalReviewExceptionsRecordV10Schema, type ReviewExceptionsResponseV10, type ProposalReviewExceptionsRecordV10, type ReviewSourceEvidenceV10 } from "@shared/proposalReviewV10";
import { materialFindingV7, type ReviewTextUnitV7 } from "@shared/proposalReviewV7";
import type { EditorialContextV3 } from "./editorialContextV9";
import { resolvedEditorialContext } from "./editorialContextV8";
import { requirementUnitMatchesV7 } from "./proposalReviewPolicy";
import { buildReviewEvidenceAliases } from "./reviewEvidence";
const invalid = (rule: string): never => {throw Object.assign(new Error("proposal_review_incomplete_evidence"),{violation:{rule}});};
/** Duplicate keys remain invalid even though the new receipt has no positive audit. */
export function decodeReviewExceptionsV10(raw: string): ReviewExceptionsResponseV10 {
  if(raw.length>100000)invalid("response_size");
  const tokens=raw.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g)??[];let index=0;
  function walk(depth=0):void {if(depth>100)invalid("json_depth");const token=tokens[index++];
    if(token==="{"){const keys=new Set<string>();if(tokens[index]==="}"){index++;return;}for(;;){const key=JSON.parse(tokens[index++]);if(typeof key!=="string"||keys.has(key)||tokens[index++]!==":")invalid("duplicate_or_invalid_json_key");keys.add(key);walk(depth+1);const separator=tokens[index++];if(separator==="}")break;if(separator!==",")invalid("json_syntax");}}
    else if(token==="["){if(tokens[index]==="]"){index++;return;}for(;;){walk(depth+1);const separator=tokens[index++];if(separator==="]")break;if(separator!==",")invalid("json_syntax");}}
    else {if(token===undefined)invalid("json_syntax");JSON.parse(token);}}
  try{walk();if(index!==tokens.length)invalid("json_syntax");const parsed=proposalReviewExceptionsResponseV10Schema.safeParse(JSON.parse(raw));if(!parsed.success)return invalid("response_schema");return parsed.data;}catch(error){if((error as any)?.violation)throw error;return invalid("json_syntax");}
}
export function normalizeReviewExceptionsV10(input: {
  response: ReviewExceptionsResponseV10; units: ReviewTextUnitV7[]; evidenceInventory: ReviewSourceEvidenceV10[];
  context: EditorialContextV3; aliases: ReturnType<typeof buildReviewEvidenceAliases>; slideCount:number;
  round:"initial"|"recheck"; inputHash:string; operationKeys:string[];
}): ProposalReviewExceptionsRecordV10 {
  const {response:r,units,evidenceInventory}=input;
  if(new Set(r.reviewedSlides).size!==r.reviewedSlides.length||r.reviewedSlides.some(i=>i>=input.slideCount)||
    (r.status==="reviewed"&&(r.limitation!==null||r.reviewedSlides.length!==input.slideCount))||
    (r.status!=="reviewed"&&!r.limitation?.trim())||(r.status==="unavailable"&&r.reviewedSlides.length))invalid("inspection_coverage_or_limitation");
  const findings:ProposalReviewExceptionsRecordV10["findings"]=r.findings.map(f=>{
    const unit=units.find(u=>u.id===f.targetId);const match=/^slide:([0-9])$/.exec(f.targetId);
    if(!unit&&!match)invalid("unknown_target_id");
    const slideIndex=unit?.slideIndex??(match?Number(match[1]):0);
    if(slideIndex>=input.slideCount||((unit?.scope??"art")==="art"&&!r.reviewedSlides.includes(slideIndex)))invalid("uninspected_target");
    if(new Set(f.evidenceIds).size!==f.evidenceIds.length)invalid("duplicate_evidence_id");
    const refs=f.evidenceIds.map(id=>evidenceInventory.find(e=>e.id===id)??invalid("unknown_evidence_id"));
    if(["unsupported_claim","factual_contradiction","entity_changed","fact_omission","explicit_requirement","visible_text_loss","media_missing"].includes(f.category)&&f.consequence==="none")invalid("category_consequence_inconsistent");
    if(["narrative_gap","narrative_structure"].includes(f.category)&&!["none","meaning_loss","explicit_requirement"].includes(f.consequence))invalid("category_consequence_inconsistent");
    if(["factual_contradiction","entity_changed","fact_omission"].includes(f.category)&&(!refs.length||refs.some(e=>compactEditorialEvidenceKind(e)!=="content")))invalid("content_evidence_required");
    if(f.category==="explicit_requirement"&&(!refs.length||refs.every(e=>compactEditorialEvidenceKind(e)==="guidance")))invalid("requirement_evidence_required");
    const consequence=f.category==="contrast"?"none":f.consequence;
    const material=materialFindingV7({...f,consequence} as any);
    if(material&&!f.expected.trim())invalid("missing_material_correction");
    const source=refs[0];
    return {category:f.category,unitId:unit?.id??null,slideIndex,fieldId:unit?.fieldId??null,itemIndex:unit?.itemIndex??null,
      scope:unit?.scope??"art",observed:unit?.text.slice(0,4000)??f.detail,expected:f.expected,sourceId:source?.sourceId??null,
      sourceQuote:source?.text??"",explanation:f.detail,consequence,certainty:f.certainty,action:"none",effect:material?"blocking":"advisory",
      authority:material?(f.category==="explicit_requirement"?"contract_grounded":"source_grounded"):"diagnostic"};
  });
  // Existing deterministic literal/surface constraints remain local safeguards.
  // This is not a fabricated model judgment or positive coverage receipt.
  const resolved=resolvedEditorialContext(input.context);
  for(const requirement of resolved.requirements){if(requirement.kind==="meaning")continue;
    const matches=requirementUnitMatchesV7(requirement,units,input.aliases);
    if(requirement.kind==="forbidden"?!matches.length:matches.length)continue;
    const unit=matches[0]??units.find(u=>(requirement.scope==="either"||u.scope===requirement.scope)&&(u.scope==="caption"||u.visibleAliases.length));
    findings.push({category:"explicit_requirement",unitId:unit?.id??null,slideIndex:unit?.slideIndex??0,fieldId:unit?.fieldId??null,itemIndex:unit?.itemIndex??null,
      scope:unit?.scope??(requirement.scope==="caption"?"caption":"art"),observed:unit?.text.slice(0,4000)??"",expected:requirement.value,
      sourceId:null,sourceQuote:"",explanation:"Obrigação textual não atendida no destino solicitado (verificação local).",consequence:"explicit_requirement",certainty:"established",action:"none",effect:"blocking",authority:"contract_grounded"});
  }
  const uncertain=findings.some(f=>f.effect==="blocking"&&f.certainty==="uncertain");
  const status=r.status!=="reviewed"||uncertain?"inconclusive":findings.some(f=>f.effect==="blocking")?"correction_required":"passed";
  return proposalReviewExceptionsRecordV10Schema.parse({policyVersion:10,automaticReviewVersion:4,round:input.round,inputHash:input.inputHash,status,
    inspectionStatus:r.status,expectedSlideCount:input.slideCount,reviewedSlides:r.reviewedSlides,findings,
    limitation:status==="inconclusive"?(r.limitation??"proposal_review_semantic_inconclusive"):"",operationKeys:input.operationKeys,
    rawResponseHash:arsenalHash(r),evidenceInventory});
}
