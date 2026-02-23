import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { THEMES, type ThemeConfig } from "@/lib/themes";

interface StyleSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (theme: ThemeConfig) => void;
  currentThemeId?: string;
}

export default function StyleSelector({
  isOpen,
  onClose,
  onSelect,
  currentThemeId,
}: StyleSelectorProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-4xl z-50 rounded-2xl overflow-hidden"
            style={{
              background: "oklch(0.12 0.025 280)",
              border: "1px solid oklch(1 0 0 / 10%)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
            initial={{ opacity: 0, scale: 0.9, y: "-45%" }}
            animate={{ opacity: 1, scale: 1, y: "-50%" }}
            exit={{ opacity: 0, scale: 0.9, y: "-45%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-4 border-b"
              style={{ borderColor: "oklch(1 0 0 / 8%)" }}
            >
              <div>
                <h2
                  className="text-lg font-semibold"
                  style={{ fontFamily: "var(--font-display)", color: "oklch(0.9 0.01 280)" }}
                >
                  Escolha um estilo
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "oklch(0.5 0.03 280)" }}>
                  Selecione um dos nossos 8 presets visuais
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-all hover:bg-white/10"
                style={{ color: "oklch(0.7 0.03 280)" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Grid of themes */}
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {THEMES.map((theme) => (
                  <motion.button
                    key={theme.id}
                    data-tour={`theme-${theme.label}`}
                    onClick={() => {
                      onSelect(theme);
                      onClose();
                    }}
                    className="relative text-left rounded-xl overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: theme.colors.bg,
                      border: `2px solid ${currentThemeId === theme.id ? theme.colors.accent : "transparent"}`,
                      boxShadow: currentThemeId === theme.id ? `0 0 20px ${theme.colors.accent}44` : "none",
                    }}
                    whileHover={{ y: -4 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  >
                    {/* Preview */}
                    <div className="p-4" style={{ background: theme.colors.surface }}>
                      <div
                        className="text-sm font-bold mb-1"
                        style={{
                          color: theme.colors.text,
                          fontFamily: theme.typography.headingFont,
                        }}
                      >
                        {theme.label}
                      </div>
                      <div
                        className="text-xs"
                        style={{
                          color: theme.colors.text,
                          opacity: 0.7,
                          fontFamily: theme.typography.bodyFont,
                        }}
                      >
                        {theme.description}
                      </div>
                      <div
                        className="mt-2 px-2 py-1 rounded text-[10px] font-medium inline-block"
                        style={{
                          background: theme.colors.accent,
                          color: theme.colors.bg,
                        }}
                      >
                        {theme.category}
                      </div>
                    </div>

                    {/* Selected indicator */}
                    {currentThemeId === theme.id && (
                      <motion.div
                        className="absolute top-2 right-2 p-1 rounded-full"
                        style={{ background: theme.colors.accent }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      >
                        <Sparkles size={12} style={{ color: theme.colors.bg }} />
                      </motion.div>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
