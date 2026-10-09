import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  deriveVariableContentContract,
  validateVariableContent,
  variableContentDocumentSchema,
  variableContentResponseSchema,
  variableContentContractSchema,
  variableContentPromptInstructions,
  type VariableContent,
  type VariableContentContract,
} from "./variableContent";
import {
  contentCoverageIssues,
  readContentSource,
  arsenalHash,
  setContentSource,
  designContentGenerationSchema,
} from "./arsenalContent";
import { catalogBundleV2Schema } from "./designArsenal";
import { createArsenalBundle } from "./arsenalGeneration";
const copy = (n: number): VariableContent => ({
  schemaVersion: 3,
  blocks: Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    type: "text",
    role: "body",
    text: `Frase ${i}`,
  })),
  caption: "",
  hashtags: [],
});
const bundleFor = (
  content: VariableContent,
  contentContract: VariableContentContract
) =>
  createArsenalBundle({
    offers: [],
    usedCandidateIds: [],
    contentContract,
    traceId: "test",
    runId: "test",
    slot: 0,
    copy: {
      content,
      designCandidateId: "none",
      tone: "Profissional",
      imagePrompt: "",
      backgroundColor: "#ffffff",
      textColor: "#111111",
      accentColor: "#555555",
      layout: "minimal",
      aspectRatio: "1:1",
      copyAngle: { type: "beneficio", label: "Café" },
    },
  });
