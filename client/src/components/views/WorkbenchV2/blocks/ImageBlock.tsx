/**
 * ImageBlock — Bloco de Imagem & Fundo do WorkbenchV2 (Passo 4.5).
 *
 * Extrai a seção de Fundo, Overlay e Calibração Fotográfica do Workbench legado.
 *
 * Responsabilidades:
 *  - Seletor de tipo de fundo: Nenhum | Galeria | Cor Sólida | Upload
 *  - <BackgroundGallery /> para seleção do fundo por categoria
 *  - Controles de sobreposição (overlay): cor + opacidade
 *  - Calibração fotográfica com <PrecisionSlider />: Zoom, Pan X/Y, Brilho, Contraste, Saturação, Blur
 *
 * Fonte de dados: 100% Zustand (setBgValue, setBgOverlay, updateImageSettings).
 * O WorkbenchRefactored.tsx legado NÃO é alterado.
 */

import React, { useRef } from "react";
import { ImagePlus, Save, X } from "lucide-react";
import type { BackgroundValue } from "@shared/postspark";
import { BackgroundGallery } from "@/components/ui/BackgroundGallery";
import { PrecisionSlider } from "@/components/ui/PrecisionSlider";
import { useEditorStore } from "@/store/editorStore";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Tabs de fonte do fundo
const BG_TABS: { id: BackgroundValue["type"]; label: string; icon: string }[] = [
    { id: "none", label: "Nenhum", icon: "✕" },
    { id: "ai", label: "IA", icon: "✨" },
    { id: "gallery", label: "Galeria", icon: "🖼" },
    { id: "solid", label: "Cor", icon: "🎨" },
    { id: "upload", label: "Upload", icon: "⬆" },
];

interface ImageBlockProps {
    onGenerateImage?: (prompt: string, provider: 'pollinations_fast' | 'pollinations_hd') => Promise<string>;
    isGenerating?: boolean;
}

