import type { CompactGenerationIntent, StructuralIntentReading } from "@shared/compactGenerationIntent";

export function structuralIntentFixture(reading: CompactGenerationIntent): StructuralIntentReading {
  return {
    ...reading,
    objective: reading.objective.replace(/[.!?]*$/, "."),
    comparisonQuote: null,
    textCta: null,
    photoProhibitionQuote: null,
    requiredFacts: [],
    compositionDirections: [
      { profile: "hierarchy", approach: "Abra pela ideia central." },
      { profile: "typographic", approach: "Use hierarquia tipográfica." },
      { profile: "list", approach: "Destaque os pontos de leitura rápida." },
    ],
  };
}
