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
import { Sparkles, Loader2, Magnet, ChevronLeft, ChevronRight } from "lucide-react";
import html2canvas from "html2canvas-pro";
import PostRenderer, { type PostRendererMode } from "@/components/PostRenderer";
import OrganicBackground from "../../OrganicBackground";
import { useEditorStore } from "@/store/editorStore";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { layoutToAdvanced } from "@/lib/layoutToAdvanced";
import { useIsMobile } from "@/hooks/useMobile";

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
    const aspectRatio = useEditorStore((s) => s.aspectRatio);
    const activeVariation = useEditorStore((s) => s.activeVariation);
    const updateLayoutSettings = useEditorStore((s) => s.updateLayoutSettings);
    const layoutSettings = useEditorStore((s) => s.layoutSettings);
    const imageSettings = useEditorStore((s) => s.imageSettings);
    const bgOverlay = useEditorStore((s) => s.bgOverlay);
    const updateVariation = useEditorStore((s) => s.updateVariation);
    const bgValue = useEditorStore((s) => s.bgValue);
    const isMagnetActive = useEditorStore((s) => s.isMagnetActive);
    const setMagnetActive = useEditorStore((s) => s.setMagnetActive);
    const postMode = useEditorStore((s) => s.postMode);
    const slides = useEditorStore((s) => s.slides);
    const currentSlideIndex = useEditorStore((s) => s.currentSlideIndex);
    const setCurrentSlideIndex = useEditorStore((s) => s.setCurrentSlideIndex);
    const applyScope = useEditorStore((s) => s.applyScope);
    const setApplyScope = useEditorStore((s) => s.setApplyScope);
    const layoutTarget = useEditorStore((s) => s.layoutTarget);
    const setLayoutTarget = useEditorStore((s) => s.setLayoutTarget);

    const [isAutoPiloting, setIsAutoPiloting] = useState(false);
    const autoPilotMutation = trpc.post.autoPilotDesign.useMutation();

    const canAutoPilot = bgValue.type !== "none";

    const handleAutoPilotDesign = async () => {
        if (!canvasRef?.current || !activeVariation || isAutoPiloting || !canAutoPilot) return;

        setIsAutoPiloting(true);
        try {
            // Captura estrita do PostCardV2
            const canvas = await html2canvas(canvasRef.current, {
                useCORS: true,
                scale: 2,
                backgroundColor: null,
            });

            const imageBase64 = canvas.toDataURL("image/webp", 0.8);
            const rootRect = canvasRef.current.getBoundingClientRect();
            const elements = Array.from(
                canvasRef.current.querySelectorAll<HTMLElement>("[data-layout-id]"),
            ).map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                    id: element.dataset.layoutId!,
                    x: ((rect.left + rect.width / 2 - rootRect.left) / rootRect.width) * 100,
                    y: ((rect.top + rect.height / 2 - rootRect.top) / rootRect.height) * 100,
                    width: (rect.width / rootRect.width) * 100,
                    height: (rect.height / rootRect.height) * 100,
                };
            });

            const result = await autoPilotMutation.mutateAsync({
                imageBase64,
                currentState: {
                    variation: activeVariation,
                    aspectRatio,
                    layoutSettings,
                    imageSettings,
                    bgValue,
                    bgOverlay,
                    canvas: { width: rootRect.width, height: rootRect.height },
                    elements,
                },
            });

            if (Array.isArray(result.suggestedElements)) {
                const nextLayout: Record<string, any> = {};
                const nextSectionLayouts = { ...(layoutSettings.sectionLayouts ?? {}) };
                const textElementSuggestions = new Map<string, any>();

                for (const suggestion of result.suggestedElements) {
                    const x = Math.min(95, Math.max(5, Number(suggestion.x)));
                    const y = Math.min(95, Math.max(5, Number(suggestion.y)));
                    const width = Math.min(96, Math.max(12, Number(suggestion.width)));
                    if (![x, y, width].every(Number.isFinite)) continue;

                    const patch = {
                        freePosition: { x, y },
                        width,
                        textAlign: suggestion.textAlign,
                        ...(suggestion.backgroundColor ? { backgroundColor: suggestion.backgroundColor } : {}),
                        ...(Number.isFinite(suggestion.borderRadius) ? { borderRadius: suggestion.borderRadius } : {}),
                    };

                    if (suggestion.id.startsWith("textElement:")) {
                        textElementSuggestions.set(
                            suggestion.id.slice("textElement:".length),
                            { suggestion, measured: elements.find((item) => item.id === suggestion.id) },
                        );
                    } else if (suggestion.id.startsWith("section:")) {
                        const sectionId = suggestion.id.slice("section:".length);
                        if (nextSectionLayouts[sectionId]) {
                            nextSectionLayouts[sectionId] = { ...nextSectionLayouts[sectionId], ...patch };
                        }
                    } else if (suggestion.id in layoutSettings && suggestion.id !== "card") {
                        nextLayout[suggestion.id] = { ...(layoutSettings as any)[suggestion.id], ...patch };
                    }
                }

                updateLayoutSettings({ ...nextLayout, sectionLayouts: nextSectionLayouts });

                if (textElementSuggestions.size && activeVariation.textElements?.length) {
                    const logicalWidth = canvasRef.current.clientWidth;
                    const logicalHeight = canvasRef.current.clientHeight;
                    updateVariation({
                        textElements: activeVariation.textElements.map((element) => {
                            const entry = textElementSuggestions.get(element.id);
                            if (!entry) return element;
                            const measuredHeight = Number(entry.measured?.height) || 8;
                            const suggestedWidth = Math.min(96, Math.max(12, Number(entry.suggestion.width)));
                            return {
                                ...element,
                                x: Math.max(0, ((Number(entry.suggestion.x) - suggestedWidth / 2) / 100) * logicalWidth),
                                y: Math.max(0, ((Number(entry.suggestion.y) - measuredHeight / 2) / 100) * logicalHeight),
                                width: (suggestedWidth / 100) * logicalWidth,
                                styles: {
                                    ...element.styles,
                                    textAlign: entry.suggestion.textAlign,
                                },
                            };
                        }),
                    });
                }
            }

            if (result.suggestedLayoutMoves) {
                const moves = result.suggestedLayoutMoves;
                const headPos = moves.headline?.position;
                const bodyPos = moves.body?.position;

                // Se houver colisão óbvia, aciona a inteligência conceitual do editor core
                if (headPos && bodyPos && headPos === bodyPos) {
                    console.warn(`[AutoPilot] Colisão detectada em '${headPos}'. Forçando fallback para layout seguro.`);
                    const safeLayout = activeVariation.layout === 'centered' ? 'split' : 'minimal';
                    updateLayoutSettings(layoutToAdvanced(safeLayout));
                } else {
                    updateLayoutSettings(moves);
                }
            }

            if (result.textColor) {
                updateVariation({ textColor: result.textColor });
            }
        } catch (error) {
            console.error("AI Adjustment failed:", error);
        } finally {
            setIsAutoPiloting(false);
        }
    };

    const [scale, setScale] = useState(1);
    const containerRef = useRef<HTMLDivElement>(null);

    // Dynamic scaling logic based on container vs post natural size
    useEffect(() => {
        const calculateScale = () => {
            if (!containerRef.current) return;
            const containerWidth = containerRef.current.clientWidth;
            const containerHeight = containerRef.current.clientHeight;

            // O card base na V2 tem um tamanho lógico interno, por ex 360px
            // Precisamos calcular uma escala para ele caber e ficar GLORIOSO mas não cortar
            const baseWidth = 360; // Base lógica original para manter a proporção das fontes
            const horizontalPadding = isMobile ? 24 : 64;
            const verticalPadding = isMobile ? 24 : 64;

            const availableWidth = Math.max(containerWidth - horizontalPadding, 1);
            const availableHeight = Math.max(containerHeight - verticalPadding, 1);

            let targetHeight = baseWidth;
            if (aspectRatio === '9:16') targetHeight = baseWidth * (16 / 9);
            if (aspectRatio === '5:6') targetHeight = baseWidth * (6 / 5);

            const scaleW = availableWidth / baseWidth;
            const scaleH = availableHeight / targetHeight;
            const viewportFitScale = Math.min(scaleW, scaleH, isMobile ? 1 : 1.25);
            const finalScale = viewportFitScale * (isMobile ? 0.98 : 0.8);

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
    }, [aspectRatio, isMobile]);

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
    const backgroundColor = dt?.colors?.background ?? activeVariation?.backgroundColor ?? "#0d0d16";
    const isCarousel = postMode === "carousel" && slides.length > 0;

    return (
        <div
            className="flex-1 flex items-center justify-center relative overflow-hidden"
            style={{ background: "oklch(0.05 0.02 280)" }}
            ref={containerRef}
            onMouseDown={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest(".draggable-block") || target.closest("button")) return;
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
            {/* Container do card com scaling responsivo pra grandeza visual */}
            <div
                className={`relative group flex items-center justify-center ${isMobile ? "px-3 pt-5 pb-4 h-full w-full" : "px-8 pt-24 pb-8 max-h-[85vh]"}`}
            >
                <div
                    className="relative z-10 rounded-2xl shadow-2xl transition-transform duration-300 ease-in-out ease-out transform-gpu shrink-0"
                    style={{
                        transform: `scale(${scale})`,
                        width: '360px',
                        aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '5:6' ? '5/6' : '1/1',
                    }}
                >
                    <div ref={canvasRef} className="h-full w-full" data-post-export-root>
                        <PostRenderer
                            mode={renderMode}
                            aspectRatio={aspectRatio}
                            isEditingCard={renderMode === "edit" && (isEditingCard || layoutTarget === "card")}
                            className="h-full w-full"
                        />
                    </div>

                    {/* Loading Overlay durante IA */}
                    <AnimatePresence>
                        {isAutoPiloting && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 rounded-2xl backdrop-blur-sm"
                            >
                                <div className="p-4 rounded-full bg-white/10 border border-white/20 mb-3">
                                    <Sparkles className="text-purple-400 animate-pulse" size={24} />
                                </div>
                                <span className="text-xs font-semibold text-white tracking-widest uppercase">
                                    IA Ajustando Design...
                                </span>
                                <Loader2 className="mt-4 text-white/40 animate-spin" size={20} />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Botão Ímã atrelado ao próprio card na parte inferior externa */}
                    <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 flex justify-center z-50">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setMagnetActive(!isMagnetActive);
                            }}
                            className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] rounded-full transition-all duration-500 border shadow-2xl hover:scale-105 active:scale-95 group/magnet`}
                            style={{
                                background: isMagnetActive ? `${accentColor}15` : "rgba(12,12,20,0.9)",
                                borderColor: isMagnetActive ? accentColor : "rgba(255,255,255,0.1)",
                                color: isMagnetActive ? accentColor : "rgba(255,255,255,0.4)",
                                backdropFilter: "blur(12px)",
                                boxShadow: isMagnetActive
                                    ? `0 0 30px ${accentColor}40, inset 0 0 12px ${accentColor}20`
                                    : "0 8px 32px -8px rgba(0,0,0,0.8)",
                            }}
                            title="Ativar/Desativar Snap-to-Grid para alinhar os elementos automaticamente"
                        >
                            <div className="relative">
                                {isMagnetActive && (
                                    <motion.div
                                        layoutId="magnet-glow"
                                        className="absolute inset-0 blur-md rounded-full"
                                        style={{ backgroundColor: accentColor }}
                                        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }}
                                        transition={{ repeat: Infinity, duration: 2 }}
                                    />
                                )}
                                <Magnet
                                    size={14}
                                    className={`relative z-10 transition-all duration-500 ${isMagnetActive ? 'rotate-[15deg] scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'opacity-50'}`}
                                />
                            </div>
                            <span className="relative z-10">
                                Ímã {isMagnetActive ? 'ON' : 'OFF'}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Botão de Ajuste com IA (Floating no topo direito do CanvasWorkspace) */}
                {isCarousel && (
                    <div className="absolute left-1/2 top-6 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-md shadow-2xl">
                        <button
                            onClick={() => setCurrentSlideIndex((currentSlideIndex - 1 + slides.length) % slides.length)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/6 text-white/75 transition-colors hover:bg-white/12 hover:text-white"
                            title="Slide anterior"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <div className="flex items-center gap-1.5">
                            {slides.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentSlideIndex(index)}
                                    className="rounded-full transition-all"
                                    style={{
                                        width: index === currentSlideIndex ? 20 : 6,
                                        height: 6,
                                        background: index === currentSlideIndex ? accentColor : "rgba(255,255,255,0.22)",
                                    }}
                                    title={`Slide ${index + 1}`}
                                />
                            ))}
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">
                            {currentSlideIndex + 1}/{slides.length}
                        </span>
                        <div className="mx-1 h-5 w-px bg-white/10" />
                        <div className="flex items-center gap-1 rounded-full border border-white/8 bg-white/5 p-1">
                            {([
                                { id: "current", label: "Este slide" },
                                { id: "all", label: "Todos" },
                            ] as const).map((scope) => {
                                const isActive = applyScope === scope.id;
                                return (
                                    <button
                                        key={scope.id}
                                        onClick={() => setApplyScope(scope.id)}
                                        className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-all"
                                        style={{
                                            background: isActive ? `${accentColor}20` : "transparent",
                                            border: `1px solid ${isActive ? `${accentColor}66` : "transparent"}`,
                                            color: isActive ? accentColor : "rgba(255,255,255,0.55)",
                                        }}
                                        title={scope.id === "current" ? "Aplicar mudanças apenas ao slide atual" : "Aplicar mudanças a todos os slides"}
                                    >
                                        {scope.label}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => setCurrentSlideIndex((currentSlideIndex + 1) % slides.length)}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/6 text-white/75 transition-colors hover:bg-white/12 hover:text-white"
                            title="Próximo slide"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
