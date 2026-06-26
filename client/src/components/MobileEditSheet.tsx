import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { useMobileEditorUI } from "@/store/mobileEditorUI";

/** Detents (alturas de encaixe) como fração da viewport. */
const DETENTS = { peek: 0.42, half: 0.62, full: 0.9 } as const;
type Detent = keyof typeof DETENTS;
const ORDER: Detent[] = ["peek", "half", "full"];

interface MobileEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  activeTabLabel?: string;
  /** Reporta a altura atual do sheet em px (0 quando fechado). */
  onHeightChange?: (px: number) => void;
}

export default function MobileEditSheet({
  isOpen,
  onClose,
  children,
  activeTabLabel,
  onHeightChange,
}: MobileEditSheetProps) {
  const [detent, setDetent] = useState<Detent>("peek");
  const [vh, setVh] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  const dragControls = useDragControls();
  const collapseNonce = useMobileEditorUI((s) => s.collapseNonce);
  const prevNonce = useRef(collapseNonce);

  // Acompanha a altura da viewport (barra do navegador some/aparece).
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Toda abertura começa no peek (decisão de UX: priorizar ver o post).
  useEffect(() => {
    if (isOpen) setDetent("peek");
  }, [isOpen]);

  // Toque fora (canvas) pede colapso: minimiza pro peek; se já no peek, fecha.
  useEffect(() => {
    if (collapseNonce === prevNonce.current) return;
    prevNonce.current = collapseNonce;
    if (!isOpen) return;
    if (detent === "peek") onClose();
    else setDetent("peek");
  }, [collapseNonce, isOpen, detent, onClose]);

  const heightPx = Math.round(vh * DETENTS[detent]);

  // Reporta a altura pra fora (canvas reserva espaço). Sem cleanup aqui pra não
  // piscar 0 a cada mudança de detent — a transição é direta de uma altura à outra.
  useEffect(() => {
    onHeightChange?.(isOpen ? heightPx : 0);
  }, [isOpen, heightPx, onHeightChange]);

  // Zera a altura ao desmontar (ex.: saindo do editor mobile).
  useEffect(() => () => onHeightChange?.(0), [onHeightChange]);

  const stepDown = () => {
    const idx = ORDER.indexOf(detent);
    if (idx <= 0) onClose();
    else setDetent(ORDER[idx - 1]);
  };
  const stepUp = () => {
    const idx = ORDER.indexOf(detent);
    if (idx < ORDER.length - 1) setDetent(ORDER[idx + 1]);
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          data-workbench-editor-surface
          key="sheet-panel"
          className="fixed inset-x-0 bottom-0 z-[70] flex flex-col"
          style={{
            background: "oklch(0.06 0.02 280)",
            borderTop: "1px solid oklch(1 0 0 / 10%)",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            boxShadow: "0 -8px 40px oklch(0 0 0 / 40%)",
          }}
          initial={{ y: "100%", height: heightPx }}
          animate={{ y: 0, height: heightPx }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.16}
          onDragEnd={(_, info) => {
            const dy = info.offset.y;
            const vy = info.velocity.y;
            if (dy < -48 || vy < -500) stepUp();
            else if (dy > 48 || vy > 500) stepDown();
          }}
        >
          {/* Alça de arrasto — única região que inicia o drag (conteúdo rola livre) */}
          <div
            className="flex justify-center pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={(e) => dragControls.start(e)}
          >
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
              onPointerDown={(e) => dragControls.start(e)}
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
                style={{ background: "oklch(1 0 0 / 8%)", color: "oklch(0.9 0.02 280)" }}
              >
                Confirmar
              </button>
            </div>
          )}

          {/* Conteúdo scrollável */}
          <div
            className="flex-1 overflow-y-auto px-4 py-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
