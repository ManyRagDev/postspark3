import { describe, expect, it, vi } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { assemblyIdentity, compactComponentCard, createComponentDefinition } from "@shared/componentAssembly";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { resolveDesignFamilyRepertoires } from "@shared/designRepertoire";
import { buildFamilySelectionCandidates } from "@shared/designFamilySelection";
import type { GenerationIntent } from "@shared/generationPlan";
import type { EmbeddingEngine } from "../ai/editorialAffinity/embeddingEngine";
import { assertFamilyRetrieval, retrieveFamilyCandidates, semanticFamilyQuery, semanticFamilySources } from "./familyRetrieval";
import { SEMANTIC_MODEL, SEMANTIC_PROFILE_VERSION, buildSemanticDesignIndex, semanticSourceDescriptor, validateSemanticDesignIndex } from "./semanticDesignIndex";
import type { SemanticDesignSearchResult } from "./semanticFamilyRetrieval";
import { boundedFamilyShortlist } from "./boundedFamilyShortlist";
import { inspectFamilyPlanFit } from "./familyPlanFit";
import { shortlistCompleteDesigns, type JevRequest } from "./designShortlist";

const hash = "a".repeat(64);
function fixture(count = 82) {
  const original = completeDesignTestDefinitions()[0];
  const cards = Array.from({length: count}, (_,i) => compactComponentCard(createComponentDefinition({
    ...original, id: assemblyIdentity(["semantic-retrieval", i]), source: {...original.source, variantKey: `source-${i}`},
    completeDesign: {...original.completeDesign!, family: `semantic-family-${i}`},
  })));
  const families = buildFamilySelectionCandidates(resolveDesignFamilyRepertoires(cards, {slideCount: 1, contentMode: "compose"}), null, true);
  const intent: GenerationIntent = {version: 1, objective: "Convite ao recital", tone: {description: "Acolhedor",origin: "explicit",rationale: "Pedido"}, adaptation: "controlled", requirements: [],
    content: [{id: "message",meaning: "Um recital com improviso",requirementIds: [],sourceIds: []}]};
  const engine = {metadata: {...SEMANTIC_MODEL, fingerprint: hash, artifactHash: hash,version: 1, normalization: "nfc_trim_v1",pooling: "attention_mean_l2_v1"},
    embed: vi.fn(async (texts: string[]) => ({vectors: texts.map(() => Float32Array.from({length: 384},(_,i) => i === 0 ? 1 : 0)),inputs: texts.map(() => ({tokenCount: 10,usedTokens: 10,truncated: false}))})),dispose: async () => {}} as unknown as EmbeddingEngine;
  const sources = semanticFamilySources(families, null);
  const result: SemanticDesignSearchResult = {indexHash: "b".repeat(64),modelFingerprint: hash,profileVersion: SEMANTIC_PROFILE_VERSION,calibrationHash: "c".repeat(64),calibrationVersion: "compact-prior-80-v1",
    matchedSourceIds: sources.map(s => s.sourceId),ranking: sources.map((s,i) => ({id: s.familyId, sourceId: s.sourceId,profileHash: hash,rowHash: hash,
      similarity: 0.9-i*0.001,meanAffinity: .81,genericExcess: .02,penalty: .005,adjusted: .895-i*.001,rawRank:i+1,adjustedRank:i+1}))};
  return {cards,families,intent,engine,result};
}
describe("automatic compact semantic retrieval", () => {
  it.each([false,true])("low style scores remain usable; second wave only with actual missing photo capacity (%s)",async requiredPhoto=>{
    const f=fixture(82);
    const retrieval=await retrieveFamilyCandidates({...f,catalog:null,automaticSemantic:{revision:"7",engine:f.engine,search:async()=>f.result}});
    const cards=f.families.flatMap(family=>family.repertoires.map(r=>({...r.slides[0].variants[0],id:r.defaultOffer.offerId,hash:r.defaultOffer.signature})));
    const requests:JevRequest[]=[];
    const sufficient=vi.fn(()=>false); // A low stylistic judgment cannot buy an extra wave.
    const result=await boundedFamilyShortlist({families:f.families,retrieval,
      input:{cards,brief:"Um convite acolhedor",slideCount:1,deadlineMs:null,editorialIntentVersion:1},
      shortlist:input=>shortlistCompleteDesigns(input,async request=>{
        requests.push(request);
        return {model:request.model,answers:Object.fromEntries(Object.keys(request.questions).map(id=>[id,{type:"score" as const,score:0,confidence:.99}])),usage:{input_tokens:10,output_tokens:10,cost:0}};
      }),sufficient,
      recovery:{inspect:(ids,scores)=>inspectFamilyPlanFit({automatic:true,families:f.families,ids,scores,intent:f.intent,
        neutrality:{version:1,seed:"test",proposalSelectionVersion:1},
        imageObligation:{policy:requiredPhoto?"required":"optional",required:requiredPhoto,purpose:requiredPhoto?"subject":"none",reason:"Fixture",slotTargets:requiredPhoto?1:0},
        requestedPhotoMix:false,slideCount:1,recentSelections:[]})}});
    expect(sufficient).not.toHaveBeenCalled();
    expect(result.familyElection.shortlistedIds).toHaveLength(12);
    expect(result.familyElection.ranking.every(r=>r.score===0&&r.confidence===.99)).toBe(true);
    expect(result.familyElection.retrieval?.expanded).toBe(requiredPhoto);
    expect(result.familyElection.retrieval?.semanticRetrieval?.technicalFit?.checkedFamilyIds).toHaveLength(20);
    expect(result.familyElection.retrieval?.semanticRetrieval?.technicalFit?.viableSlots).toHaveLength(requiredPhoto?0:3);
    expect(requests.flatMap(r=>Object.keys(r.questions))).toHaveLength(requiredPhoto?32:20);
    expect(result.cards).toHaveLength(requiredPhoto?32:20);
  });
  it("sends one compact query and source hashes; preserves scored top20 without style veto or media injection", async () => {
    const f = fixture(); const search = vi.fn(async () => f.result);
    const query = "Atmosfera de improviso e convite musical";
    const receipt = await retrieveFamilyCandidates({...f,catalog: null,visualPreference: "Paleta verde", mixedMedia:true,automaticSemantic: {revision:"7",query,engine:f.engine,search}});
    expect(receipt.initialIds).toEqual(f.result.ranking.slice(0,20).map(r=>r.id));
    expect(receipt.additionalIds).toHaveLength(12);
    expect(receipt.semanticRetrieval).toMatchObject({status:"ready",alpha:.25,missingSourceIds:[],rankings:f.result.ranking});
    expect(f.engine.embed).toHaveBeenCalledWith([`${query}\nPaleta verde`],expect.objectContaining({kind:"query",overflow:"reject"}));
    const payload = JSON.stringify(search.mock.calls[0]);
    for (const forbidden of ['"fields"','"slides"','"nodes"','"profile"','"textEn"']) expect(payload).not.toContain(forbidden);
    assertFamilyRetrieval(receipt,f.families,semanticFamilyQuery(f.intent,"Paleta verde",query));
    expect(()=>assertFamilyRetrieval({...receipt,initialIds:receipt.initialIds.slice(1)},f.families,receipt.query)).toThrow();
  });
  it.each(["missing","stale","model","malformed","store-error"])("falls back deterministically and bounded when %s; no family loses eligibility", async mode => {
    const f=fixture(100);
    const search=vi.fn(async()=> {
      if(mode==="store-error")throw new Error("sensitive upstream details");
      if(mode==="missing")return null;
      const result=structuredClone(f.result);
      if(mode==="stale")result.matchedSourceIds.pop();
      if(mode==="model")result.modelFingerprint="d".repeat(64);
      if(mode==="malformed")result.ranking[0].penalty=1;
      return result;
    });
    const input={...f,catalog:null,neutrality:{version:1 as const,seed:"fixed"},automaticSemantic:{revision:"7",engine:f.engine,search}};
    const first=await retrieveFamilyCandidates(input),second=await retrieveFamilyCandidates({...input,families:[...f.families].reverse()});
    expect(first.semanticRetrieval?.status).toBe("fallback");expect(first.initialIds).toHaveLength(20);expect(first.additionalIds).toHaveLength(12);
    expect(first.initialIds).toEqual(second.initialIds);expect(JSON.stringify(first)).not.toContain("sensitive upstream");
    assertFamilyRetrieval(first,f.families,first.query);
  });
  it("does not swallow cancellation and rejects incompatible models before database access",async()=>{
    const f=fixture(2),search=vi.fn(async()=>f.result);const controller=new AbortController();controller.abort();
    vi.mocked(f.engine.embed).mockRejectedValueOnce(new Error("aborted"));
    await expect(retrieveFamilyCandidates({...f,catalog:null,signal:controller.signal,automaticSemantic:{revision:"7",engine:f.engine,search}})).rejects.toThrow("aborted");
    const engine={...f.engine,metadata:{...f.engine.metadata,modelId:"other"}};
    const receipt=await retrieveFamilyCandidates({...f,catalog:null,automaticSemantic:{revision:"7",engine,search}});
    expect(search).not.toHaveBeenCalled();expect(receipt.semanticRetrieval?.fallbackReason).toBe("model_mismatch");
  });
  it("builds from current compact descriptors and immutable 80-query calibration; stale translations cannot publish",async()=>{
    const f=fixture(2);const profiles=f.cards.map(c=>({...semanticSourceDescriptor(c,null),textEn:"An editorial invitation with generous reading space."}));
    const input={revision:"7",cards:f.cards,catalog:null,engine:f.engine,profiles,calibration:{version:"compact-prior-80-v1",provenance:"Synthetic fixture",grandMean:.8,queries:Array.from({length:80},(_,i)=>`Creative invitation ${i}`)}};
    const index=await buildSemanticDesignIndex(input);
    expect(index.documents).toHaveLength(2);expect(index.documents[0].genericExcess).toBeCloseTo(.2);
    expect(index.documents[0].profileHash).toBe(index.documents[1].profileHash);
    expect(validateSemanticDesignIndex(index)).toEqual(index);
    vi.mocked(f.engine.embed).mockClear();const rebuilt=await buildSemanticDesignIndex({...input,previous:index});
    expect(f.engine.embed).not.toHaveBeenCalled();expect(rebuilt.hash).toBe(index.hash);
    await expect(buildSemanticDesignIndex({...input,profiles:[{...profiles[0],sourceTextHash:"f".repeat(64)}]})).rejects.toThrow("english_profile_missing");
    const corrupted=structuredClone(index);corrupted.documents[0].vector[0]=.5;
    const {hash:_,...basis}=corrupted;corrupted.hash=arsenalHash(basis);
    expect(()=>validateSemanticDesignIndex(corrupted)).toThrow("vector_invalid");
  });
});
