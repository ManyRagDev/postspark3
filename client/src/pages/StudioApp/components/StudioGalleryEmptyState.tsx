import UserTopMenu from "@/components/UserTopMenu";
import { ArrowLeft } from "lucide-react";
import type { AspectRatioType } from "@/pages/CanvasLab/components/types";
import type { ProposalDelivery } from "@shared/generationContracts";
import ProposalSkeletonCard from "./ProposalSkeletonCard";
import { labelGenerationStatus, messageGenerationProposalFailure } from "../lib/studioGenerationState";
import type { ProposalProgressValues } from "../lib/useProposalProgress";

export interface StudioGalleryEmptyStateProps {
  isGenerating: boolean;
  onBackToCreate: () => void;
  aspectRatio?: AspectRatioType;
  proposals?: ProposalDelivery[];
  proposalProgress?: ProposalProgressValues;
}

export default function StudioGalleryEmptyState({
  isGenerating,
  onBackToCreate,
  aspectRatio = "1:1",
  proposals,
  proposalProgress,
}: StudioGalleryEmptyStateProps) {
  const allProposalsFailed = Boolean(
    proposals &&
      proposals.length > 0 &&
      proposals.every(
        (p) => p.status === "failed" || p.status === "cancelled" || p.status === "expired"
      )
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#07090E] text-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4 md:px-6">
        <button
          type="button"
          onClick={onBackToCreate}
          className="flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:text-white cursor-pointer"
        >
          <ArrowLeft size={13} />
          Novo Tema
        </button>
        <UserTopMenu variant="inline" />
      </header>

      {isGenerating ? (
        <main
          role="status"
          aria-live="polite"
          className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar flex flex-col items-center justify-start select-none animate-fade-in"
        >
          {/* Status Message Header */}
          <div className="text-center mb-8">
            <p className="text-base font-semibold text-white tracking-wide">
              {allProposalsFailed
                ? "Não foi possível concluir as direções de arte"
                : "Preparando suas direções de arte"}
            </p>
            <p className="max-w-sm mt-1 text-xs text-white/60 mx-auto">
              {allProposalsFailed
                ? "Ocorreu uma instabilidade na geração das opções. Tente novamente ou volte para ajustar o tema."
                : "Cada proposta aparecerá aqui assim que estiver pronta."}
            </p>
          </div>

          {/* Skeletons Grid: se falhar, o brilho cessa no card correspondente */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 max-w-6xl mx-auto w-full items-start justify-center">
            {[0, 1, 2].map((slotIdx) => {
              const proposal = proposals?.find((p) => p.slot === slotIdx);
              const status = proposal?.status || "running";
              const errorReason = proposal?.errorReason
                ? messageGenerationProposalFailure(proposal.errorReason, proposal.failure)
                : undefined;
              const statusMessage = proposal ? labelGenerationStatus(proposal.status) : undefined;

              return (
                <ProposalSkeletonCard
                  key={slotIdx}
                  slot={slotIdx + 1}
                  aspectRatio={aspectRatio}
                  cardScale={0.72}
                  status={status}
                  progress={proposal ? proposalProgress?.[`${proposal.proposalId}:${proposal.revision}`] : undefined}
                  statusMessage={statusMessage}
                  errorReason={errorReason}
                />
              );
            })}
          </div>
        </main>
      ) : (
        <main
          role="status"
          className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center"
        >
          <p className="text-sm font-semibold">
            Nenhuma direção de arte disponível
          </p>
          <p className="max-w-sm text-xs text-white/60">
            Confira o resultado da geração acima ou volte para criar um novo tema.
          </p>
        </main>
      )}
    </div>
  );
}
