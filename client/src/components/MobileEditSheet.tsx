import { type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface MobileEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  activeTabLabel?: string;
}

export default function MobileEditSheet({
  isOpen,
  onClose,
  children,
  activeTabLabel,
}: MobileEditSheetProps) {
  // Portal: escapa de containers com transform (Framer Motion) que quebram fixed
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay — toque fora fecha */}
          <motion.div
            key="sheet-overlay"
            className="fixed inset-0 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ background: "oklch(0 0 0 / 52%)" }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet-panel"
            className="fixed inset-x-0 bottom-0 z-[70] flex flex-col"
            style={{
              height: "74vh",
              background: "oklch(0.06 0.02 280)",
              borderTop: "1px solid oklch(1 0 0 / 10%)",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              boxShadow: "0 -8px 40px oklch(0 0 0 / 40%)",
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.y > 72) onClose();
            }}
          >
            {/* Handle de arrasto */}
            <div className="flex justify-center pt-3 pb-2 shrink-0 touch-none">
              <div
                className="rounded-full"
                style={{ width: 40, height: 5, background: "oklch(1 0 0 / 20%)" }}
              />
            </div>

            {/* Header com label da aba ativa */}
            {activeTabLabel && (
              <div
                className="shrink-0 flex items-center justify-between px-5 pt-1 pb-4 touch-none"
                style={{ borderBottom: "1px solid oklch(1 0 0 / 6%)" }}
              >
                <span
                  className="text-base font-bold tracking-wide"
                  style={{ color: "oklch(0.85 0.02 280)", fontFamily: "var(--font-display)" }}
                >
                  {activeTabLabel}
                </span>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center rounded-xl px-4 py-1.5 text-xs font-bold transition-all active:scale-95"
                  style={{
                    background: "oklch(1 0 0 / 8%)",
                    color: "oklch(0.9 0.02 280)",
                  }}
                >
                  Confirmar
                </button>
              </div>
            )}

            {/* Conteúdo scrollável */}
            <div
              className="flex-1 overflow-y-auto px-4 py-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
