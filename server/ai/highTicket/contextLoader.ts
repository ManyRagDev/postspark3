import type { MasterBriefing } from "@shared/highTicket";
import type { HighTicketPipelineInput } from "@shared/highTicket";
import { getBrandKitByUser, getPersonaByUser } from "../../db";
import { loadSiteIntelligence } from "../../siteIntelligence";
import { applyContextBudget } from "./contextBudget";

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export async function loadHighTicketContext(
  input: HighTicketPipelineInput,
): Promise<MasterBriefing> {
  const [brandKit, persona, siteIntelligence] = await Promise.all([
    getBrandKitByUser(input.userUuid).catch(() => undefined),
    getPersonaByUser(input.userUuid).catch(() => undefined),
    input.siteIntelligenceId
      ? loadSiteIntelligence(input.siteIntelligenceId, input.userUuid).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  const brandFallback = !brandKit;
  const personaFallback = !persona;
  const siteFallback = !siteIntelligence;
  const forbiddenTerms = [
    ...asStringArray(brandKit?.forbidden_terms),
    ...(siteIntelligence?.editorial.prohibitedClaims ?? []),
    ...(input.executionBrief?.forbiddenTerms ?? []),
  ];
  const requiredTerms = [
    ...asStringArray(brandKit?.must_include),
    ...(input.executionBrief?.mustInclude ?? []),
  ];
  const preferredColors = asStringArray(brandKit?.visual_palette);

  const briefing: MasterBriefing = {
    version: 1,
    userInput: {
      inputType: input.inputType,
      content: input.content,
      platform: input.platform,
      postMode: input.postMode,
      creationMode: input.creationMode,
      executionBrief: input.executionBrief,
    },
    brand: {
      toneOfVoice: brandKit?.tone ?? input.executionBrief?.tone,
      formattingRules: asStringArray(brandKit?.formatting_rules),
      forbiddenTerms: asStringArray(brandKit?.forbidden_terms),
      requiredTerms: asStringArray(brandKit?.must_include),
      dictionary: brandKit?.dictionary ?? {},
      colors: preferredColors,
      fontPrimary: brandKit?.font_family ?? undefined,
      visualTokens: brandKit
        ? {
            typography: {
              fontFamily: brandKit.font_family ?? "Inter",
              customFontUrl: "",
              originalFont: brandKit.font_family ?? "Inter",
              textTransform: "none",
              textAlign: "left",
            },
            structure: {
              borderRadius: brandKit.border_radius ?? "16px",
              boxShadow: brandKit.box_shadow ?? "none",
              border: "none",
            },
          }
        : undefined,
      fallbackUsed: brandFallback,
    },
    persona: {
      audience: persona?.audience,
      pains: asStringArray(persona?.pains),
      goals: asStringArray(persona?.goals),
      languageStyle: persona?.language_style ?? undefined,
      objections: asStringArray(persona?.objections),
      fallbackUsed: personaFallback,
    },
    site: {
      siteIntelligenceId: siteIntelligence?.id,
      summary: siteIntelligence?.business.summary,
      evidence:
        siteIntelligence?.evidence.map((item) => ({
          id: item.id,
          text: item.text,
          kind: item.kind,
        })) ?? [],
      toneGuidelines: siteIntelligence?.editorial.toneGuidelines ?? [],
      prohibitedClaims: siteIntelligence?.editorial.prohibitedClaims ?? [],
      source: siteIntelligence ?? undefined,
      fallbackUsed: siteFallback,
    },
    constraints: {
      forbiddenTerms,
      requiredTerms,
      toneGuidelines: [
        ...(siteIntelligence?.editorial.toneGuidelines ?? []),
        ...(brandKit?.tone ? [`Tom da marca: ${brandKit.tone}`] : []),
        ...(persona?.language_style ? [`Linguagem da persona: ${persona.language_style}`] : []),
      ],
      formattingRules: asStringArray(brandKit?.formatting_rules),
      preferredColors,
      maxHeadlineChars: 60,
      maxBodyChars: 110,
    },
    compressed: false,
    compressionNotes: [],
    fallbackNotes: [
      ...(brandFallback ? ["BrandKit absent; using safe brand defaults."] : []),
      ...(personaFallback ? ["Persona absent; using broad-audience defaults."] : []),
      ...(siteFallback ? ["Site Intelligence absent; using user input and persisted brand context only."] : []),
    ],
  };

  return applyContextBudget(briefing);
}
