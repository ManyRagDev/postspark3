import { describe, expect, it } from "vitest";
import { compactComponentCard } from "./componentAssembly";
import { completeDesignTestDefinitions } from "./completeDesignGeneration.fixture";
import { FAMILIES } from "./creative/families";
import {
  describeBasicDesign,
  describeCompleteDesign,
  designSelectionCard,
} from "./designSelection";

describe("common design descriptions", () => {
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
});
