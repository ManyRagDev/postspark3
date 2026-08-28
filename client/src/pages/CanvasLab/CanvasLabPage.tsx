import { useRef, useState } from "react";
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
        {/* Barra Lateral (Desktop: fixa à esquerda | Mobile: Drawer deslizante) */}
        <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 md:static md:translate-x-0 ${
          isMobileDrawerOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        }`}>
          <div className="relative h-full">
            <CanvasSidebar post={post} onUpdatePost={handleUpdatePost} />
            {/* Botão Fechar no Mobile */}
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(false)}
              className="md:hidden absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 text-white/70 hover:text-white z-30"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Backdrop para fechar o drawer no Mobile */}
        {isMobileDrawerOpen && (
          <div
            onClick={() => setIsMobileDrawerOpen(false)}
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          />
        )}

        {/* Palco da Prancheta */}
        <main className="flex-1 bg-[#040508] relative overflow-auto flex items-center justify-center p-4 sm:p-8 custom-scrollbar">
          <CanvasPostStage
            ref={stageRef}
            post={post}
            zoom={zoom}
            onUpdateElementPosition={handleUpdateElementPosition}
          />

          {/* Botão Flutuante de Edição para Celular */}
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(true)}
            className="md:hidden fixed bottom-6 right-6 z-20 flex items-center gap-2 px-5 py-3 rounded-full bg-[oklch(0.78_0.22_48)] text-black font-semibold shadow-xl cursor-pointer active:scale-95 transition-transform"
          >
            <span>🎨</span>
            <span>Editar Post</span>
          </button>
        </main>
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
