/**
 * FontColorBlock — Bloco de Tipografia & Cor do WorkbenchV2 (Passo 4.4).
 *
 * Extrai e modulariza a seção de fontes e cores de texto do WorkbenchRefactored legado.
 *
 * Responsabilidades:
 *  - Seletor de fonte para Título, Corpo ou Ambos (<FontDropdown />)
 *  - Controle de escopo: 'headline' | 'body' | 'both' (mapeado para layoutTarget no Zustand)
 *  - Controles de cor: headlineColor, bodyColor, accentColor
 *  - Multiplicadores de tamanho de fonte: headlineFontSize, bodyFontSize
 *
 * Fonte de dados: 100% Zustand. Zero props de estado.
 * O WorkbenchRefactored.tsx NÃO é alterado.
 */

import React from "react";
import { motion } from "framer-motion";
import { Type, AlignLeft, AlignCenter } from "lucide-react";
import { FontDropdown } from "@/components/ui/FontDropdown";
import { DEFAULT_DESIGN_TOKENS } from "@shared/postspark";
import { useEditorStore } from "@/store/editorStore";

// Escopos de edição de tipografia
const FONT_SCOPES: { id: "headline" | "body" | "global"; label: string }[] = [
    { id: "headline", label: "Título" },
    { id: "body", label: "Corpo" },
    { id: "global", label: "Ambos" },
];

function ColorSwatch({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
                type="color"
                value={value || "#ffffff"}
                onChange={(e) => onChange(e.target.value)}
                className="w-7 h-7 rounded border border-white/10 cursor-pointer bg-transparent"
            />
            <span className="text-[var(--text-secondary)] min-w-[60px]">{label}</span>
            <input
                type="text"
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[var(--text-primary)] text-xs font-mono uppercase"
                maxLength={9}
                placeholder="#ffffff"
            />
        </label>
    );
}

