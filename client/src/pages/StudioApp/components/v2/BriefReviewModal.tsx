import { useState } from "react";
import { projectEditorialDefaults } from "@shared/projectEditorial";
import { motion } from "framer-motion";
import { Sparkles, Globe, ChevronDown, ChevronUp, X, ArrowLeft } from "lucide-react";
import type { CreationBrief } from "@shared/postspark";

interface BriefReviewModalProps {
  brief: CreationBrief;
  onUpdateBrief: (updated: CreationBrief) => void;
  onConfirmGenerate: () => void;
  onBackToEditPrompt: () => void;
  isLoading: boolean;
}

export default function BriefReviewModal({
  brief,
  onUpdateBrief,
  onConfirmGenerate,
  onBackToEditPrompt,
  isLoading,
}: BriefReviewModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const project = projectEditorialDefaults(brief.projectDossier, brief.projectSnapshot);
  const [newUrlInput, setNewUrlInput] = useState("");

  const handleSlideCountChange = (count: number) => {
    onUpdateBrief({
      ...brief,
      slideCount: count,
    });
  };

  const handleRemoveUrl = (urlToRemove: string) => {
    const updated = (brief.sourceUrls || []).filter((u) => u !== urlToRemove);
    onUpdateBrief({
      ...brief,
      sourceUrls: updated.length > 0 ? updated : undefined,
    });
  };

  const handleAddUrl = () => {
    if (!newUrlInput.trim()) return;
    let url = newUrlInput.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    const current = brief.sourceUrls || [];
    if (!current.includes(url)) {
      onUpdateBrief({
        ...brief,
        sourceUrls: [...current, url],
      });
    }
    setNewUrlInput("");
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md md:items-center md:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="brief-review-title"
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12110F] text-white shadow-2xl md:max-h-[90vh] md:gap-5 md:overflow-y-auto md:p-6"
      >
        {/* CABEÇALHO */}
        <div className="flex shrink-0 items-start justify-between gap-1 border-b border-white/10 p-4 md:p-0 md:pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#FF5C00]/20 text-[#FF5C00] text-xs font-bold">
                ✓
              </span>
              <h2 id="brief-review-title" className="text-lg font-bold tracking-tight text-white md:text-xl">Revisão do Briefing</h2>
            </div>
            <p className="text-xs text-white/50 mt-1">
              Revise a estrutura do carrossel antes de despender Sparks na criação.
            </p>
          </div>
          <button
            onClick={onBackToEditPrompt}
            className="grid min-h-11 min-w-11 shrink-0 place-items-center text-white/65 transition-colors hover:text-white md:min-h-0 md:min-w-0 md:p-1"
            title="Voltar ao prompt"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3 md:contents">
        {/* CONTAGEM DO CARROSSEL — o formato já foi escolhido no The Void */}
        <div className="flex flex-col gap-2 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
          <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">
            Quantidade de slides do carrossel
          </label>
          <div className="grid grid-cols-5 items-center gap-1.5 pt-1 md:flex md:flex-wrap">
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleSlideCountChange(num)}
                aria-pressed={(brief.slideCount ?? 5) === num}
                className={`h-11 flex-1 rounded-md text-sm font-bold transition-colors md:h-8 md:text-xs ${
                  (brief.slideCount ?? 5) === num
                    ? "bg-[#FF5C00] text-black"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* FONTES / URLS IDENTIFICADAS */}
        <div className="flex flex-col gap-2 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white/70 uppercase tracking-wider">
            <Globe size={14} className="text-emerald-400" />
            <span>Fontes & URLs de Referência</span>
          </div>

          {brief.sourceUrls && brief.sourceUrls.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-1">
              {brief.sourceUrls.map((url) => (
                <div
                  key={url}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs max-w-full truncate"
                >
                  <span className="min-w-0 max-w-[280px] truncate">{url}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveUrl(url)}
                    className="grid min-h-9 min-w-9 shrink-0 place-items-center hover:text-emerald-100 md:min-h-0 md:min-w-0 md:p-0.5"
                    title="Remover fonte"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/40">Nenhuma URL externa detectada no texto.</p>
          )}

          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              placeholder="Adicionar link de referência (ex: seusite.com)..."
              value={newUrlInput}
              onChange={(e) => setNewUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddUrl();
                }
              }}
              aria-label="Link de referência"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-base text-white placeholder-white/45 focus:border-[#FF5C00] focus:outline-none md:min-h-0 md:text-xs"
            />
            <button
              type="button"
              onClick={handleAddUrl}
              className="min-h-11 shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 md:min-h-0"
            >
              Adicionar
            </button>
          </div>
        </div>

        {(brief.projectDossier || brief.projectSnapshot) && (
          <section aria-label="Padrões do projeto" className="rounded-xl border border-white/10 p-3 text-xs text-white/80">
            <p className="font-medium">Padrões do projeto: {project.name || "Projeto selecionado"}</p>
            {project.structuredData.voiceTone && <p className="mt-2 whitespace-pre-wrap"><strong>Voz:</strong> {project.structuredData.voiceTone}</p>}
            {project.structuredData.targetAudience && <p className="mt-2 whitespace-pre-wrap"><strong>Público:</strong> {project.structuredData.targetAudience}</p>}
            {project.structuredData.defaultCta && <p className="mt-2 whitespace-pre-wrap"><strong>CTA padrão:</strong> {project.structuredData.defaultCta}</p>}
            <p className="mt-2">Os ajustes desta peça prevalecem sobre esses padrões de comunicação.</p>
          </section>
        )}

        {/* PROGRESSIVE DISCLOSURE: CAMPOS ESTRUTURADOS OPCIONAIS */}
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
            aria-controls="brief-piece-adjustments"
            className="w-full flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.05] text-xs font-semibold text-white/70 transition-colors"
          >
            <span>Ajustes desta peça (opcional)</span>
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showAdvanced && (
            <div id="brief-piece-adjustments" className="p-3.5 flex flex-col gap-3 bg-black/20 border-t border-white/5 text-xs">
              <div>
                <label htmlFor="brief-cta" className="block text-white/60 mb-1">Chamada para Ação (CTA sugerido):</label>
                <input
                  id="brief-cta"
                  type="text"
                  value={brief.callToAction || ""}
                  onChange={(e) => onUpdateBrief({ ...brief, callToAction: e.target.value || undefined })}
                  placeholder="Ex: Salve para consultar depois / Link na bio"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white placeholder-white/30 focus:border-[#FF5C00] outline-none"
                />
              </div>

              <div>
                <label htmlFor="brief-tone" className="block text-white/60 mb-1">Tom de Voz:</label>
                <input
                  id="brief-tone"
                  type="text"
                  value={brief.tone || ""}
                  onChange={(e) => onUpdateBrief({ ...brief, tone: e.target.value || undefined })}
                  placeholder="Ex: Inspirador, Didático, Provocativo"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white placeholder-white/30 focus:border-[#FF5C00] outline-none"
                />
              </div>

              <div>
                <label htmlFor="brief-audience" className="block text-white/60 mb-1">Público-alvo / Persona:</label>
                <input
                  id="brief-audience"
                  type="text"
                  value={brief.audience || ""}
                  onChange={(e) => onUpdateBrief({ ...brief, audience: e.target.value || undefined })}
                  placeholder="Ex: Fundadores de SaaS, Designers juniores"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white placeholder-white/30 focus:border-[#FF5C00] outline-none"
                />
              </div>
            </div>
          )}
        </div>

        </div>
        {/* AÇÕES DE RODAPÉ */}
        <div className="flex shrink-0 flex-col-reverse items-stretch gap-2 border-t border-white/10 px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-3 md:px-0 md:pb-0">
          <button
            type="button"
            onClick={onBackToEditPrompt}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white md:min-h-0"
          >
            <ArrowLeft size={14} />
            <span>Editar Texto Bruto</span>
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirmGenerate}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF5C00] to-[#FF8A00] px-5 py-2.5 text-xs font-bold text-black shadow-lg shadow-[#FF5C00]/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50 md:min-h-0"
          >
            <Sparkles size={16} />
            <span>{isLoading ? "Gerando Variações..." : "Confirmar & Gerar Direções"}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
