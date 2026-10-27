import { it, expect } from "vitest";
import {
  effectiveContentRequirements,
  requirementMatches,
} from "./contentRequirements";
it("preserves legacy literals and stable ids", () => {
  const r = effectiveContentRequirements({
    mustKeep: ["Café"],
    mustInclude: ["Café"],
  });
  expect(r).toHaveLength(1);
  expect(requirementMatches("café", r[0])).toBe(false);
  expect(effectiveContentRequirements({ mustKeep: ["Café"] })[0].id).toBe(
    r[0].id
  );
});
it.each([
  ["Receitas no liquidificador", false],
  ["Não diga dor", true],
  ["DOR!", true],
  ["dormente", false],
])("matches forbidden whole tokens: %s", (text, expected) => {
  const r = effectiveContentRequirements({ forbiddenTerms: ["dor"] })[0];
  expect(requirementMatches(text, r)).toBe(expected);
});
it("supports explicit substring and hashtag phrase boundaries", () => {
  const substring = effectiveContentRequirements({
    contentRequirements: [
      { kind: "forbidden", value: "dor", match: "substring" },
    ],
  })[0];
  expect(requirementMatches("liquidificador", substring)).toBe(true);
  const tag = effectiveContentRequirements({ forbiddenTerms: ["#promo"] })[0];
  expect(requirementMatches("#promocao", tag)).toBe(false);
  expect(requirementMatches("#promo!", tag)).toBe(true);
});
it("does not trim intentionally literal whitespace in legacy controls", () => {
  const r = effectiveContentRequirements({ mustKeep: [" Café "] })[0];
  expect(requirementMatches("Café", r)).toBe(false);
  expect(requirementMatches(" Café ", r)).toBe(true);
});
it("matches a forbidden phrase across whitespace without removing accents", () => {
  const r = effectiveContentRequirements({
    forbiddenTerms: ["café grátis"],
  })[0];
  expect(requirementMatches("cafe\u0301\ngrátis", r)).toBe(true);
  expect(requirementMatches("cafe gratis", r)).toBe(false);
});
