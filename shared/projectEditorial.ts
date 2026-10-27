import { brandCaptureMetadataSchema, capturedVisualPreferencesSchema } from "./generationSources";
import { z } from "zod";
import type { ProjectStructuredData } from "./brandProjects";

/** Frozen with the request, including projects that only exist in local storage. */
const generationProjectSnapshotV1Schema = z
  .object({
    version: z.literal(1),
    name: z.string().max(120),
    niche: z.string().max(120),
    structuredData: z.object({
      offerAndTransformation: z.string().optional(),
      factualDifferentials: z.string().optional(),
      targetAudience: z.string().optional(),
      painsAndObjections: z.string().optional(),
      voiceTone: z.string().optional(),
      forbiddenTerms: z.string().optional(),
      defaultCta: z.string().optional(),
    }),
  })
  .strict();
export const generationProjectSnapshotSchema = z.union([generationProjectSnapshotV1Schema,generationProjectSnapshotV1Schema.extend({version:z.literal(2),capture:brandCaptureMetadataSchema.optional(),visualPreferences:capturedVisualPreferencesSchema.optional()})]);
export type GenerationProjectSnapshot = z.infer<
  typeof generationProjectSnapshotSchema
>;

const headings: Record<keyof ProjectStructuredData, string[]> = {
  offerAndTransformation: [
    "O QUE FAZEMOS & TRANSFORMAÇÃO",
    "OFERTA_E_TRANSFORMACAO",
  ],
  factualDifferentials: ["DIFERENCIAIS FACTUAIS", "DIFERENCIAIS_FACTUAIS"],
  targetAudience: ["PÚBLICO-ALVO", "PUBLICO_ALVO"],
  painsAndObjections: ["DORES E OBJEÇÕES DO CLIENTE", "DORES_E_OBJECOES"],
  voiceTone: ["POSTURA E TOM DE VOZ", "TOM_DE_VOZ"],
  forbiddenTerms: [
    "TERMOS E ABORDAGENS PROIBIDAS",
    "FRONTEIRAS_E_TERMOS_PROIBIDOS",
  ],
  defaultCta: ["CHAMADA PARA AÇÃO (CTA PADRÃO)", "CTA_PADRAO"],
};
const normalizeHeading = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** Recognized sections only. The original document remains the factual source. */
export function projectEditorialDefaults(
  dossier = "",
  snapshot?: GenerationProjectSnapshot
) {
  const sections = new Map<string, string>();
  for (const match of Array.from(
    dossier.matchAll(/^##\s+([^\r\n]+)\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/gm)
  ))
    sections.set(normalizeHeading(match[1]), match[2].trim());
  const data = Object.fromEntries(
    Object.entries(headings)
      .map(([key, aliases]) => [
        key,
        snapshot?.structuredData[key as keyof ProjectStructuredData]?.trim() ||
          aliases.map(h => sections.get(normalizeHeading(h))).find(Boolean) ||
          "",
      ])
      .filter(([, value]) => Boolean(value))
  ) as Partial<ProjectStructuredData>;
  return {
    version: 1 as const,
    name:
      snapshot?.name ||
      dossier.match(/^#\s+DOSSIÊ DE MARCA:\s*(.+)$/im)?.[1]?.trim() ||
      "",
    niche:
      snapshot?.niche ||
      dossier
        .match(/(?:Segmento\s*\/\s*Nicho|NICHO)\s*:\*?\*?\s*(.+)/i)?.[1]
        ?.trim() ||
      "",
    structuredData: data,
  };
}

export function freezeGenerationProject(project: {
  name: string;
  niche: string;
  compiledDocument: string;
  structuredData?: Partial<ProjectStructuredData>;
  capture?: import("zod").infer<typeof brandCaptureMetadataSchema>;
  visualPreferences?: import("zod").infer<typeof capturedVisualPreferencesSchema>;
}): GenerationProjectSnapshot {
  const snapshot = generationProjectSnapshotSchema.parse({
    version: 1,
    name: project.name,
    niche: project.niche,
    structuredData: project.structuredData ?? {},
  });
  // Preserve all recognized text, including historical documents whose fields are empty.
  return generationProjectSnapshotSchema.parse(
    {...projectEditorialDefaults(project.compiledDocument, snapshot),...(project.capture || project.visualPreferences ? {version:2,capture:project.capture,visualPreferences:project.visualPreferences}: {})}
  );
}

/** Semicolons/newlines are explicit list delimiters; commas can belong to a phrase. */
export function projectForbiddenTerms(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[;\r\n]+/)
        .map(s => s.replace(/^\s*[-*•]\s*/, "").trim())
        .filter(Boolean)
    )
  );
}
