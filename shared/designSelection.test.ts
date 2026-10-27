import { describe, expect, it } from "vitest";
import { compactComponentCard } from "./componentAssembly";
import { completeDesignTestDefinitions } from "./completeDesignGeneration.fixture";
import { FAMILIES } from "./creative/families";
import {
  describeBasicDesign,
  describeCompleteDesign,
  designTextBudgets,
  designSelectionCard,
  designMotifs,
  designVisualSimilarity,
  designHasPhotographicContent,
} from "./designSelection";

describe("common design descriptions", () => {
  it("distinguishes tiny supporting labels from room for explanations and does not double-count repeated fields", () => {
    const card = compactComponentCard(completeDesignTestDefinitions()[0]);
    const region = {
      source: "block:body:0:text",
      width: 160,
      height: 37,
      fontSize: 32,
      minFontSize: 32,
      minWords: 2,
    };
    card.capacity.textRegions = [region, { ...region }];
    expect(designTextBudgets(card)[0]).toMatchObject({
      estimatedCharacters: 18,
      distribution: "word_partition",
      advisory: true,
    });
    expect(describeCompleteDesign(card).editorial.join()).toContain(
      "18 supporting characters"
    );
    card.capacity.textRegions.forEach(r => (r.minWords = 1));
    expect(designTextBudgets(card)[0].estimatedCharacters).toBe(9);
  });
  it("describes basic and complete families with the same keys while marking unverified capacity", () => {
    const complete = describeCompleteDesign(
      compactComponentCard(completeDesignTestDefinitions()[0])
    );
    for (const family of FAMILIES) {
      const basic = describeBasicDesign(family);
      expect(Object.keys(basic).sort()).toEqual(Object.keys(complete).sort());
      expect(basic.unknowns.join(" ")).toContain("verification");
      expect(basic.evidence).toBe("family-definition");
    }
  });
  it("does not turn sample topics or historical names into purpose restrictions", () => {
    const card = compactComponentCard(completeDesignTestDefinitions()[0]);
    card.label = "Reflexão obrigatória sobre café";
    card.description = "Design completo: fundo, fontes, camadas preservadas";
    card.mediaSlots = [
      {
        id: "photo",
        label: "Café",
        prompt: "Café e reflexão",
        function: "background",
        deferred: true,
        policy: "cover",
      },
    ];
    const serialized = JSON.stringify(designSelectionCard(card));
    expect(serialized).not.toContain(card.label);
    expect(serialized).not.toContain(card.description);
    expect(serialized).not.toContain("Café e reflexão");
    expect(serialized).toContain("background; cover; image to provide");
    expect(designSelectionCard(card).mediaSlotCount).toBe(1);
  });
  it("preserves documented palette and native content capacity without modifying the card", () => {
    const card = compactComponentCard(completeDesignTestDefinitions()[0]);
    card.completeDesign!.colors = ["#001122", "#ffffff"];
    const before = JSON.stringify(card),
      profile = describeCompleteDesign(card);
    expect(profile.palette).toEqual(["#001122", "#ffffff"]);
    expect(profile.content.length).toBeGreaterThan(0);
    expect(profile.capacity.join(" ")).toContain("not a character limit");
    expect(JSON.stringify(card)).toBe(before);
  });
  it("makes the existing native minimum-word guidance visible to selection", () => {
    const card = compactComponentCard(completeDesignTestDefinitions()[0]);
    card.capacity.textRegions[0].minWords = 2;
    const profile = describeCompleteDesign(card);
    expect(profile.capacity.join(" ")).toContain(
      "2 fragments share this canonical field"
    );
    expect(profile.capacity.join(" ")).toContain(
      "never expand visual_only text"
    );
  });
  it("uses authored construction and editorial/media instructions without trusting family names", () => {
    const card = compactComponentCard(completeDesignTestDefinitions()[0]);
    card.completeDesign!.family = "paper-window";
    card.completeDesign!.designGuidance = {
      version: 1,
      summary: "Two contrasting information panels",
      motifs: ["comparison-grid"],
      preserve: ["Keep both panels"],
      contentRules: ["Explain a different verified fact in each panel"],
      mediaRules: [
        { slotId: "subject", instructions: ["Show one isolated subject"] },
      ],
      knownLimitations: ["No automatic perspective"],
    };
    expect(designMotifs(card)).toEqual(["comparison-grid"]);
    const profile = describeCompleteDesign(card);
    expect(profile.editorial).toContain(
      "Explain a different verified fact in each panel"
    );
    expect(profile.customization).toContain(
      "subject: Show one isolated subject"
    );
    expect(profile.limitations).toContain("No automatic perspective");
    expect(profile.editorial.join()).toContain("split fragments");
  });
  it("groups close authored motifs gradually and distinguishes photographs from raster textures", () => {
    const cards = completeDesignTestDefinitions().map(compactComponentCard);
    const guidance = (motifs: string[]) => ({
      version: 1 as const,
      summary: "Specific design",
      motifs,
      preserve: [],
      contentRules: [],
      mediaRules: [],
      knownLimitations: [],
    });
    cards[0].completeDesign!.designGuidance = guidance(["paper", "window"]);
    cards[1].completeDesign!.designGuidance = guidance(["papel", "window"]);
    cards[2].completeDesign!.designGuidance = guidance([
      "grid",
      "photographic-object",
    ]);
    expect(designVisualSimilarity(cards[0], cards[1])).toBeGreaterThan(
      designVisualSimilarity(cards[0], cards[2])
    );
    expect(designHasPhotographicContent(cards[2])).toBe(true);
    cards[2].completeDesign!.designGuidance = guidance(["paper-texture"]);
    expect(designHasPhotographicContent(cards[2])).toBe(false);
  });
});
