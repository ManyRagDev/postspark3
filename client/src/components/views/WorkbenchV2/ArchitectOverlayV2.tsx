import type React from "react";
import { useEditorStore } from "@/store/editorStore";
import { DraggableBlock, resolveLayoutStyle } from "@/components/canvas/DraggableBlock";
import type { ContentSection, PostTemplate } from "@shared/postspark";
import type { LayoutPosition } from "@/types/editor";

// Elementos auxiliares replicados ou exportados do PostCard
function AccentBar({ color, width = "3rem", height = "3px", align = "flex-start", style }: {
    color: string;
    width?: string | number;
    height?: string;
    align?: "flex-start" | "center" | "flex-end";
    style?: React.CSSProperties;
}) {
    return (
        <div
            className="rounded-full shrink-0"
            style={{
                width: typeof width === 'number' ? `${width}%` : width,
                height,
                background: color,
                alignSelf: align,
                ...style,
            }}
        />
    );
}

// O TemplateSections no ArchitectOverlayV2 apenas serve para visualizar enquanto arrasta o Body.
// Simplificado para evitar a importação de todos os ícones Lucide da TemplateSections completa.
// Na V2 o post card real (embaixo) já tem a TemplateSections. Aqui no DraggableBlock o "body" engloba tudo.
function GhostTemplateSections({ template, sections, accentColor, textColor, bodyFont }: {
    template?: PostTemplate;
    sections?: ContentSection[];
    accentColor: string;
    textColor: string;
    bodyFont: string;
}) {
    if (!template || template === 'simple' || !sections?.length) return null;
    return (
        <div className="mt-3 opacity-50 flex flex-col gap-2" style={{ fontFamily: bodyFont, color: textColor }}>
            <div className="text-[0.6rem] uppercase tracking-wider">[{template} context...]</div>
            {sections.slice(0, 3).map((s, i) => (
                <div key={i} className="text-[0.7rem] leading-tight truncate">{s.label}</div>
            ))}
        </div>
    );
}

interface ArchitectOverlayV2Props {
    cardRef: React.RefObject<HTMLDivElement | null>;
    snapEnabled?: boolean;
    badgeNode?: React.ReactNode;
    stickerNode?: React.ReactNode;

    // Props recebidas do PostCardV2 para cores/tipografia resolvidas (já com tema misturado)
    effectiveText: string;
    headlineTextColor: string;
    bodyTextColor: string;
    accentColor: string;
    headingFont: string;
    bodyFont: string;
    headingSize: string;
    bodySize: string;
    isPlayful?: boolean;
}

