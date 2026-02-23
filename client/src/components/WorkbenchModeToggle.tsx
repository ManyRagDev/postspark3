import { motion } from "framer-motion";
import { Zap, Settings } from "lucide-react";

interface WorkbenchModeToggleProps {
  mode: "director" | "god";
  onChange: (mode: "director" | "god") => void;
}

export default function WorkbenchModeToggle({
  mode,
  onChange,
}: WorkbenchModeToggleProps) {
  return (
    <div className="flex items-center gap-2 bg-slate-900/50 backdrop-blur border border-white/10 rounded-xl p-1">
      {/* Director Mode */}
      <motion.button
        onClick={() => onChange("director")}
        className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium text-sm"
        animate={{
          background: mode === "director" ? "oklch(0.7 0.22 40 / 20%)" : "transparent",
          color: mode === "director" ? "oklch(0.7 0.22 40)" : "oklch(0.6 0.03 280)",
          borderColor:
            mode === "director" ? "oklch(0.7 0.22 40 / 50%)" : "transparent",
        }}
        style={{
          border: "1px solid",
        }}
      >
        <Settings size={16} />
        <span>Diretor</span>
        <span className="text-xs opacity-60 ml-1">(Seguro)</span>
      </motion.button>

      {/* God Mode */}
      <motion.button
        onClick={() => onChange("god")}
        className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium text-sm"
        animate={{
          background: mode === "god" ? "oklch(0.75 0.14 200 / 20%)" : "transparent",
          color: mode === "god" ? "oklch(0.75 0.14 200)" : "oklch(0.6 0.03 280)",
          borderColor: mode === "god" ? "oklch(0.75 0.14 200 / 50%)" : "transparent",
        }}
        style={{
          border: "1px solid",
        }}
      >
        <Zap size={16} />
        <span>Deus</span>
        <span className="text-xs opacity-60 ml-1">(Avançado)</span>
      </motion.button>

      {/* Tooltip */}
      <div className="ml-4 text-xs text-slate-400 hidden md:block">
        {mode === "director"
          ? "Grid travado, apenas temas"
          : "Layers, hex codes, kerning, magnet"}
      </div>
    </div>
  );
}
