/**
 * CaptionBlock — Bloco de Legenda & Texto do WorkbenchV2 (Passo 4.7).
 *
 * Extrai a edição de conteúdo textual do Workbench legado:
 *  - Edição de Título (headline) e Corpo (body) do post
 *  - Edição de Legenda (caption) com contagem de caracteres
 *  - Preview de hashtags via <CaptionPreview />
 *  - Edição de Call-to-Action e controle de hashtags
 *
 * Fonte de dados: 100% Zustand.
 * O WorkbenchRefactored.tsx NÃO é alterado.
 */

import React, { useState } from "react";
import { MessageSquare, Hash, X, Plus } from "lucide-react";
import { CaptionPreview } from "@/components/ui/CaptionPreview";
import { useEditorStore } from "@/store/editorStore";

export default function CaptionBlock() {
    const activeVariation = useEditorStore((s) => s.activeVariation);
    const updateVariation = useEditorStore((s) => s.updateVariation);
    const updateSlide = useEditorStore((s) => s.updateSlide);
    const platform = useEditorStore((s) => s.platform);
    const postMode = useEditorStore((s) => s.postMode);
    const currentSlideIndex = useEditorStore((s) => s.currentSlideIndex);

    const [showPreview, setShowPreview] = useState(false);
    const [newHashtag, setNewHashtag] = useState("");

    if (!activeVariation) {
        return (
            <div className="text-[11px] text-[var(--text-tertiary)] italic text-center py-4">
                Sem post ativo
            </div>
        );
    }

    const accentColor = activeVariation.accentColor ?? "#a855f7";

    const update = (partial: Partial<typeof activeVariation>) => updateVariation(partial);

    const updateSlideText = (field: "headline" | "body", value: string) => {
        if (postMode === "carousel") {
            updateSlide(currentSlideIndex, { [field]: value });
            return;
        }

        update({ [field]: value } as Partial<typeof activeVariation>);
    };

    const addHashtag = () => {
        const tag = newHashtag.replace(/^#/, "").trim();
        if (!tag) return;
        update({ hashtags: [...(activeVariation.hashtags ?? []), tag] });
        setNewHashtag("");
    };

    const removeHashtag = (index: number) => {
        const updated = [...(activeVariation.hashtags ?? [])];
        updated.splice(index, 1);
        update({ hashtags: updated });
    };

    const inputStyle = {
        background: "var(--bg-void)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "var(--text-primary)",
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <MessageSquare size={13} className="text-[var(--text-tertiary)]" />
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                    Conteúdo & Legenda
                </label>
            </div>

            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Título
                    {activeVariation.headline && (
                        <span className="ml-2 normal-case text-[var(--text-tertiary)]">
                            {activeVariation.headline.length} chars
                        </span>
                    )}
                </label>
                <input
                    type="text"
                    value={activeVariation.headline ?? ""}
                    onChange={(e) => updateSlideText("headline", e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={inputStyle}
                    placeholder="Digite o título..."
                />
            </div>

            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Corpo
                    {activeVariation.body && (
                        <span className="ml-2 normal-case text-[var(--text-tertiary)]">
                            {activeVariation.body.length} chars
                        </span>
                    )}
                </label>
                <textarea
                    value={activeVariation.body ?? ""}
                    onChange={(e) => updateSlideText("body", e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all resize-none"
                    style={inputStyle}
                    placeholder="Digite o corpo do post..."
                />
            </div>

            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Call-to-Action
                </label>
                <input
                    type="text"
                    value={activeVariation.callToAction ?? ""}
                    onChange={(e) => update({ callToAction: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-all"
                    style={inputStyle}
                    placeholder="Ex: Saiba mais no link da bio..."
                />
            </div>

            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Legenda
                </label>
                <textarea
                    value={activeVariation.caption ?? ""}
                    onChange={(e) => update({ caption: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all resize-none"
                    style={inputStyle}
                    placeholder="Escreva a legenda para publicação..."
                />
            </div>

            <CaptionPreview
                caption={activeVariation.caption ?? ""}
                hashtags={activeVariation.hashtags ?? []}
                platform={platform}
                showPreview={showPreview}
                onTogglePreview={() => setShowPreview((v) => !v)}
                accentColor={accentColor}
            />

            <div>
                <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Hash size={11} />
                    Hashtags ({(activeVariation.hashtags ?? []).length})
                </label>

                <div className="flex flex-wrap gap-1.5 mb-2">
                    {(activeVariation.hashtags ?? []).map((tag, i) => (
                        <span
                            key={i}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{
                                background: `${accentColor}18`,
                                border: `1px solid ${accentColor}40`,
                                color: accentColor,
                            }}
                        >
                            #{tag}
                            <button
                                onClick={() => removeHashtag(i)}
                                className="hover:opacity-70 transition-opacity"
                            >
                                <X size={9} />
                            </button>
                        </span>
                    ))}
                </div>

                <div className="flex gap-1.5">
                    <input
                        type="text"
                        value={newHashtag}
                        onChange={(e) => setNewHashtag(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addHashtag()}
                        className="flex-1 px-2.5 py-1.5 rounded-lg text-xs outline-none"
                        style={inputStyle}
                        placeholder="Nova hashtag..."
                    />
                    <button
                        onClick={addHashtag}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                        style={{
                            background: `${accentColor}20`,
                            border: `1px solid ${accentColor}40`,
                            color: accentColor,
                        }}
                    >
                        <Plus size={11} />
                    </button>
                </div>
            </div>
        </div>
    );
}
