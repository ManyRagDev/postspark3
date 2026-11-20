import { AlertTriangle } from "lucide-react";
import type { GenerationReviewWarning } from "@shared/generationReviewWarning";

export default function PostReviewWarning({ warning }: { warning?: GenerationReviewWarning }) {
  if (!warning) return null;
  return (
    <div role="status" className="flex w-full items-start gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{warning === "inconclusive" ? "Revisão de IA inconclusiva" : "A revisão de IA apontou ajustes"}</p>
        <p className="mt-1 leading-relaxed">Proposta entregue com ressalvas. Confira os textos e as informações antes de publicar.</p>
      </div>
    </div>
  );
}
