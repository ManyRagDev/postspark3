import { arsenalHash } from "./arsenalContent";
import {
  visualIdentityRulesSchema,
  resolveIdentityFont,
  identityFontWarnings,
  type VisualIdentityRules,
  type VisualIdentity,
} from "./visualIdentity";

export function identityFixture(
  overrides: Partial<VisualIdentityRules> = {}
): VisualIdentity {
  const rules = visualIdentityRulesSchema.parse({
    colors: [],
    background: null,
    text: null,
    accent: null,
    headingFont: null,
    bodyFont: null,
    headingWeight: null,
    bodyWeight: null,
    headingSize: null,
    bodySize: null,
    margin: null,
    gap: null,
    lineHeight: null,
    align: null,
    style: "",
    ...overrides,
  });
  const fonts = {
    heading: resolveIdentityFont(
      rules.headingFont,
      rules.headingWeight ?? 700,
      true
    ),
    body: resolveIdentityFont(rules.bodyFont, rules.bodyWeight ?? 400, false),
  };
  const body = {
    version: 1 as const,
    description: "Azul e branco, com bastante respiro",
    rules,
    fonts,
    warnings: identityFontWarnings(fonts),
  };
  return { ...body, revision: arsenalHash(body) };
}
