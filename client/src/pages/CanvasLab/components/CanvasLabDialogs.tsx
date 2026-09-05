/**
 * Diálogos do CanvasLab (PostSpark Studio):
 *  - SaveChoiceDialog (item 7): "Salvar como novo" × "Atualizar post salvo",
 *    com checkbox "Memorizar esta decisão" (persistido em localStorage).
 *  - ConfirmDialog (item 6): confirmação do botão "Recomeçar".
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Bookmark, Check, Loader2, RotateCcw, X } from "lucide-react";

export const SAVE_PREF_KEY = "postspark.savePreference";

export type SavePreference = "new" | "update" | null;

export function readSavePreference(): SavePreference {
  try {
    const raw = window.localStorage.getItem(SAVE_PREF_KEY);
    return raw === "new" || raw === "update" ? raw : null;
  } catch {
    return null;
  }
}

export function writeSavePreference(pref: Exclude<SavePreference, null> | undefined) {
  try {
    if (!pref) window.localStorage.removeItem(SAVE_PREF_KEY);
    else window.localStorage.setItem(SAVE_PREF_KEY, pref);
  } catch {
    /* localStorage indisponível — preferência simplesmente não é memorizada */
  }
}

interface SaveChoiceDialogProps {
  open: boolean;
  hasSavedPost: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onSaveNew: (remember: boolean) => void;
  onUpdate: (remember: boolean) => void;
}

export function SaveChoiceDialog({
  open,
  hasSavedPost,
  isSaving,
  onCancel,
  onSaveNew,
  onUpdate,
}: SaveChoiceDialogProps) {
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (open) setRemember(false);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={isSaving ? undefined : onCancel}
        >
          <motion.div
            className="w-full max-w-sm rounded-3xl border border-white/12 bg-[#0d1017] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.9)]"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[oklch(0.78_0.22_48)]/15 border border-[oklch(0.78_0.22_48)]/30 flex items-center justify-center">
                  <Bookmark size={15} className="text-[oklch(0.78_0.22_48)]" />
                </div>
                <h2 className="text-sm font-bold text-white">Salvar post</h2>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer disabled:opacity-30"
                aria-label="Fechar"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-white/50 mb-4">
              Como você quer salvar este post?
            </p>

            <div className="space-y-2">
              {hasSavedPost && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => onUpdate(remember)}
                  className="w-full py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/16 border border-white/15 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>Atualizar o post salvo</span>
                </button>
              )}
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onSaveNew(remember)}
                className="w-full py-3 px-4 rounded-2xl text-black text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
                }}
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Bookmark size={14} />}
                <span>Salvar como novo post</span>
              </button>
            </div>

            <label className="flex items-center gap-2 mt-4 pt-3 border-t border-white/8 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 accent-[oklch(0.78_0.22_48)] cursor-pointer"
              />
              <span className="text-[11px] text-white/60">
                Memorizar esta decisão (não perguntar de novo)
              </span>
            </label>
            <p className="text-[10px] text-white/30 mt-2">
              Você pode mudar a preferência limpando o armazenamento do site.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            className="w-full max-w-sm rounded-3xl border border-white/12 bg-[#0d1017] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.9)]"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
                <AlertTriangle size={15} className="text-amber-300" />
              </div>
              <h2 className="text-sm font-bold text-white">{title}</h2>
            </div>
            <p className="text-xs text-white/50 mb-4">{description}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-white/8 hover:bg-white/14 border border-white/12 text-white text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
