import { describe, expect, it } from "vitest";
import {
  jaccardSimilarity,
  normalizeVariationText,
  variationsNeedDiversification,
} from "./variationDiversity";

describe("variationDiversity", () => {
  it("normalizes accents, punctuation and casing", () => {
    expect(normalizeVariationText("  Café, AUTOMAÇÃO! ")).toBe("cafe automacao");
  });

  it("calculates lexical overlap with Jaccard similarity", () => {
    expect(jaccardSimilarity(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
  });

  it("rejects fewer than three variations", () => {
    expect(variationsNeedDiversification([{ headline: "A" }, { headline: "B" }])).toBe(true);
  });

  it("detects repeated structure and copy", () => {
    const common = {
      body: "Automatize tarefas e ganhe tempo para sua equipe",
      callToAction: "Comece agora",
      caption: "Automacao para equipes que querem produtividade",
      tone: "profissional",
      layout: "centered",
      backgroundColor: "#000000",
      textColor: "#FFFFFF",
      accentColor: "#FF0000",
    };

    expect(
      variationsNeedDiversification([
        { ...common, headline: "Ganhe tempo" },
        { ...common, headline: "Mais tempo para sua equipe" },
        { ...common, headline: "Automatize hoje" },
      ]),
    ).toBe(true);
  });

  it("accepts three lexically and visually distinct variations", () => {
    expect(
      variationsNeedDiversification([
        {
          headline: "Pare de perder horas",
          body: "Remova tarefas repetitivas da operacao.",
          callToAction: "Mapeie seu processo",
          caption: "O custo invisivel do trabalho manual.",
          tone: "direto",
          layout: "left-aligned",
          backgroundColor: "#101828",
          textColor: "#FFFFFF",
          accentColor: "#7F56D9",
        },
        {
          headline: "Crescer sem ampliar o caos",
          body: "Padronizacao permite escalar com previsibilidade.",
          callToAction: "Veja o metodo",
          caption: "Escala exige clareza operacional.",
          tone: "educacional",
          layout: "split",
          backgroundColor: "#F9FAFB",
          textColor: "#101828",
          accentColor: "#12B76A",
        },
        {
          headline: "Sua equipe merece foco",
          body: "Tecnologia assume o repetitivo e libera decisao humana.",
          callToAction: "Conheca a plataforma",
          caption: "Produtividade tambem e experiencia de trabalho.",
          tone: "inspiracional",
          layout: "minimal",
          backgroundColor: "#3E1C96",
          textColor: "#FFFFFF",
          accentColor: "#FEC84B",
        },
      ]),
    ).toBe(false);
  });
});
