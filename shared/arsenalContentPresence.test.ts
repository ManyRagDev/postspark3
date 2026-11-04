import { describe, expect, it } from "vitest";
import {
  arsenalContentFragmentSchema,
  fragmentContentText,
} from "./designArsenal";

describe("opt-in authored occupancy", () => {
  const fragments = [0, 1, 2].map(index => ({
    index,
    count: 3,
    unit: "words" as const,
    weights: [2, 1, 2],
  }));
  const allocation = {
    mode: "preserve_occupancy" as const,
    priority: [1, 0, 2],
  };
  it("keeps legacy partitions and occupies the authored emphasis without padding copy", () => {
    expect(
      fragments.map(f => fragmentContentText("COMO VOCÊ ORGANIZA?", f))
    ).toEqual(["COMO ", "", "VOCÊ ORGANIZA?"]);
    for (const text of [
      "AÇÃO",
      "Organize hoje",
      "COMO VOCÊ ORGANIZA?",
      "A mesma frase mais longa",
      "Ação\ncom  espaços 👩🏽‍💻",
    ]) {
      const parts = fragments.map(f =>
        fragmentContentText(text, { ...f, allocation })
      );
      expect(parts.join("")).toBe(text);
      expect(parts[1].trim()).not.toBe("");
      if (text.split(/\s+/).length >= 3)
        expect(parts.every(s => s.trim())).toBe(true);
    }
    expect(
      fragments.map(f =>
        fragmentContentText("COMO VOCÊ ORGANIZA?", { ...f, allocation })
      )
    ).toEqual(["COMO ", "VOCÊ ", "ORGANIZA?"]);
  });
  it("rejects ambiguous allocation rather than changing historical defaults", () => {
    expect(arsenalContentFragmentSchema.parse(fragments[0])).toEqual(
      fragments[0]
    );
    expect(() =>
      arsenalContentFragmentSchema.parse({
        ...fragments[0],
        allocation: { ...allocation, priority: [1, 1, 0] },
      })
    ).toThrow();
  });
});
