import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Globe, CheckCircle2, ChevronDown, ChevronUp, X, ArrowLeft } from "lucide-react";
import type { CreationBrief, BrandKitSummaryInput } from "@shared/postspark";

interface BriefReviewModalProps {
  brief: CreationBrief;
  brandKit?: BrandKitSummaryInput | null;
  onUpdateBrief: (updated: CreationBrief) => void;
  onConfirmGenerate: () => void;
  onBackToEditPrompt: () => void;
  isLoading: boolean;
}

export default function BriefReviewModal({
  brief,
  brandKit,
  onUpdateBrief,
  onConfirmGenerate,
  onBackToEditPrompt,
  isLoading,
}: BriefReviewModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newUrlInput, setNewUrlInput] = useState("");

  const handleFormatChange = (newFormat: "static" | "carousel") => {
    onUpdateBrief({
      ...brief,
      format: newFormat,
      slideCount: newFormat === "carousel" ? (brief.slideCount ?? 5) : undefined,
    });
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#12110F] text-white shadow-2xl p-6 flex flex-col gap-5 [scrollbar-width:thin]"
      >
        {/* CABEÇALHO */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#FF5C00]/20 text-[#FF5C00] text-xs font-bold">
                ✓
              </span>
              <h2 className="text-xl font-bold tracking-tight text-white">Revisão do Briefing</h2>
            </div>
            <p className="text-xs text-white/50 mt-1">
              Confirme como a IA estruturou sua ideia antes de despender Sparks na criação.
            </p>
          </div>
          <button
            onClick={onBackToEditPrompt}
            className="text-white/40 hover:text-white transition-colors p-1"
            title="Voltar ao prompt"
          >
            <X size={20} />
          </button>
        </div>

        {/* FORMATO E CONTAGEM */}
        <div className="flex flex-col gap-2 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
          <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Formato Confirmado</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleFormatChange("static")}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                brief.format === "static"
                  ? "bg-[#FF5C00]/20 border-[#FF5C00] text-[#FF5C00]"
                  : "bg-white/5 border-white/10 text-white/60 hover:text-white"
              }`}
            >
              Post Único (1 slide)
            </button>
            <button
              type="button"
              onClick={() => handleFormatChange("carousel")}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                brief.format === "carousel"
                  ? "bg-[#FF5C00]/20 border-[#FF5C00] text-[#FF5C00]"
                  : "bg-white/5 border-white/10 text-white/60 hover:text-white"
              }`}
            >
              Carrossel Multi-slide
            </button>
          </div>

          {brief.format === "carousel" && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-xs text-white/70">
              <span>Quantidade de slides:</span>
              <div className="flex items-center gap-1.5">
                {[3, 4, 5, 7, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleSlideCountChange(num)}
                    className={`w-7 h-7 rounded-md font-bold text-xs transition-colors ${
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
          )}
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
                  <span className="truncate max-w-[280px]">{url}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveUrl(url)}
                    className="hover:text-emerald-100 p-0.5"
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
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#FF5C00]"
            />
            <button
              type="button"
              onClick={handleAddUrl}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors"
            >
              Adicionar
            </button>
          </div>
        </div>

        {/* INTELIGÊNCIA DE MARCA / BRAND KIT */}
        {brandKit && (
          <div className="flex flex-col gap-1.5 bg-amber-500/[0.05] p-3 rounded-xl border border-amber-500/20 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300">
              <CheckCircle2 size={14} />
              <span>Brand Kit Ativo: {brandKit.brand_name || "Sua Marca"}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-white/60 text-[11px] mt-1">
              {brandKit.tone && <span>Tom: <strong className="text-white/80">{brandKit.tone}</strong></span>}
              {brandKit.font_family && <span>Tipografia: <strong className="text-white/80">{brandKit.font_family}</strong></span>}
              {Array.isArray(brandKit.must_include) && brandKit.must_include.length > 0 && (
                <span>Termos obrigatórios: <strong className="text-white/80">{brandKit.must_include.join(", ")}</strong></span>
              )}
            </div>
          </div>
        )}

        {/* PROGRESSIVE DISCLOSURE: CAMPOS ESTRUTURADOS OPCIONAIS */}
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.05] text-xs font-semibold text-white/70 transition-colors"
          >
            <span>Ajustes avançados de copy & direcionamento (opcional)</span>
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showAdvanced && (
            <div className="p-3.5 flex flex-col gap-3 bg-black/20 border-t border-white/5 text-xs">
              <div>
                <label className="block text-white/60 mb-1">Chamada para Ação (CTA sugerido):</label>
                <input
                  type="text"
                  value={brief.callToAction || ""}
                  onChange={(e) => onUpdateBrief({ ...brief, callToAction: e.target.value || undefined })}
                  placeholder="Ex: Salve para consultar depois / Link na bio"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white placeholder-white/30 focus:border-[#FF5C00] outline-none"
                />
              </div>

              <div>
                <label className="block text-white/60 mb-1">Tom de Voz:</label>
                <input
                  type="text"
                  value={brief.tone || ""}
                  onChange={(e) => onUpdateBrief({ ...brief, tone: e.target.value || undefined })}
                  placeholder="Ex: Inspirador, Didático, Provocativo"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white placeholder-white/30 focus:border-[#FF5C00] outline-none"
                />
              </div>

              <div>
                <label className="block text-white/60 mb-1">Público-alvo / Persona:</label>
                <input
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

        {/* AÇÕES DE RODAPÉ */}
        <div className="flex items-center justify-between pt-3 border-t border-white/10 gap-3">
          <button
            type="button"
            onClick={onBackToEditPrompt}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Editar Texto Bruto</span>
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirmGenerate}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF5C00] to-[#FF8A00] hover:brightness-110 active:scale-[0.99] text-xs font-bold text-black shadow-lg shadow-[#FF5C00]/20 transition-all disabled:opacity-50"
          >
            <Sparkles size={16} />
            <span>{isLoading ? "Gerando Variações..." : "Confirmar & Gerar Direções"}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
