import { z } from "zod";
import { mareSelectionsSchema } from "../shared/mareSelection";
import { canvasTemporalMediaSchema } from "../shared/canvasTemporalMedia";

/** Both personal and team save routes accept the same authoritative document. */
export function validateTemporalMedia(document: unknown) {
  const parsed = z
    .object({ slides: z.array(z.unknown()).optional() })
    .passthrough()
    .safeParse(document);
  if (!parsed.success || !parsed.data.slides) return;
  for (const slide of parsed.data.slides) {
    if (
      slide &&
      typeof slide === "object" &&
      "mareSelections" in slide &&
      slide.mareSelections !== undefined
    )
      mareSelectionsSchema.parse(slide.mareSelections);
    if (
      slide &&
      typeof slide === "object" &&
      "temporalMedia" in slide &&
      slide.temporalMedia !== undefined
    ) {
      const refs = canvasTemporalMediaSchema.parse(slide.temporalMedia);
      if (
        Object.keys(refs).some(key =>
          ["__proto__", "prototype", "constructor"].includes(key)
        )
      )
        throw new Error("Identificador de camada inválido.");
    }
  }
}
