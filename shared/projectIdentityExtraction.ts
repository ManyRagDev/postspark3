import { z } from "zod";
import type { VisualIdentity } from "./visualIdentity";
import type { BrandProjectRecord } from "./brandProjects";

const hex = z.string().regex(/^#[\da-f]{6}$/i);
const paletteSchema = z.object({ background: hex, surface: hex, text: hex, accent: hex, accent2: hex, accent3: hex });
const kitSchema = z.object({
  source: z.literal("design-extraction"),
  postIds: z.array(z.number().int().positive()).min(1).max(5),
  palette: paletteSchema.optional(),
});

export function capturedProjectPalette(preferences?: BrandProjectRecord["visualPreferences"]) {
  if (!preferences) return;
  try {
    const kit = kitSchema.parse(JSON.parse(preferences.composition));
    // Older kits stored the six DNA roles in this order.
    const [background, surface, text, accent, accent2, accent3] = preferences.colors;
    const palette = kit.palette ?? paletteSchema.parse({ background, surface, text, accent, accent2, accent3 });
    return { postIds: kit.postIds, palette };
  } catch {
    return;
  }
}

export function sameIdentityKit(identity: VisualIdentity | undefined, postIds: number[]) {
  const saved = identity?.extractedFrom?.postIds;
  return !!saved && saved.length === postIds.length && saved.every((id, index) => id === postIds[index]);
}
