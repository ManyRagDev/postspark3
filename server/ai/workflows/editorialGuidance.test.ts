import { describe, expect, it } from "vitest";
import { arsenalHash } from "@shared/arsenalContent";
import { assertReviewExecutionConfigV7, copyInstructionsV7, resolveReviewExecutionConfigV7, reviewContractHashV7, reviewInstructionsV7 } from "./reviewExecutionConfigV7";
import { editorialContextV7, validatedEditorialContext } from "./editorialContextV7";

describe("pinned editorial guidance", () => {
  it("uses old project document defaults, with absent fields and an intact factual source", () => {
    const projectDossier = "## TOM_DE_VOZ\nNatural e próxima\n## PUBLICO_ALVO\nQuem pesquisa preços\n## CTA_PADRAO\nConheça a ferramenta\n## Outra seção\nCondição histórica integral";
    const ctx = editorialContextV7({prompt:"Como avaliar ofertas?",projectDossier,contextContent:projectDossier,platform:"instagram",postMode:"carousel"},6);
    expect(ctx.instructions).toMatchObject({tone:"Natural e próxima",audience:"Quem pesquisa preços",callToAction:"Conheça a ferramenta"});
    expect(ctx.instructionOrigins).toEqual({tone:"project",audience:"project",callToAction:"project"});
    expect(ctx.project?.structuredData.factualDifferentials).toBeUndefined();
    expect(ctx.sources.some(s => s.text === projectDossier)).toBe(true);
    expect(ctx.socialPlaybook?.surface).toContain("carrossel");
  });
  it("keeps reference headings from becoming project defaults and validates the whole frozen context", () => {
    const input = {prompt:"Pedido sem projeto",contextContent:"## TOM_DE_VOZ\nVoz de um site de referência",platform:"instagram",postMode:"static" as const};
    const context = editorialContextV7(input,6);
    expect(context.project).toBeUndefined();
    expect(context.instructions.tone).toBeUndefined();
    expect(validatedEditorialContext({...input,editorialContext:context,editorialContextHash:context.hash},6)).toEqual(context);
    expect(() => validatedEditorialContext({...input,editorialContext:{...context,instructions:{...context.instructions,tone:"Alterado"}},editorialContextHash:context.hash},6)).toThrow("preparation_contract_incompatible");
  });
  it("survives JSON storage reordering snapshot keys without changing source or context hashes", () => {
    const input = {prompt:"Benefício do histórico",platform:"instagram",postMode:"static" as const,projectSnapshot:{version:1 as const,name:"BizuMiner",niche:"Ofertas",structuredData:{voiceTone:"Natural",offerAndTransformation:"Acompanha preços"}}};
    const context = editorialContextV7(input,6);
    const reordered:any = {...input,projectSnapshot:{structuredData:{offerAndTransformation:"Acompanha preços",voiceTone:"Natural"},niche:"Ofertas",name:"BizuMiner",version:1}};
    expect(editorialContextV7(reordered,6).hash).toBe(context.hash);
    expect(validatedEditorialContext({...reordered,editorialContext:JSON.parse(JSON.stringify(context)),editorialContextHash:context.hash},6).hash).toBe(context.hash);
  });
  it("preserves the historical V7 contract and refuses reinterpreting it as new guidance", () => {
    expect(reviewContractHashV7(1)).toBe("caaa057fcc28a0e6c34408bcf946afd1ccd9f7a0695aea490458c01f183c05d8");
    const { editorialGuidanceVersion, configurationHash, ...data } = resolveReviewExecutionConfigV7();
    const original = { ...data, contractHash: reviewContractHashV7(1) };
    const legacy = { ...original, configurationHash: arsenalHash(original) };
    expect(assertReviewExecutionConfigV7(legacy).editorialGuidanceVersion).toBeUndefined();
    const tampered = { ...original, editorialGuidanceVersion: 2 };
    expect(() => assertReviewExecutionConfigV7({ ...tampered, configurationHash: arsenalHash(tampered) })).toThrow("preparation_contract_incompatible");
  });
  it("pins authorship and material calibration together for new requests", () => {
    const config = assertReviewExecutionConfigV7(resolveReviewExecutionConfigV7());
    expect(config.editorialGuidanceVersion).toBe(6);
    expect(config.contractHash).not.toBe(reviewContractHashV7(1));
    expect(copyInstructionsV7(2)).toContain("Post estático: faça uma composição autossuficiente");
    expect(copyInstructionsV7(2)).toContain("Cada página deve trazer uma contribuição nova");
    expect(copyInstructionsV7(1)).not.toContain("Cada página deve trazer uma contribuição nova");
    expect(reviewInstructionsV7(undefined, undefined, 2)).toContain("Processo simples não prova rapidez instantânea");
    expect(reviewInstructionsV7(undefined, undefined, 1)).not.toContain("Processo simples não prova rapidez instantânea");
  });
  it("preserves the measured revision 2 and adds scoped benefits only to revision 3", () => {
    expect(reviewContractHashV7(2)).toBe("011a07590a5e8f5210964ba972f4942214cbbd815277f1a9a40478690fc2d628");
    expect(copyInstructionsV7(2)).not.toContain("Distinga capacidade, finalidade e resultado");
    expect(copyInstructionsV7(3)).toContain("Distinga capacidade, finalidade e resultado");
    expect(reviewInstructionsV7(undefined, undefined, 2)).not.toContain("quantificação implícita");
    expect(reviewInstructionsV7(undefined, undefined, 3)).toContain("Não faça bloqueio lexical");
    const { configurationHash, ...current } = resolveReviewExecutionConfigV7();
    const v2 = { ...current, editorialGuidanceVersion: 2 as const, contractHash: reviewContractHashV7(2) };
    expect(assertReviewExecutionConfigV7({ ...v2, configurationHash: arsenalHash(v2) }).editorialGuidanceVersion).toBe(2);
  });
  it("preserves revision 3 and pins consistent material classification in revision 4", () => {
    expect(reviewContractHashV7(3)).toBe("f8d4c0667857dfbaeee6f9fdb135d81c91b902898010741a3debf5a0bba21407");
    expect(copyInstructionsV7(4)).toBe(copyInstructionsV7(3));
    expect(reviewInstructionsV7(undefined, undefined, 3)).not.toContain("Categoria e consequência devem concordar");
    expect(reviewContractHashV7(4)).toBe("1c326f04feaa4a973dbd85296c14543c5fe0ecce014799686344a627356b9bd3");
  });
  it("preserves revision 4 and pins brand context orientation in revision 5", () => {
    const { configurationHash, ...current } = resolveReviewExecutionConfigV7();
    const v4 = { ...current, editorialGuidanceVersion: 4 as const, contractHash: reviewContractHashV7(4) };
    expect(assertReviewExecutionConfigV7({ ...v4, configurationHash: arsenalHash(v4) }).editorialGuidanceVersion).toBe(4);
    expect(reviewContractHashV7(5)).toBe("552e2288c0ec94b64534e96f5d79fcd323f98bcef6ae7e3d924f5c7a50181ef2");
    expect(reviewInstructionsV7(undefined, undefined, 4)).not.toContain("Público, essência da marca, tom e plataforma");
    expect(reviewInstructionsV7(undefined, undefined, 5)).toContain("Público, essência da marca, tom e plataforma");
    expect(reviewInstructionsV7(undefined, undefined, 5)).toContain("Categoria e consequência devem concordar");
  });
  it("matches frozen contract and context hashes from context-handoff-history fixture", async () => {
    const historyFixture = (await import("./fixtures/context-handoff-history.json")).default;
    const { editorialContextV7 } = await import("./editorialContextV7");

    expect(reviewContractHashV7(1)).toBe(historyFixture.reviewContractHashes.v1);
    expect(reviewContractHashV7(2)).toBe(historyFixture.reviewContractHashes.v2);
    expect(reviewContractHashV7(3)).toBe(historyFixture.reviewContractHashes.v3);
    expect(reviewContractHashV7(4)).toBe(historyFixture.reviewContractHashes.v4);
    expect(reviewContractHashV7(5)).toBe(historyFixture.reviewContractHashes.v5);

    const withoutBrand = editorialContextV7(historyFixture.editorialContextHashes.baseWithoutBrand.input as any, 1);
    expect(withoutBrand.hash).toBe(historyFixture.editorialContextHashes.baseWithoutBrand.hashes.v1);
    expect(withoutBrand.hash).toBe("85572cdecf9a34fe502434862ca326fe1e67a00beae56a31e8cc48384650a28e");

    const withBrandV1 = editorialContextV7(historyFixture.editorialContextHashes.withBrandBrief.input as any, 1);
    expect(withBrandV1.hash).toBe(historyFixture.editorialContextHashes.withBrandBrief.hashes.v1);
    expect(withBrandV1.hash).toBe("b5e24a72073b3bf607335c19a21ae0067b048bf2a8b48756c25bc88ec4938832");

    const withBrandV5 = editorialContextV7(historyFixture.editorialContextHashes.withBrandBrief.input as any, 5);
    expect(withBrandV5.hash).toBe(historyFixture.editorialContextHashes.withBrandBrief.hashes.v5);
    expect(withBrandV5.hash).toBe("29235a899811b86a3e16793cd55c9fcd00ec4d45a248838c4dfdb1351d54c2c9");
  });
});
