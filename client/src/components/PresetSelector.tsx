import { motion, AnimatePresence } from "framer-motion";
import { THEMES, type ThemeConfig } from "@/lib/themes";
import { Check } from "lucide-react";

interface PresetSelectorProps {
  selectedThemes: string[];
  onSelect: (themeName: string) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  recommendedThemes?: string[];
}

export default function PresetSelector({
  selectedThemes,
  onSelect,
  onConfirm,
  isLoading = false,
  recommendedThemes = [],
}: PresetSelectorProps) {
  // Convert THEMES array to object for easier access
  const themesObj = THEMES.reduce(
    (acc, theme) => {
      acc[theme.label] = theme;
      return acc;
    },
    {} as Record<string, ThemeConfig>
  );
  const themeEntries = Object.entries(themesObj);

  return (
    <motion.div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl border border-white/10 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-white/5 p-6 z-10">
          <h2 className="text-2xl font-bold text-white mb-2">Escolha os Temas</h2>
          <p className="text-sm text-slate-400">
            Selecione até 3 temas para suas variações de post
          </p>
        </div>

        {/* Recommended Section */}
        {recommendedThemes.length > 0 && (
          <div className="px-6 py-4 border-b border-white/5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Recomendados para seu sentimento
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {recommendedThemes.map((themeName) => {
                const theme = themesObj[themeName];
                if (!theme) return null;

                const isSelected = selectedThemes.includes(themeName);

                return (
                  <motion.button
                    key={themeName}
                    onClick={() => onSelect(themeName)}
                    className="relative group"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div
                      className="p-4 rounded-2xl border-2 transition-all relative overflow-hidden"
                      style={{
                        background: theme.colors.bg,
                        borderColor: isSelected
                          ? theme.colors.accent
                          : "rgba(255,255,255,0.1)",
                        boxShadow: isSelected
                          ? `0 0 20px ${theme.colors.accent}80`
                          : "none",
                      }}
                    >
                      {/* Theme preview */}
                      <div className="space-y-2 mb-3">
                        <div
                          className="h-8 rounded-lg"
                          style={{ background: theme.colors.accent }}
                        />
                        <div className="flex gap-2">
                          <div
                            className="h-4 flex-1 rounded"
                            style={{ background: theme.colors.text }}
                          />
                          <div
                            className="h-4 flex-1 rounded"
                            style={{ background: theme.colors.surface }}
                          />
                        </div>
                      </div>

                      {/* Theme name */}
                      <p className="text-sm font-semibold text-white">{themeName}</p>

                      {/* Selection indicator */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            className="absolute top-2 right-2 bg-white rounded-full p-1"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                          >
                            <Check size={16} className="text-slate-900" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* All Themes Grid */}
        <div className="p-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Todos os Temas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {themeEntries.map(([themeName, theme]) => {
              const isSelected = selectedThemes.includes(themeName);
              const isRecommended = recommendedThemes.includes(themeName);

              return (
                <motion.button
                  key={themeName}
                  onClick={() => onSelect(themeName)}
                  className="relative group"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                    <div
                      className="p-4 rounded-2xl border-2 transition-all relative overflow-hidden"
                      style={{
                        background: theme.colors.bg,
                        borderColor: isSelected
                          ? theme.colors.accent
                          : isRecommended
                            ? `${theme.colors.accent}40`
                            : "rgba(255,255,255,0.1)",
                        boxShadow: isSelected
                          ? `0 0 20px ${theme.colors.accent}80`
                          : "none",
                      }}
                    >
                      {/* Theme preview */}
                      <div className="space-y-2 mb-3">
                        <div
                          className="h-8 rounded-lg"
                          style={{ background: theme.colors.accent }}
                        />
                        <div className="flex gap-2">
                          <div
                            className="h-4 flex-1 rounded"
                            style={{ background: theme.colors.text }}
                          />
                          <div
                            className="h-4 flex-1 rounded"
                            style={{ background: theme.colors.surface }}
                          />
                        </div>
                      </div>

                    {/* Theme name */}
                    <p className="text-sm font-semibold text-white">{themeName}</p>

                    {/* Selection indicator */}
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          className="absolute top-2 right-2 bg-white rounded-full p-1"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                        >
                          <Check size={16} className="text-slate-900" />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Recommended badge */}
                    {isRecommended && !isSelected && (
                      <div className="absolute top-2 left-2 bg-blue-500/80 px-2 py-1 rounded-full">
                        <p className="text-xs font-semibold text-white">Recomendado</p>
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur border-t border-white/5 p-6 flex justify-between items-center gap-4">
          <p className="text-sm text-slate-400">
            {selectedThemes.length} de 3 temas selecionados
          </p>
          <motion.button
            onClick={onConfirm}
            disabled={selectedThemes.length === 0 || isLoading}
            className="px-6 py-2 rounded-xl font-semibold transition-all disabled:opacity-50"
            style={{
              background:
                selectedThemes.length > 0
                  ? "linear-gradient(135deg, oklch(0.7 0.22 40), oklch(0.75 0.14 200))"
                  : "oklch(1 0 0 / 10%)",
              color: selectedThemes.length > 0 ? "white" : "oklch(0.6 0.03 280)",
            }}
            whileHover={selectedThemes.length > 0 ? { scale: 1.05 } : {}}
            whileTap={selectedThemes.length > 0 ? { scale: 0.95 } : {}}
          >
            {isLoading ? "Sintetizando..." : "Gerar Composições"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
