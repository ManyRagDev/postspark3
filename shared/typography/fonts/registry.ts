/**
 * Registro de fontes do harness.
 *
 * Mapeia o nome de família como as famílias criativas o declaram
 * (`shared/creative/families.ts`) para um arquivo `.ttf` no disco.
 *
 * REGRA: fonte ausente é erro, nunca substituição. Medir "Playfair Display"
 * com Inter produziria um relatório verde e mentiroso — exatamente o modo de
 * falha que este harness existe para impedir.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT_DIR_CANDIDATES = [
  join(HERE, "files"),
  join(process.cwd(), "shared", "typography", "fonts", "files"),
  join(process.cwd(), "api", "files"),
];

export const FONT_DIR =
  FONT_DIR_CANDIDATES.find((candidate) => existsSync(candidate)) ?? FONT_DIR_CANDIDATES[0];

export interface FontEntry {
  /** Nome exatamente como aparece em `families.ts` / `designTokens.typography`. */
  family: string;
  /** Nome do arquivo dentro de `harness/fonts/files/`. */
  file: string;
  /** De onde veio, para quem precisar repor. */
  source: string;
}

/**
 * Fontes de DESTINO (D14 da arquitetura). São as que o produto vai usar.
 */
export const TARGET_FONTS: FontEntry[] = [
  { family: "Fraunces", file: "fraunces.ttf", source: "postspark-next/packages/fonts/files" },
  { family: "Archivo", file: "archivo.ttf", source: "Google Fonts (OFL) — variável, eixos wdth+wght" },
  { family: "Bricolage Grotesque", file: "bricolage-grotesque.ttf", source: "Google Fonts (OFL) — variável, eixos wdth+opsz+wght" },
];

/**
 * Fontes de LINHA DE BASE — as que as 12 famílias declaram hoje. Necessárias
 * para medir o estado atual (critério da E3: "13 de 14 cortados vira 0 de 14"
 * exige medir o antes com as fontes do antes).
 */
export const BASELINE_FONTS: FontEntry[] = [
  { family: "Inter", file: "inter.ttf", source: "postspark-next/packages/fonts/files" },
  { family: "Space Grotesk", file: "space-grotesk.ttf", source: "postspark-next/packages/fonts/files" },
  { family: "Playfair Display", file: "playfair-display.ttf", source: "Google Fonts (OFL)" },
  { family: "Anton", file: "anton.ttf", source: "Google Fonts (OFL)" },
  { family: "Archivo Black", file: "archivo-black.ttf", source: "Google Fonts (OFL)" },
  { family: "Space Mono", file: "space-mono.ttf", source: "Google Fonts (OFL)" },
  { family: "Lora", file: "lora.ttf", source: "Google Fonts (OFL)" },
];

export const ALL_FONTS: FontEntry[] = [...TARGET_FONTS, ...BASELINE_FONTS];

export function entryFor(family: string): FontEntry | undefined {
  return ALL_FONTS.find((f) => f.family.toLowerCase() === family.toLowerCase());
}

export function pathFor(family: string): string | undefined {
  const entry = entryFor(family);
  if (!entry) return undefined;
  const full = join(FONT_DIR, entry.file);
  return existsSync(full) ? full : undefined;
}

export interface FontAvailability {
  present: FontEntry[];
  missing: FontEntry[];
}

export function checkAvailability(entries: FontEntry[] = ALL_FONTS): FontAvailability {
  const present: FontEntry[] = [];
  const missing: FontEntry[] = [];
  for (const entry of entries) {
    (existsSync(join(FONT_DIR, entry.file)) ? present : missing).push(entry);
  }
  return { present, missing };
}

/** Mensagem acionável para quem (ou o que) estiver executando o harness. */
export function missingFontsReport(missing: FontEntry[]): string {
  if (missing.length === 0) return "";
  const lines = missing.map((f) => `  • ${f.family} → ${FONT_DIR}/${f.file}   (${f.source})`);
  return [
    `Faltam ${missing.length} arquivo(s) de fonte. O harness NÃO substitui por similar —`,
    `medir com fonte trocada produz relatório verde e falso.`,
    ``,
    ...lines,
    ``,
    `Baixe os .ttf VARIÁVEIS (não os estáticos) e coloque em harness/fonts/files/.`,
  ].join("\n");
}