export default function ImageBlock({ onGenerateImage, isGenerating = false }: ImageBlockProps) {
    const bgValue = useEditorStore((s) => s.bgValue);
    const bgOverlay = useEditorStore((s) => s.bgOverlay);
    const imageSettings = useEditorStore((s) => s.imageSettings);
    const setBgValue = useEditorStore((s) => s.setBgValue);
    const setBgOverlay = useEditorStore((s) => s.setBgOverlay);
    const updateImageSettings = useEditorStore((s) => s.updateImageSettings);
    const activeVariation = useEditorStore((s) => s.activeVariation);
    const utils = trpc.useUtils();

    const [imageProvider, setImageProvider] = React.useState<'pollinations_fast' | 'pollinations_hd'>('pollinations_fast');
    const [aiPrompt, setAiPrompt] = React.useState(activeVariation?.imagePrompt || "");
    const saveBackgroundMutation = trpc.post.saveBackgroundAsset.useMutation({
        onSuccess: async () => {
            await utils.post.listSavedBackgrounds.invalidate();
            toast.success("Background salvo na sua biblioteca.");
        },
        onError: (error) => {
            toast.error(error.message || "Não foi possível salvar o background.");
        },
    });

    React.useEffect(() => {
        if (activeVariation?.imagePrompt) {
            setAiPrompt(activeVariation.imagePrompt);
        }
    }, [activeVariation?.imagePrompt]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const accentColor = activeVariation?.accentColor ?? "#a855f7";
    const [activeTab, setActiveTab] = React.useState<BackgroundValue["type"]>(bgValue.type);

    // Manipulador de upload de imagem
    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const url = ev.target?.result as string;
            setBgValue({ type: "upload", url });
        };
        reader.readAsDataURL(file);
    };

    const handleGenerate = async () => {
        if (!onGenerateImage || !aiPrompt.trim() || isGenerating) return;
        await onGenerateImage(aiPrompt, imageProvider);
    };

    const handleSaveBackground = async () => {
        if (!bgValue.url || saveBackgroundMutation.isPending) return;
        await saveBackgroundMutation.mutateAsync({
            imageUrl: bgValue.url,
            sourceType: bgValue.type === "upload" ? "upload" : bgValue.type === "gallery" ? "gallery" : "ai",
            prompt: activeTab === "ai" ? aiPrompt : activeVariation?.imagePrompt,
            label: activeTab === "ai" ? "Background IA" : activeTab === "upload" ? "Upload salvo" : "Background salvo",
        });
    };

    return (
        <div className="space-y-4">
            {/* ── Cabeçalho ── */}
            <div className="flex items-center gap-2">
                <ImagePlus size={13} className="text-[var(--text-tertiary)]" />
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                    Imagem & Fundo
                </label>
            </div>

            {/* ── Tabs de tipo de fundo ── */}
            <div className="grid grid-cols-4 gap-1">
                {BG_TABS.map(({ id, label, icon }) => {
                    const isActive = activeTab === id;
                    return (
                        <button
                            key={id}
                            onClick={() => {
                                setActiveTab(id);
                                if (id === "none") {
                                    setBgValue({ type: "none" });
                                }
                            }}
                            className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg text-[10px] font-medium transition-all"
                            style={{
                                background: isActive ? `${accentColor}18` : "rgba(255,255,255,0.03)",
                                border: `1px solid ${isActive ? `${accentColor}50` : "rgba(255,255,255,0.07)"}`,
                                color: isActive ? accentColor : "var(--text-secondary)",
                            }}
                        >
                            <span>{icon}</span>
                            <span>{label}</span>
                        </button>
                    );
                })}
            </div>

            {/* ── Conteúdo por tipo ── */}

            {/* IA Generation */}
            {activeTab === "ai" && (
                <div className="space-y-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="space-y-1.5">
                        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider ml-1">
                            Modelo de IA
                        </label>
                        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-black/20 border border-white/5">
                            <button
                                onClick={() => setImageProvider('pollinations_fast')}
                                className={`py-1.5 rounded text-[10px] font-medium transition-all ${imageProvider === 'pollinations_fast' ? 'bg-white/10 text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                            >
                                Básico (Fast)
                            </button>
                            <button
                                onClick={() => setImageProvider('pollinations_hd')}
                                className={`py-1.5 rounded text-[10px] font-medium transition-all ${imageProvider === 'pollinations_hd' ? 'bg-white/10 text-[var(--text-primary)] border border-white/10' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                            >
                                Pro (HD)
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider ml-1">
                            O que deseja criar?
                        </label>
                        <textarea
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            placeholder="Ex: Praia paradisíaca ao pôr do sol..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-[var(--text-primary)] min-h-[60px] resize-none focus:border-[var(--accent-primary)] focus:outline-none transition-all"
                            style={{ "--accent-primary": accentColor } as any}
                        />
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !aiPrompt.trim()}
                        className="w-full py-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2"
                        style={{
                            background: isGenerating ? 'rgba(255,255,255,0.05)' : accentColor,
                            color: isGenerating ? 'var(--text-tertiary)' : '#fff',
                            cursor: isGenerating ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {isGenerating ? (
                            <>
                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Gerando...
                            </>
                        ) : (
                            'Gerar com IA'
                        )}
                    </button>

                    {bgValue.type === "ai" && bgValue.url && activeTab === "ai" && (
                        <div className="relative rounded-lg overflow-hidden aspect-video border border-white/10">
                            <img
                                src={bgValue.url}
                                alt="Fundo gerado"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Galeria */}
            {activeTab === "gallery" && (
                <BackgroundGallery
                    selectedUrl={bgValue.url}
                    accentColor={accentColor}
                    onSelect={(url) => setBgValue({ type: "gallery", url })}
                />
            )}

            {/* Cor sólida */}
            {activeTab === "solid" && (
                <div className="flex items-center gap-3">
                    <input
                        type="color"
                        value={bgValue.color ?? "#1a1a2e"}
                        onChange={(e) => setBgValue({ type: "solid", color: e.target.value })}
                        className="w-9 h-9 rounded-lg border border-white/10 cursor-pointer bg-transparent"
                    />
                    <input
                        type="text"
                        value={bgValue.color ?? "#1a1a2e"}
                        onChange={(e) => setBgValue({ type: "solid", color: e.target.value })}
                        className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[var(--text-primary)] text-xs font-mono uppercase"
                        maxLength={9}
                        placeholder="#1a1a2e"
                    />
                </div>
            )}

            {/* Upload */}
            {activeTab === "upload" && (
                <div className="flex flex-col gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUpload}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-xs font-medium transition-all"
                        style={{
                            background: `${accentColor}12`,
                            border: `1px dashed ${accentColor}40`,
                            color: accentColor,
                        }}
                    >
                        <ImagePlus size={14} />
                        Selecionar imagem
                    </button>
                    {bgValue.type === "upload" && bgValue.url && (
                        <div className="relative rounded-lg overflow-hidden aspect-video border border-white/10">
                            <img
                                src={bgValue.url}
                                alt="Fundo selecionado"
                                className="w-full h-full object-cover"
                            />
                            <button
                                onClick={() => setBgValue({ type: "none" })}
                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                            >
                                <X size={10} color="#fff" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Overlay (só quando há imagem) ── */}
            {(activeTab === "gallery" || activeTab === "upload" || activeTab === "ai") &&
                bgValue.type === activeTab &&
                bgValue.url && (
                    <button
                        onClick={handleSaveBackground}
                        disabled={saveBackgroundMutation.isPending}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all disabled:opacity-50"
                        style={{
                            borderColor: `${accentColor}40`,
                            background: `${accentColor}12`,
                            color: accentColor,
                        }}
                    >
                        <Save size={12} />
                        {saveBackgroundMutation.isPending ? "Salvando..." : "Salvar na biblioteca"}
                    </button>
                )}

            {(activeTab === "gallery" || activeTab === "upload" || activeTab === "ai") &&
                bgValue.type === activeTab &&
                bgValue.url && (
                    <div className="space-y-3 pt-2 border-t border-white/5">
                        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block">
                            Sobreposição
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={bgOverlay.color}
                                onChange={(e) => setBgOverlay({ color: e.target.value })}
                                className="w-7 h-7 rounded border border-white/10 cursor-pointer bg-transparent"
                            />
                            <div className="flex-1">
                                <PrecisionSlider
                                    label="Opacidade"
                                    value={bgOverlay.opacity}
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    formatValue={(v) => `${Math.round(v * 100)}%`}
                                    onChange={(v) => setBgOverlay({ opacity: v })}
                                />
                            </div>
                        </div>
                    </div>
                )}

            {/* ── Calibração Fotográfica (só quando há imagem) ── */}
            {(activeTab === "gallery" || activeTab === "upload" || activeTab === "ai") &&
                bgValue.type === activeTab &&
                bgValue.url && (
                    <div className="space-y-3 pt-2 border-t border-white/5">
                        <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider block">
                            Calibração da Imagem
                        </label>

                        <PrecisionSlider
                            label="Zoom"
                            value={imageSettings.zoom}
                            min={0.5}
                            max={3.0}
                            step={0.05}
                            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
                            onChange={(v) => updateImageSettings({ zoom: v })}
                        />
                        <PrecisionSlider
                            label="Pan X"
                            value={imageSettings.panX}
                            min={0}
                            max={100}
                            step={1}
                            unit="%"
                            onChange={(v) => updateImageSettings({ panX: v })}
                        />
                        <PrecisionSlider
                            label="Pan Y"
                            value={imageSettings.panY}
                            min={0}
                            max={100}
                            step={1}
                            unit="%"
                            onChange={(v) => updateImageSettings({ panY: v })}
                        />
                        <PrecisionSlider
                            label="Brilho"
                            value={imageSettings.brightness}
                            min={0}
                            max={2}
                            step={0.05}
                            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
                            onChange={(v) => updateImageSettings({ brightness: v })}
                        />
                        <PrecisionSlider
                            label="Contraste"
                            value={imageSettings.contrast}
                            min={0}
                            max={2}
                            step={0.05}
                            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
                            onChange={(v) => updateImageSettings({ contrast: v })}
                        />
                        <PrecisionSlider
                            label="Saturação"
                            value={imageSettings.saturation}
                            min={0}
                            max={2}
                            step={0.05}
                            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
                            onChange={(v) => updateImageSettings({ saturation: v })}
                        />
                        <PrecisionSlider
                            label="Blur"
                            value={imageSettings.blur}
                            min={0}
                            max={20}
                            step={0.5}
                            unit="px"
                            onChange={(v) => updateImageSettings({ blur: v })}
                        />
                    </div>
                )}
        </div>
    );
}
