import { PaletteDef } from "./types";
import { DesignTokens } from "../postspark";
import { isDark, lighten, darken, mix, contrastRatio } from "./color";

export const PALETTES: PaletteDef[] = [
  { id: "tiffany-dark", label: "Tiffany Dark", colorA: "#21F1A8", colorB: "#171717", temperature: "cool", vibe: ["tech", "cru"], invertible: false },
  { id: "true-pink", label: "True Pink", colorA: "#FD1843", colorB: "#FFF9FA", temperature: "warm", vibe: ["divertido", "urgente"], invertible: true },
  { id: "violet-lime", label: "Violet Lime", colorA: "#3C1A47", colorB: "#B6FF00", temperature: "cool", vibe: ["tech", "divertido"], invertible: true },
  { id: "cyprus-sand", label: "Cyprus Sand", colorA: "#004741", colorB: "#F0EDE4", temperature: "neutral", vibe: ["premium", "editorial"], invertible: true },
  { id: "lime-canopy", label: "Lime Canopy", colorA: "#E4FD97", colorB: "#2D3E2C", temperature: "neutral", vibe: ["sereno"], invertible: true, bodyNeedsBoost: true },
  { id: "milky-mantis", label: "Milky Mantis", colorA: "#FFFDF1", colorB: "#59C749", temperature: "warm", vibe: ["sereno", "divertido"], invertible: true, bodyNeedsBoost: true },
  { id: "turmeric-malt", label: "Turmeric Malt", colorA: "#FFBE0B", colorB: "#2A2312", temperature: "warm", vibe: ["urgente", "divertido"], invertible: true },
  { id: "silver-moss", label: "Silver Moss", colorA: "#141414", colorB: "#28EE34", temperature: "cool", vibe: ["tech", "cru"], invertible: false },
  { id: "volcano-night", label: "Volcano Night", colorA: "#FF4103", colorB: "#001621", temperature: "warm", vibe: ["urgente", "cru"], invertible: false },
  { id: "skin-bridal", label: "Skin Bridal", colorA: "#FFC6A8", colorB: "#741A2F", temperature: "warm", vibe: ["premium", "editorial"], invertible: true }
];

export function paletteToDesignTokens(p: PaletteDef, inverted: boolean): DesignTokens {
  const aDark = isDark(p.colorA);
  const bDark = isDark(p.colorB);
  
  let dark: string, light: string;
  if (aDark !== bDark) {
    dark = aDark ? p.colorA : p.colorB;
    light = aDark ? p.colorB : p.colorA;
  } else {
    dark = p.colorB;
    light = p.colorA;
  }

  let background = dark;
  let text = light;

  if (inverted && p.invertible) {
    if (contrastRatio(light, dark) >= 4.5) {
      background = light;
      text = dark;
    }
  }

  const getSaturation = (hex: string) => {
    const hexClean = hex.replace(/^#/, "");
    const r = parseInt(hexClean.slice(0, 2), 16);
    const g = parseInt(hexClean.slice(2, 4), 16);
    const b = parseInt(hexClean.slice(4, 6), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };

  const satA = getSaturation(p.colorA);
  const satB = getSaturation(p.colorB);
  const primary = satA > satB ? p.colorA : p.colorB;

  const secondary = mix(primary, background, 0.35);
  const card = isDark(background) ? lighten(background, 6) : darken(background, 4);

  // CR-003 (E5): contraste WCAG AA garantido por construção. Se o par
  // escolhido ficou abaixo de 4.5:1 (ex.: `true-pink` sem inversão — texto
  // vermelho sobre fundo claro), ajusta a cor do TEXTO até passar — a cor de
  // fundo da marca é preservada; o texto é que ganha a variante acessível.
  // O acento (primary) também é calibrado contra o fundo efetivo: cor de
  // marca desbotada é preferível a texto ilegível.
  const ensureAa = (fg: string, bg: string): string => {
    let candidate = fg;
    let lighter = fg;
    let darker = fg;
    for (let step = 0; step < 40 && contrastRatio(candidate, bg) < 4.5; step += 1) {
      if (isDark(bg)) {
        lighter = lighten(lighter, 6);
        candidate = lighter;
      } else {
        darker = darken(darker, 6);
        candidate = darker;
      }
    }
    return candidate;
  };

  const accessibleText = contrastRatio(text, background) >= 4.5 ? text : ensureAa(text, background);
  const accessiblePrimary = contrastRatio(primary, background) >= 4.5 ? primary : ensureAa(primary, background);
  const accessibleSecondary = contrastRatio(secondary, background) >= 4.5 ? secondary : ensureAa(secondary, background);

  return {
    colors: {
      background,
      primary: accessiblePrimary,
      secondary: accessibleSecondary,
      text: accessibleText,
      card,
    },
    typography: {
      fontFamily: "Space Grotesk",
      customFontUrl: "",
      originalFont: "",
      textTransform: "none",
      textAlign: "left",
    },
    structure: {
      borderRadius: "16px",
      boxShadow: "none",
      border: "none",
    },
    decorations: "minimal",
  };
}
