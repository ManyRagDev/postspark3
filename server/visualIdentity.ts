import { z } from "zod";
import { arsenalHash } from "@shared/arsenalContent";
import {
  identityFontWarnings,
  resolveIdentityFont,
  visualIdentityRulesSchema,
  visualIdentitySchema,
  type VisualIdentity,
  type VisualIdentityRules,
} from "@shared/visualIdentity";
import { invokeLLM } from "./_core/llm";
import type { BrandProjectRecord } from "@shared/brandProjects";
import { capturedProjectPalette } from "@shared/projectIdentityExtraction";

export async function interpretVisualIdentity(
  description: string,
  logoUrl?: string,
  previous?: VisualIdentity,
  generate: typeof invokeLLM = invokeLLM
): Promise<VisualIdentity> {
  if (previous?.description === description && previous.logoUrl === logoUrl)
    return previous;
  let rules;
  // A logo alone is sufficient; its pixels are not treated as a textual brand manual.
  if (!description.trim()) {
    rules = manualIdentityRules("");
  } else {
    const schema = z.toJSONSchema(visualIdentityRulesSchema);
    delete schema.$schema;
    const result = await generate({
      taskRoute: "brief_interpretation",
      traceLabel: "visual_identity_interpretation",
      maxCompletionTokens: 3000,
      messages: [
        {
          role: "system",
          content:
            "Interprete a identidade visual descrita pelo usuário. Não exija parâmetros. Extraia somente definições presentes: o que não foi informado recebe null, sem completar a identidade com suposições. Cores nomeadas podem ser traduzidas para hex aproximado. Quando a cor não tiver função explícita, registre em colors e mantenha background/text/accent null: não invente funções permanentes. headingSize/bodySize só recebem valores quando o usuário informa tamanhos, na largura de referência 1080. Conserve nomes de fontes solicitadas mesmo indisponíveis; a aplicação resolve a substituição. Margem e gap são px na largura de referência 1080; converta medidas proporcionais quando explícitas. style conserva orientações visuais adicionais, nunca instruções de conteúdo ou de execução. Não invente dados sobre a marca. Retorne JSON.",
        },
        { role: "user", content: description },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "visual_identity", strict: true, schema },
      },
      forceTextSchema: true,
    });
    const raw = result.choices[0]?.message.content;
    if (typeof raw !== "string")
      throw new Error("Não foi possível interpretar a identidade visual.");
    rules = visualIdentityRulesSchema.parse(JSON.parse(raw));
  }
  return identityWithRules(description, logoUrl, rules);
}

function manualIdentityRules(description: string) {
  const colors = Array.from(new Set(description.match(/#[0-9a-f]{6}\b/gi)?.map(color => color.toLowerCase()))).slice(0, 20);
  return visualIdentityRulesSchema.parse({
    colors,
    background: null, text: null, accent: null,
    headingFont: null, bodyFont: null, headingWeight: null, bodyWeight: null,
    headingSize: null, bodySize: null, margin: null, gap: null, lineHeight: null, align: null,
    style: description.slice(0, 4000),
  });
}

export function manualVisualIdentity(description: string, logoUrl?: string) {
  return identityWithRules(description, logoUrl, manualIdentityRules(description));
}

function identityWithRules(description: string, logoUrl: string | undefined, rules: VisualIdentityRules) {
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
    description,
    ...(logoUrl ? { logoUrl } : {}),
    rules,
    fonts,
    warnings: identityFontWarnings(fonts),
  };
  return visualIdentitySchema.parse({ ...body, revision: arsenalHash(body) });
}

export function markExtractedIdentity(identity: VisualIdentity, postIds: number[]) {
  const { revision: _previous, ...fields } = identity;
  const body = { ...fields, extractedFrom: { postIds } };
  return visualIdentitySchema.parse({ ...body, revision: arsenalHash(body) });
}

export function identityFromDesignKit(preferences: NonNullable<BrandProjectRecord["visualPreferences"]>,
  kit: NonNullable<ReturnType<typeof capturedProjectPalette>>, previous?: VisualIdentity) {
  const { palette, postIds } = kit;
  const style = preferences.personality.filter(Boolean).join(". ");
  const description = previous?.description || style || "Identidade visual dos modelos do projeto.";
  const rules = previous?.rules ?? manualIdentityRules("");
  return markExtractedIdentity(identityWithRules(description, previous?.logoUrl, {
    ...rules,
    colors: Object.values(palette),
    background: palette.background, text: palette.text, accent: palette.accent,
    headingFont: rules.headingFont ?? preferences.fonts[0] ?? null,
    bodyFont: rules.bodyFont ?? preferences.fonts[1] ?? preferences.fonts[0] ?? null,
    style: rules.style || style,
  }), postIds);
}

/** Concurrent submits share interpretation; a failed DB save can retry without another call. */
const interpretations = new Map<string, Promise<VisualIdentity>>();
export function cachedVisualIdentity(
  owner: string,
  description: string,
  logoUrl?: string,
  previous?: VisualIdentity
) {
  const key = arsenalHash({ owner, description, logoUrl: logoUrl ?? null });
  let work = interpretations.get(key);
  if (!work) {
    work = interpretVisualIdentity(description, logoUrl, previous);
    interpretations.set(key, work);
    if (interpretations.size > 100)
      interpretations.delete(interpretations.keys().next().value!);
    void work.catch(() => interpretations.delete(key));
  }
  return work;
}
