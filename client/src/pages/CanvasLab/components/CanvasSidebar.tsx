import { useState, useEffect } from "react";
import { AlignCenter, AlignLeft, AlignRight, Check, Copy, Edit3, Image as ImageIcon, Lightbulb, Link, Loader2, Palette, Sparkles, Upload, Wand2, Type, Download, Crop, RotateCcw, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { OFFICIAL_FAMILIES_META, type CanvasPostModel, type TextAlignType, type VisualFamilyId, type OverlayMode, type CanvasCustomText } from "./types";
import { applyFamilyPreset } from "../lib/familyPreset";
import TypographyColorControls from "./TypographyColorControls";
import TipCallout from "./TipCallout";
import { useStudioTipsStore } from "@/store/studioTipsStore";
import { FONT_CATALOG } from "@/lib/fonts";
import { trpc } from "@/lib/trpc";
import BackgroundsDrawer from "./BackgroundsDrawer";
import { downloadImageFile } from "@/lib/downloadHelper";
import FontPickerDropdown from "./FontPickerDropdown";

interface CanvasSidebarProps {
  post: CanvasPostModel;
  onUpdatePost: (patch: Partial<CanvasPostModel>) => void;
  isEditingBackground?: boolean;
  onToggleBackgroundEdit?: () => void;
  onAddExtraText?: () => void;
  onUpdateExtraText?: (id: string, patch: Partial<CanvasCustomText>) => void;
  onRemoveExtraText?: (id: string) => void;
}

type TabType = "content" | "style" | "media" | "brand";

const ALL_FAMILIES_LIST = Object.values(OFFICIAL_FAMILIES_META);

export default function CanvasSidebar({
  post,
  onUpdatePost,
  isEditingBackground = false,
  onToggleBackgroundEdit,
  onAddExtraText,
  onUpdateExtraText,
  onRemoveExtraText,
}: CanvasSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>("content");
  const [copiedCaption, setCopiedCaption] = useState(false);
  const showTips = useStudioTipsStore((s) => s.showTips);
  const setShowTips = useStudioTipsStore((s) => s.setShowTips);
  const [aiImagePrompt, setAiImagePrompt] = useState(post.imagePrompt || "");
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [applyToAllSlides, setApplyToAllSlides] = useState(false);
  const [customFontInput, setCustomFontInput] = useState(post.customFontUrl || "");
  const [uploadedFontName, setUploadedFontName] = useState<string | null>(null);

  // Manifest de Backgrounds dos Assets
  const [manifestData, setManifestData] = useState<any>(null);
  const [selectedBgCategory, setSelectedBgCategory] = useState<string>("luxo-exclusivo");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const generateImageMutation = trpc.post.generateImage.useMutation();

  // Carrega o manifest de backgrounds oficiais
  useEffect(() => {
    fetch("/images/backgrounds/manifest.json")
      .then((res) => res.json())
      .then((data) => setManifestData(data))
      .catch((err) => console.warn("Erro ao carregar manifest de backgrounds:", err));
  }, []);

  // Sincroniza o prompt de IA com o post
  useEffect(() => {
    if (post.imagePrompt) {
      setAiImagePrompt(post.imagePrompt);
    }
  }, [post.imagePrompt]);

  const currentSlide = post.slides[post.currentSlideIndex];
  const extraTextsList = currentSlide?.extraTexts || post.extraTexts || [];

  const handleUpdateHeadline = (text: string) => {
    if (currentSlide) {
      const updatedSlides = [...post.slides];
      updatedSlides[post.currentSlideIndex] = { ...currentSlide, headline: text };
      onUpdatePost({ slides: updatedSlides, headline: text });
    } else {
      onUpdatePost({ headline: text });
    }
  };

  const handleUpdateSubtext = (text: string) => {
    if (currentSlide) {
      const updatedSlides = [...post.slides];
      updatedSlides[post.currentSlideIndex] = { ...currentSlide, subtext: text };
      onUpdatePost({ slides: updatedSlides, subtext: text });
    } else {
      onUpdatePost({ subtext: text });
    }
  };

  const handleUpdateStep = (text: string) => {
    if (currentSlide) {
      const updatedSlides = [...post.slides];
      updatedSlides[post.currentSlideIndex] = { ...currentSlide, step: text };
      onUpdatePost({ slides: updatedSlides });
    }
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

  const handleCopyCaption = () => {
    if (!post.caption) return;
    navigator.clipboard.writeText(post.caption);
    setCopiedCaption(true);
    toast.success("Legenda copiada com formatação e parágrafos!");
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      handleApplyBackground(url);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      onUpdatePost({ logoUrl: url });
          };
    reader.readAsDataURL(file);
  };

  const handleFontFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fontName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_");
    const reader = new FileReader();
    reader.onload = (event) => {
      const fontDataUrl = event.target?.result as string;
      const newFontFace = new FontFace(fontName, `url(${fontDataUrl})`);
      newFontFace.load().then((loadedFace) => {
        (document.fonts as any).add(loadedFace);
        setUploadedFontName(fontName);
        onUpdatePost({ fontFamily: fontName });
        toast.success(`Fonte "${fontName}" carregada com sucesso!`);
      }).catch(() => {
        toast.error("Não foi possível processar o arquivo de fonte.");
      });
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateAiImage = async () => {
    if (!aiImagePrompt.trim()) {
      toast.error("Digite uma descrição para a imagem.");
      return;
    }
    setIsGeneratingAiImage(true);
    toast.info("A IA está criando a imagem de alta resolução...");

    try {
      const res = await generateImageMutation.mutateAsync({ prompt: aiImagePrompt.trim() });
      if (res?.imageUrl) {
        handleApplyBackground(res.imageUrl);
        toast.success("Foto exclusiva gerada com sucesso pela IA!", {
          action: {
            label: "Baixar Foto",
            onClick: () =>
              downloadImageFile(
                res.imageUrl,
                `postspark-ia-slide-${post.currentSlideIndex + 1}-${Date.now()}.png`
              ),
          },
        });
      } else {
        throw new Error("Nenhuma imagem retornada pelo motor de IA.");
      }
    } catch (err: any) {
      console.error("[CanvasSidebar] Erro ao gerar imagem por IA:", err);
      toast.error(err?.message || "Não foi possível gerar a foto com IA no momento. Tente novamente.");
    } finally {
      setIsGeneratingAiImage(false);
    }
  };

  const handleApplyCustomFont = () => {
    if (!customFontInput.trim()) return;
    onUpdatePost({ customFontUrl: customFontInput.trim() });
    toast.success("Fonte do Google Fonts aplicada!");
  };

  return (
    <aside className="w-80 h-full border-r border-white/10 bg-black/50 backdrop-blur-xl flex flex-col shrink-0 select-none z-20">
      {/* 4 Abas Principais */}
      <div className="grid grid-cols-4 p-2 gap-1 border-b border-white/10 bg-white/4">
        {[
          { id: "content", label: "Texto", icon: Edit3 },
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
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
                isSelected
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={16} className={isSelected ? "text-[oklch(0.78_0.22_48)]" : "text-white/40"} />
              <span className="mt-1">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {/* ─── ABA 1: CONTEÚDO ─── */}
        {activeTab === "content" && (
          <div className="space-y-4">
            {/* Dica contextual (item 9) */}
            <TipCallout id="tip-content-tab" title="Tudo sobre o conteúdo do post">
              Edite título, subtítulo e alinhamento; defina cores e tamanho da fonte por elemento; e prepare a legenda estratégica do Instagram.
            </TipCallout>

            {/* Ação Rápida: Inserir Nova Caixa de Texto */}
            {onAddExtraText && (
              <button
                type="button"
                onClick={onAddExtraText}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[oklch(0.78_0.22_48)]/20 to-[oklch(0.78_0.22_48)]/10 hover:from-[oklch(0.78_0.22_48)]/30 hover:to-[oklch(0.78_0.22_48)]/20 border border-[oklch(0.78_0.22_48)]/40 hover:border-[oklch(0.78_0.22_48)]/60 text-[oklch(0.78_0.22_48)] hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span>+ Adicionar Caixa de Texto Livre</span>
              </button>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                  Título (Headline)
                </label>
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
                rows={3}
                value={currentSlide ? currentSlide.headline : post.headline}
                onChange={(e) => handleUpdateHeadline(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)] resize-none"
                placeholder="Digite o título do post..."
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                  Subtítulo / Corpo
                </label>
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
                rows={4}
                value={currentSlide ? currentSlide.subtext : post.subtext}
                onChange={(e) => handleUpdateSubtext(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)] resize-none"
                placeholder="Digite o subtítulo..."
              />
            </div>

            {/* Badge / Tag e Etapa / Slide */}
            <div className="pt-3 border-t border-white/8 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold block truncate">
                    Badge / Tag
                  </label>
                  <input
                    type="text"
                    value={post.badgeText}
                    onChange={(e) => onUpdatePost({ badgeText: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)]"
                    placeholder="Ex: EDITORIAL"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold block truncate">
                    Etapa / Slide
                  </label>
                  <input
                    type="text"
                    value={currentSlide?.step || ""}
                    onChange={(e) => handleUpdateStep(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)]"
                    placeholder="Ex: 01 // CAPA"
                  />
                </div>
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
            </div>

            {/* ── Caixas de Texto Livres / Adicionais ── */}
            <div className="pt-3 border-t border-white/8 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold flex items-center gap-1.5">
                  <Type size={12} className="text-[oklch(0.78_0.22_48)]" />
                  <span>Textos Livres ({extraTextsList.length})</span>
                </label>
                {onAddExtraText && (
                  <button
                    type="button"
                    onClick={onAddExtraText}
                    className="flex items-center gap-1 text-[11px] font-medium text-[oklch(0.78_0.22_48)] hover:text-white bg-[oklch(0.78_0.22_48)]/10 hover:bg-[oklch(0.78_0.22_48)]/20 px-2 py-1 rounded-lg border border-[oklch(0.78_0.22_48)]/30 transition-all cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Adicionar Texto</span>
                  </button>
                )}
              </div>

              {extraTextsList.length === 0 ? (
                <p className="text-[11px] text-white/40 italic">
                  Nenhuma caixa de texto livre. Clique em "Adicionar Texto" para criar caixas extras editáveis no canvas.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {extraTextsList.map((et, idx) => (
                    <div
                      key={et.id}
                      className="p-2 rounded-xl bg-white/3 border border-white/8 space-y-2 hover:border-white/15 transition-all"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-mono text-white/40">#{idx + 1}</span>
                        <input
                          type="text"
                          value={et.text}
                          onChange={(e) => onUpdateExtraText?.(et.id, { text: e.target.value })}
                          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)]"
                          placeholder="Digite seu texto..."
                        />
                        {onRemoveExtraText && (
                          <button
                            type="button"
                            onClick={() => onRemoveExtraText(et.id)}
                            title="Remover caixa de texto"
                            className="p-1 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5 text-[11px]">
                        {/* Alinhamento */}
                        <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5 border border-white/10">
                          {(['left', 'center', 'right'] as const).map((align) => (
                            <button
                              key={align}
                              type="button"
                              onClick={() => onUpdateExtraText?.(et.id, { align })}
                              className={`p-1 rounded transition-colors ${
                                (et.align || 'left') === align
                                  ? 'bg-[oklch(0.78_0.22_48)] text-black font-semibold'
                                  : 'text-white/60 hover:text-white'
                              }`}
                            >
                              {align === 'left' && <AlignLeft size={11} />}
                              {align === 'center' && <AlignCenter size={11} />}
                              {align === 'right' && <AlignRight size={11} />}
                            </button>
                          ))}
                        </div>

                        {/* Tamanho da Fonte */}
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-white/40">Tam:</span>
                          <input
                            type="range"
                            min="14"
                            max="72"
                            value={et.fontSize || 24}
                            onChange={(e) => onUpdateExtraText?.(et.id, { fontSize: Number(e.target.value) })}
                            className="w-16 accent-[oklch(0.78_0.22_48)]"
                          />
                          <span className="text-[10px] font-mono text-white/60 w-5 text-right">{et.fontSize || 24}</span>
                        </div>

                        {/* Seletor de Cor */}
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={et.color || '#ffffff'}
                            onChange={(e) => onUpdateExtraText?.(et.id, { color: e.target.value })}
                            className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                            title="Cor do texto"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Tipografia do Post & Fontes ── */}
            <div className="pt-3 border-t border-white/8 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                  Tipografia do Post
                </label>
                <FontPickerDropdown
                  value={post.fontFamily}
                  onChange={(font) => onUpdatePost({ fontFamily: font })}
                  uploadedFontName={uploadedFontName}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-white/50 font-semibold flex items-center gap-1">
                  <Type size={11} />
                  <span>Upload de Fonte (.ttf, .otf, .woff2)</span>
                </label>
                <label className="w-full border border-dashed border-white/20 bg-white/3 hover:bg-white/6 rounded-xl p-2.5 flex items-center justify-center gap-2 text-xs text-white/70 cursor-pointer transition-all">
                  <Upload size={13} />
                  <span>Importar Arquivo de Fonte...</span>
                  <input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFontFileUpload} className="hidden" />
                </label>
              </div>

              <div className="space-y-1.5 p-2.5 rounded-xl bg-white/3 border border-white/8">
                <label className="text-[10px] uppercase tracking-wider text-white/50 font-semibold flex items-center gap-1">
                  <Link size={11} />
                  <span>Importar do Google Fonts</span>
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customFontInput}
                    onChange={(e) => setCustomFontInput(e.target.value)}
                    placeholder="https://fonts.googleapis.com/css2?family=..."
                    className="flex-1 rounded-lg border border-white/10 bg-black/40 p-2 text-[11px] text-white outline-none focus:border-[oklch(0.78_0.22_48)]"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCustomFont}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>

            {/* ── Cores e tamanho da tipografia (guardião de contraste integrado) ── */}
            <div className="pt-3 border-t border-white/8">
              <TypographyColorControls post={post} onUpdatePost={onUpdatePost} />
            </div>

            <div className="space-y-1.5 pt-3 border-t border-white/8">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                  Legenda Estratégica (Instagram)
                </label>
                <button
                  type="button"
                  onClick={handleCopyCaption}
                  className="flex items-center gap-1 text-[10px] text-[oklch(0.78_0.22_48)] hover:underline font-bold cursor-pointer"
                >
                  {copiedCaption ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedCaption ? "Copiado!" : "Copiar"}</span>
                </button>
              </div>
              <textarea
                rows={6}
                value={post.caption}
                onChange={(e) => onUpdatePost({ caption: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)] resize-none font-sans leading-relaxed"
                placeholder="Legenda para redes sociais com quebras de linha..."
              />
            </div>
          </div>
        )}

        {/* ─── ABA 2: ESTILO (DIREÇÕES DE ARTE & PALETA) ─── */}
        {activeTab === "style" && (
          <div className="space-y-4">
            {/* Dica contextual */}
            <TipCallout id="tip-style-tab" title="Direções de arte e paleta">
              Trocar de direção de arte altera fontes e composição visual — suas cores de fundo e destaque selecionadas continuam preservadas.
            </TipCallout>

            <div className="space-y-3">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold flex items-center justify-between">
                <span>Direções de Arte Oficiais</span>
                <span className="text-[10px] font-mono text-white/40">14 Estilos</span>
              </label>
              
              {["Tendências & Instagram", "Editorial & Clássico", "Métricas & Conversão"].map((categoryName) => {
                const categoryFamilies = ALL_FAMILIES_LIST.filter((f) => f.category === categoryName);
                return (
                  <div key={categoryName} className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase text-white/40 tracking-wider">
                      {categoryName}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {categoryFamilies.map((fam) => {
                        const isSelected = post.familyId === fam.id;
                        return (
                          <button
                            key={fam.id}
                            type="button"
                            onClick={() => onUpdatePost(applyFamilyPreset(post, fam.id))}
                            className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all cursor-pointer text-left ${
                              isSelected
                                ? "bg-white/15 border-[oklch(0.78_0.22_48)] text-white shadow-md font-semibold"
                                : "bg-white/4 border-white/8 text-white/70 hover:bg-white/8 hover:text-white"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{fam.icon}</span>
                              <div>
                                <div className="text-xs">{fam.name}</div>
                                <div className="text-[10px] text-white/40 leading-tight line-clamp-1">{fam.description}</div>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-white/40 shrink-0 ml-2">{fam.defaultFont}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 pt-3 border-t border-white/8">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                Paleta Cromática Base
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-white/40 block mb-1">Fundo</span>
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
                  <span className="text-[10px] text-white/40 block mb-1">Destaque</span>
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

        {/* ─── ABA 3: MÍDIA & FUNDOS PRÉ-DEFINIDOS ─── */}
        {activeTab === "media" && (
          <div className="space-y-4">
            {/* Dica contextual (item 9) */}
            <TipCallout id="tip-media-tab" title="Fundos por IA, texturas ou suas fotos">
              Gere um fundo com IA, explore 110+ texturas da biblioteca ou envie uma foto. Para enquadrar, dê duplo clique no fundo do palco.
            </TipCallout>

            {/* Chave: Aplicar a todos os slides do carrossel */}
            {post.slides.length > 1 && (
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                <span className="text-xs font-semibold text-white/80">Aplicar a todos os slides</span>
                <input
                  type="checkbox"
                  checked={applyToAllSlides}
                  onChange={(e) => setApplyToAllSlides(e.target.checked)}
                  className="w-4 h-4 accent-[oklch(0.78_0.22_48)]"
                />
              </label>
            )}

            {/* CARD DO PLANO DE FUNDO ATIVO (AJUSTE ESTILO CANVA + DOWNLOAD) */}
            {Boolean(post.slides[post.currentSlideIndex]?.bgImage || post.bgImage) && (
              <div className="p-3.5 rounded-xl border border-white/12 bg-white/4 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-white/70 font-bold flex items-center gap-1.5">
                    <ImageIcon size={13} className="text-[oklch(0.78_0.22_48)]" />
                    <span>Fundo do Slide</span>
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">
                    Slide {post.currentSlideIndex + 1} de {post.slides.length}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-white/15 shrink-0 bg-black/40 relative shadow-inner">
                    <img
                      src={post.slides[post.currentSlideIndex]?.bgImage || post.bgImage}
                      alt="Fundo atual"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 flex flex-col gap-1.5">
                    {/* Botão para ativar modo de edição do fundo estilo Canva */}
                    <button
                      type="button"
                      onClick={onToggleBackgroundEdit}
                      className={`w-full py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                        isEditingBackground
                          ? "bg-[oklch(0.78_0.22_48)] text-black border-[oklch(0.78_0.22_48)] shadow-md"
                          : "bg-white/8 hover:bg-white/14 text-white border-white/15"
                      }`}
                    >
                      <Crop size={13} />
                      <span>{isEditingBackground ? "✓ Concluir Ajuste" : "Ajustar Enquadramento"}</span>
                    </button>

                    {/* Botão de download direto da foto em alta resolução */}
                    <button
                      type="button"
                      onClick={async () => {
                        const targetUrl = post.slides[post.currentSlideIndex]?.bgImage || post.bgImage;
                        if (!targetUrl) return;
                        toast.info("Iniciando download da imagem...");
                        await downloadImageFile(
                          targetUrl,
                          `postspark-fundo-slide-${post.currentSlideIndex + 1}-${Date.now()}.png`
                        );
                        toast.success("Download da imagem concluído!");
                      }}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      title="Baixar imagem original de alta resolução gerada ou aplicada"
                    >
                      <Download size={12} className="text-[oklch(0.78_0.22_48)]" />
                      <span>Baixar Foto (Alta Res)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 1. GERADOR DE IMAGENS POR IA (COM PROMPT PRÉ-PREENCHIDO PELA IA) */}
            <div className="space-y-2 p-3 rounded-xl border border-white/10 bg-white/3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Wand2 size={13} className="text-[oklch(0.78_0.22_48)]" />
                  <span>Gerar Imagem com IA</span>
                </div>
                {post.imagePrompt && (
                  <span className="text-[9px] font-mono text-[oklch(0.78_0.22_48)] bg-[oklch(0.78_0.22_48)]/10 px-1.5 py-0.5 rounded">
                    Prompt da IA
                  </span>
                )}
              </div>
              <textarea
                rows={3}
                value={aiImagePrompt}
                onChange={(e) => setAiImagePrompt(e.target.value)}
                placeholder="Descreva a imagem de fundo que você deseja..."
                className="w-full rounded-lg border border-white/10 bg-black/40 p-2 text-xs text-white outline-none focus:border-[oklch(0.78_0.22_48)] resize-none"
              />
              <button
                type="button"
                onClick={handleGenerateAiImage}
                disabled={isGeneratingAiImage}
                className="w-full py-2 px-3 rounded-lg bg-[oklch(0.78_0.22_48)] text-black text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-110 disabled:opacity-50 cursor-pointer shadow-md"
              >
                {isGeneratingAiImage ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                <span>{isGeneratingAiImage ? "Sintetizando Imagem..." : "Gerar Foto com IA"}</span>
              </button>
            </div>

            {/* 2. BIBLIOTECA DE TEXTURAS OFICIAIS (ABRE GAVETA FLUTUANTE) */}
            <div className="space-y-2 pt-2 border-t border-white/8">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold flex items-center justify-between">
                <span>Biblioteca de Texturas</span>
                <span className="text-[10px] text-[oklch(0.78_0.22_48)] font-bold">110+ Assets</span>
              </label>

              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                className="w-full p-3 rounded-xl border border-white/15 bg-white/4 hover:bg-white/8 hover:border-[oklch(0.78_0.22_48)] flex items-center justify-between text-left transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center text-white/80 group-hover:text-white group-hover:scale-105 transition-all">
                    <ImageIcon size={18} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Explorar 110+ Texturas</span>
                    <span className="text-[10px] text-white/50">Luxo, Concreto, Linho, Papel, Tech...</span>
                  </div>
                </div>
                <span className="text-xs text-[oklch(0.78_0.22_48)] font-bold">➔</span>
              </button>
            </div>

            {/* 3. UPLOAD DO COMPUTADOR */}
            <div className="space-y-1.5 pt-2 border-t border-white/8">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                Upload do Computador
              </label>
              <label className="w-full border border-dashed border-white/20 bg-white/3 hover:bg-white/6 rounded-xl p-3 flex items-center justify-center gap-2 text-xs text-white/70 cursor-pointer transition-all">
                <Upload size={14} />
                <span>Selecionar Foto Local...</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>

            {/* 4. REMOVER FUNDO */}
            <button
              type="button"
              onClick={() => handleApplyBackground(undefined)}
              className="w-full py-2 rounded-xl border border-white/10 bg-white/4 hover:bg-white/8 text-xs text-white/60 hover:text-white cursor-pointer"
            >
              Usar Apenas Cor Sólida (Sem Foto)
            </button>

            {/* 5. CONTROLES DO OVERLAY / SCRIM */}
            <div className="space-y-3 pt-3 border-t border-white/8">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                <span>Camada de Sobreposição (Overlay)</span>
                <span>{Math.round((post.overlayOpacity ?? 0.55) * 100)}%</span>
              </div>

              {/* Modo de Distribuição / Variações */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Estilo do Overlay</span>
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
                        className={`py-1.5 px-2.5 rounded-lg text-left text-xs transition-all cursor-pointer border ${
                          active
                            ? "bg-[oklch(0.78_0.22_48)]/15 border-[oklch(0.78_0.22_48)] text-white font-medium shadow-sm"
                            : "bg-white/4 border-white/8 text-white/60 hover:text-white hover:bg-white/8"
                        }`}
                      >
                        <div className="font-semibold text-[11px]">{m.label}</div>
                        <div className="text-[9px] text-white/40">{m.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cor do Overlay */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Cor da Sobreposição</span>
                  {post.overlayColor && (
                    <button
                      type="button"
                      onClick={() => onUpdatePost({ overlayColor: undefined })}
                      className="text-[10px] text-white/40 hover:text-white/80 underline cursor-pointer"
                    >
                      Padrão do Fundo
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { label: "Preto", color: "#000000", tip: "Escurecer com alto contraste" },
                    { label: "Fundo", color: post.palette.background, tip: "Cor original do post" },
                    { label: "Destaque", color: post.palette.accent, tip: "Cor da marca" },
                    { label: "Branco", color: "#FFFFFF", tip: "Claro / High-key" },
                    { label: "Noite", color: "#0F172A", tip: "Grafite azulado" },
                  ].map((p, idx) => {
                    const active = post.overlayColor
                      ? post.overlayColor.toLowerCase() === p.color.toLowerCase()
                      : p.label === "Fundo";
                    return (
                      <button
                        key={idx}
                        type="button"
                        title={`${p.label} (${p.tip})`}
                        onClick={() => onUpdatePost({ overlayColor: p.color })}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border transition-all cursor-pointer ${
                          active
                            ? "border-[oklch(0.78_0.22_48)] bg-white/10 text-white font-medium shadow-sm"
                            : "border-white/10 bg-white/4 text-white/60 hover:text-white hover:bg-white/8"
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span>{p.label}</span>
                      </button>
                    );
                  })}

                  {/* Picker nativo */}
                  <label
                    title="Escolher cor personalizada"
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-white/10 bg-white/4 hover:bg-white/8 text-white/60 hover:text-white cursor-pointer transition-all"
                  >
                    <input
                      type="color"
                      value={post.overlayColor || post.palette.background || "#000000"}
                      onChange={(e) => onUpdatePost({ overlayColor: e.target.value })}
                      className="w-3.5 h-3.5 rounded border-0 p-0 cursor-pointer bg-transparent"
                    />
                    <span className="text-[10px] font-mono">
                      {(post.overlayColor || post.palette.background || "#000000").slice(0, 7).toUpperCase()}
                    </span>
                  </label>
                </div>
              </div>

              {/* Slider de Intensidade */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                  <span>Intensidade / Opacidade</span>
                  <span className="font-mono text-white/70">{Math.round((post.overlayOpacity ?? 0.55) * 100)}%</span>
                </div>
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
          </div>
        )}

        {/* ─── ABA 4: LOGO ─── */}
        {activeTab === "brand" && (
          <div className="space-y-4">
            <TipCallout id="tip-brand-tab" title="Logo da sua marca">
              Envie o logo em PNG transparente e selecione o quadrante ou arraste livremente no palco para posicionar.
            </TipCallout>

            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                Logo da Marca (PNG Transparente)
              </label>
              <label className="w-full border border-dashed border-white/20 bg-white/3 hover:bg-white/6 rounded-xl p-3 flex items-center justify-center gap-2 text-xs text-white/70 cursor-pointer transition-all">
                <Upload size={14} />
                <span>Upload do Logo...</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
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

            {/* Posição do Logo (4 Quadrantes Oficiais) */}
            <div className="space-y-1.5 pt-3 border-t border-white/8">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                Posição do Logo
              </label>
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
                        ? "bg-white text-black border-white shadow-sm"
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

      {/* Rodapé: checkbox global "Mostrar dicas" (item 9) */}
      <label className="flex items-center justify-between px-4 py-2.5 border-t border-white/10 bg-black/40 cursor-pointer select-none shrink-0">
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
      <BackgroundsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        post={post}
        onApplyBackground={handleApplyBackground}
        manifestData={manifestData}
        applyToAllSlides={applyToAllSlides}
        onToggleApplyToAll={(val) => setApplyToAllSlides(val)}
      />
    </aside>
  );
}
