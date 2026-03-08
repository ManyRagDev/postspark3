/**
 * PlatformBlock — Bloco de Plataforma & Proporção do WorkbenchV2.
 *
 * Ejeta a UI de seleção de plataforma (Instagram, LinkedIn…) e
 * de proporção (1:1, 5:6, 9:16) do WorkbenchRefactored antigo.
 *
 * Lê e muta APENAS o Zustand (sem props de estado).
 * Fiel ao design original do WorkbenchRefactored, linhas 686-823.
 */

import React, { useEffect } from "react";
import type { Platform, AspectRatio } from "@shared/postspark";
import {
    PLATFORM_SPECS,
    PLATFORM_ASPECT_RATIOS,
    ASPECT_RATIO_LABELS,
} from "@shared/postspark";
import RatioIcon from "@/components/RatioIcon";
import { useEditorStore } from "@/store/editorStore";

const PLATFORMS: Platform[] = ["instagram", "twitter", "linkedin", "facebook"];

// Fallback se ASPECT_RATIO_LABELS não existir na versão do shared
const RATIO_LABELS: Record<AspectRatio, string> = {
    "1:1": "Quadrado",
    "5:6": "Retrato",
    "9:16": "Stories",
};

function getRatioLabel(ratio: AspectRatio): string {
    // @ts-ignore - ASPECT_RATIO_LABELS pode não existir dependendo da versão do shared
    return (ASPECT_RATIO_LABELS?.[ratio]?.label || RATIO_LABELS[ratio] || ratio) as string;
}

export default function PlatformBlock() {
    const platform = useEditorStore((s) => s.platform);
    const aspectRatio = useEditorStore((s) => s.aspectRatio);
    const setPlatform = useEditorStore((s) => s.setPlatform);
    const setAspectRatio = useEditorStore((s) => s.setAspectRatio);

    // Quando a plataforma muda, garante que o ratio seja compatível
    useEffect(() => {
        const allowed = PLATFORM_ASPECT_RATIOS[platform];
        if (allowed && !allowed.includes(aspectRatio)) {
            setAspectRatio(allowed[0]);
        }
    }, [platform, aspectRatio, setAspectRatio]);

    // Cor accent da variação ativa (usada para highlight dos botões)
    const accentColor = useEditorStore(
        (s) => s.activeVariation?.accentColor ?? "#a855f7"
    );

    const allowedRatios = PLATFORM_ASPECT_RATIOS[platform] ?? ["1:1"];

    return (
        <div className="space-y-4">
            {/* ── PLATAFORMA ── */}
            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
                    Plataforma
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                    {PLATFORMS.map((p) => {
                        const spec = PLATFORM_SPECS[p];
                        const isActive = platform === p;
                        return (
                            <button
                                key={p}
                                onClick={() => setPlatform(p)}
                                className="flex flex-col items-start px-3 py-2 rounded-lg text-left transition-all"
                                style={{
                                    background: isActive
                                        ? `${accentColor}15`
                                        : "rgba(255,255,255,0.03)",
                                    border: `1px solid ${isActive ? `${accentColor}40` : "rgba(255,255,255,0.06)"
                                        }`,
                                }}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm">{spec.icon}</span>
                                    <span
                                        className="text-[11px] font-medium"
                                        style={{
                                            color: isActive ? accentColor : "var(--text-secondary)",
                                        }}
                                    >
                                        {spec.label}
                                    </span>
                                </div>
                                <span className="text-[9px] text-[var(--text-tertiary)] mt-0.5">
                                    {spec.description}
                                </span>
                                <span className="text-[8px] font-mono text-[var(--text-tertiary)] mt-0.5">
                                    {spec.width}×{spec.height} · {spec.maxChars} chars
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── PROPORÇÃO ── */}
            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
                    Proporção
                </label>
                <div className="flex gap-1.5">
                    {allowedRatios.map((r) => {
                        const isActive = aspectRatio === r;
                        return (
                            <button
                                key={r}
                                onClick={() => setAspectRatio(r)}
                                className="flex-1 flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl transition-all"
                                style={{
                                    background: isActive
                                        ? `${accentColor}18`
                                        : "rgba(255,255,255,0.03)",
                                    border: `1px solid ${isActive ? `${accentColor}50` : "rgba(255,255,255,0.07)"
                                        }`,
                                }}
                            >
                                <RatioIcon
                                    ratio={r}
                                    size={20}
                                    color={isActive ? accentColor : "var(--text-tertiary)"}
                                />
                                <span
                                    className="text-[10px] font-medium leading-none"
                                    style={{
                                        color: isActive ? accentColor : "var(--text-secondary)",
                                    }}
                                >
                                    {r}
                                </span>
                                <span className="text-[8.5px] text-[var(--text-tertiary)] leading-none">
                                    {getRatioLabel(r)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
