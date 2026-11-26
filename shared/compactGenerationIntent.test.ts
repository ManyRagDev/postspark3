import { describe, expect, it } from "vitest";
import { positiveCompactGenerationIntentInstructions, compactGenerationIntentInstructions, compactGenerationIntentInput, compactGenerationIntentSchema, projectCompactGenerationIntent, projectStructuralGenerationIntent, structuralGenerationIntentSchema } from "./compactGenerationIntent";

describe("brief automatic intent", () => {
  const reading = {objective:"Apresentar o café",tone:"Acolhedor",semanticQuery:"Café artesanal, composição tipográfica, sem foto",ideas:[{meaning:"Uma pausa para café",sourceIds:["s1","unknown","s1"]}]};
  it("projects deterministic ideas without making style or factual limits into content obligations", () => {
    const result = projectCompactGenerationIntent(reading,{adaptation:"literal",factualSourceIds:new Set(["s1"])});
    expect(result).toMatchObject({adaptation:"literal",requirements:[],content:[{id:"idea-1",requirementIds:[],sourceIds:["s1"]}]});
    expect(projectCompactGenerationIntent(reading,{adaptation:"literal",factualSourceIds:new Set(["s1"])})).toEqual(result);
    expect(compactGenerationIntentSchema.safeParse({...reading,requirements:[{description:"Não invente preços"}]}).success).toBe(false);
  });
  it("sends each source text once without catalog vocabulary, source hashes or planning metadata", () => {
    const request="Café artesanal, sem foto, não invente preços";
    expect(compactGenerationIntentInput({request,sources:[{id:"s1",text:request},{id:"s2",text:request},{id:"s3",text:"Fato da marca"},{id:"s4",text:"Fato da marca"},{id:"platform",text:"Instagram"}],factualSourceIds:new Set(["s1","s2","s3","s4"])})).toEqual({request,requestSourceIds:["s1","s2"],sources:[{ids:["s3","s4"],text:"Fato da marca"}]});
  });
  it("recovers the complete objective and grounded requirements from both audited briefs", () => {
    const clay = "Monte um carrossel didático para Instagram sobre como planejar uma oficina de cerâmica em casa. Use esta sequência: capa com a promessa; escolha um espaço ventilado e proteja a mesa; organize argila, água e ferramentas simples; comece com uma peça pequena e deixe secar antes do acabamento; feche convidando a salvar o guia. Use títulos curtos, uma ideia por lâmina e uma direção gráfica que funcione sem fotografia.";
    const garden = "Crie um post único para Instagram em 4:5 comparando os dois planos de um clube fictício de jardinagem. Essencial: R$ 39 por mês e 1 oficina mensal. Completo: R$ 69 por mês, 2 oficinas mensais e kit de sementes. Mostre os dois preços e as diferenças na arte com hierarquia visual clara. Encerre com “Escolha seu plano”. Não invente benefícios nem condições.";
    const incomplete = "Criar um post único de Instagram em 4:5 que compare os dois planos de um clube fictício de jardinagem, com hierarquia visual clara entre pre";
    const response = structuralGenerationIntentSchema.parse({
      ...reading, objective: incomplete, comparisonQuote: null, textCta: null, photoProhibitionQuote: null,
      requiredFacts: [], compositionDirections: Array.from({ length: 3 }, () => ({ profile: "hierarchy", approach: "Priorização." })),
    });
    const project = (request: string, slideCount: number) =>
      projectStructuralGenerationIntent(response, { adaptation: "controlled", factualSourceIds: new Set(["s1"]), sources: [{id:"s1",text:request}], request, slideCount });
    const clayIntent = project(clay, 5), gardenIntent = project(garden, 1);
    expect(clayIntent.objective).toBe(clay);
    expect(clayIntent.designRequirements).toMatchObject({ forbidsPhotography: true, requiresTextCta: true, textCta: null });
    expect(clayIntent.designRequirements?.requiredFacts.map(fact => fact.slideIndex)).toEqual([0, 1, 2, 3]);
    expect(gardenIntent.objective).toBe(garden);
    expect(gardenIntent.designRequirements).toMatchObject({ requiresComparison: true, requiresTextCta: true,
      textCta: "Escolha seu plano", estimatedArtCharacters: 109 });
    expect(gardenIntent.requirements).toHaveLength(6);
    expect(gardenIntent.content.find(content => content.meaning.includes("kit de sementes"))?.sourceIds).toEqual(["s1"]);
    expect(new Set(gardenIntent.compositionDirections?.map(direction => direction.profile)).size).toBe(3);
  });
});


it("pins positive intent instructions independently of historical receipts",()=>{
  expect(positiveCompactGenerationIntentInstructions).toContain("ideias orientam escolhas criativas");
  expect(positiveCompactGenerationIntentInstructions).toContain("Garantias, quantidades, causalidade");
  expect(positiveCompactGenerationIntentInstructions).not.toContain("Não invente fatos, números, preços, garantias ou CTA");
  expect(compactGenerationIntentInstructions).toContain("Não invente fatos, números, preços, garantias ou CTA");
});