export default function FontColorBlock() {
    const activeVariation = useEditorStore((s) => s.activeVariation);
    const setActiveVariation = useEditorStore((s) => s.setActiveVariation);
    const layoutTarget = useEditorStore((s) => s.layoutTarget);
    const setLayoutTarget = useEditorStore((s) => s.setLayoutTarget);

    if (!activeVariation) {
        return (
            <div className="text-[11px] text-[var(--text-tertiary)] italic text-center py-4">
                Sem post ativo
            </div>
        );
    }

    // Normaliza layoutTarget para os escopos de fonte globais
    const isSpecialTarget = layoutTarget === "image" || layoutTarget === "badge" || layoutTarget === "sticker" || layoutTarget === "accentBar";
    const fontScope = (isSpecialTarget ? "global" : layoutTarget) as
        | "headline"
        | "body"
        | "global";

    // Valor atual da fonte conforme escopo
    const fontValue =
        fontScope === "headline"
            ? (activeVariation.headlineFontFamily ?? activeVariation.designTokens?.typography?.fontFamily ?? "Inter")
            : fontScope === "body"
                ? (activeVariation.bodyFontFamily ?? activeVariation.designTokens?.typography?.fontFamily ?? "Inter")
                : (activeVariation.designTokens?.typography?.fontFamily ?? "Inter");

    const updateVariation = (partial: Partial<typeof activeVariation>) =>
        setActiveVariation({ ...activeVariation, ...partial });

    const handleFontChange = (value: string) => {
        if (fontScope === "headline") {
            updateVariation({ headlineFontFamily: value });
        } else if (fontScope === "body") {
            updateVariation({ bodyFontFamily: value });
        } else {
            // Ambos: aplica no designTokens + limpa overrides específicos
            const baseTokens = activeVariation.designTokens ?? DEFAULT_DESIGN_TOKENS;
            updateVariation({
                headlineFontFamily: undefined,
                bodyFontFamily: undefined,
                designTokens: {
                    ...baseTokens,
                    typography: {
                        ...DEFAULT_DESIGN_TOKENS.typography,
                        ...baseTokens.typography,
                        fontFamily: value,
                    },
                },
            });
        }
    };

    const accentColor = activeVariation.accentColor ?? "#a855f7";

    return (
        <div className="space-y-4">
            {/* ── Cabeçalho ── */}
            <div className="flex items-center gap-2">
                <Type size={13} className="text-[var(--text-tertiary)]" />
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                    Tipografia & Cor
                </label>
            </div>

            {/* ── Fonte ── */}
            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Família de Fonte
                </label>
                <FontDropdown value={fontValue} onChange={handleFontChange} />
            </div>

            {/* ── Tamanho relativo ── */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                        Tamanho Título
                    </label>
                    <input
                        type="range"
                        min={0.6}
                        max={1.8}
                        step={0.05}
                        value={activeVariation.headlineFontSize ?? 1}
                        onChange={(e) =>
                            updateVariation({ headlineFontSize: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[#a855f7]"
                    />
                    <span className="text-[9px] text-[var(--text-tertiary)]">
                        {((activeVariation.headlineFontSize ?? 1) * 100).toFixed(0)}%
                    </span>
                </div>
                <div>
                    <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                        Tamanho Corpo
                    </label>
                    <input
                        type="range"
                        min={0.6}
                        max={1.8}
                        step={0.05}
                        value={activeVariation.bodyFontSize ?? 1}
                        onChange={(e) =>
                            updateVariation({ bodyFontSize: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[#a855f7]"
                    />
                    <span className="text-[9px] text-[var(--text-tertiary)]">
                        {((activeVariation.bodyFontSize ?? 1) * 100).toFixed(0)}%
                    </span>
                </div>
            </div>

            {/* ── Cores de Texto ── */}
            <div className="flex flex-col gap-2">
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                    Cores
                </label>
                <ColorSwatch
                    label="Destaque"
                    value={activeVariation.accentColor ?? "#a855f7"}
                    onChange={(v) => {
                        const baseTokens = (activeVariation.designTokens ?? DEFAULT_DESIGN_TOKENS) as any;
                        updateVariation({
                            accentColor: v,
                            designTokens: { ...baseTokens, colors: { ...baseTokens.colors, primary: v } }
                        });
                    }}
                />
                <ColorSwatch
                    label="Título"
                    value={activeVariation.headlineColor ?? activeVariation.textColor ?? "#ffffff"}
                    onChange={(v) => updateVariation({ headlineColor: v })}
                />
                <ColorSwatch
                    label="Corpo"
                    value={activeVariation.bodyColor ?? activeVariation.textColor ?? "#ffffff"}
                    onChange={(v) => updateVariation({ bodyColor: v })}
                />
            </div>

            {/* ── Badge & Sticker (CopyAngle) ── */}
            {activeVariation.copyAngle && (
                <div className="space-y-2 pt-3 border-t border-white/5">
                    <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                        Elementos de Destaque
                    </label>
                    <div className="space-y-1.5">
                        <input
                            value={activeVariation.copyAngle.badge ?? ""}
                            onChange={(e) =>
                                updateVariation({
                                    copyAngle: {
                                        ...activeVariation.copyAngle!,
                                        badge: e.target.value,
                                    },
                                })
                            }
                            placeholder="Badge (ex: FOCO)"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-white/20 transition-colors"
                        />
                        <input
                            value={activeVariation.copyAngle.stickerText ?? ""}
                            onChange={(e) =>
                                updateVariation({
                                    copyAngle: {
                                        ...activeVariation.copyAngle!,
                                        stickerText: e.target.value,
                                    },
                                })
                            }
                            placeholder="Sticker (ex: UAU!)"
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/8 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-white/20 transition-colors"
                        />
                    </div>
                </div>
            )}

            {/* ── Alinhamento de Texto ── */}
            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Alinhamento
                </label>
                <div className="flex gap-1">
                    {(["left", "center"] as const).map((align) => {
                        const isActive =
                            (activeVariation.designTokens?.typography?.textAlign ?? "left") ===
                            align;
                        return (
                            <button
                                key={align}
                                onClick={() => {
                                    const baseTokens = activeVariation.designTokens ?? DEFAULT_DESIGN_TOKENS;
                                    updateVariation({
                                        designTokens: {
                                            ...baseTokens,
                                            typography: {
                                                ...DEFAULT_DESIGN_TOKENS.typography,
                                                ...baseTokens.typography,
                                                textAlign: align,
                                            },
                                        },
                                    });
                                }}
                                className="flex-1 flex items-center justify-center py-1.5 rounded-lg transition-all relative overflow-hidden"
                                style={{
                                    background: isActive
                                        ? `${accentColor}12`
                                        : "rgba(255,255,255,0.03)",
                                    border: `1px solid ${isActive ? accentColor : "rgba(255,255,255,0.07)"}`,
                                    color: isActive ? accentColor : "var(--text-secondary)",
                                    boxShadow: isActive ? `0 0 10px ${accentColor}20` : "none",
                                }}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="align-glow"
                                        className="absolute inset-0 bg-current opacity-10 pointer-events-none blur-md"
                                        animate={{ opacity: [0.05, 0.15, 0.05] }}
                                        transition={{ repeat: Infinity, duration: 2 }}
                                    />
                                )}
                                {align === "left" ? (
                                    <AlignLeft size={13} className="relative z-10" />
                                ) : (
                                    <AlignCenter size={13} className="relative z-10" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
