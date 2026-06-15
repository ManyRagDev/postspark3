import { useState } from "react";
import { Bug, ChevronDown, ChevronRight, Copy, X } from "lucide-react";
import { toast } from "sonner";
import type { GenerationDebugTrace } from "@shared/postspark";

interface GenerationAuditPanelProps {
  trace?: GenerationDebugTrace;
  title?: string;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

// AUDIT_DEBUG_START: remove this component and its call sites to remove the temporary UI.
export default function GenerationAuditPanel({
  trace,
  title = "Auditoria da geração",
}: GenerationAuditPanelProps) {
  const [open, setOpen] = useState(false);
  const [expandedCall, setExpandedCall] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  if (!trace || hidden) return null;

  const copyTrace = async () => {
    await navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
    toast.success("Trace copiado.");
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-[min(92vw,560px)]">
      <div className="overflow-hidden rounded-2xl border border-amber-300/25 bg-[#090911]/95 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <Bug size={14} className="shrink-0 text-amber-300" />
            <span className="truncate text-xs font-semibold text-white/85">{title}</span>
            <span className="text-[10px] text-white/40">
              {trace.calls.length} chamadas · {(trace.durationMs / 1000).toFixed(1)}s
            </span>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <button
            type="button"
            onClick={copyTrace}
            className="p-1 text-white/45 hover:text-white"
            aria-label="Copiar trace de auditoria"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="p-1 text-white/45 hover:text-white"
            aria-label="Ocultar painel de auditoria"
          >
            <X size={13} />
          </button>
        </div>

        {open && (
          <div className="max-h-[70vh] overflow-y-auto border-t border-white/8 p-3 text-[11px]">
            <div className="mb-3 grid grid-cols-2 gap-2 text-white/60">
              <span>Run: {trace.runId}</span>
              <span>Solicitado: {trace.requestedModel}</span>
              <span className="col-span-2">Efetivos: {trace.effectiveModels.join(", ") || "nenhum"}</span>
            </div>

            <p className="mb-1 font-semibold uppercase tracking-wider text-amber-200/80">Etapas</p>
            <div className="mb-4 space-y-1">
              {trace.events.map((event, index) => (
                <div key={`${event.at}-${index}`} className="rounded-lg bg-white/4 p-2 text-white/65">
                  <span className="font-semibold text-white/85">{event.stage}</span>
                  <span className="ml-2 uppercase text-amber-200/60">{event.status}</span>
                  <p className="mt-1">{event.detail}</p>
                </div>
              ))}
            </div>

            <p className="mb-1 font-semibold uppercase tracking-wider text-amber-200/80">Chamadas de IA</p>
            <div className="space-y-2">
              {trace.calls.map((call, index) => {
                const expanded = expandedCall === index;
                return (
                  <div key={`${call.label}-${index}`} className="rounded-lg border border-white/8 bg-white/3">
                    <button
                      type="button"
                      onClick={() => setExpandedCall(expanded ? null : index)}
                      className="flex w-full items-center gap-2 p-2 text-left"
                    >
                      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <span className="font-semibold text-white/85">{call.label}</span>
                      <span className="text-white/45">{call.provider}/{call.effectiveModel}</span>
                      <span className="ml-auto text-white/35">{call.latencyMs}ms</span>
                    </button>
                    {expanded && (
                      <div className="space-y-2 border-t border-white/8 p-2">
                        <div>
                          <p className="mb-1 text-white/45">Prompt</p>
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/35 p-2 text-white/70">
                            {stringify(call.messages)}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-white/45">Retorno</p>
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-black/35 p-2 text-white/70">
                            {stringify(call.response)}
                          </pre>
                        </div>
                        {call.error && <p className="text-red-300">{call.error}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// AUDIT_DEBUG_END
