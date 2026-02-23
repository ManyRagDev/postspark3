import { motion } from "framer-motion";
import { Grid3X3 } from "lucide-react";

interface LayoutGridProps {
  selectedCell?: number;
  onSelectCell?: (index: number) => void;
  disabled?: boolean;
}

export default function LayoutGrid({
  selectedCell,
  onSelectCell,
  disabled = false,
}: LayoutGridProps) {
  const cells = Array.from({ length: 9 }, (_, i) => i);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Grid3X3 size={18} className="text-slate-400" />
        <h3 className="font-semibold text-white">Grid Visual 3x3</h3>
      </div>

      <div className="grid grid-cols-3 gap-3 bg-slate-900/30 p-4 rounded-xl border border-white/5">
        {cells.map((index) => (
          <motion.button
            key={index}
            onClick={() => !disabled && onSelectCell?.(index)}
            disabled={disabled}
            className="aspect-square rounded-lg border-2 transition-all cursor-pointer relative overflow-hidden group"
            style={{
              borderColor:
                selectedCell === index
                  ? "oklch(0.75 0.14 200)"
                  : "oklch(1 0 0 / 10%)",
              background:
                selectedCell === index
                  ? "oklch(0.75 0.14 200 / 10%)"
                  : "oklch(1 0 0 / 4%)",
            }}
            whileHover={!disabled ? { scale: 1.05 } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
          >
            {/* Grid background */}
            <div className="absolute inset-0 opacity-20">
              <div className="w-full h-full border-l border-b border-white/20" />
            </div>

            {/* Cell number */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-300 transition-colors">
                {index + 1}
              </span>
            </div>

            {/* Selection indicator */}
            {selectedCell === index && (
              <motion.div
                className="absolute inset-0 border-2 border-oklch(0.75 0.14 200) rounded-lg"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
              />
            )}
          </motion.button>
        ))}
      </div>

      <p className="text-xs text-slate-400">
        Selecione uma célula para posicionar seu conteúdo
      </p>
    </div>
  );
}
