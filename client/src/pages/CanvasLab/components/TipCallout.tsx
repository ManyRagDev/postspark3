/**
 * TipCallout — dicas suaves do Workbench CanvasLab (item 9 do usuário).
 *
 *  - Aparece no topo de cada aba/menus quando o usuário abre um contexto;
 *  - pode ser dispensada individualmente (X) — a preferência é memorizada;
 *  - obedece ao checkbox global "Mostrar dicas" (useStudioTipsStore).
 */

import { Lightbulb, X } from "lucide-react";
import { useStudioTipsStore } from "@/store/studioTipsStore";

interface TipCalloutProps {
  /** Chave única da dica (usada para memorizar a dispensa individual). */
  id: string;
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}

export default function TipCallout({ id, title, children, compact = false }: TipCalloutProps) {
  const showTips = useStudioTipsStore((s) => s.showTips);
  const dismissed = useStudioTipsStore((s) => Boolean(s.dismissed[id]));
  const dismissTip = useStudioTipsStore((s) => s.dismissTip);

  if (!showTips || dismissed) return null;

  return (
    <div
      className={`relative rounded-xl border border-[oklch(0.78_0.22_48)]/25 bg-[oklch(0.78_0.22_48)]/8 ${compact ? "p-2.5" : "p-3"}`}
    >
      <div className="flex items-start gap-2 pr-5">
        <Lightbulb size={13} className="text-[oklch(0.78_0.22_48)] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-white/90 leading-tight">{title}</p>
          <p className="text-[10px] text-white/55 leading-snug mt-0.5">{children}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismissTip(id)}
        aria-label="Dispensar dica"
        className="absolute top-1.5 right-1.5 p-1 rounded-md text-white/35 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
      >
        <X size={11} />
      </button>
    </div>
  );
}
