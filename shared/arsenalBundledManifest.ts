import fonts from "./arsenalBundledAssets.json";
import showcase from "./arsenalShowcaseAssets.json";
import type { ArsenalAsset } from "./designArsenal";

export const arsenalBundledManifest: Readonly<Record<string, ArsenalAsset & { path: string }>> = {
  ...fonts,
  ...showcase,
} as Record<string, ArsenalAsset & { path: string }>;
