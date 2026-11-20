import { expect, it, vi } from "vitest";
import { interpretVisualIdentity } from "./visualIdentity";
import { identityFixture } from "@shared/visualIdentity.fixture";
import {
  freezeGenerationProject,
  generationProjectSnapshotSchema,
} from "@shared/projectEditorial";
import {
  saveVisualIdentitySchema,
  resolveIdentityFont,
} from "@shared/visualIdentity";
import { resolveIdentityAppearance } from "@shared/identityComposition";

it("accepts a partial description, keeps missing rules absent and resolves unavailable fonts explicitly", async () => {
  const response = identityFixture({
    accent: "#22AA33",
    headingFont: "Fonte Inexistente",
  }).rules;
  const generate = vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify(response) } }],
  }));
  const identity = await interpretVisualIdentity(
    "Verde, títulos com Fonte Inexistente",
    undefined,
    undefined,
    generate as any
  );
  expect(identity.rules.background).toBeNull();
  expect(identity.rules.margin).toBeNull();
  expect(identity.fonts.heading).toMatchObject({
    requested: "Fonte Inexistente",
    applied: "Inter",
    substituted: true,
  });
  expect(identity.warnings[0]).toContain("Foi ajustado para Inter");
  expect(
    await interpretVisualIdentity(
      identity.description,
      undefined,
      identity,
      generate as any
    )
  ).toBe(identity);
  expect(generate).toHaveBeenCalledTimes(1);
});

it("accepts just a logo without inventing rules or calling an LLM", async () => {
  expect(
    saveVisualIdentitySchema.safeParse({
      name: "Projeto",
      description: "",
      logoUrl: "/api/post-media/owned/logo",
    }).success
  ).toBe(true);
  expect(
    saveVisualIdentitySchema.safeParse({ name: "Projeto", description: "" })
      .success
  ).toBe(false);
  const generate = vi.fn();
  const result = await interpretVisualIdentity(
    "",
    "/api/post-media/owned/logo",
    undefined,
    generate
  );
  expect(result.rules).toMatchObject({
    background: null,
    headingFont: null,
    margin: null,
  });
  expect(generate).not.toHaveBeenCalled();
});

it("selects actual available font weights and comparable bundled fallbacks", () => {
  expect(resolveIdentityFont("Montserrat", 700, true)).toMatchObject({
    requested: "Montserrat",
    applied: "Montserrat",
    weight: 800,
    substituted: false,
  });
  expect(resolveIdentityFont("Georgia", 400, false)).toMatchObject({
    applied: "Playfair Display",
    substituted: true,
  });
});
it("completes color roles for each piece without making them permanent brand definitions", () => {
  const identity = identityFixture({ colors: ["#6622AA"] });
  const appearance = resolveIdentityAppearance(identity, {
    background: "#FFFFFF",
    text: "#111111",
    accent: "#22AA33",
    headingFont: "An unavailable generated choice",
    bodyFont: "Inter",
    margin: 60,
    gap: 24,
    align: "left",
    pages: [{ layout: "centered", decoration: "none" }],
  });
  expect(appearance.palette.background).toBe("#6622AA");
  expect(appearance.warnings).toEqual([]);
  expect(identity.rules.background).toBeNull();
  expect(identity.rules.text).toBeNull();
});

it("freezes a project with only visual identity and preserves historical snapshots", () => {
  const identity = identityFixture();
  const snapshot = freezeGenerationProject({
    name: "Somente identidade",
    niche: "",
    compiledDocument: "",
    visualIdentity: identity,
  });
  expect(snapshot).toMatchObject({
    version: 3,
    visualIdentity: identity,
    structuredData: {},
  });
  identity.rules.accent = "#112233";
  expect(
    snapshot.version === 3 && snapshot.visualIdentity.rules.accent
  ).toBeNull();
  expect(
    generationProjectSnapshotSchema.parse({
      version: 1,
      name: "Antigo",
      niche: "Geral",
      structuredData: {},
    }).version
  ).toBe(1);
});