it("preserves open-phrasing grounded quotes, isolates mixed negations, prioritizes literal CTA and groups verb-separated alternatives", () => {
  const baseReading = {
    objective: "Objetivo completo.",
    tone: "Direto",
    semanticQuery: "Tipografia limpa",
    ideas: [{ meaning: "Ideia central", sourceIds: ["s1"] }],
    requiredFacts: [],
    compositionDirections: [
      { profile: "hierarchy" as const, approach: "Hierarquia." },
      { profile: "columns" as const, approach: "Colunas." },
      { profile: "typographic" as const, approach: "Tipografia." },
    ],
  };

  // 1. Mixed negation: "Sem fotografia, sem chamada para ação" must keep forbidsPhotography=true
  const sarau = "Crie um cartaz tipográfico. Sem fotografia, sem chamada para ação.";
  const sarauIntent = projectStructuralGenerationIntent(
    { ...baseReading, comparisonQuote: null, textCta: null, photoProhibitionQuote: "Sem fotografia" },
    { adaptation: "controlled", factualSourceIds: new Set(["s1"]), request: sarau, slideCount: 1 }
  );
  expect(sarauIntent.designRequirements?.forbidsPhotography).toBe(true);
  expect(sarauIntent.designRequirements?.requiresTextCta).toBe(false);

  // 2. Open phrasing grounded by model quote ("Use o convite...", "Mostre na arte o horário antigo e o novo", "Trabalhe apenas com tipografia e formas")
  const mostra = "Mostra Linha de Tinta. Use o convite “Visite a mostra”.";
  const mostraIntent = projectStructuralGenerationIntent(
    { ...baseReading, comparisonQuote: null, textCta: { quote: "Use o convite “Visite a mostra”.", text: "Visite a mostra" }, photoProhibitionQuote: null },
    { adaptation: "controlled", factualSourceIds: new Set(["s1"]), request: mostra, slideCount: 1 }
  );
  expect(mostraIntent.designRequirements).toMatchObject({ requiresTextCta: true, textCta: "Visite a mostra" });

  const lavanderia = "Mostre na arte o horário antigo e o novo, com rótulos inequívocos.";
  const lavanderiaIntent = projectStructuralGenerationIntent(
    { ...baseReading, comparisonQuote: "Mostre na arte o horário antigo e o novo, com rótulos inequívocos.", textCta: null, photoProhibitionQuote: null },
    { adaptation: "controlled", factualSourceIds: new Set(["s1"]), request: lavanderia, slideCount: 1 }
  );
  expect(lavanderiaIntent.designRequirements?.requiresComparison).toBe(true);

  const microconto = "Termine com “Quem leva a chuva para casa?”. Trabalhe apenas com tipografia e formas.";
  const microcontoIntent = projectStructuralGenerationIntent(
    { ...baseReading, comparisonQuote: null, textCta: null, photoProhibitionQuote: "Trabalhe apenas com tipografia e formas." },
    { adaptation: "controlled", factualSourceIds: new Set(["s1"]), request: microconto, slideCount: 3 }
  );
  expect(microcontoIntent.designRequirements?.forbidsPhotography).toBe(true);

  // 3. Literal CTA in request overrides inferred options.callToAction
  const feira = "Na última, deve aparecer o CTA “Compartilhe com alguém”.";
  const feiraIntent = projectStructuralGenerationIntent(
    { ...baseReading, comparisonQuote: null, textCta: { quote: "deve aparecer o CTA “Compartilhe com alguém”", text: "Compartilhe com alguém" }, photoProhibitionQuote: null },
    { adaptation: "controlled", factualSourceIds: new Set(["s1"]), request: feira, slideCount: 4, callToAction: "Compartilhe com um amigo" }
  );
  expect(feiraIntent.designRequirements?.textCta).toBe("Compartilhe com alguém");

  // 4. Verb-separated comparison alternatives without colon ("Solo custa R$ 24...")
  const clube = "Compare os dois planos. Solo custa R$ 24 por mês e inclui 2 audições. Dueto custa R$ 42 por mês e inclui 4 audições.";
  const clubeIntent = projectStructuralGenerationIntent(
    { ...baseReading, comparisonQuote: "Compare os dois planos.", textCta: null, photoProhibitionQuote: null },
    { adaptation: "controlled", factualSourceIds: new Set(["s1"]), request: clube, slideCount: 1 }
  );
  expect(clubeIntent.designRequirements?.requiresComparison).toBe(true);
  expect(clubeIntent.designRequirements?.requiredFacts.map(f => [f.role, f.comparisonGroup, f.text])).toEqual([
    ["label", 1, "Solo"],
    ["detail", 1, "R$ 24 por mês e inclui 2 audições"],
    ["label", 2, "Dueto"],
    ["detail", 2, "R$ 42 por mês e inclui 4 audições"],
  ]);
});
