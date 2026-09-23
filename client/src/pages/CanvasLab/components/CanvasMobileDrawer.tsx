import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Edit3,
  Palette,
  Image as ImageIcon,
  Sparkles,
  ChevronUp,
  ChevronDown,
  ArrowDownToLine,
  Wand2,
  Upload,
  Trash2,
  Sliders,
  Loader2,
  Layers,
  AlignCenter,
  AlignLeft,
  AlignRight,
  RotateCcw,
  Type,
  Plus,
  ImagePlus,
  Copy,
  ChevronsUp,
  ChevronsDown,
} from "lucide-react";
import { toast } from "sonner";
import type { CanvasPostModel, VisualFamilyId, TextAlignType, OverlayMode, CanvasCustomText, CanvasCustomImage, SplitBgPosition, FitMode, BackgroundPlacement } from "@/pages/CanvasLab/components/types";
import { OFFICIAL_FAMILIES_META } from "@/pages/CanvasLab/components/types";
import { applyFamilyPreset } from "../lib/familyPreset";
import { duplicateExtraElement, reorderExtraElement } from "../lib/documentCommands";
import TypographyColorControls from "./TypographyColorControls";
import TipCallout from "./TipCallout";
import { useStudioTipsStore } from "@/store/studioTipsStore";
import { Lightbulb } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { FONT_CATALOG } from "@/lib/fonts";
import BackgroundsDrawer from "./BackgroundsDrawer";
import RadialTextureSelector from "./RadialTextureSelector";
import FontPickerDropdown from "./FontPickerDropdown";

interface CanvasMobileDrawerProps {
  post: CanvasPostModel;
  onUpdatePost: (updates: Partial<CanvasPostModel>) => void;
  onExportPng: () => void;
  onExportZip: () => void;
  isExportingZip?: boolean;
  isOpen?: boolean;
  onToggleOpen?: (open: boolean) => void;
  onAddExtraText?: () => void;
  onUpdateExtraText?: (id: string, patch: Partial<CanvasCustomText>) => void;
  onRemoveExtraText?: (id: string) => void;
  onAddExtraImage?: (url: string, naturalWidth?: number, naturalHeight?: number) => void;
  onUpdateExtraImage?: (id: string, patch: Partial<CanvasCustomImage>) => void;
  onRemoveExtraImage?: (id: string) => void;
  selectedElementId?: string | null;
}

type MobileTab = "text" | "style" | "media" | "brand";

