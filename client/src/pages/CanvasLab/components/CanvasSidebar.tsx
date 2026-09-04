import { useState, useEffect } from "react";
import { AlignCenter, AlignLeft, AlignRight, Check, Copy, Edit3, Image as ImageIcon, Link, Loader2, Palette, Sparkles, Upload, Wand2, Type, Download, Crop } from "lucide-react";
import { toast } from "sonner";
import { OFFICIAL_FAMILIES_META, resolveLegibleTextColor, type CanvasPostModel, type TextAlignType, type VisualFamilyId } from "./types";
import { FONT_CATALOG } from "@/lib/fonts";
import { trpc } from "@/lib/trpc";
import BackgroundsDrawer from "./BackgroundsDrawer";
import { downloadImageFile } from "@/lib/downloadHelper";

interface CanvasSidebarProps {
  post: CanvasPostModel;
  onUpdatePost: (patch: Partial<CanvasPostModel>) => void;
  isEditingBackground?: boolean;
  onToggleBackgroundEdit?: () => void;
}

type TabType = "content" | "style" | "media" | "brand";

const ALL_FAMILIES_LIST = Object.values(OFFICIAL_FAMILIES_META);

export default function CanvasSidebar({
  post,
  onUpdatePost,
  isEditingBackground = false,
  onToggleBackgroundEdit,
}: CanvasSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>("content");
  const [copiedCaption, setCopiedCaption] = useState(false);
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
          { id: "brand", label: "Marca", icon: Sparkles },
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

        {/* ─── ABA 2: ESTILO & FONTES ─── */}
        {activeTab === "style" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                Tipografia do Post
              </label>
              <select
                value={post.fontFamily}
                onChange={(e) => onUpdatePost({ fontFamily: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-[#12141A] p-2.5 text-xs text-white outline-none cursor-pointer"
              >
                {uploadedFontName && (
                  <optgroup label="Fontes Próprias (Upload)">
                    <option value={uploadedFontName}>{uploadedFontName}</option>
                  </optgroup>
                )}
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

            <div className="space-y-3 pt-2 border-t border-white/8">
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
                            onClick={() => {
                              const legText = resolveLegibleTextColor(post.palette.background, post.palette.text);
                              onUpdatePost({
                                familyId: fam.id,
                                familyName: fam.name,
                                fontFamily: fam.defaultFont,
                                palette: {
                                  background: post.palette.background,
                                  text: legText,
                                  accent: post.palette.accent,
                                  surface: post.palette.surface || fam.defaultPalette.surface,
                                },
                              });
                            }}
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
                Paleta Cromática
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-white/40 block mb-1">Fundo</span>
                  <input
                    type="color"
                    value={post.palette.background}
                    onChange={(e) => {
                      const newBg = e.target.value;
                      const newText = resolveLegibleTextColor(newBg, post.palette.text);
                      onUpdatePost({ palette: { ...post.palette, background: newBg, text: newText } });
                    }}
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
                <div>
                  <span className="text-[10px] text-white/40 block mb-1">Texto</span>
                  <input
                    type="color"
                    value={post.palette.text}
                    onChange={(e) =>
                      onUpdatePost({ palette: { ...post.palette, text: e.target.value } })
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

            {/* 5. OPACIDADE DO OVERLAY */}
            <div className="space-y-2 pt-3 border-t border-white/8">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                <span>Escurecimento (Overlay)</span>
                <span>{Math.round(post.overlayOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={post.overlayOpacity}
                onChange={(e) => onUpdatePost({ overlayOpacity: parseFloat(e.target.value) })}
                className="w-full accent-[oklch(0.78_0.22_48)]"
              />
            </div>
          </div>
        )}

        {/* ─── ABA 4: MARCA ─── */}
        {activeTab === "brand" && (
          <div className="space-y-4">
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

            <div className="space-y-1.5 pt-3 border-t border-white/8">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold">
                Badge / Tag de Categoria
              </label>
              <input
                type="text"
                value={post.badgeText}
                onChange={(e) => onUpdatePost({ badgeText: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white placeholder-white/30 outline-none focus:border-[oklch(0.78_0.22_48)]"
                placeholder="Ex: EDITORIAL // CAPA"
              />
            </div>
          </div>
        )}
      </div>
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
