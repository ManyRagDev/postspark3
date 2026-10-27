import { describe, expect, it, vi, afterEach } from "vitest";
import {
  completeSourceContext,
  GENERATION_CONTEXT_MAX_CHARS,
} from "@shared/sourceContext";
import { loadGenerationContext } from "./generationRuntime";
import {
  loadSiteIntelligence,
  siteIntelligenceToPrompt,
} from "../../siteIntelligence";
import { scrapeUrl } from "../../siteContent";

vi.mock("../../siteIntelligence", () => ({
  loadSiteIntelligence: vi.fn(),
  siteIntelligenceToPrompt: vi.fn(),
}));
vi.mock("../../siteContent", () => ({ scrapeUrl: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const input = { inputType: "text", content: "Pedido do usuário" } as any;

describe("complete generation context", () => {
  it("uses an admitted structured-only project snapshot without loading a live project", async () => {
    const projectSnapshot = {version:1,name:"Projeto local",niche:"Ofertas",structuredData:{voiceTone:"Natural",offerAndTransformation:"Acompanha preços"}};
    const result = await loadGenerationContext({...input,projectId:"local-only",projectDossier:"",projectSnapshot},"owner");
    expect(result).toContain("Projeto local");expect(result).toContain("Acompanha preços");expect(result).toContain("Pedido do usuário");
  });
  it("preserves the exact source up to its limit and refuses to delete the end", () => {
    const text = "x".repeat(GENERATION_CONTEXT_MAX_CHARS - 12) + "Só até 18h!!";
    expect(completeSourceContext(text)).toBe(text);
    expect(() => completeSourceContext(text + " Mais conteúdo")).toThrow(
      "Envie um trecho menor"
    );
  });
  it("requests complete URL extraction and preserves a fact after character 12000", async () => {
    const content = "x".repeat(13000) + " Frete grátis somente acima de R$ 100";
    vi.mocked(scrapeUrl).mockResolvedValue({
      url: "https://example.test",
      title: "Loja",
      description: "Ofertas",
      content,
    });
    const result = await loadGenerationContext(
      { ...input, inputType: "url", content: "https://example.test" },
      "owner"
    );
    expect(scrapeUrl).toHaveBeenCalledWith("https://example.test", {
      requireComplete: true,
    });
    expect(result).toContain("Frete grátis somente acima de R$ 100");
  });
  it("counts title, description and user content in the combined URL budget", async () => {
    vi.mocked(scrapeUrl).mockResolvedValue({
      url: "https://example.test",
      title: "Loja",
      description: "Ofertas",
      content: "x".repeat(24000),
    });
    await expect(
      loadGenerationContext(
        { ...input, inputType: "url", content: "https://example.test" },
        "owner"
      )
    ).rejects.toThrow("limite de leitura integral");
  });
  it("does not truncate supplied Site Intelligence evidence or query another owner", async () => {
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "site-1",
      sourceUrl: "https://example.test",
      fingerprint: "abc123hash",
      evidence: [
        {
          id: "ev-1",
          sourceUrl: "https://example.test",
          kind: "body",
          text: "x".repeat(24000) + " Condição essencial",
        },
      ],
    } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "site" }, "owner")
    ).rejects.toThrow("limite de leitura integral");
    expect(loadSiteIntelligence).toHaveBeenCalledWith("site", "owner");
  });

  it("preserves exact snapshot evidence with id, kind, sourceUrl and quality metadata", async () => {
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "site-snapshot-42",
      sourceUrl: "https://advocacia.test",
      fingerprint: "fp-xyz-789",
      extractedAt: "2026-10-15T12:00:00Z",
      quality: {
        overall: 85,
        visual: 90,
        semantic: 80,
        evidenceCoverage: 85,
        fallbackUsed: false,
        warnings: ["aviso não crítico de favicon"],
      },
      brand: {
        brandName: "Silva & Santos",
        industry: "Direito",
        colors: {
          palette: ["#001122", "#334455"],
          primary: "#001122",
        },
      },
      business: {
        summary: "Escritório de advocacia empresarial",
        valueProposition: "Segurança jurídica para PMEs",
        products: [],
        services: ["Contratos", "Societário"],
        audiences: ["Empresários"],
        audienceProblems: ["Burocracia contratual"],
        differentiators: ["Atendimento personalizado"],
        goals: ["authority", "lead"],
      },
      editorial: {
        pillars: ["Direito Preventivo"],
        priorityTopics: ["Contratos claros"],
        prohibitedClaims: ["Garantia de causa ganha"],
        toneGuidelines: ["Formal e acessível"],
      },
      evidence: [
        {
          id: "ev-title-1",
          sourceUrl: "https://advocacia.test/sobre",
          kind: "title",
          text: "Silva & Santos Advocacia Empresarial",
        },
        {
          id: "ev-body-2",
          sourceUrl: "https://advocacia.test/servicos",
          kind: "body",
          text: "Atuamos em contratos empresariais complexos desde 2010.",
        },
      ],
    } as any);

    const result = await loadGenerationContext(
      { ...input, siteIntelligenceId: "site-snapshot-42" },
      "owner-123"
    );

    // AC-1: exact identifiers, origin, fingerprint, dates, quality
    expect(result).toContain("site-snapshot-42");
    expect(result).toContain("https://advocacia.test");
    expect(result).toContain("fp-xyz-789");
    expect(result).toContain("2026-10-15T12:00:00Z");
    expect(result).toContain("Fallback utilizado na coleta: false");
    expect(result).toContain("aviso não crítico de favicon");

    // Exact text of each saved evidence with id, kind, sourceUrl
    expect(result).toContain("[evidência:ev-title-1] [tipo:title] [origem:https://advocacia.test/sobre]");
    expect(result).toContain("Silva & Santos Advocacia Empresarial");
    expect(result).toContain("[evidência:ev-body-2] [tipo:body] [origem:https://advocacia.test/servicos]");
    expect(result).toContain("Atuamos em contratos empresariais complexos desde 2010.");

    // AC-2: separated sections, no "fonte unica", no mandatory color rules
    expect(result).toContain("METADADOS DO SNAPSHOT");
    expect(result).toContain("SÍNTESE DO SITE");
    expect(result).toContain("ORIENTAÇÕES CONTEXTUAIS DO SITE");
    expect(result).toContain("EVIDÊNCIAS SALVAS DO SITE");
    expect(result).not.toContain("fonte unica");
    expect(result).not.toContain("BRAND SOUL");
    expect(result).not.toContain("REGRAS DE CORES OBRIGATORIAS");
  });

  it("handles missing historical metadata as 'desconhecido' and distinguishes fallbackUsed: true", async () => {
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "legacy-snap-1",
      evidence: [
        {
          id: "ev-leg-1",
          sourceUrl: "",
          kind: "body",
          text: "Conteúdo institucional histórico",
        },
      ],
      quality: {
        fallbackUsed: true,
        warnings: [],
      },
    } as any);

    const result = await loadGenerationContext(
      { ...input, siteIntelligenceId: "legacy-snap-1" },
      "owner-leg"
    );

    expect(result).toContain("Origem: desconhecido");
    expect(result).toContain("Fingerprint: desconhecido");
    expect(result).toContain("Data da extração: desconhecido");
    expect(result).toContain("Fallback utilizado na coleta: true");
    expect(result).toContain("Avisos da coleta: nenhum");
    expect(result).toContain("[evidência:ev-leg-1]");
  });

  it("fails explicitly on malformed snapshot structure before calling model (AC-1 matrix)", async () => {
    // 1. Missing or invalid id
    vi.mocked(loadSiteIntelligence).mockResolvedValue({ evidence: [] } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "snap-1" }, "owner")
    ).rejects.toThrow("identificador válido");

    // 2. Invalid evidence list (not an array)
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "snap-ok",
      evidence: "not an array",
    } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "snap-2" }, "owner")
    ).rejects.toThrow("lista de evidências");

    // 3. Evidence with unknown kind
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "snap-ok",
      evidence: [{ id: "ev-1", kind: "unknown_kind", text: "Texto válido" }],
    } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "snap-3" }, "owner")
    ).rejects.toThrow("com tipo inválido");

    // 4. Evidence with empty or whitespace text
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "snap-ok",
      evidence: [{ id: "ev-1", kind: "body", text: "   \n  " }],
    } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "snap-4" }, "owner")
    ).rejects.toThrow("sem texto válido ou com conteúdo em branco");

    // 5. fallbackUsed as string "false" instead of boolean
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "snap-ok",
      evidence: [{ id: "ev-1", kind: "body", text: "Texto" }],
      quality: { fallbackUsed: "false" },
    } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "snap-5" }, "owner")
    ).rejects.toThrow("quality.fallbackUsed inválido no snapshot: esperado booleano");

    // 6. warnings with numbers/null/objects
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "snap-ok",
      evidence: [{ id: "ev-1", kind: "body", text: "Texto" }],
      quality: { warnings: ["aviso válido", 123] },
    } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "snap-6" }, "owner")
    ).rejects.toThrow("quality.warnings inválido no snapshot");

    // 7. Metadata sourceUrl with wrong type (number)
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "snap-ok",
      sourceUrl: 12345,
      evidence: [{ id: "ev-1", kind: "body", text: "Texto" }],
    } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "snap-7" }, "owner")
    ).rejects.toThrow("sourceUrl inválido");

    // 8. Synthesis summary as object instead of string
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "snap-ok",
      evidence: [{ id: "ev-1", kind: "body", text: "Texto" }],
      business: { summary: { text: "Objeto em vez de string" } },
    } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "snap-8" }, "owner")
    ).rejects.toThrow("business.summary inválido");

    // 9. Lists not arrays or containing invalid items
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "snap-ok",
      evidence: [{ id: "ev-1", kind: "body", text: "Texto" }],
      business: { products: "String em vez de array" },
    } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "snap-9" }, "owner")
    ).rejects.toThrow("business.products inválido");

    // 10. Malformed anchors facts
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "snap-ok",
      evidence: [{ id: "ev-1", kind: "body", text: "Texto" }],
      anchors: { facts: [{ id: "fact-1", text: "   " }] }, // empty text
    } as any);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "snap-10" }, "owner")
    ).rejects.toThrow("anchors.facts inválido");
  });

  it("AC-2: distinguishes explicit absence, does not coerce missing evidence URL to general URL, accepts unconsumed extensions", async () => {
    // Snapshot with missing optional structures and unconsumed extensions
    vi.mocked(loadSiteIntelligence).mockResolvedValue({
      id: "snap-clean",
      sourceUrl: "https://site-geral.test",
      evidence: [
        {
          id: "ev-no-url",
          kind: "heading",
          text: "Texto com URL de evidência ausente",
          // sourceUrl omitted
        },
      ],
      // quality without warnings (undefined)
      quality: {
        fallbackUsed: false,
      },
      unconsumedExtension: { extraField: "should be ignored" },
    } as any);

    const result = await loadGenerationContext(
      { ...input, siteIntelligenceId: "snap-clean" },
      "owner-user"
    );

    // Warnings undefined is 'desconhecido'
    expect(result).toContain("Avisos da coleta: desconhecido");
    // Fallback is explicitly false
    expect(result).toContain("Fallback utilizado na coleta: false");
    // Evidence URL missing is 'desconhecida', NOT 'https://site-geral.test'
    expect(result).toContain("[origem:desconhecida]");
    expect(result).not.toContain("[origem:https://site-geral.test]");
    // Preserves text bytes
    expect(result).toContain("Texto com URL de evidência ausente");
  });

  it("fails when snapshot is inaccessible or belongs to another user", async () => {
    vi.mocked(loadSiteIntelligence).mockResolvedValue(null);
    await expect(
      loadGenerationContext({ ...input, siteIntelligenceId: "inaccessible-snap" }, "wrong-owner")
    ).rejects.toThrow("Inteligência de site indisponível para este usuário");
    expect(loadSiteIntelligence).toHaveBeenCalledWith("inaccessible-snap", "wrong-owner");
  });
});