export default function CanvasMobileDrawer({
  post,
  onUpdatePost,
  onExportPng,
  onExportZip,
  isExportingZip = false,
  isOpen: controlledIsOpen,
  onToggleOpen,
  onAddExtraText,
  onUpdateExtraText,
  onRemoveExtraText,
  onAddExtraImage,
  onUpdateExtraImage,
  onRemoveExtraImage,
  selectedElementId,
}: CanvasMobileDrawerProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const setIsOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof value === "function" ? value(isOpen) : value;
    if (isControlled && onToggleOpen) {
      onToggleOpen(nextVal);
    } else {
      setInternalIsOpen(nextVal);
    }
  };
  const [activeTab, setActiveTab] = useState<MobileTab>("text");
  const showTips = useStudioTipsStore((s) => s.showTips);
  const setShowTips = useStudioTipsStore((s) => s.setShowTips);

  // Estado da Mídia / Background
  const [aiPrompt, setAiPrompt] = useState(post.imagePrompt || "");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [applyToAllSlides, setApplyToAllSlides] = useState(false);
  const [isTexturesDrawerOpen, setIsTexturesDrawerOpen] = useState(false);
  const [isTextureStudioOpen, setIsTextureStudioOpen] = useState(false);
  const [manifestData, setManifestData] = useState<any>(null);

  const generateImageMutation = trpc.post.generateImage.useMutation();

  // Carrega o manifest de backgrounds
  useEffect(() => {
    fetch("/images/backgrounds/manifest.json")
      .then((res) => res.json())
      .then((data) => setManifestData(data))
      .catch((err) => console.warn("Erro ao carregar manifest:", err));
  }, []);

  // Sincroniza prompt de IA
  useEffect(() => {
    if (post.imagePrompt) {
      setAiPrompt(post.imagePrompt);
    }
  }, [post.imagePrompt]);

  const currentSlide = post.slides[post.currentSlideIndex] || post.slides[0];
  const extraTextsList = currentSlide?.extraTexts || post.extraTexts || [];
  const extraImagesList = currentSlide?.extraImages || post.extraImages || [];
  const activeBg = currentSlide?.bgImage || post.bgImage;

  const mobileImageInputRef = useRef<HTMLInputElement>(null);

  const handleMobileImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        onAddExtraImage?.(dataUrl, img.naturalWidth, img.naturalHeight);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

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

  const hasManualTextPosition = Boolean(currentSlide?.headlinePos || currentSlide?.subtextPos);
  const handleResetTextPositions = () => {
    if (currentSlide) {
      const updatedSlides = [...post.slides];
      updatedSlides[post.currentSlideIndex] = {
        ...currentSlide,
        headlinePos: undefined,
        subtextPos: undefined,
      };
      onUpdatePost({ slides: updatedSlides });
      toast.success("Posições do texto redefinidas para o layout padrão!");
    }
  };

  const handleSelectFamily = (familyId: VisualFamilyId) => {
    // Preset único de família: muda apenas tipografia/composição — as cores do
    // usuário são preservadas e o guardião de contraste re-resolve o texto.
    onUpdatePost(applyFamilyPreset(post, familyId));
  };

  const handleApplyBackground = (url?: string) => {
    if (applyToAllSlides && post.slides.length > 0) {
      const updated = post.slides.map((s) => ({ ...s, bgImage: url }));
      onUpdatePost({ slides: updated, bgImage: url });
    } else if (currentSlide) {
      const updated = [...post.slides];
      updated[post.currentSlideIndex] = { ...currentSlide, bgImage: url };
      onUpdatePost({ slides: updated, bgImage: url });
    } else {
      onUpdatePost({ bgImage: url });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      handleApplyBackground(url);
      toast.success("Foto aplicada com sucesso!");
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateAiImage = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Digite uma descrição para a imagem.");
      return;
    }
    setIsGeneratingAi(true);
    toast.info("A IA está gerando sua imagem em alta resolução...");

    try {
      const res = await generateImageMutation.mutateAsync({ prompt: aiPrompt.trim() });
      if (res?.imageUrl) {
        handleApplyBackground(res.imageUrl);
        toast.success("Foto exclusiva gerada com sucesso pela IA!");
      } else {
        throw new Error("Nenhuma imagem retornada.");
      }
    } catch (err: any) {
      console.error("[CanvasMobileDrawer] Erro ao gerar imagem IA:", err);
      toast.error(err?.message || "Não foi possível gerar a foto agora.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  return (
    <>
      {/* Gaveta Oficial de Texturas (Modal tela cheia no mobile) */}
      <BackgroundsDrawer
        isOpen={isTexturesDrawerOpen}
        onClose={() => setIsTexturesDrawerOpen(false)}
        post={post}
        onApplyBackground={handleApplyBackground}
        manifestData={manifestData}
        applyToAllSlides={applyToAllSlides}
        onToggleApplyToAll={setApplyToAllSlides}
      />

      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 select-none flex flex-col justify-end pointer-events-none">
        {/* Backdrop Transparente (Sem embaçar o post) */}
        {isOpen && (
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-30 pointer-events-auto bg-transparent"
          />
        )}

        {/* Container da Gaveta */}
        <motion.div
          className="w-full bg-[#0a0d16] border-t border-white/15 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.8)] pointer-events-auto flex flex-col overflow-hidden z-40"
          initial={false}
          animate={{ height: isOpen ? "62vh" : "auto" }}
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
              { id: "brand", label: "Logo", icon: Sparkles },
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
              {/* ─── ABA 1: TEXTO ─── */}
              {activeTab === "text" && (
                <div className="space-y-3">
                  <TipCallout id="tip-mtext-tab" title="Conteúdo do post" compact>
                    Título, subtexto, alinhamentos, fontes e cores por elemento com contraste garantido.
                  </TipCallout>

                  {/* Ações Rápidas: Inserir Nova Caixa de Texto ou Imagem */}
                  <div className="grid grid-cols-2 gap-2">
                    {onAddExtraText && (
                      <button
                        type="button"
                        onClick={onAddExtraText}
                        className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-[oklch(0.78_0.22_48)]/20 to-[oklch(0.78_0.22_48)]/10 hover:from-[oklch(0.78_0.22_48)]/30 hover:to-[oklch(0.78_0.22_48)]/20 border border-[oklch(0.78_0.22_48)]/40 text-[oklch(0.78_0.22_48)] text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                        <span>+ Texto</span>
                      </button>
                    )}
                    {onAddExtraImage && (
                      <>
                        <input
                          ref={mobileImageInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleMobileImageFile}
                        />
                        <button
                          type="button"
                          onClick={() => mobileImageInputRef.current?.click()}
                          className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white/80 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                        >
                          <ImagePlus size={14} strokeWidth={2.2} />
                          <span>+ Imagem</span>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-mono text-white/50 uppercase">Título (Headline)</label>
                      <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/8 gap-0.5">
                        {[
                          { id: "left", icon: AlignLeft },
                          { id: "center", icon: AlignCenter },
                          { id: "right", icon: AlignRight },
                        ].map((item) => {
                          const Icon = item.icon;
                          const isSel = (post.headlineAlign || "left") === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => onUpdatePost({ headlineAlign: item.id as TextAlignType })}
                              className={`p-1 rounded text-xs transition-all cursor-pointer ${
                                isSel ? "bg-white/20 text-white" : "text-white/40 hover:text-white"
                              }`}
                            >
                              <Icon size={12} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={currentSlide?.headline || ""}
                      onChange={(e) => handleUpdateSlide("headline", e.target.value)}
                      className="w-full bg-white/6 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-[oklch(0.78_0.22_48)] resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-mono text-white/50 uppercase">Subtexto</label>
                      <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/8 gap-0.5">
                        {[
                          { id: "left", icon: AlignLeft },
                          { id: "center", icon: AlignCenter },
                          { id: "right", icon: AlignRight },
                        ].map((item) => {
                          const Icon = item.icon;
                          const isSel = (post.bodyAlign || "left") === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => onUpdatePost({ bodyAlign: item.id as TextAlignType })}
                              className={`p-1 rounded text-xs transition-all cursor-pointer ${
                                isSel ? "bg-white/20 text-white" : "text-white/40 hover:text-white"
                              }`}
                            >
                              <Icon size={12} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={currentSlide?.subtext || ""}
                      onChange={(e) => handleUpdateSlide("subtext", e.target.value)}
                      className="w-full bg-white/6 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-[oklch(0.78_0.22_48)] resize-none"
                    />
                  </div>

                  {/* ── Elementos Opcionais de Marcação (Badge & Etapa) ── */}
                  <div className="pt-3 border-t border-white/8 space-y-3">
                    {/* Badge / Tag Superior */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={post.showBadge || false}
                          onChange={(e) => onUpdatePost({ showBadge: e.target.checked })}
                          className="w-3.5 h-3.5 rounded border border-white/20 bg-white/5 accent-[oklch(0.78_0.22_48)] cursor-pointer"
                        />
                        <span className="text-[11px] font-semibold text-white/70 hover:text-white uppercase tracking-wider">
                          Exibir Badge / Tag Superior
                        </span>
                      </label>
                      {post.showBadge && (
                        <input
                          type="text"
                          value={post.badgeText || ""}
                          onChange={(e) => handleUpdateBadge(e.target.value)}
                          className="w-full bg-white/6 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)]"
                          placeholder="Ex: EDITORIAL, DESTAQUE, CASE STUDY..."
                        />
                      )}
                    </div>

                    {/* Indicador de Slide / Carrossel (apenas se houver mais de 1 slide) */}
                    {post.slides.length > 1 && (
                      <div className="space-y-1.5 pt-2 border-t border-white/5">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={post.showStep || false}
                            onChange={(e) => onUpdatePost({ showStep: e.target.checked })}
                            className="w-3.5 h-3.5 rounded border border-white/20 bg-white/5 accent-[oklch(0.78_0.22_48)] cursor-pointer"
                          />
                          <span className="text-[11px] font-semibold text-white/70 hover:text-white uppercase tracking-wider">
                            Exibir Indicador de Slide ({post.currentSlideIndex + 1}/{post.slides.length})
                          </span>
                        </label>
                        {post.showStep && (
                          <input
                            type="text"
                            value={currentSlide?.step || ""}
                            onChange={(e) => handleUpdateSlide("step", e.target.value)}
                            className="w-full bg-white/6 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)]"
                            placeholder="Ex: 01 // CAPA, PASSO 02..."
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {hasManualTextPosition && (
                    <button
                      type="button"
                      onClick={handleResetTextPositions}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <RotateCcw size={11} className="text-[oklch(0.78_0.22_48)]" />
                      <span>Redefinir Posição Livre do Texto</span>
                    </button>
                  )}

                  {/* Caixas de Texto Livres / Adicionais */}
                  <div className="space-y-2 pt-2 border-t border-white/8">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-mono text-white/50 uppercase flex items-center gap-1">
                        <Type size={11} />
                        <span>Textos Livres ({extraTextsList.length})</span>
                      </label>
                      {onAddExtraText && (
                        <button
                          type="button"
                          onClick={onAddExtraText}
                          className="flex items-center gap-1 text-[11px] font-medium text-[oklch(0.78_0.22_48)] bg-[oklch(0.78_0.22_48)]/10 px-2 py-0.5 rounded-lg border border-[oklch(0.78_0.22_48)]/30 active:scale-95 transition-all"
                        >
                          <Plus size={11} />
                          <span>Adicionar</span>
                        </button>
                      )}
                    </div>

                    {extraTextsList.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                        {extraTextsList.map((et, idx) => (
                          <div
                            key={et.id}
                            className="p-2 rounded-xl bg-white/4 border border-white/8 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-[10px] font-mono text-white/40">#{idx + 1}</span>
                              <input
                                type="text"
                                value={et.text}
                                onChange={(e) => onUpdateExtraText?.(et.id, { text: e.target.value })}
                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[oklch(0.78_0.22_48)]"
                                placeholder="Texto livre..."
                              />
                              {onRemoveExtraText && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveExtraText(et.id)}
                                  className="p-1 rounded-lg text-white/40 hover:text-red-400 active:bg-red-500/20"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-1 text-[10px] pt-1 border-t border-white/5">
                              {/* Alinhamento */}
                              <div className="flex items-center gap-0.5 bg-white/5 rounded-md p-0.5 border border-white/8">
                                {(["left", "center", "right"] as const).map((align) => (
                                  <button
                                    key={align}
                                    type="button"
                                    onClick={() => onUpdateExtraText?.(et.id, { align })}
                                    className={`p-1 rounded ${
                                      (et.align || "left") === align
                                        ? "bg-[oklch(0.78_0.22_48)] text-black font-semibold"
                                        : "text-white/60"
                                    }`}
                                  >
                                    {align === "left" && <AlignLeft size={10} />}
                                    {align === "center" && <AlignCenter size={10} />}
                                    {align === "right" && <AlignRight size={10} />}
                                  </button>
                                ))}
                              </div>

                              {/* Tamanho */}
                              <div className="flex items-center gap-1">
                                <span className="text-white/40">Tam:</span>
                                <input
                                  type="range"
                                  min="14"
                                  max="64"
                                  value={et.fontSize || 24}
                                  onChange={(e) => onUpdateExtraText?.(et.id, { fontSize: Number(e.target.value) })}
                                  className="w-14 accent-[oklch(0.78_0.22_48)]"
                                />
                                <span className="font-mono text-white/60 w-4 text-right">{et.fontSize || 24}</span>
                              </div>

                              {/* Cor */}
                              <input
                                type="color"
                                value={et.color || "#ffffff"}
                                onChange={(e) => onUpdateExtraText?.(et.id, { color: e.target.value })}
                                className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer"
                              />
                            </div>

                            {/* Controles de Opacidade, Rotação e Camadas */}
                            <div className="space-y-1.5 pt-1.5 border-t border-white/5 text-[10px]">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 flex items-center gap-1">
                                  <span className="text-white/40">Opac:</span>
                                  <input
                                    type="range"
                                    min="0.1"
                                    max="1"
                                    step="0.05"
                                    value={et.opacity ?? 1}
                                    onChange={(e) => onUpdateExtraText?.(et.id, { opacity: parseFloat(e.target.value) })}
                                    className="w-12 accent-[oklch(0.78_0.22_48)] h-1 bg-white/10 rounded-lg cursor-pointer"
                                  />
                                  <span className="font-mono text-white/50">{Math.round((et.opacity ?? 1) * 100)}%</span>
                                </div>

                                <div className="flex-1 flex items-center gap-1 justify-end">
                                  <span className="text-white/40">Giro:</span>
                                  <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    step="5"
                                    value={et.rotation || 0}
                                    onChange={(e) => onUpdateExtraText?.(et.id, { rotation: parseInt(e.target.value, 10) })}
                                    className="w-12 accent-[oklch(0.78_0.22_48)] h-1 bg-white/10 rounded-lg cursor-pointer"
                                  />
                                  <span className="font-mono text-white/50">{et.rotation || 0}°</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/5">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => onUpdatePost(reorderExtraElement(post, et.id, "front"))}
                                    title="Trazer para frente no palco"
                                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[9px] flex items-center gap-1 transition-all cursor-pointer"
                                  >
                                    <ChevronsUp size={10} />
                                    <span>Frente</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onUpdatePost(reorderExtraElement(post, et.id, "back"))}
                                    title="Enviar para trás no palco"
                                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[9px] flex items-center gap-1 transition-all cursor-pointer"
                                  >
                                    <ChevronsDown size={10} />
                                    <span>Trás</span>
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const result = duplicateExtraElement(post, et.id);
                                    onUpdatePost(result.post);
                                    toast.success("Texto duplicado!");
                                  }}
                                  title="Duplicar texto"
                                  className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[9px] flex items-center gap-1 transition-all cursor-pointer"
                                >
                                  <Copy size={9} />
                                  <span>Duplicar</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Imagens e Fotos Livres Adicionais ── */}
                  <div className="space-y-2 pt-2 border-t border-white/8">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-mono text-white/50 uppercase flex items-center gap-1">
                        <ImagePlus size={11} className="text-[oklch(0.78_0.22_48)]" />
                        <span>Imagens & Fotos ({extraImagesList.length})</span>
                      </label>
                      {onAddExtraImage && (
                        <button
                          type="button"
                          onClick={() => mobileImageInputRef.current?.click()}
                          className="flex items-center gap-1 text-[11px] font-medium text-[oklch(0.78_0.22_48)] hover:text-white bg-[oklch(0.78_0.22_48)]/10 hover:bg-[oklch(0.78_0.22_48)]/20 px-2 py-0.5 rounded-lg border border-[oklch(0.78_0.22_48)]/30 transition-all cursor-pointer"
                        >
                          <Plus size={11} />
                          <span>Inserir</span>
                        </button>
                      )}
                    </div>

                    {extraImagesList.length > 0 && (
                      <div className="space-y-2">
                        {extraImagesList.map((img, idx) => {
                          const isSelected = selectedElementId === img.id;
                          return (
                            <div
                              key={img.id}
                              className={`p-2.5 rounded-xl border space-y-2 transition-all ${
                                isSelected
                                  ? "bg-[oklch(0.78_0.22_48)]/10 border-[oklch(0.78_0.22_48)]/50 shadow-sm"
                                  : "bg-white/3 border-white/8 hover:border-white/15"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-9 h-9 rounded-lg overflow-hidden border border-white/15 bg-black/40 shrink-0">
                                    <img src={img.url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-white/90">
                                      Foto #{idx + 1}
                                    </div>
                                    <div className="text-[10px] text-white/40 font-mono">
                                      {img.width} × {img.height}px
                                    </div>
                                  </div>
                                </div>
                                {onRemoveExtraImage && (
                                  <button
                                    type="button"
                                    onClick={() => onRemoveExtraImage(img.id)}
                                    title="Remover imagem"
                                    className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all cursor-pointer"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>

                              {/* Opacidade e Arredondamento */}
                              <div className="space-y-1.5 pt-1.5 border-t border-white/5 text-[11px]">
                                <div className="flex items-center justify-between text-white/60">
                                  <span>Opacidade</span>
                                  <span className="font-mono text-[10px]">{Math.round((img.opacity ?? 1) * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="0.1"
                                  max="1"
                                  step="0.05"
                                  value={img.opacity ?? 1}
                                  onChange={(e) => onUpdateExtraImage?.(img.id, { opacity: parseFloat(e.target.value) })}
                                  className="w-full accent-[oklch(0.78_0.22_48)] h-1 bg-white/10 rounded-lg cursor-pointer"
                                />

                                <div className="flex items-center justify-between text-white/60 pt-0.5">
                                  <span>Arredondamento</span>
                                  <span className="font-mono text-[10px]">{img.cornerRadius || 0}px</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="60"
                                  step="2"
                                  value={img.cornerRadius || 0}
                                  onChange={(e) => onUpdateExtraImage?.(img.id, { cornerRadius: parseInt(e.target.value, 10) })}
                                  className="w-full accent-[oklch(0.78_0.22_48)] h-1 bg-white/10 rounded-lg cursor-pointer"
                                />

                                <div className="flex items-center justify-between text-white/60 pt-0.5">
                                  <span>Giro / Rotação</span>
                                  <span className="font-mono text-[10px]">{img.rotation || 0}°</span>
                                </div>
                                <input
                                  type="range"
                                  min="-180"
                                  max="180"
                                  step="5"
                                  value={img.rotation || 0}
                                  onChange={(e) => onUpdateExtraImage?.(img.id, { rotation: parseInt(e.target.value, 10) })}
                                  className="w-full accent-[oklch(0.78_0.22_48)] h-1 bg-white/10 rounded-lg cursor-pointer"
                                />

                                <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-white/5">
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => onUpdatePost(reorderExtraElement(post, img.id, "front"))}
                                      title="Trazer para frente no palco"
                                      className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[9px] flex items-center gap-1 transition-all cursor-pointer"
                                    >
                                      <ChevronsUp size={10} />
                                      <span>Frente</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onUpdatePost(reorderExtraElement(post, img.id, "back"))}
                                      title="Enviar para trás no palco"
                                      className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[9px] flex items-center gap-1 transition-all cursor-pointer"
                                    >
                                      <ChevronsDown size={10} />
                                      <span>Trás</span>
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const result = duplicateExtraElement(post, img.id);
                                      onUpdatePost(result.post);
                                      toast.success("Imagem duplicada!");
                                    }}
                                    title="Duplicar imagem"
                                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[9px] flex items-center gap-1 transition-all cursor-pointer"
                                  >
                                    <Copy size={9} />
                                    <span>Duplicar</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Tipografia do Post */}
                  <div className="space-y-1 pt-2 border-t border-white/8">
                    <label className="text-[11px] font-mono text-white/50 uppercase flex items-center gap-1">
                      <Type size={11} />
                      <span>Tipografia do Post</span>
                    </label>
                    <FontPickerDropdown
                      value={post.fontFamily}
                      onChange={(font) => onUpdatePost({ fontFamily: font })}
                    />
                  </div>

                  {/* ── Cores e tamanho da tipografia (guardião de contraste integrado) ── */}
                  <div className="pt-3 border-t border-white/8">
                    <TypographyColorControls post={post} onUpdatePost={onUpdatePost} compact />
                  </div>
                </div>
              )}

              {/* ─── ABA 2: ESTILO (14 FAMÍLIAS & CORES) ─── */}
              {activeTab === "style" && (
                <div className="space-y-4">
                  <TipCallout id="tip-mstyle-tab" title="Estilos mudam a forma, nunca as cores" compact>
                    Trocar de direção de arte altera fontes e composição — suas cores escolhidas continuam as mesmas.
                  </TipCallout>

                  <div className="space-y-2">
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

                  {/* Cores da Paleta */}
                  <div className="pt-2 border-t border-white/8 space-y-2">
                    <div className="text-[11px] font-mono text-white/50 uppercase">Cores da Paleta Base</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-white/50 block mb-1">Fundo</span>
                        <input
                          type="color"
                          value={post.palette.background}
                          onChange={(e) =>
                            onUpdatePost({ palette: { ...post.palette, background: e.target.value } })
                          }
                          className="w-full h-8 rounded-lg cursor-pointer bg-transparent border border-white/15"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-white/50 block mb-1">Destaque</span>
                        <input
                          type="color"
                          value={post.palette.accent}
                          onChange={(e) =>
                            onUpdatePost({ palette: { ...post.palette, accent: e.target.value } })
                          }
                          className="w-full h-8 rounded-lg cursor-pointer bg-transparent border border-white/15"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── ABA 3: MÍDIA & PLANO DE FUNDO ─── */}
              {activeTab === "media" && (
                <div className="space-y-4">
                  <TipCallout id="tip-mmedia-tab" title="Fundos por IA, texturas ou fotos" compact>
                    Gere fundo com IA, abra o catálogo de texturas ou envie da galeria do celular.
                  </TipCallout>

                  {/* Status do Fundo Ativo */}
                  {activeBg && (() => {
                    const currentPlacement = currentSlide?.bgPlacement || post.bgPlacement;
                    const activeFitMode: FitMode = currentPlacement?.fitMode || "cover";

                    const handleSetMobileFitMode = (mode: FitMode) => {
                      const newPlacement: BackgroundPlacement = {
                        fitMode: mode,
                        focalPoint: { x: 0.5, y: 0.5 },
                        crop: undefined,
                        transform: undefined,
                      };
                      if (currentSlide) {
                        const updated = [...post.slides];
                        updated[post.currentSlideIndex] = {
                          ...currentSlide,
                          bgPlacement: newPlacement,
                          bgTransform: undefined,
                        };
                        onUpdatePost({ slides: updated, bgPlacement: newPlacement });
                      } else {
                        onUpdatePost({ bgPlacement: newPlacement, bgTransform: undefined });
                      }
                    };

                    return (
                      <div className="p-3 rounded-2xl bg-white/6 border border-white/12 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={activeBg}
                              alt="Fundo Ativo"
                              className="w-10 h-10 rounded-xl object-cover border border-white/15"
                            />
                            <div>
                              <span className="text-xs font-bold text-white block">Foto Ativa</span>
                              <span className="text-[10px] text-white/50">Fundo aplicado</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleApplyBackground(undefined)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold hover:bg-rose-500/30 active:scale-95 cursor-pointer"
                          >
                            <Trash2 size={12} />
                            <span>Remover</span>
                          </button>
                        </div>

                        {/* Modos de Enquadramento */}
                        <div className="pt-2 border-t border-white/8 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] uppercase font-mono text-white/50">
                            <span>Enquadramento</span>
                            <button
                              type="button"
                              onClick={() => handleSetMobileFitMode("cover")}
                              className="text-[oklch(0.78_0.22_48)] hover:underline flex items-center gap-0.5"
                            >
                              <RotateCcw size={10} />
                              <span>Restaurar</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { id: "cover", label: "Preencher" },
                              { id: "contain", label: "Inteira" },
                              { id: "original", label: "Original" },
                            ].map((btn) => (
                              <button
                                key={btn.id}
                                type="button"
                                onClick={() => handleSetMobileFitMode(btn.id as FitMode)}
                                className={`py-1 px-2 rounded-lg text-[11px] font-semibold transition-all border ${
                                  activeFitMode === btn.id
                                    ? "bg-[oklch(0.78_0.22_48)] text-black border-[oklch(0.78_0.22_48)] font-bold shadow-sm"
                                    : "bg-white/5 border-white/8 text-white/70 active:bg-white/10"
                                }`}
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Posição da Foto no Brutal Split */}
                  {post.familyId === "brutal-split" && (
                    <div className="p-3 rounded-2xl border border-[oklch(0.78_0.22_48)]/30 bg-[oklch(0.78_0.22_48)]/5 space-y-2">
                      <div className="flex items-center justify-between text-xs uppercase tracking-wider font-semibold text-[oklch(0.78_0.22_48)]">
                        <span>Posição da Foto no Split</span>
                        <span className="text-[10px] font-mono text-white/50 lowercase">brutal-split</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: "bottom", label: "Metade Inferior", desc: "Clássico" },
                          { id: "top", label: "Metade Superior", desc: "No Topo" },
                          { id: "full", label: "Fundo Todo", desc: "100%" },
                        ].map((pos) => {
                          const active = (currentSlide?.splitBgPosition || post.splitBgPosition || "bottom") === pos.id;
                          return (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() => {
                                if (currentSlide) {
                                  const updatedSlides = [...post.slides];
                                  updatedSlides[post.currentSlideIndex] = {
                                    ...currentSlide,
                                    splitBgPosition: pos.id as SplitBgPosition,
                                  };
                                  onUpdatePost({
                                    slides: updatedSlides,
                                    splitBgPosition: pos.id as SplitBgPosition,
                                  });
                                } else {
                                  onUpdatePost({ splitBgPosition: pos.id as SplitBgPosition });
                                }
                              }}
                              className={`p-2 rounded-xl text-center transition-all cursor-pointer border ${
                                active
                                  ? "bg-[oklch(0.78_0.22_48)]/20 border-[oklch(0.78_0.22_48)] text-white font-bold shadow-sm"
                                  : "bg-white/4 border-white/8 text-white/60 hover:text-white"
                              }`}
                            >
                              <div className="text-[11px] font-bold">{pos.label}</div>
                              <div className="text-[9px] text-white/40 mt-0.5">{pos.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 1. Botão para Abrir o Modo Estúdio de Texturas */}
                  <button
                    type="button"
                    onClick={() => setIsTextureStudioOpen(true)}
                    className="w-full p-4 rounded-2xl bg-white/5 hover:bg-white/8 border border-white/15 flex items-center justify-between active:scale-[0.99] transition-all cursor-pointer shadow-lg group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[oklch(0.78_0.22_48)]/15 border border-[oklch(0.78_0.22_48)]/30 flex items-center justify-center text-[oklch(0.78_0.22_48)] group-hover:scale-110 transition-transform">
                        <Sparkles size={20} />
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">Catálogo de Texturas HD</span>
                          <span className="text-[9px] font-mono bg-[oklch(0.78_0.22_48)]/20 text-[oklch(0.78_0.22_48)] px-1.5 py-0.5 rounded font-bold">
                            110+ Assets
                          </span>
                        </div>
                        <span className="text-[10px] text-white/50">Luxo, Impacto, Criativo, Linho, Concreto...</span>
                      </div>
                    </div>
                    <span className="text-xs text-[oklch(0.78_0.22_48)] font-bold">➔</span>
                  </button>

                  {/* 2. Controles Completos do Overlay / Scrim (Quando Fundo Ativo) */}
                  {activeBg && (
                    <div className="p-3.5 rounded-2xl bg-white/4 border border-white/10 space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-white/80">
                        <div className="flex items-center gap-1.5">
                          <Sliders size={13} />
                          <span>Camada de Sobreposição (Overlay)</span>
                        </div>
                        <span className="font-mono text-xs text-[oklch(0.78_0.22_48)] font-bold">
                          {Math.round((post.overlayOpacity ?? 0.55) * 100)}%
                        </span>
                      </div>

                      {/* Modo de Distribuição / Variações */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Estilo</span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: "gradient-bottom", label: "Gradiente ↓", desc: "Suave na base" },
                            { id: "gradient-top", label: "Gradiente ↑", desc: "Suave no topo" },
                            { id: "solid", label: "Sólido ■", desc: "Uniforme" },
                            { id: "radial", label: "Vinheta ◉", desc: "Foco central" },
                          ].map((m) => {
                            const active = (post.overlayMode || "gradient-bottom") === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => onUpdatePost({ overlayMode: m.id as OverlayMode })}
                                className={`py-1.5 px-2 rounded-xl text-left text-xs transition-all cursor-pointer border ${
                                  active
                                    ? "bg-[oklch(0.78_0.22_48)]/15 border-[oklch(0.78_0.22_48)] text-white font-medium"
                                    : "bg-white/4 border-white/8 text-white/60 hover:text-white"
                                }`}
                              >
                                <div className="font-semibold text-[11px]">{m.label}</div>
                                <div className="text-[9px] text-white/40">{m.desc}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Cor da Sobreposição */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Cor</span>
                          {post.overlayColor && (
                            <button
                              type="button"
                              onClick={() => onUpdatePost({ overlayColor: undefined })}
                              className="text-[10px] text-white/40 hover:text-white/80 underline cursor-pointer"
                            >
                              Padrão
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {[
                            { label: "Preto", color: "#000000" },
                            { label: "Fundo", color: post.palette.background },
                            { label: "Destaque", color: post.palette.accent },
                            { label: "Branco", color: "#FFFFFF" },
                            { label: "Noite", color: "#0F172A" },
                          ].map((p, idx) => {
                            const active = post.overlayColor
                              ? post.overlayColor.toLowerCase() === p.color.toLowerCase()
                              : p.label === "Fundo";
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => onUpdatePost({ overlayColor: p.color })}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition-all cursor-pointer ${
                                  active
                                    ? "border-[oklch(0.78_0.22_48)] bg-white/10 text-white font-medium"
                                    : "border-white/10 bg-white/4 text-white/60 hover:text-white"
                                }`}
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
                                  style={{ backgroundColor: p.color }}
                                />
                                <span>{p.label}</span>
                              </button>
                            );
                          })}

                          {/* Picker nativo */}
                          <label
                            title="Escolher cor personalizada"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border border-white/10 bg-white/4 hover:bg-white/8 text-white/60 hover:text-white cursor-pointer transition-all"
                          >
                            <input
                              type="color"
                              value={post.overlayColor || post.palette.background || "#000000"}
                              onChange={(e) => onUpdatePost({ overlayColor: e.target.value })}
                              className="w-3 h-3 rounded border-0 p-0 cursor-pointer bg-transparent"
                            />
                            <span className="text-[10px] font-mono">
                              {(post.overlayColor || post.palette.background || "#000000").slice(0, 7).toUpperCase()}
                            </span>
                          </label>
                        </div>
                      </div>

                      {/* Slider de Opacidade */}
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Opacidade</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={post.overlayOpacity ?? 0.55}
                          onChange={(e) => onUpdatePost({ overlayOpacity: parseFloat(e.target.value) })}
                          className="w-full accent-[oklch(0.78_0.22_48)] cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {/* Toggle para aplicar a todos os slides se for carrossel */}
                  {post.slides.length > 1 && (
                    <label className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 cursor-pointer">
                      <span className="text-xs font-semibold text-white/80">Aplicar textura em todos os slides</span>
                      <input
                        type="checkbox"
                        checked={applyToAllSlides}
                        onChange={(e) => setApplyToAllSlides(e.target.checked)}
                        className="w-4 h-4 accent-[oklch(0.78_0.22_48)] cursor-pointer"
                      />
                    </label>
                  )}

                  {/* 3. Gerador de Imagem com IA */}
                  <div className="p-3.5 rounded-2xl bg-white/4 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        <Wand2 size={14} className="text-[oklch(0.78_0.22_48)]" />
                        <span>Gerar Foto com IA</span>
                      </div>
                      <span className="text-[9px] font-mono text-white/40">OpenRouter & Polli HD</span>
                    </div>
                    <textarea
                      rows={2}
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Descreva o fundo fotográfico desejado..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)] resize-none"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateAiImage}
                      disabled={isGeneratingAi}
                      className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-black flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-95 transition-all"
                      style={{
                        background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
                      }}
                    >
                      {isGeneratingAi ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Sintetizando Foto...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          <span>Gerar Imagem com IA</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 4. Upload da Galeria do Celular (Fundo) */}
                  <label className="flex items-center justify-between p-3 rounded-2xl bg-white/4 hover:bg-white/7 border border-white/10 cursor-pointer active:scale-[0.99] transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center">
                        <Upload size={14} className="text-white/70" />
                      </div>
                      <span className="text-xs font-semibold text-white/90">Definir Imagem de Fundo</span>
                    </div>
                    <span className="text-xs text-white/50">Fundo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>

                  {/* 5. Inserir Foto como Camada Livre */}
                  {onAddExtraImage && (
                    <button
                      type="button"
                      onClick={() => mobileImageInputRef.current?.click()}
                      className="w-full flex items-center justify-between p-3 rounded-2xl bg-[oklch(0.78_0.22_48)]/10 hover:bg-[oklch(0.78_0.22_48)]/15 border border-[oklch(0.78_0.22_48)]/30 cursor-pointer active:scale-[0.99] transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[oklch(0.78_0.22_48)]/20 flex items-center justify-center text-[oklch(0.78_0.22_48)]">
                          <ImagePlus size={15} />
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-semibold text-white block">Inserir Imagem / Foto Sobreposta</span>
                          <span className="text-[10px] text-white/50">Adicione imagens redimensionáveis no post</span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[oklch(0.78_0.22_48)]">+ Inserir</span>
                    </button>
                  )}
                </div>
              )}

              {/* ─── ABA 4: LOGO ─── */}
              {activeTab === "brand" && (
                <div className="space-y-3">
                  <TipCallout id="tip-mbrand-tab" title="Logo e tag do post" compact>
                    Envie o logo em PNG transparente e arraste-o no palco para posicionar.
                  </TipCallout>

                  {/* Upload do logo (paridade com o desktop) */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono text-white/50 uppercase">Logo da Marca (PNG Transparente)</label>
                    <label className="flex items-center justify-center gap-2 w-full border border-dashed border-white/20 bg-white/3 hover:bg-white/6 rounded-xl p-3 text-xs text-white/70 cursor-pointer transition-all">
                      <Upload size={14} />
                      <span>Upload do Logo...</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            onUpdatePost({ logoUrl: event.target?.result as string });
                            toast.success("Logo aplicado! Arraste no palco para posicionar.");
                          };
                          reader.readAsDataURL(file);
                        }}
                        className="hidden"
                      />
                    </label>
                    {post.logoUrl && (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10 text-xs">
                        <span className="text-white/60">Logo Ativo</span>
                        <button
                          type="button"
                          onClick={() => onUpdatePost({ logoUrl: undefined })}
                          className="text-red-400 hover:underline cursor-pointer"
                        >
                          Remover
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Posição inicial do logo (4 posições válidas; o drag no palco prevalece) */}
                  <div className="space-y-1 pt-2 border-t border-white/8">
                    <label className="text-[11px] font-mono text-white/50 uppercase">Posição do Logo</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: "top-left", label: "Sup. Esq." },
                        { id: "top-right", label: "Sup. Dir." },
                        { id: "bottom-left", label: "Inf. Esq." },
                        { id: "bottom-right", label: "Inf. Dir." },
                      ] as const).map((pos) => (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => onUpdatePost({ logoPosition: pos.id })}
                          className={`p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                            post.logoPosition === pos.id
                              ? "bg-white text-black border-white"
                              : "bg-white/4 border-white/8 text-white/60 hover:text-white"
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Checkbox global "Mostrar dicas" (item 9) */}
          {isOpen && (
            <label className="flex items-center justify-between px-4 py-2 border-t border-white/10 bg-black/50 cursor-pointer select-none shrink-0">
              <span className="text-[11px] font-semibold text-white/60 flex items-center gap-1.5">
                <Lightbulb size={12} className="text-[oklch(0.78_0.22_48)]" />
                Mostrar dicas
              </span>
              <input
                type="checkbox"
                checked={showTips}
                onChange={(e) => setShowTips(e.target.checked)}
                className="w-4 h-4 accent-[oklch(0.78_0.22_48)] cursor-pointer"
              />
            </label>
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
          {/* Modo Estúdio Imersivo de Texturas */}
        <RadialTextureSelector
          isOpen={isTextureStudioOpen}
          onClose={() => setIsTextureStudioOpen(false)}
          post={post}
          onApplyBackground={handleApplyBackground}
          manifestData={manifestData}
          applyToAllSlides={applyToAllSlides}
        />
      </motion.div>
      </div>
    </>
  );
}
