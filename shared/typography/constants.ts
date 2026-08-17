/**
 * Constantes canônicas de encaixe tipográfico (SPEC-001). Únicas — o harness
 * (`harness/thresholds.ts`) reexporta as duas de aceite em vez de duplicar.
 */

/** Piso de legibilidade do headline em px, num documento de 360px de largura. */
export const LEGIBILITY_FLOOR_PX = 24;

/** Teto de corpo de fonte para headline, em px, antes de multiplicadores de família. */
export const HEADLINE_CEILING_PX = 56;

/** Teto de corpo de fonte para body, em px. */
export const BODY_CEILING_PX = 22;

/** Piso de legibilidade do body em px. Menor que o do headline — corpo de texto lido de perto. */
export const BODY_FLOOR_PX = 17;