describe("contrato variável por pedido", () => {
  const listCopy = (counts: number[]): VariableContent => ({
    ...copy(0),
    blocks: counts.map((n, index) => ({
      id: `l${index}`,
      type: "list",
      items: Array.from({ length: n }, (_, i) => ({
        id: `i${i}`,
        text: `Dica ${i}`,
      })),
    })),
  });
  it("quantidade livre não recebe os padrões 8, 4 ou 15", () => {
    const c = deriveVariableContentContract("post sobre café");
    expect(c).toMatchObject({ version: 2, blocks: null, listItems: null });
    expect(validateVariableContent(copy(20), c)).toEqual([]);
    const list = deriveVariableContentContract("lista de dicas de café");
    expect(list).toMatchObject({
      version: 2,
      blocks: null,
      listItems: null,
      requiredTypes: ["list"],
    });
    expect(validateVariableContent(listCopy([12, 12]), list)).toEqual([]);
    const json = z.toJSONSchema(variableContentResponseSchema(c));
    expect(json.properties?.blocks).not.toHaveProperty("maxItems");
    const listJson = z.toJSONSchema(
      variableContentResponseSchema(
        deriveVariableContentContract("apenas uma lista")
      )
    ) as any;
    expect(
      listJson.properties.blocks.items.properties.items
    ).not.toHaveProperty("maxItems");
    expect(variableContentPromptInstructions(c)).not.toMatch(
      /\b(4|8|15|32|64)\b/
    );
  });
  it("liberdade editorial mantém o orçamento técnico no servidor", () => {
    const c = deriveVariableContentContract("post sobre café");
    expect(variableContentResponseSchema(c).safeParse(copy(33)).success).toBe(
      true
    );
    expect(validateVariableContent(copy(33), c)).toContain(
      "Orçamento técnico: use até 32 blocos"
    );
    expect(validateVariableContent(listCopy([32, 33]), c)).toContain(
      "Orçamento técnico: use até 64 itens no total"
    );
    expect(
      designContentGenerationSchema.safeParse(listCopy([32, 33])).success
    ).toBe(false);
    expect(validateVariableContent(listCopy([32, 32]), c)).toEqual([]);
    const huge = copy(4);
    huge.blocks = huge.blocks.map(b => ({
      ...b,
      text: "x".repeat(3100),
    })) as VariableContent["blocks"];
    expect(validateVariableContent(huge, c)).toContain(
      "Conteúdo excede 12.000 caracteres"
    );
  });
  it("contrato V1 preserva limites, bytes canônicos e hash no bundle", () => {
    const legacy = {
      ...deriveVariableContentContract("post sobre café"),
      version: 1 as const,
      blocks: { min: 1, max: 8 },
      listItems: { min: 1, max: 15 },
    };
    const hash = arsenalHash(legacy);
    expect(variableContentContractSchema.parse(legacy)).toEqual(legacy);
    expect(validateVariableContent(copy(9), legacy).length).toBeGreaterThan(0);
    expect(
      validateVariableContent(listCopy([16]), legacy).length
    ).toBeGreaterThan(0);
    expect(
      variableContentContractSchema.safeParse({ ...legacy, blocks: null })
        .success
    ).toBe(false);
    const bundle = bundleFor(copy(1), legacy);
    expect(
      arsenalHash(catalogBundleV2Schema.parse(bundle).contentContract)
    ).toBe(hash);
  });
  it("bundle V2 transporta contrato livre V2 e preserva todo o conteúdo", () => {
    const c = deriveVariableContentContract("lista de dicas de café");
    const content = listCopy([20]);
    const bundle = bundleFor(content, c);
    const parsed = catalogBundleV2Schema.parse(
      JSON.parse(JSON.stringify(bundle))
    );
    expect(parsed.contentContract).toEqual(c);
    expect(parsed.content).toEqual(content);
    expect(parsed.userContentHash).toBe(arsenalHash(content));
  });
  it("uma frase não acrescenta título ou CTA", () => {
    const c = deriveVariableContentContract(
      "Crie apenas uma frase sobre café, sem título e sem CTA"
    );
    expect(validateVariableContent(copy(1), c)).toEqual([]);
    expect(validateVariableContent(copy(2), c).length).toBeGreaterThan(0);
    expect(
      variableContentResponseSchema(c).safeParse({
        ...copy(1),
        blocks: [{ ...copy(1).blocks[0], role: "headline" }],
      }).success
    ).toBe(false);
  });
  it("15 elementos são 15 blocos, sem teto legado de 12", () => {
    const c = deriveVariableContentContract(
      "Crie quinze elementos de conteúdo sobre café"
    );
    expect(c.blocks).toEqual({ min: 15, max: 15 });
    expect(validateVariableContent(copy(15), c)).toEqual([]);
    expect(validateVariableContent(copy(14), c).length).toBeGreaterThan(0);
  });
  it("15 itens são uma lista com 15 entradas, não 15 blocos", () => {
    const c = deriveVariableContentContract(
      "Crie uma lista de 15 dicas sobre café"
    );
    const v: VariableContent = {
      ...copy(0),
      blocks: [
        {
          id: "lista",
          type: "list",
          items: Array.from({ length: 15 }, (_, i) => ({
            id: `i${i}`,
            text: `Dica ${i}`,
          })),
        },
      ],
    };
    expect(validateVariableContent(v, c)).toEqual([]);
    expect(
      validateVariableContent({ ...v, blocks: copy(15).blocks }, c).length
    ).toBeGreaterThan(0);
    expect(c.listItems).toEqual({ min: 15, max: 15 });
  });
  it.each(["0 elementos", "33 elementos", "65 itens", "1 bloco e 15 blocos"])(
    "recusa orçamento ou contradição sem reduzir: %s",
    prompt => expect(() => deriveVariableContentContract(prompt)).toThrow()
  );
  it("IDs duplicados e campos de geometria são inválidos", () => {
    expect(
      variableContentDocumentSchema.safeParse({
        ...copy(1),
        blocks: [copy(1).blocks[0], copy(1).blocks[0]],
      }).success
    ).toBe(false);
    expect(
      variableContentDocumentSchema.safeParse({ ...copy(1), x: 10 }).success
    ).toBe(false);
  });
  it("editor não impõe limites de geração ao documento salvo", () => {
    expect(
      variableContentDocumentSchema.safeParse({
        ...copy(40),
        blocks: [
          {
            id: "l",
            type: "list",
            items: Array.from({ length: 80 }, (_, i) => ({
              id: `i${i}`,
              text: "x".repeat(5000),
            })),
          },
        ],
      }).success
    ).toBe(true);
  });
  it("cobertura confere todos os blocos repetidos e bindings usam IDs estáveis", () => {
    const v = copy(2);
    expect(contentCoverageIssues(v, [{ source: "body" }])).toEqual([
      "content_coverage:content:b1:text",
    ]);
    expect(
      contentCoverageIssues(v, [
        { source: "block:body:0:text" },
        { source: "block:body:1:text" },
      ])
    ).toEqual([]);
    expect(readContentSource(v, "block:body:1:text")).toBe("Frase 1");
    const before = arsenalHash(v);
    setContentSource(v, "content:b1:text", "Nova frase");
    expect(readContentSource(v, "block:body:1:text")).toBe("Nova frase");
    expect(arsenalHash(v)).not.toBe(before);
  });
  it("não exige a lista proibida em uma frase", () => {
    expect(
      deriveVariableContentContract("apenas uma frase, sem lista").requiredTypes
    ).toEqual([]);
  });
  it("faixas e teto são mantidos, sem virar contagem exata", () => {
    expect(
      deriveVariableContentContract("entre 1 e 15 elementos").blocks
    ).toEqual({ min: 1, max: 15 });
    expect(deriveVariableContentContract("até 15 itens").listItems).toEqual({
      min: 1,
      max: 15,
    });
    expect(
      deriveVariableContentContract("entre três e quinze dicas").listItems
    ).toEqual({ min: 3, max: 15 });
  });
  it("conteúdo literal não define uma contagem de produção", () => {
    expect(
      deriveVariableContentContract(
        'Escreva apenas uma frase: "Existem 15 elementos nessa coleção"'
      ).blocks
    ).toEqual({ min: 1, max: 1 });
  });
  it("apenas uma lista proíbe blocos extras", () => {
    const contract = deriveVariableContentContract(
      "apenas uma lista com 15 itens"
    );
    expect(contract.blocks).toEqual({ min: 1, max: 1 });
    expect(contract.allowedTypes).toEqual(["list"]);
  });
  it.each([
    "1000 elementos",
    "1 elemento com título e corpo",
    "sem lista, mas com 15 itens",
  ])("recusa pedido impossível: %s", prompt =>
    expect(() => deriveVariableContentContract(prompt)).toThrow()
  );
  it("15 itens é o total entre listas, não 15 por lista", () => {
    const contract = deriveVariableContentContract("15 itens");
    const list = (id: string, n: number) => ({
      id,
      type: "list" as const,
      items: Array.from({ length: n }, (_, i) => ({
        id: `${id}-${i}`,
        text: "Conselho",
      })),
    });
    expect(
      validateVariableContent(
        { ...copy(0), blocks: [list("a", 7), list("b", 8)] },
        contract
      )
    ).toEqual([]);
    expect(
      validateVariableContent(
        { ...copy(0), blocks: [list("a", 15), list("b", 15)] },
        contract
      ).some(e => e.startsWith("Total de itens"))
    ).toBe(true);
  });
  it.each([
    ["apenas um título", "text", "headline"],
    ["apenas um CTA", "text", "callToAction"],
    ["apenas uma métrica", "metric", null],
    ["apenas uma citação", "quote", null],
    ["apenas uma comparação", "comparison", null],
  ])(
    "tipo singular explícito é contrato obrigatório: %s",
    (prompt, type, role) => {
      const c = deriveVariableContentContract(prompt!);
      expect(c.blocks).toEqual({ min: 1, max: 1 });
      expect(c.allowedTypes).toEqual([type]);
      if (role) expect(c.requiredTextRoles).toEqual([role]);
      else expect(c.requiredTypes).toEqual([type]);
    }
  );
  it("frase sobre citação continua sendo texto e pode usar o papel permitido", () => {
    const c = deriveVariableContentContract(
      "apenas uma frase sobre citação, sem corpo"
    );
    expect(c.allowedTypes).toEqual(["text"]);
    expect(c.allowedTextRoles).toEqual(["headline"]);
  });
});
