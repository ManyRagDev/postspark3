/**
 * EditorSlider — slider com label + valor para o editor avançado.
 * Usa o Radix Slider existente como base, adiciona label e display de valor.
 */
import { Slider } from "@/components/ui/slider";

interface EditorSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}

export default function EditorSlider({
  label,
  value,
  min,
  max,
  step = 0.05,
  formatValue,
  onChange,
}: EditorSliderProps) {
  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium"
          style={{ color: "oklch(0.65 0.03 280)" }}
        >
          {label}
        </span>
        <span
          className="text-xs font-mono tabular-nums"
          style={{ color: "oklch(0.75 0.08 280)" }}
        >
          {displayValue}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
