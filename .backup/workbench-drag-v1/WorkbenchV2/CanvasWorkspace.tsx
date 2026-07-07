/**
 * CanvasWorkspace — O canvas central passivo do WorkbenchV2.
 *
 * Responsabilidade ÚNICA: centralizar o PostCardV2 na tela e
 * fornecer o contexto visual de fundo (OrganicBackground).
 *
 * Não possui estado local complexo: lê aspectRatio do Zustand
 * só pra envolver o card com o padding certo.
 */

import React, { useState, useEffect, useRef } from "react";
import PostRenderer, { type PostRendererMode } from "@/components/PostRenderer";
import { CanvasInteractionProvider } from "@/editor/integration/CanvasInteractionProvider";
import { InteractionOverlay } from "@/editor/integration/InteractionOverlay";
import OrganicBackground from "../../OrganicBackground";
import { useEditorStore } from "@/store/editorStore";
import { useMobileEditorUI } from "@/store/mobileEditorUI";
import { useIsMobile } from "@/hooks/useMobile";
import { FloatingImageMenu } from "./FloatingImageMenu";
import { useAutoPilotDesign } from "./useAutoPilotDesign";
import { CanvasLoadingOverlay } from "./CanvasLoadingOverlay";
import { CarouselMobileArrows, CarouselScopeControl, CarouselSlideNavigator, MagnetControl } from "./CanvasControls";
import { CanvasGridOverlay } from "./CanvasGridOverlay";

const POST_BASE_WIDTH = 360;
const DESKTOP_MAX_CANVAS_SCALE = 2;
const DESKTOP_CANVAS_HORIZONTAL_GUTTER = 64;
const DESKTOP_CANVAS_VERTICAL_GUTTER = 96;
/** Altura aproximada do bottom nav mobile (o sheet o cobre antes de avançar no canvas). */
const MOBILE_BOTTOM_NAV_HEIGHT = 72;

interface CanvasWorkspaceProps {
    /** Referência do card para o export (html2canvas) */
    canvasRef?: React.RefObject<HTMLDivElement | null>;
    /** Mostra borda de edição no card raiz */
    isEditingCard?: boolean;
    renderMode?: Extract<PostRendererMode, "edit" | "export">;
}

