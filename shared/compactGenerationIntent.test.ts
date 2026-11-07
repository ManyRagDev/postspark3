import { describe, expect, it } from "vitest";
import { positiveCompactGenerationIntentInstructions, compactGenerationIntentInstructions, compactGenerationIntentInput, compactGenerationIntentSchema, projectCompactGenerationIntent } from "./compactGenerationIntent";

describe("brief automatic intent", () => {
  const reading = {objective:"Apresentar o café",tone:"Acolhedor",semanticQuery:"Café artesanal, composição tipográfica, sem foto",ideas:[{meaning:"Uma pausa para café",sourceIds:["s1","unknown","s1"]}]};
  it("projects deterministic ideas without making style or factual limits into content obligations", () => {
    const result = projectCompactGenerationIntent(reading,{adaptation:"literal",factualSourceIds:new Set(["s1"])});
    expect(result).toMatchObject({adaptation:"literal",requirements:[],content:[{id:"idea-1",requirementIds:[],sourceIds:["s1"]}]});
    expect(projectCompactGenerationIntent(reading,{adaptation:"literal",factualSourceIds:new Set(["s1"])})).toEqual(result);
    expect(compactGenerationIntentSchema.safeParse({...reading,requirements:[{description:"Não invente preços"}]}).success).toBe(false);
  });
  it("sends each source text once without catalog vocabulary, source hashes or planning metadata", () => {
    const request="Café artesanal, sem foto, não invente preços";
    expect(compactGenerationIntentInput({request,sources:[{id:"s1",text:request},{id:"s2",text:request},{id:"s3",text:"Fato da marca"},{id:"s4",text:"Fato da marca"},{id:"platform",text:"Instagram"}],factualSourceIds:new Set(["s1","s2","s3","s4"])})).toEqual({request,requestSourceIds:["s1","s2"],sources:[{ids:["s3","s4"],text:"Fato da marca"}]});
  });
});


it("pins positive intent instructions independently of historical receipts",()=>{
  expect(positiveCompactGenerationIntentInstructions).toContain("ideias orientam escolhas criativas");
  expect(positiveCompactGenerationIntentInstructions).toContain("Garantias, quantidades, causalidade");
  expect(positiveCompactGenerationIntentInstructions).not.toContain("Não invente fatos, números, preços, garantias ou CTA");
  expect(compactGenerationIntentInstructions).toContain("Não invente fatos, números, preços, garantias ou CTA");
});
