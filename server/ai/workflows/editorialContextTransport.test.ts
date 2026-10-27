import { expect, it, vi } from "vitest";
import { editorialContextV9 } from "./editorialContextV9";
import { compactSelectionContextV1 } from "./editorialContextTransport";
import { prepareOrchestratedGeneration } from "./generationPreparation";
import { orchestratedGenerationInputSchema } from "@shared/generationRequest";
import { defaultStudioPreferences } from "@shared/studioPreferences";
import { electionCatalogFixture } from "../../designCatalog/designElection.fixture";
import { reconcileCatalogCoverage } from "../../designCatalog/catalogCoverage";
import { shortlistCompleteDesigns, type DesignShortlistInput } from "../../designCatalog/designShortlist";

const facts = "A oficina recebe equipamentos por agendamento, informa o diagnóstico e solicita aprovação antes de cada reparo. ".repeat(24);
const audience = "Pessoas que precisam organizar a manutenção dos equipamentos de trabalho. ".repeat(5);
const tone = "Linguagem clara, com condições e prazos apresentados de forma objetiva. ".repeat(3);
const forbidden = Array.from({ length: 15 }, (_, i) => `Garantia absoluta ${i}`).join("; ");
const dossier = `# Marca: Oficina Geral\n## DIFERENCIAIS FACTUAIS\n${facts}\n## PÚBLICO-ALVO\n${audience}\n## POSTURA E TOM DE VOZ\n${tone}\n## TERMOS PROIBIDOS\n${forbidden}\n## CTA PADRÃO\nAgende uma avaliação.`;
const projectSnapshot = { version: 1 as const, name: "Oficina Geral", niche: "Manutenção", structuredData: { offerAndTransformation: facts, factualDifferentials: facts, targetAudience: audience, voiceTone: tone, forbiddenTerms: forbidden, defaultCta: "Agende uma avaliação." } };

it("shares source text without merging origins, guidance or UTF-16 references", () => {
  const context = editorialContextV9({ prompt: "Como funciona o agendamento? 🧑🏽‍💻", platform: "linkedin", postMode: "static", projectSnapshot, projectDossier: dossier, sourceReferences: [{ id: "project", kind: "project", purpose: "content", facts: dossier }] });
  const before = JSON.stringify(context);
  const view = compactSelectionContextV1(context);
  expect(JSON.stringify(context)).toBe(before);
  expect(view.sources.map(s => [s.id, s.origin])).toEqual(context.sources.map(s => [s.id, s.origin]));
  for (const source of view.sources) {
    const { textId, start, end } = source.textRef;
    expect(view.sourceTexts[textId].slice(start, end)).toBe(context.sources.find(s => s.id === source.id)!.text);
  }
  expect(view.guidanceRanges).toEqual(context.guidanceRanges);
  expect(view.requirements).toEqual(context.requirements);
  expect(view.instructions).toEqual(context.instructions);
  expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(Buffer.byteLength(before));
});

it("real preparation and shortlist accept a normal dossier that the historical projection cannot fit", async () => {
  const { inventory } = electionCatalogFixture(14);
  const input = orchestratedGenerationInputSchema.parse({ ownerId: "11111111-1111-4111-8111-111111111111", idempotencyKey: "transport-regression", inputType: "text", content: "Explique como agendar a avaliação de um equipamento.", platform: "facebook", postMode: "static", creationMode: "ideation", aspectRatio: "4:5", projectSnapshot, projectDossier: dossier });
  const journal = new Map<string, unknown>();
  let shortlistInput!: DesignShortlistInput;
  const evaluate = vi.fn(async (request: any) => {
    expect(Buffer.byteLength(JSON.stringify(request))).toBeLessThanOrEqual(28000);
    return { model: request.model, answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, { type: "score" as const, score: 3, confidence: 1 }])), usage: { input_tokens: 0, output_tokens: 0, cost: 0 } };
  });
  await expect(prepareOrchestratedGeneration(input, input.ownerId, false, Date.now() + 30000, {
    loadContext: async () => ({ version: 1 as const, text: dossier, sources: [{ id: "project", kind: "project" as const, purpose: "content" as const, origin: "project", text: dossier }] }),
    preferences: async () => defaultStudioPreferences,
    retrieve: async request => reconcileCatalogCoverage(request, inventory),
    operation: async (key, work) => { const value = await work(); journal.set(key, value); return value; },
    shortlist: async request => { shortlistInput = request; return shortlistCompleteDesigns(request, evaluate); },
    generate: async () => { throw Error("main_selector_reached"); },
  })).rejects.toThrow("main_selector_reached");
  expect(evaluate).toHaveBeenCalled();
  const receipt = journal.get("selection_input") as any;
  expect(receipt.shortlistContextEncoding).toBe(1);
  expect(receipt.editorialContext.sources.every((s: any) => typeof s.text === "string")).toBe(true);
  const calls = evaluate.mock.calls.length;
  const oldBrief = { ...JSON.parse(shortlistInput.brief), editorialContext: receipt.editorialContext };
  await expect(shortlistCompleteDesigns({ ...shortlistInput, brief: JSON.stringify(oldBrief) }, evaluate)).rejects.toMatchObject({ failure: { code: "preparation_context_too_large", stage: "selection" } });
  expect(evaluate.mock.calls).toHaveLength(calls);
});