export default function ArchitectOverlayV2({
    cardRef,
    snapEnabled = true,
    badgeNode,
    stickerNode,
    effectiveText,
    headlineTextColor,
    bodyTextColor,
    accentColor,
    headingFont,
    bodyFont,
    headingSize,
    bodySize,
    isPlayful
}: ArchitectOverlayV2Props) {
    const {
        activeVariation,
        layoutSettings,
        updateLayoutSettings,
        setLayoutTarget,
        isMagnetActive,
    } = useEditorStore();

    if (!activeVariation || !layoutSettings) return null;

    const al = layoutSettings;
    const { headline, body, template, sections } = activeVariation;

    const handleDragPosition = (target: "headline" | "body" | "accentBar" | "badge" | "sticker", x: number, y: number) => {
        let finalX = x;
        let finalY = y;

        if (isMagnetActive) {
            // Snap para grid 5x5 (em steps de 25%: 0%, 25%, 50%, 75%, 100%)
            const STEP = 25;
            finalX = Math.max(0, Math.min(100, Math.round(x / STEP) * STEP));
            finalY = Math.max(0, Math.min(100, Math.round(y / STEP) * STEP));
        }

        updateLayoutSettings({
            [target]: { ...al[target], freePosition: { x: finalX, y: finalY } }
        });
    };

    const handleResizeBlock = (target: "headline" | "body" | "accentBar" | "badge" | "sticker", width: number) => {
        updateLayoutSettings({
            [target]: { ...al[target], width }
        });
    };

    const handleSelectElement = (target: "headline" | "body" | "accentBar" | "card" | "badge" | "sticker" | "global") => {
        // Only update targets that we support
        if (target === 'headline' || target === 'body') {
            setLayoutTarget(target);
        } else {
            setLayoutTarget('global');
        }
    };

    return (
        <>
            {al.accentBar && (
                <DraggableBlock
                    layoutPos={al.accentBar}
                    padding={al.padding}
                    containerRef={cardRef}
                    onDragEnd={(x, y) => handleDragPosition("accentBar", x, y)}
                    onResize={(w) => handleResizeBlock("accentBar", w)}
                    onSelect={() => handleSelectElement("accentBar")}
                    snapEnabled={snapEnabled}
                    accentColor={accentColor}
                >
                    <AccentBar color={accentColor} width="100%" />
                </DraggableBlock>
            )}

            {al.headline && (
                <DraggableBlock
                    layoutPos={al.headline}
                    padding={al.padding}
                    containerRef={cardRef}
                    onDragEnd={(x, y) => handleDragPosition("headline", x, y)}
                    onResize={(w) => handleResizeBlock("headline", w)}
                    onSelect={() => handleSelectElement("headline")}
                    snapEnabled={snapEnabled}
                    accentColor={effectiveText}
                >
                    <h2
                        className="font-bold"
                        style={{
                            color: headlineTextColor,
                            fontFamily: headingFont,
                            fontSize: headingSize,
                            lineHeight: 1.22,
                            textAlign: al.headline.textAlign,
                            whiteSpace: "pre-wrap",
                            overflowWrap: "break-word",
                            width: "100%",
                        }}
                    >
                        {headline}
                    </h2>
                </DraggableBlock>
            )}

            {al.body && (body || (sections && sections.length > 0)) && (
                <DraggableBlock
                    layoutPos={al.body}
                    padding={al.padding}
                    containerRef={cardRef}
                    onDragEnd={(x, y) => handleDragPosition("body", x, y)}
                    onResize={(w) => handleResizeBlock("body", w)}
                    onSelect={() => handleSelectElement("body")}
                    snapEnabled={snapEnabled}
                    accentColor={effectiveText}
                >
                    <div className="flex flex-col gap-3 w-full">
                        {body && (
                            <p
                                style={{
                                    color: bodyTextColor,
                                    fontFamily: bodyFont,
                                    fontSize: bodySize,
                                    lineHeight: 1.65,
                                    opacity: 0.85,
                                    textAlign: al.body.textAlign,
                                    whiteSpace: "pre-wrap",
                                    overflowWrap: "break-word",
                                    width: "100%",
                                }}
                            >
                                {body}
                            </p>
                        )}
                        <GhostTemplateSections
                            template={template}
                            sections={sections}
                            accentColor={accentColor}
                            textColor={bodyTextColor}
                            bodyFont={bodyFont}
                        />
                    </div>
                </DraggableBlock>
            )}

            {al.badge && badgeNode && (
                <DraggableBlock
                    layoutPos={al.badge}
                    padding={al.padding}
                    containerRef={cardRef}
                    onDragEnd={(x, y) => handleDragPosition("badge", x, y)}
                    onResize={(w) => handleResizeBlock("badge", w)}
                    onSelect={() => handleSelectElement("badge")}
                    snapEnabled={snapEnabled}
                    accentColor={accentColor}
                >
                    <div className={`w-full flex ${al.badge.textAlign === 'center' ? 'justify-center' : al.badge.textAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                        {badgeNode}
                    </div>
                </DraggableBlock>
            )}

            {al.sticker && stickerNode && (
                <DraggableBlock
                    layoutPos={al.sticker}
                    padding={al.padding}
                    containerRef={cardRef}
                    onDragEnd={(x, y) => handleDragPosition("sticker", x, y)}
                    onResize={(w) => handleResizeBlock("sticker", w)}
                    onSelect={() => handleSelectElement("sticker")}
                    snapEnabled={snapEnabled}
                    accentColor={accentColor}
                >
                    <div className={`w-full flex items-center ${al.sticker.textAlign === 'center' ? 'justify-center' : al.sticker.textAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                        {stickerNode}
                    </div>
                </DraggableBlock>
            )}
        </>
    );
}
