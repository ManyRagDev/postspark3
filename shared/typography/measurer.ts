/**
 * Indireção do medidor tipográfico (SPEC-005, correção de build).
 *
 * `resolve.ts` não importa mais `fontkitMeasurer` diretamente: o medidor de
 * fontkit depende de `node:fs`/`node:path` (registro de fontes em disco) e
 * quebraria o bundle do cliente. Quem precisa de medição real chama
 * `setTypographyMeasurer(fontkitMeasurer)`:
 *
 * - servidor/harness: `server/ai/generationOrchestrator.ts` (e o setup do
 *   vitest em `vitest.setup.ts`);
 * - cliente: NUNCA — o snapshot v4 já chega resolvido do servidor; em
 *   re-resolução de edição sem medidor, a falha é estruturada
 *   (`missing-font`), exatamente como hoje sem fontes no disco.
 */

import type { Measurer } from "./types";
import { MissingFontError } from "./types";

let activeMeasurer: Measurer | null = null;

export function setTypographyMeasurer(measurer: Measurer | null): void {
  activeMeasurer = measurer;
}

const unavailableMeasurer: Measurer = {
  id: "unavailable",
  supports: () => false,
  measureWidth: () => {
    throw new MissingFontError("unavailable", "medidor tipográfico não configurado neste ambiente");
  },
  wrapText: () => {
    throw new MissingFontError("unavailable", "medidor tipográfico não configurado neste ambiente");
  },
  linesHeight: () => 0,
};

export function getTypographyMeasurer(): Measurer {
  return activeMeasurer ?? unavailableMeasurer;
}
