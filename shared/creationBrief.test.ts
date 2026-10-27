import { describe, expect, it } from "vitest";
import {
  extractUrlsFromText,
  interpretRawBriefing,
  creationBriefToExecutionBrief,
} from "./creationBrief";
import { CREATION_BRIEF_VERSION } from "./postsparkSchemas";

describe("creationBrief - Etapa 4", () => {
  describe("extractUrlsFromText", () => {
    it("extrai URLs embutidas no meio do texto com pontuações adjacentes", () => {
      const text = "Veja o meu artigo em https://exemplo.com/post-1, e também confira www.outro-site.com.br/artigo! Vale muito a pena.";
      const urls = extractUrlsFromText(text);

      expect(urls).toEqual([
        "https://exemplo.com/post-1",
        "https://www.outro-site.com.br/artigo",
      ]);
    });

    it("retorna lista vazia quando não há links", () => {
      expect(extractUrlsFromText("Apenas texto puro sem nenhum link.")).toEqual([]);
      expect(extractUrlsFromText("")).toEqual([]);
    });

    it("elimina URLs duplicadas no mesmo briefing", () => {
      const text = "Acesse https://postspark.app para criar e https://postspark.app para editar.";
      const urls = extractUrlsFromText(text);
      expect(urls).toEqual(["https://postspark.app"]);
    });
  });

  describe("interpretRawBriefing", () => {
    it("interpreta briefing de carrossel com detecção de slides e URLs", () => {
      const raw = "Quero um carrossel de 5 slides sobre produtividade remota com base no artigo https://meublog.com/produtividade. CTA: Salve este post.";
      const brief = interpretRawBriefing(raw);

      expect(brief.version).toBe(CREATION_BRIEF_VERSION);
      expect(brief.format).toBe("carousel");
      expect(brief.slideCount).toBe(5);
      expect(brief.sourceUrls).toEqual(["https://meublog.com/produtividade"]);
      expect(brief.callToAction).toBe("Salve este post");
    });

    it("incorpora inteligência do Brand Kit quando fornecido", () => {
      const raw = "Post sobre lançamento da nova funcionalidade";
      const brandKit = {
        brand_name: "Acme Corp",
        tone: "Audacioso e inovador",
        must_include: ["#InovacaoAcme", "Lançamento oficial"],
        forbidden_terms: ["barato", "desconto"],
      };

      const brief = interpretRawBriefing(raw, {
        selectedFormat: "static",
        brandKit,
      });

      expect(brief.format).toBe("static");
      expect(brief.tone).toBe("Audacioso e inovador");
      expect(brief.brandEssence).toBe("Acme Corp");
      expect(brief.requiredTerms).toEqual(["#InovacaoAcme", "Lançamento oficial"]);
      expect(brief.forbiddenTerms).toEqual(["barato", "desconto"]);
    });

    it("permite sobrescrever o formato detectado com o formato explicitamente selecionado", () => {
      const raw = "3 dicas de liderança"; // texto com tendência de carrossel
      const brief = interpretRawBriefing(raw, { selectedFormat: "static" });

      expect(brief.format).toBe("static");
      expect(brief.slideCount).toBeUndefined();
    });
  });

  describe("creationBriefToExecutionBrief", () => {
    it("converte CreationBrief para o contrato aceito pelo backend", () => {
      const brief = interpretRawBriefing("Ideia com https://site.com/artigo", {
        selectedFormat: "carousel",
      });
      const exec = creationBriefToExecutionBrief(brief);

      expect(exec.creationMode).toBe("execution");
      expect(exec.format).toBe("carousel");
      expect(exec.platform).toBe("instagram");
      expect(exec.contentSourceType).toBe("carousel_topics");
      expect(exec.brandInput?.websiteUrl).toBe("https://site.com/artigo");
    });

    it("preserva público e essência da marca vindos do Brand Kit ou edição", () => {
      const brandKit = {
        brand_name: "Startup Alpha",
        brand_essence: "Tecnologia acessível para pequenas empresas",
        target_audience: "Empreendedores B2B iniciantes",
        tone: "Pragmático e encorajador",
      };
      const brief = interpretRawBriefing("Post sobre gestão financeira", {
        selectedFormat: "static",
        brandKit,
      });
      expect(brief.audience).toBe("Empreendedores B2B iniciantes");
      expect(brief.brandEssence).toBe("Tecnologia acessível para pequenas empresas");
      expect(brief.tone).toBe("Pragmático e encorajador");

      const exec = creationBriefToExecutionBrief(brief);
      expect(exec.audience).toBe("Empreendedores B2B iniciantes");
      expect(exec.brandEssence).toBe("Tecnologia acessível para pequenas empresas");
      expect(exec.tone).toBe("Pragmático e encorajador");

      // Edição prevalece sobre o Kit
      const editedBrief = {
        ...brief,
        audience: "Diretores financeiros de scale-ups",
      };
      const editedExec = creationBriefToExecutionBrief(editedBrief);
      expect(editedExec.audience).toBe("Diretores financeiros de scale-ups");
      expect(editedExec.brandEssence).toBe("Tecnologia acessível para pequenas empresas");
    });

    it("não inventa público ou essência quando ausentes", () => {
      const brief = interpretRawBriefing("Post simples sem kit", {
        selectedFormat: "static",
      });
      expect(brief.audience).toBeUndefined();
      expect(brief.brandEssence).toBeUndefined();

      const exec = creationBriefToExecutionBrief(brief);
      expect(exec.audience).toBeUndefined();
      expect(exec.brandEssence).toBeUndefined();
    });

    it("converte briefing no formato antigo sem audience/brandEssence sem erro", () => {
      const legacyBrief = {
        version: 1,
        format: "static" as const,
        objective: "engage" as const,
        interventionLevel: "optimize_structure" as const,
        contentSourceType: "freeform" as const,
        rawInput: "Texto legado sem campos de marca",
      };
      const exec = creationBriefToExecutionBrief(legacyBrief as any);
      expect(exec.audience).toBeUndefined();
      expect(exec.brandEssence).toBeUndefined();
      expect(exec.rawInput).toBe("Texto legado sem campos de marca");
    });
  });
});

