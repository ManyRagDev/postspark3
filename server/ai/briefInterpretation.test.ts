import { describe, expect, it, vi } from "vitest";

const invokeLLM = vi.hoisted(() => vi.fn());
vi.mock("../_core/llm", () => ({ invokeLLM }));

import {
  briefInterpretationPrompt,
  findInstructionLeakage,
  interpretGenerationBrief,
  interpretedContent,
  validateBriefInterpretation,
} from "./briefInterpretation";

const source = "Quero criar um post sobre alimentação saudável. Use o título \"Comer bem começa hoje\".";
const interpretation = {
  contentSpans: ["alimentação saudável"],
  instructionSpans: ["Quero criar um post sobre", "Use o título"],
  verbatimSpans: ["Comer bem começa hoje"],
  uncertain: false,
};

describe("brief interpretation", () => {
  it("keeps only exact source excerpts and never invents content", () => {
    expect(validateBriefInterpretation({
      ...interpretation,
      contentSpans: ["alimentação saudável", "dieta milagrosa"],
    }, source)).toEqual(interpretation);
    expect(validateBriefInterpretation({ ...interpretation, contentSpans: ["dieta milagrosa"] }, source)).toBeNull();
  });

  it("preserves the topic, allows literal reuse and detects only leaked instructions", () => {
    expect(interpretedContent(interpretation)).toBe("alimentação saudável");
    expect(briefInterpretationPrompt(interpretation)).toContain("Reutilizar palavras do assunto");
    expect(findInstructionLeakage({ headline: "Alimentação saudável", body: "Comer bem começa hoje" }, interpretation)).toEqual([]);
    expect(findInstructionLeakage({ headline: "Quero criar um post sobre alimentação saudável" }, interpretation)).toEqual(["Quero criar um post sobre"]);
  });

  it("does not enforce uncertain interpretation or short production fragments", () => {
    expect(interpretedContent({ ...interpretation, uncertain: true })).toBeNull();
    expect(findInstructionLeakage({ headline: "Quero criar um post sobre alimentação saudável" }, { ...interpretation, uncertain: true })).toEqual([]);
    expect(findInstructionLeakage({ headline: "Use o título da oferta" }, interpretation)).toEqual([]);
  });

  it("uses a single dedicated low-cost route without provider fallback", async () => {
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(interpretation) } }] });
    await expect(interpretGenerationBrief(source)).resolves.toEqual(interpretation);
    expect(invokeLLM).toHaveBeenCalledWith(expect.objectContaining({
      taskRoute: "brief_interpretation",
      traceLabel: "brief_interpretation",
      disableFallback: true,
    }));
  });
});
