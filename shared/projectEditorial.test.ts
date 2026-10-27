import { describe, expect, it } from "vitest";
import { compileProjectDossier } from "./brandProjects";
import {
  freezeGenerationProject,
  projectEditorialDefaults,
} from "./projectEditorial";
import { affirmativeSocialPlaybook } from "./affirmativeSocialPlaybook";

describe("frozen project and affirmative playbooks", () => {
  it("extracts recognized old sections in full and keeps unidentified fields absent", () => {
    const voice = "Voz completa e natural. ".repeat(90).trim();
    const dossier =
      compileProjectDossier("BizuMiner", "Ofertas", {
        voiceTone: voice,
        targetAudience: "Pessoas comparando preços",
        defaultCta: "Conheça o acompanhamento",
      }) + "\n## Particularidade histórica\nCondição integral do projeto.";
    const snapshot = freezeGenerationProject({
      name: "BizuMiner",
      niche: "Ofertas",
      compiledDocument: dossier,
    });
    expect(snapshot.structuredData.voiceTone).toBe(voice);
    expect(snapshot.structuredData.offerAndTransformation).toBeUndefined();
    expect(snapshot.structuredData.defaultCta).toBe("Conheça o acompanhamento");
    expect(dossier).toContain("Condição integral do projeto.");
  });
  it("prefers structured calibration and deterministically fills old document sections", () => {
    const snapshot = freezeGenerationProject({
      name: "Projeto",
      niche: "Ofertas",
      compiledDocument:
        "## TOM_DE_VOZ\nVoz antiga\n## PUBLICO_ALVO\nPúblico antigo",
      structuredData: { voiceTone: "Voz atual" },
    });
    expect(snapshot.structuredData).toEqual({
      voiceTone: "Voz atual",
      targetAudience: "Público antigo",
    });
    expect(projectEditorialDefaults().structuredData).toEqual({});
  });
  it("selects eight principles for the actual Instagram format only", () => {
    const single = affirmativeSocialPlaybook("instagram", "static")!;
    const carousel = affirmativeSocialPlaybook("instagram", "carousel")!;
    expect(single.principles).toHaveLength(8);
    expect(carousel.principles).toHaveLength(8);
    expect(single.principles[3]).toContain("autossuficiente");
    expect(carousel.principles[3]).toContain("cada página");
    expect(affirmativeSocialPlaybook("linkedin", "static")).toBeNull();
  });
});
