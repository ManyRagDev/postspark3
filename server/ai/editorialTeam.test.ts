import { describe, expect, it } from "vitest";
import { resolveGenerationModelConfig } from "./generationModel";
import { chooseEditorialWriter, proposalWriter } from "./editorialTeam";

describe("editorial team V1", () => {
  it.each([
    ["Apresente a cafeteria do bairro", "z-ai/glm-5.3"],
    ["Uma crônica da fila do pão", "qwen/qwen4-max"],
    ["Campanha de vendas sem humor", "openai/gpt-6.2-sol"],
    ["Comunicado sobre o feriado", "google/gemini-3.8-flash"],
  ])("routes %s at admission", (content, model) => {
    expect(chooseEditorialWriter({content})).toBe(model);
  });

  it("honors literal execution before genre or objective", () => {
    expect(chooseEditorialWriter({content:"Anúncio com humor", executionBrief: {
      creationMode:"execution", format:"ad", platform:"instagram", contentSourceType:"freeform",
      objective:"sell", interventionLevel:"visual_only", rawInput:"Texto pronto",
    }})).toBe("google/gemini-3.8-flash");
  });

  it("routes the three slots alike and changes a commercial writer only for a new design", () => {
    const config = resolveGenerationModelConfig({postMode:"carousel",content:"Crie um anúncio"}, true, true, true, true);
    expect(proposalWriter(config.editorialTeam)).toBe("openai/gpt-6.2-sol");
    expect(proposalWriter(config.editorialTeam, true)).toBe("z-ai/glm-5.3");
    expect(proposalWriter(undefined)).toBeUndefined();
    expect(resolveGenerationModelConfig({generationModel:"claude",postMode:"static"},true,true,true,true).editorialTeam).toBeUndefined();
  });
});
