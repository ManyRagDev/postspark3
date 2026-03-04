/**
 * LayoutBlock — Bloco de Disposição do WorkbenchV2 (Passo 4.6).
 *
 * Extrai os controles técnicos de layout do Workbench legado:
 *  - Padding global (Respiro) via <PrecisionSlider />
 *  - Grid de posições 3×3 (clique para posicionar Título, Corpo, Destaque)
 *  - Seletor de "layer" alvo: headline | body | accentBar | badge | sticker
 *
 * Conectado exclusivamente ao Zustand:
 *  - Lê: layoutSettings, layoutTarget
 *  - Muta: updateLayoutSettings, setLayoutTarget
 *
 * O WorkbenchRefactored.tsx legado NÃO é alterado.
 */

import React, { useState } from "react";
import { Layout } from "lucide-react";
import type { TextPosition, TextAlignment } from "@/types/editor";
import { PrecisionSlider } from "@/components/ui/PrecisionSlider";
import { useEditorStore } from "@/store/editorStore";

// Todos os alvos de layout disponíveis
const LAYOUT_LAYERS: {
    id: "headline" | "body" | "accentBar" | "badge" | "sticker";
    label: string;
}[] = [
        { id: "headline", label: "Título" },
        { id: "body", label: "Corpo" },
        { id: "accentBar", label: "Destaque" },
        { id: "badge", label: "Badge" },
        { id: "sticker", label: "Sticker" },
    ];

// Grid 3×3 de posições
const GRID_POSITIONS: TextPosition[] = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
];

// Ícones visuais para cada posição
const POSITION_ICONS: Record<TextPosition, string> = {
    "top-left": "↖",
    "top-center": "↑",
    "top-right": "↗",
    "center-left": "←",
    "center": "•",
    "center-right": "→",
    "bottom-left": "↙",
    "bottom-center": "↓",
    "bottom-right": "↘",
};

// Opções de alinhamento de texto
const ALIGNMENT_OPTIONS: { id: TextAlignment; label: string }[] = [
    { id: "left", label: "E" },
    { id: "center", label: "C" },
    { id: "right", label: "D" },
];