export default function CanvasWorkspace({
    canvasRef,
    isEditingCard = false,
    renderMode = "edit",
}: CanvasWorkspaceProps) {
    const isMobile = useIsMobile();
    const sheetHeightPx = useMobileEditorUI((s) => s.sheetHeightPx);
    const requestCollapse = useMobileEditorUI((s) => s.requestCollapse);
    const aspectRatio = useEditorStore((s) => s.aspectRatio);
    const visualSnapshot = useEditorStore((s) => s.visualSnapshot);
    const activeVariation = useEditorStore((s) => s.activeVariation);
    const updateVariation = useEditorStore((s) => s.updateVariation);
    const isMagnetActive = useEditorStore((s) => s.isMagnetActive);
    const setMagnetActive = useEditorStore((s) => s.setMagnetActive);
    const postMode = useEditorStore((s) => s.postMode);
    const slides = useEditorStore((s) => s.slides);
    const currentSlideIndex = useEditorStore((s) => s.currentSlideIndex);
    const setCurrentSlideIndex = useEditorStore((s) => s.setCurrentSlideIndex);
    const applyScope = useEditorStore((s) => s.applyScope);
    const setApplyScope = useEditorStore((s) => s.setApplyScope);
    const selectedSlideIndices = useEditorStore((s) => s.selectedSlideIndices);
    const toggleSlideSelection = useEditorStore((s) => s.toggleSlideSelection);
    const layoutTarget = useEditorStore((s) => s.layoutTarget);
    const setLayoutTarget = useEditorStore((s) => s.setLayoutTarget);
    const addImageElement = useEditorStore((s) => s.addImageElement);
    const updateSlide = useEditorStore((s) => s.updateSlide);
    const removeImageElement = useEditorStore((s) => s.removeImageElement);
    const autoPilotDesign = useAutoPilotDesign(canvasRef);
    const isCarousel = postMode === "carousel" && slides.length > 0;

    const [scale, setScale] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);

    // Espaço que o bottom sheet ocupa por cima do canvas (além do nav que ele já cobre).
    // O post sobe e encolhe pra continuar visível acima do sheet.
    const reservedBottom = isMobile ? Math.max(0, sheetHeightPx - MOBILE_BOTTOM_NAV_HEIGHT) : 0;

    // Dynamic scaling logic based on container vs post natural size
    useEffect(() => {
        const calculateScale = () => {
            if (!containerRef.current) return;
            const containerWidth = containerRef.current.clientWidth;
            const containerHeight = containerRef.current.clientHeight;

            // O card base na V2 tem um tamanho lógico interno, por ex 360px
            // Precisamos calcular uma escala para ele caber e ficar GLORIOSO mas não cortar
            const baseWidth = POST_BASE_WIDTH;
            const horizontalPadding = isMobile ? 24 : DESKTOP_CANVAS_HORIZONTAL_GUTTER;
            const verticalPadding = isCarousel
                ? (isMobile ? 220 : 190)
                : (isMobile ? 80 : DESKTOP_CANVAS_VERTICAL_GUTTER);

            const availableWidth = Math.max(containerWidth - horizontalPadding, 1);
            const availableHeight = Math.max(containerHeight - verticalPadding - reservedBottom, 1);

            let targetHeight = baseWidth;
            if (aspectRatio === '9:16') targetHeight = baseWidth * (16 / 9);
            if (aspectRatio === '5:6') targetHeight = baseWidth * (6 / 5);

            const scaleW = availableWidth / baseWidth;
            const scaleH = availableHeight / targetHeight;
            const viewportFitScale = Math.min(scaleW, scaleH);
            const finalScale = isMobile
                ? Math.min(viewportFitScale, 1) * 0.98
                : Math.min(viewportFitScale, DESKTOP_MAX_CANVAS_SCALE);

            setScale(finalScale);
        };

        calculateScale();
        window.addEventListener('resize', calculateScale);
        const resizeObserver = typeof ResizeObserver !== "undefined"
            ? new ResizeObserver(calculateScale)
            : null;
        if (resizeObserver && containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        return () => {
            window.removeEventListener('resize', calculateScale);
            resizeObserver?.disconnect();
        };
    }, [aspectRatio, isCarousel, isMobile, reservedBottom]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setLayoutTarget("global");
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [setLayoutTarget]);

    const dt = activeVariation?.designTokens;
    const accentColor = dt?.colors?.primary ?? activeVariation?.accentColor ?? "#a855f7";
    const mobileCanvasTopPadding = "pt-4";
    const logicalCardHeight = aspectRatio === "9:16" ? POST_BASE_WIDTH * (16 / 9) : aspectRatio === "5:6" ? POST_BASE_WIDTH * (6 / 5) : POST_BASE_WIDTH;
    const scaledCardOverflowY = (logicalCardHeight * Math.max(scale - 1, 0)) / 2;
    const cardMarginTop = isCarousel && !isMobile ? scaledCardOverflowY + 28 : 0;
    const slideNavigatorMarginTop = isMobile
        ? 40
        : Math.max(72, scaledCardOverflowY + 46);

    return (
        <div
            className="flex-1 flex flex-col items-center justify-center relative overflow-hidden"
            style={{ background: "oklch(0.05 0.02 280)" }}
            ref={containerRef}
            onMouseDown={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest(".draggable-block") || target.closest("button")) return;
                // Toque fora dos editores minimiza o bottom sheet (mobile).
                if (isMobile && sheetHeightPx > 0) requestCollapse();
                setLayoutTarget("global");
            }}
        >
            {/* Fundo orgânico decorativo e dinâmico */}
            <OrganicBackground accentColor={accentColor} intensity={0.4} />
            <div
                aria-hidden
                className="absolute inset-0 pointer-events-none opacity-50"
                style={{
                    background:
                        `radial-gradient(ellipse 70% 60% at 40% 50%, ${accentColor}32 0%, transparent 70%)`,
                }}
            />

            {/* Textura de Ruído (Grain) */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    backgroundSize: "160px 160px",
                    opacity: 0.028,
                }}
            />

            {/* Barra superior do canvas — ancorada no topo da área (gutter), nunca sobre o card.
                Empilha a navegação do carrossel + ações. pointer-events-none deixa o gutter
                vazio clicável (colapsa o sheet); só os controles capturam o toque. */}
            <div className="pointer-events-none relative z-30 flex w-full max-w-full flex-col items-center gap-2 px-3">
                {isCarousel && (
                    <CarouselScopeControl
                        slides={slides}
                        index={currentSlideIndex}
                        scope={applyScope}
                        selectedIndices={selectedSlideIndices}
                        accentColor={accentColor}
                        onScopeChange={setApplyScope}
                        onToggleSlideSelection={toggleSlideSelection}
                    />
                )}
                <FloatingImageMenu
                    onUpload={(file) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const url = ev.target?.result as string;
                        // Posição inicial: centro do card (baseado em 360px de largura)
                        const cardWidth = 360;
                        const cardHeight = aspectRatio === '9:16' ? 640 : aspectRatio === '5:6' ? 432 : 360;
                        const newElement = {
                            id: `img-${Date.now()}`,
                            url,
                            x: cardWidth / 2 - 60,  // centro horizontal menos metade da largura (px)
                            y: cardHeight / 2 - 60,  // centro vertical menos metade da altura (px)
                            width: 120,
                            height: 'auto' as const,
                            rotation: 0,
                            source: 'upload' as const,
                        };
                        addImageElement(newElement);
                        setLayoutTarget(`imageElement:${newElement.id}`);
                    };
                    reader.readAsDataURL(file);
                }}
                accentColor={accentColor}
                />
            </div>

            {/* Container do card com scaling responsivo pra grandeza visual */}
            <div
                className={`relative group flex flex-col items-center justify-center gap-4 ${isMobile ? `min-h-0 w-full flex-1 px-3 pb-4 ${mobileCanvasTopPadding}` : "max-h-[85vh] px-8 pb-8 pt-4"}`}
                style={isMobile ? { paddingBottom: reservedBottom || undefined, transition: "padding 0.35s cubic-bezier(.22,1,.36,1)" } : undefined}
            >
                <div
                    className="relative z-10 rounded-2xl shadow-2xl transition-transform duration-300 ease-in-out ease-out transform-gpu shrink-0"
                    style={{
                        marginTop: cardMarginTop,
                        transform: `scale(${scale})`,
                        width: '360px',
                        aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '5:6' ? '5/6' : '1/1',
                    }}
                >
                    <CanvasInteractionProvider canvasRef={canvasRef as React.RefObject<HTMLElement | null>}>
                        <div ref={canvasRef} className="h-full w-full" data-post-export-root>
                            {visualSnapshot && <PostRenderer
                                mode={renderMode}
                                snapshot={visualSnapshot}
                                aspectRatio={aspectRatio}
                                currentSlideIndex={currentSlideIndex}
                                isEditingCard={renderMode === "edit" && (isEditingCard || layoutTarget === "card")}
                                editorBindings={renderMode === "edit" ? {
                                    layoutTarget,
                                    isMagnetActive,
                                    setLayoutTarget,
                                    updateVariation,
                                    updateSlide,
                                    removeImageElement,
                                } : undefined}
                                className="h-full w-full"
                            />}
                        </div>
                        {renderMode === "edit" && isMagnetActive && <CanvasGridOverlay accentColor={accentColor} />}
                        {renderMode === "edit" && <InteractionOverlay />}
                    </CanvasInteractionProvider>

                    <CanvasLoadingOverlay visible={autoPilotDesign.isAutoPiloting} />

                    <MagnetControl active={isMagnetActive} accentColor={accentColor} isMobile={isMobile} onChange={setMagnetActive} />
                </div>
                {isMobile && isCarousel && (
                    <div className="relative z-30 mt-14 max-w-full">
                        <CarouselMobileArrows
                            slides={slides}
                            currentIndex={currentSlideIndex}
                            accentColor={accentColor}
                            onIndexChange={setCurrentSlideIndex}
                        />
                    </div>
                )}
                {!isMobile && isCarousel && visualSnapshot && (
                    <div
                        className="relative z-30 max-w-full"
                        style={{ marginTop: slideNavigatorMarginTop }}
                    >
                        <CarouselSlideNavigator
                            slides={slides}
                            currentIndex={currentSlideIndex}
                            accentColor={accentColor}
                            onIndexChange={setCurrentSlideIndex}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
