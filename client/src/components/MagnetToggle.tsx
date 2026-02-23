import { motion } from "framer-motion";
import { Magnet } from "lucide-react";

interface MagnetToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export default function MagnetToggle({
  enabled,
  onChange,
  disabled = false,
}: MagnetToggleProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 font-medium text-white">
          <Magnet size={18} className="text-blue-400" />
          Alinhamento Magnético
        </label>
        <motion.button
          onClick={() => onChange(!enabled)}
          disabled={disabled}
          className="relative w-12 h-7 rounded-full transition-all"
          style={{
            background: enabled
              ? "oklch(0.75 0.14 200 / 30%)"
              : "oklch(1 0 0 / 10%)",
            border: `1px solid ${
              enabled ? "oklch(0.75 0.14 200 / 50%)" : "oklch(1 0 0 / 20%)"
            }`,
          }}
        >
          <motion.div
            className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg"
            animate={{
              left: enabled ? "22px" : "2px",
            }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
          />
        </motion.button>
      </div>

      <p className="text-xs text-slate-400">
        {enabled
          ? "Elementos se alinham automaticamente à grade"
          : "Posicionamento livre"}
      </p>
    </div>
  );
}
