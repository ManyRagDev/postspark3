import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { createComponentDefinition } from "@shared/componentAssembly";
import { ENV } from "../../_core/env";
import { compactCopyPrompt, compactWritableSlides } from "./compactProposalCopy";
import { mediaPostContext, type ProposalExecutionInput } from "./proposalGraph";
import { editorialContextV9 } from "./editorialContextV9";
import { resolveReviewExecutionConfigV10 } from "./reviewExecutionConfigV10";

const testSamples = [
  {
    briefing: "Cafeteria artesanal especializada em grãos selecionados do cerrado mineiro com métodos de extração filtrados e espresso impecável.",
    code: "REF-08",
    englishTitle: "Why do you actually exist?",
    label: "REF-08 · Why do you actually exist? — pergunta editorial",
    family: "acervo82-reference-08",
    description: "Composição editorial com pergunta de alto contraste e bloco de leitura reflexiva.",
  },
  {
    briefing: "Escritório de advocacia trabalhista focado em defender direitos fundamentais de bancários e trabalhadores sob metas abusivas.",
    code: "REF-18",
    englishTitle: "Marketing that gets talked about",
    label: "REF-18 · Marketing that gets talked about — imprensa ácido",
    family: "acervo82-reference-18",
    description: "Layout estilo imprensa ácido com manchete impactante para tom institucional e crítico.",
  },
  {
    briefing: "Clínica veterinária 24 horas com atendimento humanizado, UTI dedicada e especialistas em felinos.",
    code: "REF-03",
    englishTitle: "Truth about creative people",
    label: "REF-03 · Truth about creative people — azul e amarelo",
    family: "acervo82-reference-03",
    description: "Bloco vibrante de destaque com áreas equilibradas de suporte e contraste.",
  },
  {
    briefing: "Plataforma SaaS de gestão financeira para agências de publicidade e estúdios criativos com controle de fee mensal.",
    code: "REF-04",
    englishTitle: "Brutalism",
    label: "REF-04 · Brutalism — editorial vermelho",
    family: "acervo82-reference-04",
    description: "Estrutura brutalista editorial com hierarquia vertical precisa e foco em métricas.",
  },
  {
    briefing: "Consultoria de arquitetura sustentável para residências de alto padrão que integram ventilação natural e luz solar.",
    code: "CON-06",
    englishTitle: "Creative leadership",
    label: "CON-06 · Creative leadership — conceito ousado",
    family: "acervo82-concept-06",
    description: "Conceito minimalista contemporâneo com espaços amplos de respiro e sofisticação.",
  },
  {
    briefing: "Confeitaria artesanal de doces finos sem glúten e sem lactose para casamentos e eventos corporativos elegantes.",
    code: "CON-10",
    englishTitle: "Minimalist future",
    label: "CON-10 · Minimalist future — arquitetura e forma",
    family: "acervo82-concept-10",
    description: "Tipografia limpa e geométrica para mensagens premium e refinadas.",
  },
  {
    briefing: "Estúdio de yoga e meditação com aulas matinais focadas em redução do estresse e equilíbrio mental.",
    code: "R9-03",
    englishTitle: "High performance habits",
    label: "R9-03 · High performance habits — lista dinâmica",
    family: "acervo82-r9-03",
    description: "Lista estruturada para leitura sequencial e escaneabilidade ágil.",
  },
  {
    briefing: "Escola de programação e inteligência artificial para jovens do ensino médio com metodologia prática baseada em projetos.",
    code: "R9-11",
    englishTitle: "The secret behind great design",
    label: "R9-11 · The secret behind great design — contraste brutal",
    family: "acervo82-r9-11",
    description: "Contraste dramático com foco em declarações diretas e marcantes.",
  },
  {
    briefing: "Corretora de seguros corporativos oferecendo proteção patrimonial, seguros de vida em grupo e blindagem societária.",
    code: "R9-20",
    englishTitle: "Stop wasting your time",
    label: "R9-20 · Stop wasting your time — chamada urgente",
    family: "acervo82-r9-20",
    description: "Chamada urgente e assertiva para temas regulatórios e proteção.",
  },
  {
    briefing: "E-commerce de cosméticos veganos e cruelty-free com embalagens 100% recicláveis e ingredientes da Amazônia.",
    code: "REF-24",
    englishTitle: "The art of simplicity",
    label: "REF-24 · The art of simplicity — resumo visual",
    family: "acervo82-reference-24",
    description: "Resumo visual claro com foco na pureza do produto e apelo sustentável.",
  },
];

