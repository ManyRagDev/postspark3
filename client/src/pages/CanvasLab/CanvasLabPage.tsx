import CanvasMobileDrawer from "./components/CanvasMobileDrawer";
import { useRef, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Check, Crop } from "lucide-react";
import { toast } from "sonner";
import { CanvasPostStage, type CanvasPostStageRef } from "./components/CanvasPostStage";
import CanvasTopBar from "./components/CanvasTopBar";
import CanvasSidebar from "./components/CanvasSidebar";
import CarouselFilmstrip from "./components/CarouselFilmstrip";
import { ConfirmDialog, SaveChoiceDialog, readSavePreference, writeSavePreference } from "./components/CanvasLabDialogs";
import {
  INITIAL_POST,
  type AspectRatioType,
  type CanvasPostModel,
  type ElementPosition,
  type BgImageTransform,
} from "./components/types";
import { applyContrastGuard, patchTouchesContrast } from "./lib/contrast";

interface CanvasLabPageProps {
  initialPost?: CanvasPostModel;
  onBackToGallery?: () => void;
  /** Item 6: recomeçar do zero — limpa a sessão e volta à tela de criação. */
  onRestart?: () => void;
  /** Item 7: persiste o post ("new" = INSERT, "update" = UPDATE do salvo). */
  onSave?: (post: CanvasPostModel, mode: "new" | "update") => Promise<boolean>;
  /** Existe um post salvo vinculado à sessão (habilita "Atualizar"). */
  hasSavedPost?: boolean;
  isSaving?: boolean;
  [key: string]: any;
}

