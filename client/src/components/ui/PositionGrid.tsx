/**
 * PositionGrid — grid 3×3 de posições de texto para o editor avançado.
 * Cada botão representa uma posição no card (topo-esquerda, centro, base-direita, etc.).
 */
import type { TextPosition } from "@/types/editor";

interface PositionGridProps {
  value: TextPosition;
  onChange: (position: TextPosition) => void;
  accentColor?: string;
}

const POSITIONS: TextPosition[] = [
  "top-left",    "top-center",    "top-right",
  "center-left", "center",        "center-right",
  "bottom-left", "bottom-center", "bottom-right",
];

export default function PositionGrid({
  value,
  onChange,
  accentColor = "oklch(0.7 0.22 40)",
}: PositionGridProps) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      role="radiogroup"
      aria-label="Posição do texto"
    >
      {POSITIONS.map((pos) => {
        const isSelected = pos === value;
        return (
          <button
            key={pos}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={pos}
            onClick={() => onChange(pos)}
            className="w-full aspect-square rounded-lg flex items-center justify-center transition-all"
            style={{
              background: isSelected
                ? `${accentColor}30`
                : "oklch(1 0 0 / 5%)",
              border: isSelected
                ? `1.5px solid ${accentColor}`
                : "1.5px solid oklch(1 0 0 / 10%)",
            }}
          >
            <div
              className="rounded-sm"
              style={{
                width: 6,
                height: 6,
                background: isSelected ? accentColor : "oklch(0.6 0.03 280)",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
