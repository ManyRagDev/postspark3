/**
 * Motor de Contraste Inteligente do CanvasLab (PostSpark Studio).
 *
 * Regra mandatória de usabilidade (item 1 do usuário):
 *   fundo escuro ⇄ texto claro, e vice-versa — também nas metades do split.
 *
 * Modo "corrigir + permitir re-override":
 *   - Quando o fundo, o acento ou a família mudam, as cores de texto NÃO
 *     manuais são re-resolvidas automaticamente (applyContrastGuard).
 *   - Escolhas manuais do usuário (manualHeadlineColor/manualSubtextColor)
 *     são preservadas; o invalidar de contraste é apenas sinalizado
 *     (getContrastWarnings → selo "contraste baixo" nos pickers).
 *
 * Não é um segundo normalizador visual de snapshot: é um utilitário de cor
 * puro aplicado ao CanvasPostModel, documento autoritativo do editor oficial.
 */

import {
  isDarkColor,
  resolveLegibleTextColor,
  type CanvasPostModel,
  type CanvasPostPalette,
} from "../components/types";

export { isDarkColor, resolveLegibleTextColor };

/** Indica se texto tem contraste legível contra o fundo (regra binária YIQ). */
export function hasLegibleTextContrast(bg: string, text?: string): boolean {
  if (!text) return true;
  return isDarkColor(bg) !== isDarkColor(text);
}

export interface ContrastWarnings {
  /** Título com contraste insuficiente contra o fundo da sua metade. */
  headline: boolean;
  /** Corpo com contraste insuficiente contra o fundo da sua metade. */
  subtext: boolean;
}

/**
 * Resolve a paleta aplicando a regra de contraste.
 * - Fundo escuro ⇒ texto claro; fundo claro ⇒ texto escuro.
 * - brutal-split: título respeita a metade de CIMA (`background`);
 *   corpo respeita a metade de BAIXO (`accent`).
 * - Cores manuais (flags) são preservadas e apenas auditadas.
 */
export function resolveGuardedPalette(post: CanvasPostModel): {
  palette: CanvasPostPalette;
  warnings: ContrastWarnings;
} {
  const isCinematic = post.familyId === "cinematic-depth";
  let bg = post.palette.background || (isCinematic ? "#08080A" : "#171717");
  if (isCinematic && !isDarkColor(bg)) {
    bg = "#08080A";
  }
  const accent = post.palette.accent || "#21F1A8";
  const isSplit = post.familyId === "brutal-split";

  const headlineSource = post.palette.headlineColor ?? post.palette.text;
  const subtextSource = post.palette.subtextColor ?? post.palette.text;
  const subtextBg = isSplit ? accent : bg;

  const headlineColor = post.manualHeadlineColor
    ? headlineSource
    : resolveLegibleTextColor(bg, headlineSource);
  const subtextColor = post.manualSubtextColor
    ? subtextSource
    : resolveLegibleTextColor(subtextBg, subtextSource);

  const text = post.manualHeadlineColor || post.manualSubtextColor
    ? post.palette.text
    : resolveLegibleTextColor(bg, post.palette.text);

  const palette: CanvasPostPalette = {
    ...post.palette,
    background: bg,
    text,
    headlineColor,
    subtextColor,
  };

  return {
    palette,
    warnings: {
      headline: !hasLegibleTextContrast(bg, headlineColor),
      subtext: !hasLegibleTextContrast(subtextBg, subtextColor),
    },
  };
}

/**
 * Aplica o guardião a um post: devolve o post com a paleta re-resolvida.
 * Idempotente — chamar sempre que fundo/acento/família mudarem.
 */
export function applyContrastGuard(post: CanvasPostModel): CanvasPostModel {
  const { palette } = resolveGuardedPalette(post);
  return { ...post, palette };
}

/** Apenas as advertências (para selos de UI nos pickers de cor). */
export function getContrastWarnings(post: CanvasPostModel): ContrastWarnings {
  return resolveGuardedPalette(post).warnings;
}

/** Detecta se um patch de atualização toca em algo que exige re-resolução de contraste. */
export function patchTouchesContrast(
  prev: CanvasPostModel,
  patch: Partial<CanvasPostModel>,
): boolean {
  if (patch.familyId !== undefined && patch.familyId !== prev.familyId) return true;
  if (patch.manualHeadlineColor === false || patch.manualSubtextColor === false) return true;
  if (patch.palette) {
    if (patch.palette.background !== prev.palette.background) return true;
    if (patch.palette.accent !== prev.palette.accent) return true;
  }
  return false;
}
