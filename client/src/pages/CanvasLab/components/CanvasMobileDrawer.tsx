import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Edit3, Palette, ImageIcon, Sparkles, X, ChevronUp, ChevronDown, Check, ArrowDownToLine } from "lucide-react";
import type { CanvasPostModel, VisualFamilyId } from "@/pages/CanvasLab/components/types";
import { OFFICIAL_FAMILIES_META, resolveLegibleTextColor } from "@/pages/CanvasLab/components/types";

interface CanvasMobileDrawerProps {
  post: CanvasPostModel;
  onUpdatePost: (updates: Partial<CanvasPostModel>) => void;
  onExportPng: () => void;
  onExportZip: () => void;
  isExportingZip?: boolean;
}

type MobileTab = "text" | "style" | "media" | "brand";

export default function CanvasMobileDrawer({
  post,
  onUpdatePost,
  onExportPng,
  onExportZip,
  isExportingZip = false,
}: CanvasMobileDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MobileTab>("text");

  const currentSlide = post.slides[post.currentSlideIndex] || post.slides[0];

  const handleUpdateSlide = (field: "headline" | "subtext" | "step", value: string) => {
    const nextSlides = [...post.slides];
    nextSlides[post.currentSlideIndex] = {
      ...currentSlide,
      [field]: value,
    };
    onUpdatePost({
      slides: nextSlides,
      headline: field === "headline" ? value : post.headline,
      subtext: field === "subtext" ? value : post.subtext,
    });
  };

  const handleUpdateBadge = (value: string) => {
    onUpdatePost({ badgeText: value });
  };

  const handleSelectFamily = (familyId: VisualFamilyId) => {
    const meta = OFFICIAL_FAMILIES_META[familyId];
    if (!meta) return;

    const resolvedText = resolveLegibleTextColor(meta.defaultPalette.background);
    const resolvedPalette = {
      ...meta.defaultPalette,
      text: resolvedText,
    };

    onUpdatePost({
      familyId,
      familyName: meta.name,
      palette: resolvedPalette,
      fontFamily: meta.defaultFont,
    });
  };

  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 z-40 select-none flex flex-col justify-end pointer-events-none">
      {/* Backdrop quando aberto */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 pointer-events-auto"
        />
      )}

      {/* Container da Gaveta */}
      <motion.div
        className="w-full bg-[#0a0d16] border-t border-white/15 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.8)] pointer-events-auto flex flex-col overflow-hidden z-40"
        initial={false}
        animate={{ height: isOpen ? "55vh" : "auto" }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      >
        {/* Handle / Puxador Superior */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="w-full py-2 flex flex-col items-center justify-center cursor-pointer bg-white/4 border-b border-white/8 active:bg-white/8"
        >
          <div className="w-10 h-1 rounded-full bg-white/25 mb-1" />
          <div className="flex items-center justify-between w-full px-4 text-xs font-semibold text-white/80">
            <span className="flex items-center gap-1.5">
              <span className="text-[oklch(0.78_0.22_48)]">✦</span>
              <span>{isOpen ? "Painel de Edição" : "Toque para Editar Post"}</span>
            </span>
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>
        </div>

        {/* Barra de 4 Abas Táteis */}
        <div className="grid grid-cols-4 p-1.5 gap-1 bg-black/40 border-b border-white/10 shrink-0">
          {[
            { id: "text", label: "Texto", icon: Edit3 },
            { id: "style", label: "Estilo", icon: Palette },
            { id: "media", label: "Mídia", icon: ImageIcon },
            { id: "brand", label: "Marca", icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as MobileTab);
                  if (!isOpen) setIsOpen(true);
                }}
                className={`flex flex-col items-center justify-center py-2 rounded-xl text-[11px] font-semibold transition-all ${
                  isSelected
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-white/40 hover:text-white"
                }`}
              >
                <Icon size={15} className={isSelected ? "text-[oklch(0.78_0.22_48)]" : ""} />
                <span className="mt-0.5">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Conteúdo da Aba (Apenas quando aberta) */}
        {isOpen && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {/* ─── ABA TEXTO ─── */}
            {activeTab === "text" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-white/50 uppercase">Título (Headline)</label>
                  <textarea
                    rows={2}
                    value={currentSlide?.headline || ""}
                    onChange={(e) => handleUpdateSlide("headline", e.target.value)}
                    className="w-full bg-white/6 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-[oklch(0.78_0.22_48)] resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-white/50 uppercase">Subtexto</label>
                  <textarea
                    rows={2}
                    value={currentSlide?.subtext || ""}
                    onChange={(e) => handleUpdateSlide("subtext", e.target.value)}
                    className="w-full bg-white/6 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-[oklch(0.78_0.22_48)] resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-white/50 uppercase">Badge Superior</label>
                    <input
                      type="text"
                      value={post.badgeText || ""}
                      onChange={(e) => handleUpdateBadge(e.target.value)}
                      className="w-full bg-white/6 border border-white/10 rounded-xl p-2 text-xs text-white outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-white/50 uppercase">Etapa / Slide</label>
                    <input
                      type="text"
                      value={currentSlide?.step || ""}
                      onChange={(e) => handleUpdateSlide("step", e.target.value)}
                      className="w-full bg-white/6 border border-white/10 rounded-xl p-2 text-xs text-white outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── ABA ESTILO (14 FAMÍLIAS VISUAIS) ─── */}
            {activeTab === "style" && (
              <div className="space-y-3">
                <div className="text-[11px] font-mono text-white/50 uppercase">
                  14 Famílias Visuais Oficiais
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(OFFICIAL_FAMILIES_META).map(([id, meta]) => {
                    const isSelected = post.familyId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleSelectFamily(id as VisualFamilyId)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-[oklch(0.78_0.22_48)]/15 border-[oklch(0.78_0.22_48)] text-white shadow-md"
                            : "bg-white/4 border-white/8 text-white/60 hover:text-white"
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: meta.defaultPalette.accent }}
                        />
                        <div className="truncate">
                          <div className="text-xs font-bold truncate">{meta.name}</div>
                          <div className="text-[9px] text-white/40 truncate">{meta.category}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─── ABA MÍDIA / FUNDO ─── */}
            {activeTab === "media" && (
              <div className="space-y-3 text-center py-4">
                <div className="text-xs text-white/70">Texturas e fundos cinematográficos</div>
                <button
                  type="button"
                  onClick={() => onUpdatePost({ bgImage: undefined })}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white border border-white/10"
                >
                  Remover Foto de Fundo
                </button>
              </div>
            )}

            {/* ─── ABA MARCA ─── */}
            {activeTab === "brand" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-white/50 uppercase">Posição da Logo</label>
                  <div className="grid grid-cols-3 gap-2">
                    {["top-left", "top-right", "bottom-center"].map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => onUpdatePost({ logoPosition: pos as any })}
                        className={`p-2 rounded-xl border text-xs font-semibold ${
                          post.logoPosition === pos
                            ? "bg-white text-black"
                            : "bg-white/4 border-white/8 text-white/60"
                        }`}
                      >
                        {pos === "top-left" ? "Top Esq." : pos === "top-right" ? "Top Dir." : "Base"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Botão de Exportação Fixo no Rodapé */}
        <div className="p-3 border-t border-white/10 bg-black/80 flex items-center gap-2">
          <button
            type="button"
            onClick={onExportPng}
            className="flex-1 py-3 rounded-2xl bg-white text-black font-bold text-xs shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <ArrowDownToLine size={14} />
            <span>Baixar Imagem (HD)</span>
          </button>
          {post.slides.length > 1 && (
            <button
              type="button"
              onClick={onExportZip}
              disabled={isExportingZip}
              className="py-3 px-4 rounded-2xl bg-white/10 text-white font-bold text-xs border border-white/10 flex items-center justify-center gap-1 active:scale-95"
            >
              <span>ZIP</span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
