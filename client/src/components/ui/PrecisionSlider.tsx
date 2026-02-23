/**
 * PrecisionSlider - Slider premium para modo Architect
 * 
 * Design sofisticado com thumb dourado, valor em destaque,
 * e animações suaves.
 */

import { motion } from 'framer-motion';

interface PrecisionSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function PrecisionSlider({
  label,
  value,
  min,
  max,
  step = 0.05,
  unit = '',
  formatValue,
  onChange,
  disabled = false,
}: PrecisionSliderProps) {
  const displayValue = formatValue
    ? formatValue(value)
    : `${value}${unit}`;

  return (
    <motion.div
      className="flex flex-col gap-2"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text-secondary)] font-medium tracking-wide">
          {label}
        </span>
        <span className="text-[var(--accent-gold)] font-mono tabular-nums">
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-[var(--bg-base)] rounded-full appearance-none cursor-pointer py-3 touch-none
          slider-thumb-gold
          [&::-webkit-slider-runnable-track]:h-1.5
          [&::-webkit-slider-runnable-track]:rounded-full
          [&::-webkit-slider-runnable-track]:bg-[var(--bg-elevated)]
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-6
          [&::-webkit-slider-thumb]:h-6
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-[var(--text-primary)]
          [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-[var(--accent-gold)]
          [&::-webkit-slider-thumb]:shadow-lg
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
          [&::-webkit-slider-thumb]:-mt-[9px]
          [&::-moz-range-thumb]:w-6
          [&::-moz-range-thumb]:h-6
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-[var(--text-primary)]
          [&::-moz-range-thumb]:border-2
          [&::-moz-range-thumb]:border-[var(--accent-gold)]
          disabled:opacity-50
          disabled:cursor-not-allowed"
        style={{
          background: `linear-gradient(to right, var(--accent-gold) 0%, var(--accent-gold) ${((value - min) / (max - min)) * 100}%, var(--bg-elevated) ${((value - min) / (max - min)) * 100}%, var(--bg-elevated) 100%)`,
        }}
      />
    </motion.div>
  );
}

export default PrecisionSlider;
