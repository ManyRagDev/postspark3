/**
 * savePreflight.ts — Validação compartilhada de orçamento de envelope de salvamento
 * (OS-003-008-C05 / BUG-CL-032).
 *
 * Constrói o payload real com canvasModelToSavePayload ou canvasModelToUpdatePayload,
 * aplica fitSavePayload e verifica a cota estrita de 3.5MB UTF-8 antes de qualquer commit.
 */

import type { CanvasPostModel } from "../components/types";
import { canvasModelToSavePayload, canvasModelToUpdatePayload, type CanvasSaveInputMeta } from "./saveAdapter";
import { fitSavePayload } from "./fitSavePayload";

export const MAX_SAVE_PAYLOAD_BYTES = 3_500_000;

export interface PreflightOptions {
  isUpdate?: boolean;
  inputMeta?: CanvasSaveInputMeta;
}

export interface PreflightResult {
  ok: boolean;
  byteLength: number;
  payload?: any;
  error?: string;
}

/**
 * Executa o preflight puro do envelope de salvamento.
 * Retorna ok: true e o payload preparado se couber no teto de 3.5MB;
 * caso contrário retorna ok: false com a mensagem de erro apropriada.
 */
export async function preflightSavePayload(
  post: CanvasPostModel,
  options?: PreflightOptions
): Promise<PreflightResult> {
  const isUpdate = options?.isUpdate ?? false;
  const inputMeta: CanvasSaveInputMeta = options?.inputMeta ?? {
    inputType: "text",
    inputContent: post.caption || post.headline || "audit",
  };

  const rawPayload = isUpdate
    ? canvasModelToUpdatePayload(post)
    : canvasModelToSavePayload(post, inputMeta);

  try {
    const fitted = await fitSavePayload(rawPayload);
    const byteLength = new TextEncoder().encode(JSON.stringify(fitted)).byteLength;
    if (byteLength > MAX_SAVE_PAYLOAD_BYTES) {
      return {
        ok: false,
        byteLength,
        error: `O tamanho total do payload (${byteLength} bytes) excede o limite permitido (${MAX_SAVE_PAYLOAD_BYTES} bytes).`,
      };
    }
    return {
      ok: true,
      byteLength,
      payload: fitted,
    };
  } catch (err: any) {
    const rawBytes = new TextEncoder().encode(JSON.stringify(rawPayload)).byteLength;
    return {
      ok: false,
      byteLength: rawBytes,
      error: err?.message || "O tamanho total do documento com a nova fonte excede o limite permitido (3.5MB).",
    };
  }
}
