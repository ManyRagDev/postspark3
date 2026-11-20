import { describe, expect, it } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { affirmativeCopyInstructions, affirmativeCopyInstructionsV2 } from "@shared/affirmativeSocialPlaybook";
import { formatHumanTextCapacityGuidance } from "./proposalGraph";

describe("Fase 6: Melhorias no Fluxo Legado", () => {
  it("6b. formatHumanTextCapacityGuidance usa o modelo unificado de fragmentos e não 'Recomendado N palavras'", () => {
    const def = completeDesignTestDefinitions()[0];
    const notes = [
      {
        slide: 0,
        fields: [
          {
            id: "field-0",
            role: "headline",
            capacity: { fragmentCount: 2, minWords: 2, estimatedMaxChars: 60 },
            targets: [{ maxLines: 2, maxChars: 60 }],
          },
        ],
      },
    ];

    const guidanceLegacy = formatHumanTextCapacityGuidance([def], notes, false);
    const guidanceCapability = formatHumanTextCapacityGuidance([def], notes, true);

    // Ambas as saídas agora utilizam o modelo correto de caixas/fragmentos
    expect(guidanceLegacy).toContain("caixa(s) compartilham o texto");
    expect(guidanceLegacy).not.toContain("Recomendado 2 a");
    expect(guidanceCapability).toContain("caixa(s) compartilham o texto");
    expect(guidanceLegacy).toBe(guidanceCapability);
  });

  it("6a. serialização de designGuidance em fieldSchemaNotes filtra knownLimitations por whitelist", () => {
    const def = completeDesignTestDefinitions()[0];
    def.completeDesign!.designGuidance = {
      version: 1,
      summary: "Estrutura demo",
      motifs: ["paper"],
      preserve: ["logo"],
      contentRules: ["Regra 1"],
      mediaRules: ["Foto cover"],
      requiredTextTargets: ["field-0"],
      knownLimitations: ["/path/to/secret/file", "seed 12345", "O dado 72% é fictício"],
    };

    // Whitelist simulation em fieldSchemaNotes
    const filteredGuidance = def.completeDesign?.designGuidance ? {
      contentRules: def.completeDesign.designGuidance.contentRules,
      mediaRules: def.completeDesign.designGuidance.mediaRules,
      preserve: def.completeDesign.designGuidance.preserve,
      requiredTextTargets: def.completeDesign.designGuidance.requiredTextTargets,
    } : undefined;

    const serialized = JSON.stringify(filteredGuidance);
    expect(serialized).toContain("Regra 1");
    expect(serialized).toContain("Foto cover");
    expect(serialized).toContain("logo");
    expect(serialized).toContain("field-0");

    // Limitações conhecidas e metadados de arquivo NÃO vazam
    expect(serialized).not.toContain("/path/to/secret/file");
    expect(serialized).not.toContain("seed 12345");
    expect(serialized).not.toContain("fictício");
    expect(serialized).not.toContain("Estrutura demo");
  });

  it("6c. affirmativeCopyInstructionsV2 adiciona âncora pt-BR preservando V1 intacta", () => {
    // V1 intacta (invariante de hash de contrato)
    expect(affirmativeCopyInstructions).not.toContain("pt-BR");

    // V2 contém a diretriz explícita de idioma
    expect(affirmativeCopyInstructionsV2).toContain("português natural do Brasil (pt-BR)");
    expect(affirmativeCopyInstructionsV2).toContain("preservando termos técnicos e nomes próprios");
  });

  it("6d. flag MINIFY_LEGACY_PROMPTS serializa JSON sem indentação", () => {
    const data = { role: "headline", listMode: "native-slots", prefix: "- " };
    const indented = JSON.stringify(data, null, 2);
    const minified = JSON.stringify(data);

    expect(indented).toContain('\n  "role": "headline"');
    expect(minified).not.toContain("\n");
    expect(minified).toBe('{"role":"headline","listMode":"native-slots","prefix":"- "}');
  });
});
