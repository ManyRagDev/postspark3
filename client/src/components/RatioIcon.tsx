/**
 * RatioIcon — mini SVG que representa visualmente cada proporção de aspecto.
 * Quadrado para 1:1 · Retrato leve para 5:6 · Retrato alto para 9:16
 */
import type { AspectRatio } from "@shared/postspark";

interface RatioIconProps {
  ratio: AspectRatio;
  size?: number;
  color?: string;
}

export default function RatioIcon({ ratio, size = 12, color = "currentColor" }: RatioIconProps) {
  // Dimensões do retângulo dentro de um viewBox de 12×16
  const configs: Record<AspectRatio, { w: number; h: number }> = {
    "1:1":  { w: 11, h: 11 }, // quadrado
    "5:6":  { w: 10, h: 12 }, // retrato suave
    "9:16": { w:  7, h: 13 }, // retrato alto
  };

  const { w, h } = configs[ratio];
  const vbW = 14;
  const vbH = 16;
  // Centralizar o retângulo no viewBox
  const x = (vbW - w) / 2;
  const y = (vbH - h) / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${vbW} ${vbH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={1.5}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
      />
    </svg>
  );
}
