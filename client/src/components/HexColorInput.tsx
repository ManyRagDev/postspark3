import { motion } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface HexColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function HexColorInput({
  label,
  value,
  onChange,
  disabled = false,
}: HexColorInputProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let hex = e.target.value;
    // Ensure it starts with # and is valid hex
    if (!hex.startsWith("#")) hex = "#" + hex;
    if (hex.length <= 7) {
      onChange(hex);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-300">{label}</label>

      <div className="flex gap-2">
        {/* Color preview */}
        <div className="relative w-12 h-10 rounded-lg border-2 border-white/10 overflow-hidden flex-shrink-0">
          <div
            className="absolute inset-0"
            style={{ background: value || "#000000" }}
          />
          <div className="absolute inset-0 border border-white/20" />
        </div>

        {/* Input */}
        <input
          type="text"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          placeholder="#000000"
          maxLength={7}
          className="flex-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-white placeholder:text-slate-500 font-mono text-sm focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
        />

        {/* Copy button */}
        <motion.button
          onClick={handleCopy}
          disabled={disabled}
          className="px-3 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          whileHover={!disabled ? { scale: 1.05 } : {}}
          whileTap={!disabled ? { scale: 0.95 } : {}}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </motion.button>
      </div>

      {/* Validation message */}
      {value && !/^#[0-9A-F]{6}$/i.test(value) && (
        <p className="text-xs text-red-400">Formato inválido. Use #RRGGBB</p>
      )}
    </div>
  );
}