export default function CanvasLabPage({ initialPost, onBackToGallery, onRestart, onSave, hasSavedPost = false, isSaving = false }: CanvasLabPageProps = {}) {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isEditingBackground, setIsEditingBackground] = useState(false);
  const [post, setPost] = useState<CanvasPostModel>(initialPost || INITIAL_POST);
  const [zoom, setZoom] = useState(1);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false);
  const stageRef = useRef<CanvasPostStageRef>(null);

  // Monitoramento dinâmico da resolução da tela para responsividade matemática
  const [windowDimensions, setWindowDimensions] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 390,
    height: typeof window !== "undefined" ? window.innerHeight : 844,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowDimensions.width < 768;
  const baseWidth = 360;
  const baseHeight = post.aspectRatio === "9:16" ? 640 : post.aspectRatio === "5:6" ? 432 : 360;

  // Escala adaptativa calculada matematicamente pelo tamanho real da tela
  const mobileAdaptiveScale = useMemo(() => {
    if (!isMobile) return 1;

    const topBarHeight = 56;
    const padding = 16;
    const availableWidth = windowDimensions.width - padding * 2;

    if (isMobileDrawerOpen) {
      // Drawer aberto ocupa ~58% da tela. A área superior livre é ~42vh menos a barra superior.
      const upperAreaHeight = Math.max(140, windowDimensions.height * 0.40 - topBarHeight - padding);
      const scaleX = availableWidth / baseWidth;
      const scaleY = upperAreaHeight / baseHeight;
      return Math.min(scaleX, scaleY, 0.92);
    } else {
      // Drawer fechado: quase a tela inteira disponível acima da barra inferior
      const closedAreaHeight = Math.max(200, windowDimensions.height - topBarHeight - 110 - padding);
      const scaleX = availableWidth / baseWidth;
      const scaleY = closedAreaHeight / baseHeight;
      return Math.min(scaleX, scaleY, 0.98);
    }
  }, [isMobile, isMobileDrawerOpen, windowDimensions.width, windowDimensions.height, baseWidth, baseHeight]);

  const handleUpdatePost = (patch: Partial<CanvasPostModel>) => {
    setPost((prev) => {
      const next = { ...prev, ...patch };
      // Guardião de contraste (regra mandatória): toda mudança de fundo,
      // acento, família ou limpeza de cor manual re-resolve as cores de
      // texto — fundo escuro ⇄ texto claro, e vice-versa, por metade no split.
      return patchTouchesContrast(prev, patch) ? applyContrastGuard(next) : next;
    });
  };

  const handleAspectRatioChange = (ratio: AspectRatioType) => {
    setPost((prev) => ({ ...prev, aspectRatio: ratio }));
  };

  const handleToggleSnap = () => {
    setPost((prev) => {
      const next = prev.isSnapEnabled === false ? true : false;
      return { ...prev, isSnapEnabled: next };
    });
  };

  // Salva posições individuais arrastadas no slide ativo
  const handleUpdateElementPosition = (
    elementKey: "headlinePos" | "subtextPos" | "badgePos" | "barPos" | "logoPos",
    pos: ElementPosition
  ) => {
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
      const currentSlide = prev.slides[curIdx];
      if (!currentSlide) return prev;

      const updatedSlides = [...prev.slides];
      updatedSlides[curIdx] = {
        ...currentSlide,
        [elementKey]: pos,
      };

      return {
        ...prev,
        slides: updatedSlides,
      };
    });
  };

  // Salva enquadramento (posição e escala) do plano de fundo
  const handleUpdateBgTransform = (transform: BgImageTransform) => {
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
      const currentSlide = prev.slides[curIdx];
      if (!currentSlide) return { ...prev, bgTransform: transform };

      const updatedSlides = [...prev.slides];
      updatedSlides[curIdx] = {
        ...currentSlide,
        bgTransform: transform,
      };

      return {
        ...prev,
        bgTransform: transform,
        slides: updatedSlides,
      };
    });
  };

  const handleResetBgTransform = () => {
    handleUpdateBgTransform({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    });
    toast.info("Enquadramento do fundo resetado para o padrão.");
  };

  // Edição direta no canvas (duplo clique / duplo toque)
  const handleUpdateText = (field: "headline" | "subtext" | "badgeText", value: string) => {
    setPost((prev) => {
      const curIdx = prev.currentSlideIndex;
      const currentSlide = prev.slides[curIdx];
      const updatedSlides = [...prev.slides];

      if (currentSlide) {
        if (field === "headline") {
          updatedSlides[curIdx] = { ...currentSlide, headline: value };
        } else if (field === "subtext") {
          updatedSlides[curIdx] = { ...currentSlide, subtext: value };
        } else if (field === "badgeText") {
          updatedSlides[curIdx] = { ...currentSlide, step: value };
        }
      }

      return {
        ...prev,
        [field]: value,
        slides: updatedSlides,
      };
    });
  };

  // ─── Item 7: fluxo de salvamento com decisão memorizável ───
  const handleSaveClick = () => {
    if (!onSave) {
      toast.error("Salvamento indisponível nesta tela.");
      return;
    }
    const pref = readSavePreference();
    if (pref === "new") {
      void onSave(post, "new");
      return;
    }
    if (pref === "update" && hasSavedPost) {
      void onSave(post, "update");
      return;
    }
    setIsSaveDialogOpen(true);
  };

  const handleSaveNew = (remember: boolean) => {
    if (remember) writeSavePreference("new");
    setIsSaveDialogOpen(false);
    void onSave?.(post, "new");
  };

  const handleSaveUpdate = (remember: boolean) => {
    if (remember) writeSavePreference("update");
    setIsSaveDialogOpen(false);
    void onSave?.(post, "update");
  };

  // Teclado: Escape ou Enter concluem o modo de edição do fundo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingBackground && (e.key === "Escape" || e.key === "Enter")) {
        setIsEditingBackground(false);
        toast.success("Enquadramento do fundo concluído!");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditingBackground]);

  const handleExportPng = () => {
    if (!stageRef.current) return;
    const dataUrl = stageRef.current.exportPng4K();
    if (!dataUrl) {
      toast.error("Erro ao gerar imagem 4K.");
      return;
    }
    const link = document.createElement("a");
    link.download = `postspark-${post.familyId}-${post.aspectRatio.replace(":", "x")}.png`;
    link.href = dataUrl;
    link.click();
    toast.success("Post 4K exportado com sucesso!");
  };

  const handleExportZip = async () => {
    if (!stageRef.current) return;
    setIsExportingZip(true);
    toast.info("Compilando todos os slides em arquivo ZIP de alta resolução...");

    try {
      const blob = await stageRef.current.exportZip4K((current, total) => {
        toast.loading(`Renderizando slide ${current} de ${total}...`, { id: "zip-progress" });
      });
      toast.dismiss("zip-progress");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `carrossel-postspark-${Date.now()}.zip`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Carrossel completo baixado em ZIP!");
    } catch (err) {
      toast.error("Erro ao gerar arquivo ZIP.");
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleAddSlide = () => {
    const nextIdx = post.slides.length + 1;
    const newSlide = {
      id: `s-${Date.now()}`,
      step: `SLIDE 0${nextIdx} // CONTINUAÇÃO`,
      headline: "Novo ponto importante da narrativa",
      subtext: "Explique este conceito com clareza para manter o público engajado até a chamada para ação.",
    };
    setPost((prev) => ({
      ...prev,
      slides: [...prev.slides, newSlide],
      currentSlideIndex: prev.slides.length,
    }));
  };

  const handleDuplicateSlide = (index: number) => {
    const target = post.slides[index];
    if (!target) return;
    const duplicated = {
      ...target,
      id: `s-${Date.now()}`,
      step: `${target.step} (CÓPIA)`,
    };
    const nextSlides = [...post.slides];
    nextSlides.splice(index + 1, 0, duplicated);
    setPost((prev) => ({
      ...prev,
      slides: nextSlides,
      currentSlideIndex: index + 1,
    }));
  };

  const handleDeleteSlide = (index: number) => {
    if (post.slides.length <= 1) {
      toast.error("O carrossel precisa ter no mínimo 1 slide.");
      return;
    }
    const nextSlides = post.slides.filter((_, i) => i !== index);
    setPost((prev) => ({
      ...prev,
      slides: nextSlides,
      currentSlideIndex: Math.min(prev.currentSlideIndex, nextSlides.length - 1),
    }));
  };

  return (
    <div className="h-screen w-full bg-[#07090E] text-white flex flex-col overflow-hidden select-none font-sans">
      {/* 1. Top Bar */}
      <CanvasTopBar
        aspectRatio={post.aspectRatio}
        onAspectRatioChange={handleAspectRatioChange}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(1.8, z + 0.1))}
        onZoomOut={() => setZoom((z) => Math.max(0.6, z - 0.1))}
        onResetZoom={() => setZoom(1)}
        onExportPng={handleExportPng}
        onExportZip={handleExportZip}
        onBackToGallery={onBackToGallery}
        isSnapEnabled={post.isSnapEnabled !== false}
        onToggleSnap={handleToggleSnap}
        isExportingZip={isExportingZip}
        slideCount={post.slides.length}
        currentSlide={post.currentSlideIndex}
        onPrevSlide={() => setPost((p) => ({ ...p, currentSlideIndex: Math.max(0, p.currentSlideIndex - 1) }))}
        onNextSlide={() => setPost((p) => ({ ...p, currentSlideIndex: Math.min(p.slides.length - 1, p.currentSlideIndex + 1) }))}
        onRestart={onRestart ? () => setIsRestartConfirmOpen(true) : undefined}
        onSave={onSave ? handleSaveClick : undefined}
        isSaving={isSaving}
      />

      {/* 2. Área Central */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop: Barra Lateral Fixa à Esquerda (Intocada) */}
        <div className="hidden md:flex h-full">
          <CanvasSidebar
            post={post}
            onUpdatePost={handleUpdatePost}
            isEditingBackground={isEditingBackground}
            onToggleBackgroundEdit={() => setIsEditingBackground((v) => !v)}
          />
        </div>

        {/* Palco da Prancheta com Viewport Adaptativo (Mobile & Desktop) */}
        <main
          onClick={() => {
            if (isMobileDrawerOpen) setIsMobileDrawerOpen(false);
          }}
          className="flex-1 bg-[#040508] relative overflow-hidden flex items-center justify-center p-2 sm:p-8 pb-20 md:pb-8 custom-scrollbar"
        >
          {/* BARRA FLUTUANTE DE MODO DE EDIÇÃO DO FUNDO (ESTILO CANVA) */}
          <AnimatePresence>
            {isEditingBackground && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-[#10141D]/95 backdrop-blur-2xl border border-[oklch(0.78_0.22_48)]/50 shadow-[0_20px_50px_rgba(0,0,0,0.8)] px-4 py-2.5 rounded-full flex items-center gap-3 text-xs"
              >
                <div className="flex items-center gap-2 text-white/90">
                  <span className="w-2.5 h-2.5 rounded-full bg-[oklch(0.78_0.22_48)] animate-pulse" />
                  <span className="font-bold text-white">Editando Enquadramento do Fundo</span>
                  <span className="text-white/40 hidden lg:inline">
                    | Arraste para reposicionar ou use os controladores para redimensionar
                  </span>
                </div>

                <div className="flex items-center gap-2 pl-3 border-l border-white/12">
                  <button
                    type="button"
                    onClick={handleResetBgTransform}
                    className="px-2.5 py-1 rounded-lg bg-white/6 hover:bg-white/12 text-white/70 hover:text-white transition-all text-[11px] flex items-center gap-1.5 cursor-pointer font-medium"
                    title="Resetar para o enquadramento padrão"
                  >
                    <RotateCcw size={12} />
                    <span>Resetar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingBackground(false);
                      toast.success("Enquadramento do fundo salvo!");
                    }}
                    className="px-3.5 py-1 rounded-lg bg-[oklch(0.78_0.22_48)] hover:brightness-110 text-black font-bold transition-all text-[11px] flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Check size={13} strokeWidth={3} />
                    <span>Concluir</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="flex items-center justify-center cursor-pointer md:cursor-default"
            animate={
              isMobile
                ? {
                    scale: mobileAdaptiveScale * zoom,
                    y: isMobileDrawerOpen
                      ? -Math.round(windowDimensions.height * 0.23)
                      : 0,
                  }
                : {
                    scale: zoom,
                    y: 0,
                  }
            }
            transition={{
              type: "spring",
              stiffness: 280,
              damping: 26,
              mass: 0.8,
            }}
          >
            <CanvasPostStage
              ref={stageRef}
              post={post}
              zoom={1}
              onUpdateElementPosition={handleUpdateElementPosition}
              isEditingBackground={isEditingBackground}
              onUpdateBgTransform={handleUpdateBgTransform}
              onEnterBackgroundEdit={() => setIsEditingBackground(true)}
              onUpdateText={handleUpdateText}
            />
          </motion.div>
        </main>

        {/* Mobile: Bottom Sheet Drawer Deslizante Nativo */}
        <CanvasMobileDrawer
          post={post}
          onUpdatePost={handleUpdatePost}
          onExportPng={handleExportPng}
          onExportZip={handleExportZip}
          isExportingZip={isExportingZip}
          isOpen={isMobileDrawerOpen}
          onToggleOpen={setIsMobileDrawerOpen}
        />
      </div>

      {/* 3. Fita Inferior de Carrossel */}
      <CarouselFilmstrip
        slides={post.slides}
        currentIndex={post.currentSlideIndex}
        onSelectSlide={(index) => setPost((p) => ({ ...p, currentSlideIndex: index }))}
        onAddSlide={handleAddSlide}
        onDuplicateSlide={handleDuplicateSlide}
        onRemoveSlide={handleDeleteSlide}
      />

      {/* ── Diálogos: Salvar (item 7) e Recomeçar (item 6) ── */}
      <SaveChoiceDialog
        open={isSaveDialogOpen}
        hasSavedPost={hasSavedPost}
        isSaving={isSaving}
        onCancel={() => setIsSaveDialogOpen(false)}
        onSaveNew={handleSaveNew}
        onUpdate={handleSaveUpdate}
      />
      <ConfirmDialog
        open={isRestartConfirmOpen}
        title="Recomeçar do zero?"
        description="Este post atual será descartado e você voltará à tela de criação para gerar novas direções de arte."
        confirmLabel="Recomeçar"
        onConfirm={() => {
          setIsRestartConfirmOpen(false);
          onRestart?.();
        }}
        onCancel={() => setIsRestartConfirmOpen(false)}
      />
    </div>
  );
}
