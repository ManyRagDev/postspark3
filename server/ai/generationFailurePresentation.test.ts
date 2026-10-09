import { describe, expect, it } from "vitest";
import { userMessageForGenerationIssues } from "./generationFailurePresentation";

describe("userMessageForGenerationIssues", () => {
  it("explica requisito explícito sem culpar o briefing", () => {
    expect(userMessageForGenerationIssues([{ detail: "termo explicitamente obrigatório ausente: BizuMiner" }]))
      .toContain("“BizuMiner”, exigido no briefing");
  });

  it("distingue instrução vazada de erro estrutural", () => {
    expect(userMessageForGenerationIssues([{ detail: "instruction_leakage_slots:2" }])).toContain("instruções do briefing");
    expect(userMessageForGenerationIssues([{ detail: "variation 1 must contain 5 slides" }])).toContain("quantidade necessária de slides");
  });

  it("não repassa detalhes desconhecidos do provider", () => {
    expect(userMessageForGenerationIssues([{ detail: "secret-provider-payload" }])).not.toContain("secret-provider-payload");
  });
  it("distingue convite e apoio ausentes de um erro de formato", () => {
    expect(userMessageForGenerationIssues([{ detail: "slot:0:cta_required_on_art" }])).toContain("convite solicitado");
    expect(userMessageForGenerationIssues([{ detail: "slot:2:body_required_on_art" }])).toContain("texto de apoio solicitado");
  });
});
