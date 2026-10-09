import { readArsenalComposition } from "../../shared/designArsenal";
import manifest from "../../shared/arsenalBundledAssets.json";
import { authorizeArsenalAssets } from "./arsenalAssets";
import { arsenalHash } from "@shared/arsenalContent";

/** Validate new compositions without constraining legacy CanvasPostModels. Flag never blocks save/reopen. */
export function validateArsenalSaveModel(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const model = value as {
    modelVersion?: number;
    aspectRatio?: string;
    slides?: Array<{ composition?: unknown }>;
  };
  for (const slide of Array.isArray(model.slides) ? model.slides : []) {
    if (slide?.composition === undefined) continue;
    if (model.modelVersion !== 2)
      throw new Error("Composição V2 exige modelVersion 2");
    const c = readArsenalComposition(slide.composition);
    if (model.aspectRatio !== c.effectiveAspectRatio)
      throw new Error("Formato da composição divergente do documento");
    for (const asset of c.assets) {
      if (asset.kind === "catalog") continue; // Async ownership/manifest validation in the authenticated mutation.
      const entry = (
        manifest as Record<
          string,
          {
            sha256: string;
            family: string;
            weight: number;
            bytes: number;
            mimeType: string;
          }
        >
      )[asset.id];
      if (
        asset.kind !== "bundled" ||
        !entry ||
        ["sha256", "family", "weight", "bytes", "mimeType"].some(
          key =>
            (asset as unknown as Record<string, unknown>)[key] !==
            (entry as unknown as Record<string, unknown>)[key]
        )
      )
        throw new Error("Asset do arsenal não autorizado no manifesto M1");
    }
  }
}

export async function authorizeArsenalSaveModel(value: unknown, actor: string) {
  validateArsenalSaveModel(value);
  const slides =
    (value as { slides?: Array<{ composition?: unknown }> } | undefined)
      ?.slides ?? [];
  const assets = slides.flatMap(s =>
    s.composition
      ? readArsenalComposition(s.composition).assets.filter(
          a => a.kind === "catalog"
        )
      : []
  );
  const authorized = await authorizeArsenalAssets(
    assets.map(a => a.id),
    actor
  );
  for (const a of assets)
    if (
      !authorized.some(
        known => known.id === a.id && arsenalHash(known) === arsenalHash(a)
      )
    )
      throw new Error("Manifesto de asset divergente da autorização");
}
