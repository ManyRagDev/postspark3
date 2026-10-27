import { it, expect } from "vitest";
import {
  sourceRepresentation,
  resolveSourceQuote,
} from "./sourceRepresentation";
it.each([
  ["**Café** fresco", "Café fresco"],
  ["Cafe\u0301 fresco", "Café fresco"],
  ["Café\nfresco", "Café fresco"],
  ["Café\u00a0fresco", "Café fresco"],
])(
  "resolves representation without inventing original offsets: %s",
  (source, quote) => {
    const r = resolveSourceQuote(source, quote);
    expect(r).toHaveLength(1);
    expect(source.slice(r[0].start, r[0].end)).toBe(r[0].original);
    expect(sourceRepresentation(r[0].original).text).toContain(
      sourceRepresentation(quote).text
    );
  }
);
it.each([
  ["Não custa R$ 20", "Custa R$ 20"],
  ["R$ 20", "R$ 30"],
  ["5 mg", "5 g"],
  ["BizuMiner", "Bizu Miner"],
  ["a ** 2 + b ** 3", "a 2 + b 3"],
])("does not equate material/ambiguous changes: %s", (source, quote) => {
  expect(resolveSourceQuote(source, quote)).toHaveLength(0);
});
it("retains all matching original contexts instead of guessing one", () => {
  expect(resolveSourceQuote("Café hoje. Café amanhã.", "Café")).toHaveLength(2);
});
it("preserves user provenance when the same text also occurs in extracted context", async () => {
  const { editorialContextV7 } = await import("./editorialContextV7");
  const context = editorialContextV7({
    prompt: "O preço corrigido é R$ 20.",
    contextContent: "O preço corrigido é R$ 20.",
  });
  expect(context.sources).toHaveLength(1);
  expect(context.sources[0].origin).toBe("user");
});
it("indexes separate user and context sources with distinct origins", async () => {
  const { editorialContextV7 } = await import("./editorialContextV7");
  const context = editorialContextV7({
    prompt: "Lançamento oficial da plataforma.",
    contextContent: "Preço especial de lançamento de R$ 99 por mês.",
    sourceUrl: "https://exemplo.com/precos",
    brandContext: {
      brandName: "Plataforma X",
      targetAudience: "Startups",
      essence: "Agilidade",
      tone: "Direto",
    },
  });
  expect(context.sources.length).toBeGreaterThanOrEqual(2);
  const origins = context.sources.map((s) => s.origin);
  expect(origins).toContain("user");
  expect(origins).toContain("context");
});
