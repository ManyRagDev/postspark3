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
import { Eye, Sparkles, Loader2, Magnet } from "lucide-react";
import html2canvas from "html2canvas-pro";
import PostCardV2 from "./PostCardV2";
import OrganicBackground from "../../OrganicBackground";
import { useEditorStore } from "@/store/editorStore";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { layoutToAdvanced } from "../WorkbenchRefactored";

interface CanvasWorkspaceProps {
    /** Referência do card para o export (html2canvas) */
    canvasRef?: React.RefObject<HTMLDivElement | null>;
    /** Mostra borda de edição no card raiz */
    isEditingCard?: boolean;
}

export default function CanvasWorkspace({
    canvasRef,
    isEditingCard = false,
}: CanvasWorkspaceProps) {
    const aspectRatio = useEditorStore((s) => s.aspectRatio);
    const activeVariation = useEditorStore((s) => s.activeVariation);
    const updateLayoutSettings = useEditorStore((s) => s.updateLayoutSettings);
    const updateVariation = useEditorStore((s) => s.updateVariation);
    const bgValue = useEditorStore((s) => s.bgValue);
    const isMagnetActive = useEditorStore((s) => s.isMagnetActive);
    const setMagnetActive = useEditorStore((s) => s.setMagnetActive);

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

            const result = await autoPilotMutation.mutateAsync({
                imageBase64,
                currentState: activeVariation,
            });

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
            const padding = 64; // p-8 * 2

            const availableWidth = containerWidth - padding;
            const availableHeight = containerHeight - padding;

            let targetHeight = baseWidth;
            if (aspectRatio === '9:16') targetHeight = baseWidth * (16 / 9);
            if (aspectRatio === '5:6') targetHeight = baseWidth * (6 / 5);

            const scaleW = availableWidth / baseWidth;
            const scaleH = availableHeight / targetHeight;
            const viewportFitScale = Math.min(scaleW, scaleH, 1.25); // Max zoom 1.25x (se couber)
            const finalScale = viewportFitScale * 0.8; // 20% menor conforme solicitado pelo usuário

            setScale(finalScale);
        };

        calculateScale();
        window.addEventListener('resize', calculateScale);
        return () => window.removeEventListener('resize', calculateScale);
    }, [aspectRatio]);

    const dt = activeVariation?.designTokens;
    const accentColor = dt?.colors?.primary ?? activeVariation?.accentColor ?? "#a855f7";
    const backgroundColor = dt?.colors?.background ?? activeVariation?.backgroundColor ?? "#0d0d16";

    return (
        <div
            className="flex-1 flex items-center justify-center relative overflow-hidden"
            style={{ background: "oklch(0.05 0.02 280)" }}
            ref={containerRef}
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
            <div className="relative group p-8 flex items-center justify-center max-h-[85vh]">
                <div
                    ref={canvasRef}
                    className="relative z-10 rounded-2xl shadow-2xl transition-transform duration-300 ease-in-out ease-out transform-gpu shrink-0"
                    style={{
                        transform: `scale(${scale})`,
                        width: '360px',
                        aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '5:6' ? '5/6' : '1/1',
                    }}
                >
                    <PostCardV2 isEditingCard={isEditingCard} />

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
                <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                    {canAutoPilot ? (
                        <button
                            onClick={handleAutoPilotDesign}
                            disabled={isAutoPiloting}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/80 border border-white/10 text-white hover:bg-black transition-all shadow-xl active:scale-95 disabled:opacity-50"
                            title="Ajustar com IA (Visão)"
                        >
                            {isAutoPiloting ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Eye size={16} className="text-purple-400" />
                            )}
                            <span className="text-[10px] font-bold uppercase tracking-tighter">
                                Ajustar com IA
                            </span>
                        </button>
                    ) : (
                        <div
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/50 border border-white/5 text-white/40 cursor-not-allowed shadow-xl"
                            title="Adicione um background (IA ou Galeria) para usar a Inteligência de Layout"
                        >
                            <Eye size={16} className="opacity-50" />
                            <span className="text-[10px] font-bold uppercase tracking-tighter">
                                Ajustar com IA
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
