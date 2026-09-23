import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Lightbulb, X } from "lucide-react";
import type { FormatIntent } from "@shared/formatIntent";
import { MONO, STUDIO } from "./shared";

/**
 * Etapa 3 §8.2 — confirmação de divergência de formato ANTES de gerar.
 *
 * O backend já revalida (`format_mismatch` antes da reserva de Sparks); esta
 * tela garante que o usuário resolva a contradição localmente, sem consumir
 * Sparks e sem receber um formato diferente do que pediu silenciosamente.
 */
export function FormatConfirmModal({
  intent,
  selectedMode,
  onKeepSelected,
  onSwitchToDetected,
  onDismiss,
}: {
  intent: FormatIntent;
  selectedMode: "static" | "carousel";
  onKeepSelected: () => void;
  onSwitchToDetected: () => void;
  onDismiss: () => void;
}) {
  const detectedLabel = intent.detectedFormat === "carousel" ? "Carrossel" : "Post Único";
  const selectedLabel = selectedMode === "carousel" ? "Carrossel" : "Post Único";

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Confirme o formato do post"
    >
      <motion.div
        initial={{ y: 24, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 16, scale: 0.98, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="w-full max-w-lg rounded-3xl border p-6 shadow-[0_30px_80px_rgba(0,0,0,0.85)]"
        style={{ background: STUDIO.bg, borderColor: STUDIO.hairline, color: STUDIO.ink }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border" style={{ borderColor: "oklch(0.75 0.14 200 / 35%)", background: "oklch(0.75 0.14 200 / 10%)" }}>
              <AlertTriangle size={17} style={{ color: "oklch(0.78 0.14 200)" }} />
            </div>
            <div>
              <div style={{ ...MONO, fontSize: 11, fontWeight: 700 }}>Formato divergente</div>
              <div className="text-[12.5px] leading-snug" style={{ color: STUDIO.ink60 }}>
                Seu pedido parece ser <strong>{detectedLabel}</strong>, mas o seletor está em <strong>{selectedLabel}</strong>.
              </div>
            </div>
          </div>
          <button type="button" onClick={onDismiss} aria-label="Fechar" className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {intent.evidence.length > 0 ? (
          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: STUDIO.hairline, background: "rgba(242,237,228,0.03)" }}>
            <div style={{ ...MONO, fontSize: 8.5, color: STUDIO.ink40 }}>Evidência detectada</div>
            <ul className="mt-1.5 space-y-1">
              {intent.evidence.map((ev) => (
                <li key={ev} className="text-[12px]" style={{ color: STUDIO.ink60 }}>
                  • {ev}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onSwitchToDetected}
            className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold text-black"
            style={{ background: STUDIO.accent }}
          >
            <span>Alterar para {detectedLabel}</span>
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            onClick={onKeepSelected}
            className="flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold"
            style={{ borderColor: STUDIO.hairline, color: STUDIO.ink }}
          >
            Manter {selectedLabel}
          </button>
        </div>
        <p className="mt-3 text-center text-[10.5px]" style={{ color: STUDIO.ink40 }}>
          Nenhuma Spark é consumida até o formato ser confirmado.
        </p>
      </motion.div>
    </motion.div>
  );
}

/**
 * Etapa 3 §8.3 — falha explícita com fallback opt-in.
 *
 * Mostra a causa real (taxonomia), oferece "Tentar novamente" e só após
 * escolha explícita do usuário gera sugestões locais rotuladas. Nunca
 * apresenta fallback como IA nem mostra toast de sucesso de IA após fallback.
 */
export function GenerationFailureModal({
  reason,
  userMessage,
  retryable,
  onRetry,
  onReviewBriefing,
  onUseLocalFallback,
  onDismiss,
}: {
  reason: string;
  userMessage: string;
  retryable: boolean;
  onRetry: () => void;
  onReviewBriefing: () => void;
  onUseLocalFallback: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="A geração não foi concluída"
    >
      <motion.div
        initial={{ y: 24, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 16, scale: 0.98, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="w-full max-w-lg rounded-3xl border p-6 shadow-[0_30px_80px_rgba(0,0,0,0.85)]"
        style={{ background: STUDIO.bg, borderColor: STUDIO.hairline, color: STUDIO.ink }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[oklch(0.7_0.22_40/35%)] bg-[oklch(0.7_0.22_40/10%)]">
              <AlertTriangle size={17} color="#FF5C00" />
            </div>
            <div>
              <div style={{ ...MONO, fontSize: 11, fontWeight: 700 }}>Não foi possível gerar com IA</div>
              <div className="mt-0.5 text-[12px]" style={{ ...MONO, fontSize: 8.5, color: STUDIO.ink40 }}>
                motivo // {reason}
              </div>
            </div>
          </div>
          <button type="button" onClick={onDismiss} aria-label="Fechar" className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <p className="mt-4 text-[13px] leading-relaxed" style={{ color: STUDIO.ink60 }}>
          {userMessage}
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          {retryable ? (
            <button
              type="button"
              onClick={onRetry}
              className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold text-black"
              style={{ background: STUDIO.accent }}
            >
              Tentar novamente
            </button>
          ) : null}
          <button
            type="button"
            onClick={onReviewBriefing}
            className="flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold"
            style={{ borderColor: STUDIO.hairline, color: STUDIO.ink }}
          >
            Revisar briefing
          </button>
          <button
            type="button"
            onClick={onUseLocalFallback}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
            style={{ color: STUDIO.ink60, border: `1px dashed ${STUDIO.hairline}` }}
          >
            <Lightbulb size={15} style={{ color: STUDIO.ink40 }} />
            Usar sugestões locais (sem IA)
          </button>
        </div>
        <p className="mt-3 text-center text-[10.5px]" style={{ color: STUDIO.ink40 }}>
          Sugestões locais são rotuladas como “sugestão local” e nunca contam como geração de IA.
        </p>
      </motion.div>
    </motion.div>
  );
}

export function CreationGuardsHost({ children }: { children: React.ReactNode }) {
  return <AnimatePresence>{children}</AnimatePresence>;
}