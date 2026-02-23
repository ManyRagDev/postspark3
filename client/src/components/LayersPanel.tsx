import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Trash2, Copy, Lock, Unlock } from "lucide-react";
import { useState } from "react";

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  type: "text" | "image" | "shape";
}

interface LayersPanelProps {
  layers: Layer[];
  selectedLayerId?: string;
  onSelectLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onDeleteLayer: (id: string) => void;
}

export default function LayersPanel({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onDuplicateLayer,
  onDeleteLayer,
}: LayersPanelProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      <h3 className="text-sm font-semibold text-white px-2">Camadas</h3>

      <AnimatePresence>
        {layers.map((layer, index) => (
          <motion.div
            key={layer.id}
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onMouseEnter={() => setHoveredId(layer.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => onSelectLayer(layer.id)}
            className="group relative p-2 rounded-lg cursor-pointer transition-all"
            style={{
              background:
                selectedLayerId === layer.id
                  ? "oklch(0.75 0.14 200 / 15%)"
                  : "oklch(1 0 0 / 5%)",
              borderLeft:
                selectedLayerId === layer.id
                  ? "2px solid oklch(0.75 0.14 200)"
                  : "2px solid transparent",
            }}
          >
            <div className="flex items-center gap-2">
              {/* Layer type icon */}
              <div className="w-6 h-6 rounded bg-slate-700/50 flex items-center justify-center text-xs">
                {layer.type === "text" && "T"}
                {layer.type === "image" && "I"}
                {layer.type === "shape" && "S"}
              </div>

              {/* Layer name */}
              <span className="flex-1 text-sm text-slate-300 truncate">
                {layer.name}
              </span>

              {/* Visibility toggle */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(layer.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {layer.visible ? (
                  <Eye size={14} className="text-slate-400" />
                ) : (
                  <EyeOff size={14} className="text-slate-600" />
                )}
              </motion.button>

              {/* Lock toggle */}
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock(layer.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {layer.locked ? (
                  <Lock size={14} className="text-slate-400" />
                ) : (
                  <Unlock size={14} className="text-slate-600" />
                )}
              </motion.button>

              {/* Duplicate button */}
              <AnimatePresence>
                {hoveredId === layer.id && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateLayer(layer.id);
                    }}
                    className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Copy size={14} className="text-slate-400" />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Delete button */}
              <AnimatePresence>
                {hoveredId === layer.id && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLayer(layer.id);
                    }}
                    className="p-1 hover:bg-red-500/20 rounded transition-colors"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Layer index indicator */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-600 group-hover:hidden">
              {layers.length - index}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {layers.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm">
          Nenhuma camada adicionada
        </div>
      )}
    </div>
  );
}
