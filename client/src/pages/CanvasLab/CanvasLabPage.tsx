import CanvasMobileDrawer from "./components/CanvasMobileDrawer";
import { useRef, useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { CanvasPostStage, type CanvasPostStageRef } from "./components/CanvasPostStage";
import CanvasTopBar from "./components/CanvasTopBar";
import CanvasSidebar from "./components/CanvasSidebar";
import CarouselFilmstrip from "./components/CarouselFilmstrip";
import { INITIAL_POST, type AspectRatioType, type CanvasPostModel, type ElementPosition } from "./components/types";

interface CanvasLabPageProps {
  initialPost?: CanvasPostModel;
  onBackToGallery?: () => void;
  [key: string]: any;
}

export default function CanvasLabPage({ initialPost, onBackToGallery }: CanvasLabPageProps = {}) {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [post, setPost] = useState<CanvasPostModel>(initialPost || INITIAL_POST);
  const [zoom, setZoom] = useState(1);
  const [isExportingZip, setIsExportingZip] = useState(false);
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
    setPost((prev) => ({ ...prev, ...patch }));
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
      />

      {/* 2. Área Central */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop: Barra Lateral Fixa à Esquerda (Intocada) */}
        <div className="hidden md:flex h-full">
          <CanvasSidebar post={post} onUpdatePost={handleUpdatePost} />
        </div>

        {/* Palco da Prancheta com Viewport Adaptativo (Mobile & Desktop) */}
        <main
          onClick={() => {
            if (isMobileDrawerOpen) setIsMobileDrawerOpen(false);
          }}
          className="flex-1 bg-[#040508] relative overflow-hidden flex items-center justify-center p-2 sm:p-8 pb-20 md:pb-8 custom-scrollbar"
        >
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
    </div>
  );
}
