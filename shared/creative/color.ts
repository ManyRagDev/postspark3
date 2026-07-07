/**
 * Parses a hex color to its RGB components [0, 255].
 * Handles both #RGB and #RRGGBB formats.
 */
function parseHex(hex: string): [number, number, number] {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Converts RGB components [0, 255] back to a #RRGGBB hex string.
 */
function toHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  const toHexStr = (val: number) => clamp(val).toString(16).padStart(2, "0");
  return `#${toHexStr(r)}${toHexStr(g)}${toHexStr(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}

export function lighten(hex: string, pct: number): string {
  const [r, g, b] = parseHex(hex);
  if (pct === 0) return toHex(r, g, b);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = Math.min(1, l + pct / 100);
  const [newR, newG, newB] = hslToRgb(h, s, newL);
  return toHex(newR, newG, newB);
}

export function darken(hex: string, pct: number): string {
  const [r, g, b] = parseHex(hex);
  if (pct === 0) return toHex(r, g, b);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = Math.max(0, l - pct / 100);
  const [newR, newG, newB] = hslToRgb(h, s, newL);
  return toHex(newR, newG, newB);
}

export function mix(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  const clamp = (val: number) => Math.max(0, Math.min(1, val));
  const tNorm = clamp(t);
  
  const r = Math.round(r1 + (r2 - r1) * tNorm);
  const g = Math.round(g1 + (g2 - g1) * tNorm);
  const b = Math.round(b1 + (b2 - b1) * tNorm);
  
  return toHex(r, g, b);
}

function luminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map(function (v) {
    v /= 255;
    return v <= 0.03928
      ? v / 12.92
      : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  const lum1 = luminance(r1, g1, b1);
  const lum2 = luminance(r2, g2, b2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

export function isDark(hex: string): boolean {
  // Returns true if the color has a higher contrast ratio with white than with black.
  return contrastRatio(hex, "#ffffff") > contrastRatio(hex, "#000000");
}
