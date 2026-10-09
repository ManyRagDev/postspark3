import React from "react";
import { aspectRatioHeight } from "@shared/aspectRatios";
import type { AspectRatioType } from "@/pages/CanvasLab/components/types";
import { Sparkles, AlertCircle, RotateCw } from "lucide-react";

export interface ProposalSkeletonCardProps {
  slot: number;
  aspectRatio?: AspectRatioType;
  cardScale?: number;
  status?: "queued" | "running" | "ready" | "failed" | "cancelled" | "expired" | string;
  statusMessage?: string;
  errorReason?: string;
  onRetry?: () => void;
  disableShimmer?: boolean;
  className?: string;
}

export default function ProposalSkeletonCard({
  slot,
  aspectRatio = "1:1",
  cardScale = 0.72,
  status = "running",
  statusMessage,
  errorReason,
  onRetry,
  disableShimmer = false,
  className = "",
}: ProposalSkeletonCardProps) {
  const stageWidth = 360 * cardScale; // ~259.2px
  const stageHeight = aspectRatioHeight(aspectRatio) * cardScale;

  const isFailed = status === "failed" || status === "cancelled" || status === "expired";
  // O brilho cessa imediatamente quando ocorre falha ou quando disableShimmer é solicitado
  const isShimmering = !isFailed && !disableShimmer;
  const shimmerClass = isShimmering ? "skeleton-shimmer" : "";

  const defaultStatusMessage = isFailed
    ? errorReason || "Falha ao preparar esta direção"
    : status === "queued"
    ? "Aguardando na fila..."
    : "Sintetizando direção visual...";

  return (
    <div
      role="status"
      aria-label={`Opção 0${slot}: ${statusMessage || defaultStatusMessage}`}
      className={`group relative flex flex-col items-center bg-white/[0.03] ${
        isFailed ? "border-red-500/20" : "border-white/10"
      } border rounded-3xl p-5 shadow-2xl transition-all duration-300 ${className}`}
    >
      {/* Header do Card */}
      <div className="w-full flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full border ${
              isFailed ? "bg-red-400/20 border-red-500/30" : "bg-white/10 border-white/10"
            } ${shimmerClass}`}
          />
          <div
            className={`h-3.5 w-24 rounded-md ${
              isFailed ? "bg-white/5" : "bg-white/10"
            } ${shimmerClass}`}
          />
        </div>
        <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider flex items-center gap-1">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              isFailed ? "bg-red-400/70" : "bg-amber-400/80 animate-pulse"
            }`}
          />
          Opção 0{slot}
        </span>
      </div>

      {/* Prancheta Esqueleto Konva com Dimensões Geométricas Idênticas (Shimmer desativado em erro) */}
      <div
        className={`relative flex flex-col items-center justify-between p-5 my-2 rounded-2xl ${
          isFailed ? "bg-red-950/[0.12] border-red-500/20" : "bg-white/[0.04] border-white/5"
        } border ${shimmerClass} overflow-hidden transition-all duration-200 select-none`}
        style={{ width: stageWidth, height: stageHeight }}
      >
        {isFailed ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
            <AlertCircle className="w-8 h-8 text-amber-400/90 mb-2" />
            <p className="text-xs font-semibold text-white/90 mb-1">Não foi possível carregar</p>
            <p className="text-[10px] text-white/60 max-w-[180px] line-clamp-2">
              {errorReason || "Ocorreu uma instabilidade na geração deste card."}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white transition-colors cursor-pointer border border-white/10"
              >
                <RotateCw size={11} />
                Tentar novamente
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Top Tag & Header Placeholder */}
            <div className="w-full flex items-center justify-between">
              <div className="h-2.5 w-14 rounded bg-white/10" />
              <div className="h-2.5 w-8 rounded bg-white/10" />
            </div>

            {/* Headline Placeholders com silhuetas de texto */}
            <div className="w-full space-y-2 my-auto px-1">
              <div className="h-5 w-4/5 rounded bg-white/15" />
              <div className="h-5 w-3/5 rounded bg-white/15" />
              <div className="h-3 w-1/2 rounded bg-white/10 mt-3" />
            </div>

            {/* Imagem / Área Visual Mockada */}
            <div className="w-full h-1/3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center my-2">
              <Sparkles className="w-5 h-5 text-white/20 animate-pulse" />
            </div>

            {/* Call to action ou footer placeholder */}
            <div className="w-full flex items-center justify-between pt-2 border-t border-white/5">
              <div className="h-2 w-20 rounded bg-white/10" />
              <div className="h-2 w-12 rounded bg-white/10" />
            </div>
          </>
        )}
      </div>

      {/* Status da Proposta */}
      <div
        className={`w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl ${
          isFailed
            ? "bg-red-500/10 border-red-500/20 text-red-200/90"
            : "bg-white/[0.02] border-white/5 text-white/60"
        } border`}
      >
        {isFailed ? (
          <AlertCircle size={12} className="text-amber-400 shrink-0" />
        ) : (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
          </span>
        )}
        <span className="text-[11px] font-medium tracking-wide truncate">
          {statusMessage || defaultStatusMessage}
        </span>
      </div>

      {/* Botões Placeholders Desabilitados: shimmer apenas se estiver carregando */}
      {!isFailed ? (
        <div className="w-full space-y-2 mt-4 pointer-events-none">
          <div className={`w-full h-8 rounded-xl bg-white/10 ${shimmerClass}`} />
          <div className={`w-full h-8 rounded-xl bg-white/5 ${shimmerClass}`} />
        </div>
      ) : onRetry ? (
        <div className="w-full mt-4">
          <button
            type="button"
            onClick={onRetry}
            className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:border-white/20"
          >
            <RotateCw size={12} />
            <span>Tentar novamente</span>
          </button>
        </div>
      ) : (
        <div className="w-full space-y-2 mt-4 pointer-events-none opacity-30">
          <div className="w-full h-8 rounded-xl bg-white/5" />
        </div>
      )}

      <span className="mt-2 text-[9px] font-mono uppercase tracking-wider text-white/30">
        {isFailed ? "geração interrompida" : "preparando direção de arte"}
      </span>
    </div>
  );
}