import { assemblyIdentity } from "@shared/componentAssembly";

const baseDefinition = completeDesignTestDefinitions()[0];

function makeDefinition(sample: typeof testSamples[number]) {
  return createComponentDefinition({
    ...baseDefinition,
    id: assemblyIdentity(["catalog-test", sample.code]),
    label: sample.label,
    description: sample.description,
    completeDesign: {
      family: sample.family,
      baselineVerified: true,
    },
  });
}

function makeInput(sample: typeof testSamples[number], def: ReturnType<typeof makeDefinition>): ProposalExecutionInput {
  const inp: ProposalExecutionInput = {
    requestId: `req-${sample.code.toLowerCase()}`,
    runId: "00000000-0000-4000-8000-000000000001",
    proposalId: `prop-${sample.code.toLowerCase()}`,
    slot: 0,
    prompt: sample.briefing,
    contextContent: sample.briefing,
    selectedDefinition: def,
    postMode: "static",
    reviewPolicyVersion: 10,
    reviewExecutionConfig: resolveReviewExecutionConfigV10(),
    generationConfig: { taskRouting: "standard" },
  };
  inp.editorialContext = editorialContextV9(inp);
  inp.editorialContextHash = inp.editorialContext.hash;
  return inp;
}

describe("Fase 3: Catalog Label Sanitization", () => {
  it("when flag is disabled (legacy behavior), design.name and familyName leak into copy prompt and image context", () => {
    const prev = ENV.catalogLabelSanitization;
    try {
      (ENV as any).catalogLabelSanitization = false;

      const sample = testSamples[0];
      const def = makeDefinition(sample);
      const inp = makeInput(sample, def);

      const promptPayload = compactCopyPrompt(inp, [def]);
      // Comportamento legado: o prompt contém o código interno e o título em inglês da demo
      expect(promptPayload).toContain(sample.code);
      expect(promptPayload).toContain(sample.englishTitle);

      const slides = compactWritableSlides(inp, [def]);
      expect(slides[0].design).toHaveProperty("name", sample.label);

      // E mediaPostContext vaza o familyName técnico do catálogo
      const mediaCtx = mediaPostContext(
        inp,
        def,
        { values: [{ fieldId: "field-0", value: "Headline" }], mediaPrompts: [] },
        "Caption"
      );
      expect(mediaCtx.familyName).toBe(sample.family);
    } finally {
      (ENV as any).catalogLabelSanitization = prev;
    }
  });

  it("snapshot for 10 PT-BR briefings: compactCopyPrompt contains NO catalog codes (REF/R9/CON) and NO english demo titles", () => {
    const prev = ENV.catalogLabelSanitization;
    try {
      (ENV as any).catalogLabelSanitization = true;

      for (let i = 0; i < testSamples.length; i++) {
        const sample = testSamples[i];
        const def = makeDefinition(sample);
        const inp = makeInput(sample, def);

        const promptPayload = compactCopyPrompt(inp, [def]);
        const parsed = JSON.parse(promptPayload);

        // 1. Nenhum código de catálogo (REF-nn, R9-nn, CON-nn)
        expect(promptPayload).not.toMatch(/\b(REF|R9|CON)-\d{2}\b/);

        // 2. Nenhum dos títulos demo em inglês
        for (const s of testSamples) {
          expect(promptPayload).not.toContain(s.englishTitle);
        }

        // 3. Em cada slide, design.name foi removido, mas description autoral foi preservada
        for (const slide of parsed.slides) {
          expect(slide.design).not.toHaveProperty("name");
          expect(slide.design.description).toBe(sample.description);
        }

        // 4. mediaPostContext não contém o familyName técnico
        const mediaCtx = mediaPostContext(
          inp,
          def,
          { values: [{ fieldId: "field-0", value: "Headline" }], mediaPrompts: [] },
          "Caption"
        );
        expect(mediaCtx.familyName).toBeUndefined();
      }
    } finally {
      (ENV as any).catalogLabelSanitization = prev;
    }
  });
});