export default function LayoutBlock() {
    const layoutSettings = useEditorStore((s) => s.layoutSettings);
    const updateLayoutSettings = useEditorStore((s) => s.updateLayoutSettings);
    const activeVariation = useEditorStore((s) => s.activeVariation);

    // Layer ativo é gerenciado localmente (os valores accentBar/badge/sticker
    // não são tipos válidos do Zustand global layoutTarget)
    const [activeLayer, setActiveLayer] = useState<
        "headline" | "body" | "accentBar" | "badge" | "sticker"
    >("headline");

    const accentColor = activeVariation?.accentColor ?? "#a855f7";
    const layerSettings = layoutSettings[activeLayer];

    const handlePositionClick = (pos: TextPosition) => {
        updateLayoutSettings({
            [activeLayer]: {
                ...layerSettings,
                position: pos,
                // Limpa freePosition ao usar grid
                freePosition: undefined,
            },
        });
    };

    const handleAlignmentClick = (align: TextAlignment) => {
        updateLayoutSettings({
            [activeLayer]: {
                ...layerSettings,
                textAlign: align,
            },
        });
    };

    return (
        <div className="space-y-4">
            {/* ── Cabeçalho ── */}
            <div className="flex items-center gap-2">
                <Layout size={13} className="text-[var(--text-tertiary)]" />
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                    Disposição
                </label>
            </div>

            {/* ── Disposição (Presets) ── */}
            <div className="grid grid-cols-2 gap-1.5">
                {[
                    { value: 'centered' as const, label: 'Centralizado', description: 'Texto no centro', icon: '◎' },
                    { value: 'left-aligned' as const, label: 'Lateral', description: 'Texto na base', icon: '☰' },
                    { value: 'split' as const, label: 'Bipartido', description: 'Imagem + texto', icon: '⬒' },
                    { value: 'minimal' as const, label: 'Minimal', description: 'Só headline', icon: '○' },
                ].map((opt) => {
                    const isActive = activeVariation?.layout === opt.value;
                    return (
                        <button
                            key={opt.value}
                            onClick={() => {
                                const { updateVariation } = useEditorStore.getState();
                                updateVariation({ layout: opt.value });
                            }}
                            className="flex flex-col items-center justify-center gap-1 min-h-[64px] rounded-lg transition-all group"
                            style={{
                                background: isActive ? `${accentColor}10` : 'var(--bg-void)',
                                border: `1px solid ${isActive ? `${accentColor}30` : 'rgba(255, 255, 255, 0.06)'}`,
                                color: isActive ? accentColor : 'var(--text-tertiary)',
                            }}
                        >
                            <span className="text-xl leading-none">{opt.icon}</span>
                            <span className="text-[10px] font-medium">{opt.label}</span>
                            <span className="text-[8px] opacity-60">{opt.description}</span>
                        </button>
                    )
                })}
            </div>

            {/* ── Seletor de posição da imagem — visível apenas no layout Bipartido ── */}
            {activeVariation?.layout === 'split' && (
                <div className="pt-1">
                    <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block">
                        Imagem em
                    </label>
                    <div className="flex gap-1.5">
                        {[
                            { value: 'top' as const, icon: '⬆', label: 'Cima' },
                            { value: 'bottom' as const, icon: '⬇', label: 'Baixo' },
                        ].map((opt) => {
                            const isActive = (activeVariation.splitImagePosition ?? 'top') === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    onClick={() => {
                                        const { updateVariation } = useEditorStore.getState();
                                        updateVariation({ splitImagePosition: opt.value })
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all"
                                    style={{
                                        background: isActive ? `${accentColor}15` : 'var(--bg-void)',
                                        border: `1px solid ${isActive ? `${accentColor}40` : 'rgba(255,255,255,0.06)'}`,
                                        color: isActive ? accentColor : 'var(--text-tertiary)',
                                    }}
                                >
                                    <span>{opt.icon}</span>
                                    <span>{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Respiro (Padding) ── */}
            <PrecisionSlider
                label="Respiro (Padding)"
                value={layoutSettings.padding}
                min={0}
                max={80}
                step={2}
                unit="px"
                onChange={(v) => updateLayoutSettings({ padding: v })}
            />

            {/* ── Seletor de Layer ── */}
            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Elemento
                </label>
                <div className="flex flex-wrap gap-1">
                    {LAYOUT_LAYERS.map(({ id, label }) => {
                        const isActive = activeLayer === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setActiveLayer(id)}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all"
                                style={{
                                    background: isActive ? `${accentColor}18` : "rgba(255,255,255,0.03)",
                                    border: `1px solid ${isActive ? `${accentColor}50` : "rgba(255,255,255,0.07)"}`,
                                    color: isActive ? accentColor : "var(--text-secondary)",
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Grid 3×3 de Posições ── */}
            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Posição — {activeLayer}
                </label>
                <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
                >
                    {GRID_POSITIONS.map((pos) => {
                        const isActive = layerSettings?.position === pos;
                        return (
                            <button
                                key={pos}
                                onClick={() => handlePositionClick(pos)}
                                title={pos}
                                className="aspect-square flex items-center justify-center rounded-lg text-base transition-all"
                                style={{
                                    background: isActive ? `${accentColor}22` : "rgba(255,255,255,0.03)",
                                    border: `1px solid ${isActive ? `${accentColor}60` : "rgba(255,255,255,0.07)"}`,
                                    color: isActive ? accentColor : "var(--text-tertiary)",
                                    fontWeight: isActive ? "700" : "400",
                                }}
                            >
                                {POSITION_ICONS[pos]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Alinhamento de Texto ── */}
            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Alinhamento de Texto
                </label>
                <div className="flex gap-1">
                    {ALIGNMENT_OPTIONS.map(({ id, label }) => {
                        const isActive = (layerSettings?.textAlign ?? "left") === id;
                        return (
                            <button
                                key={id}
                                onClick={() => handleAlignmentClick(id)}
                                className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                                style={{
                                    background: isActive ? `${accentColor}18` : "rgba(255,255,255,0.03)",
                                    border: `1px solid ${isActive ? `${accentColor}50` : "rgba(255,255,255,0.07)"}`,
                                    color: isActive ? accentColor : "var(--text-secondary)",
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Largura do bloco ── */}
            <PrecisionSlider
                label={`Largura — ${activeLayer}`}
                value={layerSettings?.width ?? 76}
                min={10}
                max={100}
                step={1}
                unit="%"
                onChange={(v) =>
                    updateLayoutSettings({
                        [activeLayer]: { ...layerSettings, width: v },
                    })
                }
            />
        </div>
    );
}
