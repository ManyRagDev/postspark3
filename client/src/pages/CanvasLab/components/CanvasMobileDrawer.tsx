import { useState, useEffect } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import type { CanvasPostModel, VisualFamilyId, TextAlignType } from "@/pages/CanvasLab/components/types";
import { OFFICIAL_FAMILIES_META } from "@/pages/CanvasLab/components/types";
import { applyFamilyPreset } from "../lib/familyPreset";
import TypographyColorControls from "./TypographyColorControls";
import TipCallout from "./TipCallout";
import { useStudioTipsStore } from "@/store/studioTipsStore";
import { Lightbulb } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { FONT_CATALOG } from "@/lib/fonts";
import BackgroundsDrawer from "./BackgroundsDrawer";
import RadialTextureSelector from "./RadialTextureSelector";

interface CanvasMobileDrawerProps {
  post: CanvasPostModel;
  onUpdatePost: (updates: Partial<CanvasPostModel>) => void;
  onExportPng: () => void;
  onExportZip: () => void;
  isExportingZip?: boolean;
  isOpen?: boolean;
  onToggleOpen?: (open: boolean) => void;
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
  const activeBg = currentSlide?.bgImage || post.bgImage;

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

                  {/* Tipografia do Post */}
                  <div className="space-y-1 pt-2 border-t border-white/8">
                    <label className="text-[11px] font-mono text-white/50 uppercase flex items-center gap-1">
                      <Type size={11} />
                      <span>Tipografia do Post</span>
                    </label>
                    <select
                      value={post.fontFamily}
                      onChange={(e) => onUpdatePost({ fontFamily: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-[#12141A] p-2 text-xs text-white outline-none cursor-pointer"
                    >
                      <optgroup label="Serifadas (Elegância & Luxo)">
                        {FONT_CATALOG.serif.map((f) => (
                          <option key={f.name} value={f.name}>{f.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Sans-Serif (Modernas & Clean)">
                        {FONT_CATALOG.sansSerif.map((f) => (
                          <option key={f.name} value={f.name}>{f.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Display (Impacto & Brutalismo)">
                        {FONT_CATALOG.display.map((f) => (
                          <option key={f.name} value={f.name}>{f.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Monoespaçadas (Cyber & Tech)">
                        {FONT_CATALOG.mono.map((f) => (
                          <option key={f.name} value={f.name}>{f.label}</option>
                        ))}
                      </optgroup>
                    </select>
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
                  {activeBg && (
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-white/6 border border-white/12">
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

                  {/* 2. Slider de Opacidade do Overlay / Scrim (Quando Fundo Ativo) */}
                  {activeBg && (
                    <div className="p-3 rounded-2xl bg-white/4 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-white/80">
                        <div className="flex items-center gap-1.5">
                          <Sliders size={13} />
                          <span>Escurecer Fundo (Contraste)</span>
                        </div>
                        <span className="font-mono text-xs text-[oklch(0.78_0.22_48)] font-bold">
                          {Math.round((post.overlayOpacity ?? 0.55) * 100)}%
                        </span>
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

                  {/* 4. Upload da Galeria do Celular */}
                  <label className="flex items-center justify-between p-3 rounded-2xl bg-white/4 hover:bg-white/7 border border-white/10 cursor-pointer active:scale-[0.99] transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center">
                        <Upload size={14} className="text-white/70" />
                      </div>
                      <span className="text-xs font-semibold text-white/90">Escolher da Galeria do Celular</span>
                    </div>
                    <span className="text-xs text-white/50">Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
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
