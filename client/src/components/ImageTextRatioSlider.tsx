import { motion } from "framer-motion";
import { Image, Type } from "lucide-react";
import { useState } from "react";

interface ImageTextRatioSliderProps {
  value: number; // 0-100, where 0 = 100% text, 100 = 100% image
  onChange: (value: number) => void;
  disabled?: boolean;
}

export default function ImageTextRatioSlider({
  value,
  onChange,
  disabled = false,
}: ImageTextRatioSliderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const imageRatio = value;
  const textRatio = 100 - value;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Proporção Imagem/Texto</h3>
        <div className="text-xs text-slate-400">
          <span className="text-orange-400 font-semibold">{imageRatio}%</span>
          {" / "}
          <span className="text-blue-400 font-semibold">{textRatio}%</span>
        </div>
      </div>

      {/* Visual preview */}
      <div className="flex gap-2 h-16 bg-slate-900/30 rounded-lg p-2 border border-white/5">
        {/* Image portion */}
        <motion.div
          className="rounded-md bg-gradient-to-br from-orange-500/20 to-orange-600/20 border border-orange-500/30 flex items-center justify-center"
          animate={{ flex: imageRatio }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
        >
          <Image size={16} className="text-orange-400" />
        </motion.div>

        {/* Text portion */}
        <motion.div
          className="rounded-md bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 flex items-center justify-center"
          animate={{ flex: textRatio }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
        >
          <Type size={16} className="text-blue-400" />
        </motion.div>
      </div>

      {/* Slider */}
      <div className="relative pt-2">
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          disabled={disabled}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider disabled:opacity-50"
          style={{
            background: `linear-gradient(to right, oklch(0.7 0.22 40), oklch(0.75 0.14 200))`,
          }}
        />
      </div>

      {/* Preset buttons */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Texto", value: 0 },
          { label: "30/70", value: 30 },
          { label: "50/50", value: 50 },
          { label: "Imagem", value: 100 },
        ].map((preset) => (
          <motion.button
            key={preset.label}
            onClick={() => onChange(preset.value)}
            disabled={disabled}
            className="px-3 py-2 rounded-lg text-xs font-medium transition-all border"
            animate={{
              background:
                value === preset.value
                  ? "oklch(0.75 0.14 200 / 20%)"
                  : "oklch(1 0 0 / 5%)",
              borderColor:
                value === preset.value
                  ? "oklch(0.75 0.14 200)"
                  : "oklch(1 0 0 / 10%)",
              color:
                value === preset.value
                  ? "oklch(0.75 0.14 200)"
                  : "oklch(0.6 0.03 280)",
            }}
            whileHover={!disabled ? { scale: 1.05 } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
          >
            {preset.label}
          </motion.button>
        ))}
      </div>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
          border: 2px solid oklch(0.75 0.14 200);
        }

        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
          border: 2px solid oklch(0.75 0.14 200);
        }
      `}</style>
    </div>
  );
}
