import type { ArsenalUserFont } from "@shared/designArsenal";

export const MAX_SINGLE_FONT_BYTES = 1024 * 1024; // 1 MiB (1,048,576 bytes)
export const MAX_TOTAL_USER_FONT_BYTES = 3_500_000; // 3.5 MB
export const DEFAULT_FONT_TIMEOUT_MS = 3000;

export type SupportedFontFormat = "truetype" | "opentype" | "woff" | "woff2";

export interface FontValidationResult {
  valid: boolean;
  format?: SupportedFontFormat;
  error?: string;
}

/**
 * Inspeciona os magic bytes do buffer binário para determinar o formato da fonte.
 * TTF: 0x00 0x01 0x00 0x00 ou 'true' (0x74 0x72 0x75 0x65)
 * OTF: 'OTTO' (0x4F 0x54 0x54 0x4F)
 * WOFF: 'wOFF' (0x77 0x4F 0x46 0x46)
 * WOFF2: 'wOF2' (0x77 0x4F 0x46 0x32)
 */
export function detectFontFormat(bytes: Uint8Array): SupportedFontFormat | null {
  if (bytes.length < 4) return null;

  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];

  // TTF: 00 01 00 00
  if (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) {
    return "truetype";
  }
  // TTF (Mac TrueType): 'true'
  if (b0 === 0x74 && b1 === 0x72 && b2 === 0x75 && b3 === 0x65) {
    return "truetype";
  }
  // OTF: 'OTTO'
  if (b0 === 0x4f && b1 === 0x54 && b2 === 0x54 && b3 === 0x4f) {
    return "opentype";
  }
  // WOFF: 'wOFF'
  if (b0 === 0x77 && b1 === 0x4f && b2 === 0x46 && b3 === 0x46) {
    return "woff";
  }
  // WOFF2: 'wOF2'
  if (b0 === 0x77 && b1 === 0x4f && b2 === 0x46 && b3 === 0x32) {
    return "woff2";
  }

  return null;
}

/**
 * Calcula o tamanho em bytes a partir de uma URL ou data URI.
 */
export function estimateFontBytes(url: string): number {
  if (url.startsWith("data:")) {
    const commaIdx = url.indexOf(",");
    if (commaIdx >= 0) {
      const base64 = url.slice(commaIdx + 1);
      const padding = (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
      return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
    }
  }
  return 0;
}

/**
 * Valida o arquivo binário da fonte (formato e tamanho ≤ 1 MiB).
 */
export function validateFontFile(
  bytes: Uint8Array,
  fileName?: string
): FontValidationResult {
  if (bytes.length === 0) {
    return { valid: false, error: "Arquivo de fonte vazio." };
  }

  if (bytes.length > MAX_SINGLE_FONT_BYTES) {
    return {
      valid: false,
      error: `O arquivo de fonte excede o limite máximo de 1 MiB (${bytes.length} bytes > ${MAX_SINGLE_FONT_BYTES} bytes).`,
    };
  }

  const format = detectFontFormat(bytes);
  if (!format) {
    return {
      valid: false,
      error: `Formato de fonte não suportado${fileName ? ` (${fileName})` : ""}. Use TTF, OTF, WOFF ou WOFF2.`,
    };
  }

  // Validação de integridade estrutural mínima
  if (format === "truetype" || format === "opentype") {
    if (bytes.length < 12) {
      return { valid: false, error: "Arquivo de fonte truncado ou corrompido." };
    }
    const numTables = (bytes[4] << 8) | bytes[5];
    if (numTables === 0 || 12 + numTables * 16 > bytes.length) {
      return { valid: false, error: "Estrutura de tabelas da fonte corrompida ou truncada." };
    }
  } else if (format === "woff") {
    if (bytes.length < 44) {
      return { valid: false, error: "Cabeçalho WOFF corrompido ou truncado." };
    }
  } else if (format === "woff2") {
    if (bytes.length < 48) {
      return { valid: false, error: "Cabeçalho WOFF2 corrompido ou truncado." };
    }
  }

  return { valid: true, format };
}

/**
 * Valida se adicionar uma nova fonte excede o payload cumulativo de fontes do documento (≤ 3.500.000 bytes).
 */
export function validateTotalFontPayload(
  existingFonts: ArsenalUserFont[] | undefined,
  newFontBytes: number
): { valid: boolean; currentTotal: number; newTotal: number; error?: string } {
  const currentTotal = (existingFonts || []).reduce((acc, f) => acc + estimateFontBytes(f.url), 0);
  const newTotal = currentTotal + newFontBytes;

  if (newTotal > MAX_TOTAL_USER_FONT_BYTES) {
    return {
      valid: false,
      currentTotal,
      newTotal,
      error: `O payload total de fontes pessoais (${newTotal} bytes) excederia o limite máximo de ${MAX_TOTAL_USER_FONT_BYTES} bytes por documento.`,
    };
  }

  return { valid: true, currentTotal, newTotal };
}

// Registro global de fontes já carregadas no DOM para prevenir injeções duplicadas (AC-006-05)
const registeredFonts = new Set<string>();

/**
 * Registra e injeta a fonte no DOM de forma idempotente sem duplicar fontes no FontFaceSet.
 */
export async function registerUserFont(font: ArsenalUserFont): Promise<boolean> {
  const fontKey = `${font.family}::${font.url}`;
  if (registeredFonts.has(fontKey)) {
    return true;
  }

  if (typeof document === "undefined" || !document.fonts) {
    registeredFonts.add(fontKey);
    return true;
  }

  try {
    const formatStr = font.format ? `format("${font.format}")` : "";
    const source = `url("${font.url}") ${formatStr}`.trim();
    const descriptors: FontFaceDescriptors = {
      weight: font.weight ? String(font.weight) : "normal",
      style: "normal",
    };

    const fontFace = new FontFace(font.family, source, descriptors);
    const loadedFace = await Promise.race([
      fontFace.load(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout ao carregar fonte")), DEFAULT_FONT_TIMEOUT_MS)
      ),
    ]);

    if (loadedFace) {
      document.fonts.add(loadedFace);
      registeredFonts.add(fontKey);
      return true;
    }
  } catch (err) {
    console.warn(`[fontResources] Falha ao registrar fonte ${font.family}:`, err);
  }

  return false;
}

/**
 * Carrega fontes do catálogo com timeout determinístico e fallback gracioso sem travar a interface (AC-006-03).
 */
export async function loadCatalogFontWithTimeout(
  family: string,
  timeoutMs = DEFAULT_FONT_TIMEOUT_MS
): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) {
    return true;
  }

  try {
    const isAlreadyLoaded = document.fonts.check(`16px "${family}"`);
    if (isAlreadyLoaded) return true;

    const loadPromise = document.fonts.load(`16px "${family}"`);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ao carregar fonte de catálogo ${family}`)), timeoutMs)
    );

    await Promise.race([loadPromise, timeoutPromise]);
    return true;
  } catch (error) {
    console.warn(`[fontResources] Fallback ativado para ${family}:`, error);
    return false;
  }
}

