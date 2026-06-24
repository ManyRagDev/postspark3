import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";

export function CanvasLoadingOverlay({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm"
        >
          <div className="mb-3 rounded-full border border-white/20 bg-white/10 p-4">
            <Sparkles className="animate-pulse text-purple-400" size={24} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest text-white">IA Ajustando Design...</span>
          <Loader2 className="mt-4 animate-spin text-white/40" size={20} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
