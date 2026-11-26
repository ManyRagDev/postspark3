import type { VisualIdentity } from "./visualIdentity";
import type { GenerationProjectSnapshot } from "./projectEditorial";
import type { PieceDefinitionV2, ResolvedVariantDefinitionV2 } from "./designArsenal";
import { arsenalHash } from "./arsenalContent";
import { contrastRatio, mix } from "./creative/color";

export function extractedPalette(snapshot?: GenerationProjectSnapshot) {
  const identity = snapshot?.version === 3 ? snapshot.visualIdentity : undefined;
  if (!identity?.extractedFrom) return;
  return identity.rules;
}

type Rules = VisualIdentity["rules"];
/** Translate editable inks using their original relationship to paper, ink and accent. */
export function projectColorMap(rules: Rules, originalBackground: string) {
  const background = rules.background ?? rules.colors[0];
  const accent = rules.accent ?? rules.colors[3] ?? rules.colors[1] ?? background;
  if (!background || !accent) return;
  const text = [rules.text, "#111111", "#FFFFFF", "#000000"].find(
    c => c && contrastRatio(c, background) >= 4.5) ?? "#000000";
  const rgb = (color: string) => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const gray = (color: string) => {
    const [r, g, b] = rgb(color);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const paper = gray(originalBackground) >= 0.5 ? 1 : 0;
  const accents = Array.from(new Set([accent, ...rules.colors.slice(4)]));
  const hues: number[] = [];
  const targetBackground = background;
  function color(value: string) {
    if (!/^#[a-f\d]{6}$/i.test(value)) return value;
    if (value.toLowerCase() === originalBackground.toLowerCase()) return targetBackground;
    const [r, g, b] = rgb(value);
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > 45) {
      const hue = Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b);
      let group = hues.findIndex(h => Math.cos(hue - h) >= 0.72);
      if (group < 0) group = hues.push(hue) - 1;
      const ink = accents[group % accents.length];
      // Tint pale coloured panels so that a badge and its background remain distinct.
      const strength = Math.min(1, spread / 130);
      return strength < 1 ? mix(targetBackground, ink, strength) : ink;
    }
    return mix(targetBackground, text, Math.abs(gray(value) - paper));
  }
  return { background, text, accent, color };
}

/** The fragment is a private copy. Re-address changed pieces before hashing its variant. */
export function colorProjectFragment(base: ResolvedVariantDefinitionV2, pieces: Record<string, PieceDefinitionV2>,
  map: NonNullable<ReturnType<typeof projectColorMap>>) {
  base.artboard.background = map.background;
  const colored: Record<string, PieceDefinitionV2> = {};
  const hashes = new Map<string, string>();
  for (const instance of base.instances) {
    const old = instance.pieceHash;
    let hash = hashes.get(old);
    if (!hash) {
      const p = pieces[old];
      const next = p.kind === "media" || p.imageAssetId ? p : {
        ...p, fill: map.color(p.fill), stroke: p.stroke && map.color(p.stroke),
        ...(p.textGradient && { textGradient: { ...p.textGradient, colors: p.textGradient.colors.map(map.color) } }),
        ...(p.extrusion && { extrusion: { ...p.extrusion, color: map.color(p.extrusion.color), colors: p.extrusion.colors?.map(map.color) } }),
        ...(p.textFragments && { textFragments: p.textFragments.map(f => f.style.color
          ? { ...f, style: { ...f.style, color: map.color(f.style.color) } } : f) }),
      };
      hash = next === p ? old : arsenalHash(next);
      hashes.set(old, hash);
      colored[hash] = next;
    }
    instance.pieceHash = hash;
  }
  return colored;
}
