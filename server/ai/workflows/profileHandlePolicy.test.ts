import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_HANDLE, normalizeCopyProfileHandles, profileHandleInstructions, profileHandleValueNormalizer, suppliedProfileHandles } from "./profileHandlePolicy";
import { buildCompactEditorialContract } from "./compactEditorialContract";
import { applyTargetedCopyRepair } from "./compactProposalCopy";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import type { ProposalExecutionInput, CopyResponse } from "./proposalGraph";

const input: ProposalExecutionInput = {prompt:"Crie um post da cafeteria Lume.",requestId:"handles",runId:"00000000-0000-4000-8000-000000000001",proposalId:"handles",slot:0,
  reviewExecutionConfig:{version:5,automaticReviewVersion:4,profileHandlePolicyVersion:1} as ProposalExecutionInput["reviewExecutionConfig"]};
const copy:CopyResponse={caption:"Conheça @LumeInventada.",hashtags:["#cafe"],slides:[{values:[{fieldId:"field-0",value:"@cafeteria_lume"},{fieldId:"field-1",value:["Siga (@lume_cafe)!","Conheça o espaço"]}],mediaPrompts:[{slotId:"photo",prompt:"Café @lume_fake"}]}]};

describe("versioned profile handle placeholder",()=>{
  it("replaces invented profile suggestions without changing raw receipts",()=>{
    const raw=structuredClone(copy), result=normalizeCopyProfileHandles(copy,input);
    expect(result.caption).toBe("Conheça @seuperfil.");
    expect(result.slides[0].values).toEqual([{fieldId:"field-0",value:"@seuperfil"},{fieldId:"field-1",value:["Siga (@seuperfil)!","Conheça o espaço"]}]);
    expect(result.slides[0].mediaPrompts[0].prompt).toBe("Café @seuperfil");
    expect(copy).toEqual(raw);
    expect(normalizeCopyProfileHandles(result,input)).toEqual(result);
  });
  it("preserves original handles and source profile URLs with canonical spelling",()=>{
    const value={...input,prompt:"Use @Lume.Real e @Outra_Marca",sourceReferences:[{kind:"url",purpose:"content",url:"https://www.instagram.com/Lume.Oficial/",facts:"Nosso perfil é @Lume.Fonte."}]};
    expect(suppliedProfileHandles(value)).toEqual(expect.arrayContaining(["@Lume.Real","@Outra_Marca","@Lume.Oficial","@Lume.Fonte"]));
    const normalize=profileHandleValueNormalizer(value);
    expect(normalize("@lume.real @outra_marca @lume.oficial @lume.fonte @inventado")).toBe("@Lume.Real @Outra_Marca @Lume.Oficial @Lume.Fonte @seuperfil");
  });
  it("does not promote handles from visual/style references into real profiles",()=>{
    const value={...input,sourceReferences:[{kind:"image",purpose:"visual_reference",facts:"Referência visual @MarcaDaFoto",url:"https://instagram.com/MarcaDaFoto"},{kind:"text",purpose:"guidance",facts:"Tom semelhante ao @GuiaDeEstilo"}]};
    expect(suppliedProfileHandles(value)).toEqual([]);
    expect(profileHandleValueNormalizer(value)("@MarcaDaFoto @GuiaDeEstilo")).toBe("@seuperfil @seuperfil");
  });
  it("keeps emails, URL paths/query strings and code examples intact",()=>{
    const text="contato@lume.com, josé@lume.com; https://site.test/?q=@lume https://instagram.com/@lume www.site.test/@lume mailto:contato@lume.com `@media`";
    expect(profileHandleValueNormalizer(input)(text)).toBe(text);
    expect(suppliedProfileHandles({...input,prompt:text})).not.toContain("@media");
  });
  it("handles punctuation, adjacent mentions and federated handles as complete tokens",()=>{
    expect(profileHandleValueNormalizer(input)("(@a), @b! [@c] @d. @user@server.example")).toBe("(@seuperfil), @seuperfil! [@seuperfil] @seuperfil. @seuperfil");
    expect(profileHandleValueNormalizer(input)(DEFAULT_PROFILE_HANDLE)).toBe(DEFAULT_PROFILE_HANDLE);
  });
  it("keeps visual_only literal and historical requests unchanged",()=>{
    expect(normalizeCopyProfileHandles(copy,{...input,reviewExecutionConfig:undefined})).toBe(copy);
    expect(profileHandleInstructions({...input,reviewExecutionConfig:undefined})).toBeUndefined();
    const literal={...input,executionBrief:{interventionLevel:"visual_only"} as any};
    expect(normalizeCopyProfileHandles(copy,literal)).toBe(copy);
    expect(profileHandleValueNormalizer(literal)("@unknown")).toBe("@unknown");
  });
  it("gives the reviewer and author the same explicit non-factual placeholder rule",()=>{
    const contract=buildCompactEditorialContract(input);
    expect(contract.profileHandles).toMatchObject({placeholder:"@seuperfil",provided:[]});
    expect(contract.profileHandles!.rule).toContain("não afirma que uma conta exista");
    expect(buildCompactEditorialContract({...input,reviewExecutionConfig:undefined})).not.toHaveProperty("profileHandles");
  });
  it("normalizes and deduplicates repair alternatives before fit, preserving healthy fields",()=>{
    const original={...copy,slides:[{values:[{fieldId:"field-0",value:"Texto atual"},{fieldId:"field-1",value:"Saudável @fornecido"}],mediaPrompts:[]}]};
    const target={slideIndex:0,fieldId:"field-0",itemIndex:null,current:"Texto atual",reason:["overflow"]};
    const fits=vi.fn((candidate:CopyResponse)=>candidate.slides[0].values[0].value==="Visite");
    const result=applyTargetedCopyRepair(original,[target],{patches:[{slideIndex:0,fieldId:"field-0",itemIndex:null,value:"@inventado",alternatives:["@outro","Visite"]}]},[completeDesignTestDefinitions()[0]],fits,2,profileHandleValueNormalizer(input));
    expect(fits).toHaveBeenCalledTimes(2);
    expect(result.slides[0].values).toEqual([{fieldId:"field-0",value:"Visite"},{fieldId:"field-1",value:"Saudável @fornecido"}]);
    expect(result.caption).toBe(original.caption);
  });
});
