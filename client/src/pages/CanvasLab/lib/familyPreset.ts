/**
 * Aplicação canônica de uma Direção de Arte (família visual) no CanvasLab.
 *
 * Regra mandatória de usabilidade (item 3 do usuário):
 *   um estilo pré-definido altera APENAS tipografia, espaçamentos, tamanhos
 *   e organização — NUNCA as cores já decididas pelo usuário.
 *
 * Comportamento:
 *   - familyId/familyName/fontFamily vêm da família escolhida;
 *   - palette.background e palette.accent são PRESERVADOS intactos;
 *   - surface só assume o default da família quando o usuário não definiu um;
 *   - a legibilidade do texto é re-resolvida pelo guardião de contraste
 *     (client/src/pages/CanvasLab/lib/contrast.ts) — respeitando overrides
 *     manuais do usuário.
 */

import { OFFICIAL_FAMILIES_META, type CanvasPostModel, type VisualFamilyId } from "../components/types";
import { applyContrastGuard } from "./contrast";

export function applyFamilyPreset(
  post: CanvasPostModel,
  familyId: VisualFamilyId,
): CanvasPostModel {
  const meta = OFFICIAL_FAMILIES_META[familyId];
  if (!meta) return post;

  const withFamily: CanvasPostModel = {
    ...post,
    familyId,
    familyName: meta.name,
    fontFamily: meta.defaultFont,
  };

  const guarded = applyContrastGuard(withFamily);

  return {
    ...guarded,
    palette: {
      ...guarded.palette,
      background: post.palette.background,
      accent: post.palette.accent,
      surface: post.palette.surface || meta.defaultPalette.surface,
    },
  };
}
