import { describe, expect, it } from "vitest";
import definitionJson from "@shared/nativeGlyph.r9-14.fixture.json";
import { componentDefinitionV1Schema } from "@shared/componentAssembly";
import { compactCopyTransportSchema, compactCopyValidationSchema, compactWritableSlides, targetedCopyRepairSchema } from "./compactProposalCopy";
import type { ProposalExecutionInput } from "./proposalGraph";
const definition=componentDefinitionV1Schema.parse(definitionJson);
const input={prompt:"Crie um post",requestId:"glyph",runId:"11111111-1111-4111-8111-111111111111",proposalId:"glyph",slot:0,reviewExecutionConfig:{version:5,automaticReviewVersion:4,nativeGlyphProjection:1}} as ProposalExecutionInput;
const copy={caption:"",hashtags:[],slides:[{values:[{fieldId:"field-0",value:"Uma pausa"},{fieldId:"field-1",value:"Café artesanal"},{fieldId:"field-2",value:"Lume"}],mediaPrompts:[]}]};
describe("compact native glyph integration",()=>{
  it("omits only the verified ornament from the new writable prompt and validates projected copy",()=>{
    expect(compactWritableSlides(input,[definition])[0].fields.map(f=>f.fieldId)).toEqual(["field-0","field-1","field-2"]);
    expect(compactCopyTransportSchema([definition],1).safeParse(copy).success).toBe(true);
    expect(compactCopyValidationSchema([definition],1).safeParse(copy).success).toBe(true);
    expect(compactCopyValidationSchema([definition]).safeParse(copy).success).toBe(false);
  });
  it("keeps the old native field set while rejecting an attempted projected ornament write",()=>{
    const historical={...copy,slides:[{...copy.slides[0],values:[...copy.slides[0].values,{fieldId:"field-3",value:"➔"}]}]};
    expect(compactCopyValidationSchema([definition]).safeParse(historical).success).toBe(true);
    expect(compactCopyValidationSchema([definition],1).safeParse(historical).success).toBe(false);
    expect(compactWritableSlides({...input,reviewExecutionConfig:undefined},[definition])[0].fields).toHaveLength(4);
  });
  it("cannot authorize a paid repair for the projected read-only ornament",()=>{
    const target={slideIndex:0,fieldId:"field-3",itemIndex:null,current:"➔",reason:["overflow"]};
    expect(()=>targetedCopyRepairSchema([target],[definition],2,1)).toThrow("copy_repair_unknown_native_field");
    expect(()=>targetedCopyRepairSchema([target],[definition],2)).not.toThrow();
  });
});
