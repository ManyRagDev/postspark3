/**
 * PostCard — visual de post para redes sociais.
 *
 * Três proporções com diagramações distintas:
 *  • 1:1  — quadrado (Instagram feed): texto na base, fonte compacta
 *  • 5:6  — retrato (feed portrait): texto na base, fonte média
 *  • 9:16 — story/reels: diagramação própria de story, texto centralizado
 *            verticalmente, sem line-clamp, texto completo sempre visível
 *
 * Props extras (editor avançado):
 *  • imageSettings — filtros CSS na imagem (zoom, brilho, contraste, etc.)
 *  • advancedLayout — posicionamento absoluto headline/body no grid 3×3
 *
 * O texto ajusta automaticamente ao mudar de aspect ratio:
 *  - Tamanho da fonte recalculado
 *  - Line-clamp dinâmico para evitar overflow
 *  - Padding otimizado para cada formato
 *
 * ArchitectOverlay:
 *  - Quando `advancedLayout` está presente, TODOS os layouts usam esta camada.
 *  - O overlay é position:absolute e inset:0, garantindo que as 9 posições
 *    sejam relativas ao card inteiro, independente do layout de fundo.
 */

import type React from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { Layers } from "lucide-react";
import type { PostVariation, AspectRatio, BackgroundValue, BgOverlaySettings } from "@shared/postspark";
import { ASPECT_RATIO_VALUES } from "@shared/postspark";
import type { ThemeConfig } from "@/lib/themes";
import type { ImageSettings, AdvancedLayoutSettings, TextPosition } from "@/types/editor";
import ThemeRenderer from "./ThemeRenderer";
import { useTextAutoFit } from "@/hooks/useTextAutoFit";
import { useDragElement } from "@/hooks/useDragElement";
import { useResizeElement } from "@/hooks/useResizeElement";

// --- TextCanvas Imports ---
import { AdvancedTextNode } from "@/components/canvas/AdvancedTextNode";

interface PostCardProps {
  variation: PostVariation;
  compact?: boolean;
  theme?: ThemeConfig;
  aspectRatio?: AspectRatio;
  imageSettings?: ImageSettings;
  advancedLayout?: AdvancedLayoutSettings;
  bgValue?: BackgroundValue;
  bgOverlay?: BgOverlaySettings;
  showOverflowWarning?: boolean;
  /** When true, variation colors take priority over theme colors (used in Workbench editor) */
  forceVariationColors?: boolean;
  /** Callback para atualizar posição de texto via drag direto no card (modo Arquiteto) */
  onDragPosition?: (target: "headline" | "body" | "accentBar", x: number, y: number) => void;
  /** Callback para atualizar largura do bloco via resize handles (modo Arquiteto) */
  onResizeBlock?: (target: "headline" | "body" | "accentBar", width: number) => void;
  /** Se o snap magnético está ativo (usado junto com onDragPosition) */
  snapEnabled?: boolean;
}

// ─── AccentBar Component ─────────────────────────────────────────────────────
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

// ─── Mapeamento TextPosition → CSSProperties ─────────────────────────────────
function resolvePosition(
  rawPosition: TextPosition | string,
  padding: number
): React.CSSProperties {
  const p = padding;
  // Normalize legacy / malformed 'center-center' → 'center'
  const position = rawPosition === "center-center" ? "center" : (rawPosition as TextPosition);
  // All positions use left+top+transform to keep box anchoring consistent.
  // This prevents visual alignment shifts when dragging between positions.
  switch (position) {
    case "top-left":
      return { top: p, left: `${p}px` };
    case "top-center":
      return { top: p, left: "50%", transform: "translateX(-50%)" };
    case "top-right":
      return { top: p, left: `calc(100% - ${p}px)`, transform: "translateX(-100%)" };
    case "center-left":
      return { top: "50%", left: `${p}px`, transform: "translateY(-50%)" };
    case "center":
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    case "center-right":
      return { top: "50%", left: `calc(100% - ${p}px)`, transform: "translate(-100%, -50%)" };
    case "bottom-left":
      return { top: `calc(100% - ${p}px)`, left: `${p}px`, transform: "translateY(-100%)" };
    case "bottom-center":
      return { top: `calc(100% - ${p}px)`, left: "50%", transform: "translate(-50%, -100%)" };
    case "bottom-right":
      return { top: `calc(100% - ${p}px)`, left: `calc(100% - ${p}px)`, transform: "translate(-100%, -100%)" };
    default:
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
}

// ─── ArchitectOverlay ─────────────────────────────────────────────────────────
// A unified positioned layer that renders headline + body at absolute positions.
// It is always positioned relative to the card root (inset: 0),
// ensuring consistent behavior across ALL layouts and aspect ratios.
// Quando onDragPosition é fornecido, o texto se torna diretamente arrastável (Canva-like).
interface ArchitectOverlayProps {
  al: AdvancedLayoutSettings;
  headline: string;
  body?: string;
  effectiveText: string;       // cor base (fallback)
  headlineTextColor: string;   // cor do título (pode ser igual a effectiveText)
  bodyTextColor: string;       // cor do corpo (pode ser igual a effectiveText)
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  headingSize: string;
  bodySize: string;
  cardRef: React.RefObject<HTMLElement | null>;
  onDragPosition?: (target: "headline" | "body" | "accentBar", x: number, y: number) => void;
  onResizeBlock?: (target: "headline" | "body" | "accentBar", width: number) => void;
  snapEnabled?: boolean;
}

// Grid de 3×3 para snap visual durante drag
const GRID_SNAP_POSITIONS = [
  { cx: 10, cy: 10 }, { cx: 50, cy: 10 }, { cx: 90, cy: 10 },
  { cx: 10, cy: 50 }, { cx: 50, cy: 50 }, { cx: 90, cy: 50 },
  { cx: 10, cy: 90 }, { cx: 50, cy: 90 }, { cx: 90, cy: 90 },
];

function resolveLayoutStyle(
  lp: import("@/types/editor").LayoutPosition,
  padding: number,
): React.CSSProperties {
  if (lp.freePosition) {
    // FIX Bug 4 — Respiro (padding) tem efeito mesmo com freePosition.
    // Converte padding de px para % (assumindo card ~360px) e aplica como clamp nas bordas,
    // garantindo que os blocos de texto nunca ultrapassem a margem de segurança definida pelo slider.
    const paddingPct = (padding / 360) * 100;
    const halfBlock = 5; // estimativa de metade da largura de um bloco médio em %
    const minX = paddingPct + halfBlock;
    const maxX = 100 - paddingPct - halfBlock;
    const minY = paddingPct + halfBlock;
    const maxY = 100 - paddingPct - halfBlock;
    const clampedX = Math.max(minX, Math.min(maxX, lp.freePosition.x));
    const clampedY = Math.max(minY, Math.min(maxY, lp.freePosition.y));
    return {
      left: `${clampedX}%`,
      top: `${clampedY}%`,
      transform: "translate(-50%, -50%)",
    };
  }
  return resolvePosition(lp.position, padding);
}

// ─── DraggableTextBlock ───────────────────────────────────────────────────────
// Bloco de texto arrastável com:
//  • Clique único → seleciona (mostra bounding box + 8 alças de resize)
//  • Drag no texto → move o bloco
//  • Drag nas alças de aresta/canto → redimensiona (largura em %)
//  • Clique fora → desseleciona

interface DraggableTextBlockProps {
  layoutPos: import("@/types/editor").LayoutPosition;
  padding: number;
  cardRef: React.RefObject<HTMLElement | null>;
  onDragEnd: (x: number, y: number) => void;
  onResize: (width: number) => void;
  snapEnabled: boolean;
  children: React.ReactNode;
  accentColor?: string;
}

// Alças de redimensionamento: 4 cantos + 4 pontos médios das arestas
// cx/cy em % relativo ao bounding box do bloco (0=esquerda/topo, 100=direita/baixo)
const HANDLES = [
  { id: "tl", cx: 0, cy: 0, cursor: "nw-resize", dir: "left" as const },
  { id: "tm", cx: 50, cy: 0, cursor: "n-resize", dir: "right" as const }, // vertical — ignorado no resize
  { id: "tr", cx: 100, cy: 0, cursor: "ne-resize", dir: "right" as const },
  { id: "ml", cx: 0, cy: 50, cursor: "ew-resize", dir: "left" as const },
  { id: "mr", cx: 100, cy: 50, cursor: "ew-resize", dir: "right" as const },
  { id: "bl", cx: 0, cy: 100, cursor: "sw-resize", dir: "left" as const },
  { id: "bm", cx: 50, cy: 100, cursor: "s-resize", dir: "right" as const },
  { id: "br", cx: 100, cy: 100, cursor: "se-resize", dir: "right" as const },
] as const;

function DraggableTextBlock({
  layoutPos,
  padding,
  cardRef,
  onDragEnd,
  onResize,
  snapEnabled,
  children,
  accentColor = "rgba(255,255,255,0.8)",
}: DraggableTextBlockProps) {
  const [isSelected, setIsSelected] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);

  // Largura efectiva: usa layoutPos.width se salvo, senão 76% (padrão)
  const currentWidth = layoutPos.width ?? 76;

  const { isDragging, dragPos, handlers } = useDragElement({
    containerRef: cardRef,
    onDragEnd,
  });

  const { isResizing, previewWidth, startResize } = useResizeElement({
    containerRef: cardRef,
    initialWidth: currentWidth,
    onResizeEnd: onResize,
  });

  // Desselecionar ao clicar fora do bloco
  useEffect(() => {
    if (!isSelected) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (blockRef.current && !blockRef.current.contains(e.target as Node)) {
        setIsSelected(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSelected]);

  // Largura visual durante resize usa previewWidth; senão usa currentWidth
  const effectiveWidth = isResizing && previewWidth !== null ? previewWidth : currentWidth;

  // Posição visual durante drag usa dragPos; caso contrário usa layoutPos
  const currentStyle: React.CSSProperties = isDragging && dragPos
    ? { left: `${dragPos.x}%`, top: `${dragPos.y}%`, transform: "translate(-50%, -50%)" }
    : resolveLayoutStyle(layoutPos, padding);

  // Célula de snap mais próxima durante drag (para mostrar guia)
  const snapTarget = isDragging && dragPos && snapEnabled
    ? GRID_SNAP_POSITIONS.reduce((best, cell) => {
      const d = Math.hypot(dragPos.x - cell.cx, dragPos.y - cell.cy);
      const bd = Math.hypot(dragPos.x - best.cx, dragPos.y - best.cy);
      return d < bd ? cell : best;
    }, GRID_SNAP_POSITIONS[0])
    : null;

  // Cor do bounding box e alças (derivada do accentColor com opacidade)
  const handleBg = "rgba(255,255,255,1)";
  const boxBorder = `${accentColor}90`;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Não inicia move drag se clicou numa alça de resize
      if ((e.target as HTMLElement).dataset.handle) return;
      (handlers as { onPointerDown: React.PointerEventHandler<HTMLElement> }).onPointerDown(
        e as React.PointerEvent<HTMLElement>
      );
    },
    [handlers]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      (handlers as { onPointerMove: React.PointerEventHandler<HTMLElement> }).onPointerMove(e);
    },
    [handlers]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      (handlers as { onPointerUp: React.PointerEventHandler<HTMLElement> }).onPointerUp(e);
    },
    [handlers]
  );

  return (
    <>
      {/* Guias de grid durante drag com snap ativo */}
      {isDragging && snapEnabled && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          {[10, 50, 90].map((y) => (
            <div key={`h${y}`} className="absolute left-0 right-0" style={{
              top: `${y}%`, height: "1px",
              background: `${accentColor}30`, borderTop: `1px dashed ${accentColor}40`,
            }} />
          ))}
          {[10, 50, 90].map((x) => (
            <div key={`v${x}`} className="absolute top-0 bottom-0" style={{
              left: `${x}%`, width: "1px",
              background: `${accentColor}30`, borderLeft: `1px dashed ${accentColor}40`,
            }} />
          ))}
          {snapTarget && (
            <div className="absolute rounded-lg" style={{
              left: `${snapTarget.cx}%`, top: `${snapTarget.cy}%`,
              transform: "translate(-50%, -50%)",
              width: "48px", height: "24px",
              background: `${accentColor}25`, border: `1.5px dashed ${accentColor}70`,
            }} />
          )}
        </div>
      )}

      {/* Bloco de texto — arrastável + selecionável */}
      <div
        ref={blockRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={() => !isDragging && setIsSelected(true)}
        className="absolute z-20 select-none"
        style={{
          ...currentStyle,
          width: `${effectiveWidth}%`,
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
          // Bounding box leve quando selecionado ou em drag
          outline: (isSelected || isDragging || isResizing)
            ? `1.5px solid ${boxBorder}`
            : "none",
          outlineOffset: "3px",
          borderRadius: "3px",
        }}
      >
        {children}

        {/* Alças de resize — só visíveis quando selecionado e não em drag */}
        {isSelected && !isDragging && (
          <>
            {HANDLES.map((h) => (
              <div
                key={h.id}
                data-handle={h.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startResize(e, h.dir);
                }}
                style={{
                  position: "absolute",
                  left: `${h.cx}%`,
                  top: `${h.cy}%`,
                  transform: "translate(-50%, -50%)",
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: handleBg,
                  border: `1.5px solid ${boxBorder}`,
                  cursor: h.cursor,
                  zIndex: 30,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  touchAction: "none",
                }}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

function ArchitectOverlay({
  al,
  headline,
  body,
  effectiveText,
  headlineTextColor,
  bodyTextColor,
  accentColor,
  headingFont,
  bodyFont,
  headingSize,
  bodySize,
  cardRef,
  onDragPosition,
  onResizeBlock,
  snapEnabled = true,
}: ArchitectOverlayProps) {
  const headlineStyle = resolveLayoutStyle(al.headline, al.padding);
  const bodyStyle = resolveLayoutStyle(al.body, al.padding);
  const barStyle = al.accentBar ? resolveLayoutStyle(al.accentBar, al.padding) : { display: 'none' };

  // Larguras salvas (ou padrão)
  const headlineWidth = al.headline.width ?? 76;
  const bodyWidth = al.body.width ?? 76;
  const barWidth = al.accentBar?.width ?? 15;

  // Se onDragPosition não está disponível, renderiza texto estático (HoloDeck)
  if (!onDragPosition) {
    return (
      <>
        {al.accentBar && (
          <div className="absolute z-20" style={{ ...barStyle, width: `${barWidth}%` }}>
            <AccentBar color={accentColor} width="100%" />
          </div>
        )}
        <div className="absolute z-20" style={{ ...headlineStyle, width: `${headlineWidth}%` }}>
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
            }}
          >
            {headline}
          </h2>
        </div>
        {body && (
          <div className="absolute z-20" style={{ ...bodyStyle, width: `${bodyWidth}%` }}>
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
              }}
            >
              {body}
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Barrinha arrastável */}
      {al.accentBar && (
        <DraggableTextBlock
          layoutPos={al.accentBar}
          padding={al.padding}
          cardRef={cardRef}
          onDragEnd={(x, y) => onDragPosition("accentBar", x, y)}
          onResize={(w) => onResizeBlock?.("accentBar", w)}
          snapEnabled={snapEnabled}
          accentColor={accentColor}
        >
          <AccentBar color={accentColor} width="100%" />
        </DraggableTextBlock>
      )}

      {/* Título arrastável + redimensionável */}
      <DraggableTextBlock
        layoutPos={al.headline}
        padding={al.padding}
        cardRef={cardRef}
        onDragEnd={(x, y) => onDragPosition("headline", x, y)}
        onResize={(w) => onResizeBlock?.("headline", w)}
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
      </DraggableTextBlock>

      {/* Corpo arrastável + redimensionável */}
      {body && (
        <DraggableTextBlock
          layoutPos={al.body}
          padding={al.padding}
          cardRef={cardRef}
          onDragEnd={(x, y) => onDragPosition("body", x, y)}
          onResize={(w) => onResizeBlock?.("body", w)}
          snapEnabled={snapEnabled}
          accentColor={effectiveText}
        >
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
        </DraggableTextBlock>
      )}
    </>
  );
}

// ─── PostCard ────────────────────────────────────────────────────────────────
export default function PostCard({
  variation,
  compact = false,
  theme,
  aspectRatio: ratioOverride,
  imageSettings,
  advancedLayout,
  bgValue,
  bgOverlay,
  forceVariationColors = false,
  onDragPosition,
  onResizeBlock,
  snapEnabled = true,
}: PostCardProps) {
  // Ref para o container de layout (a div com aspectRatio) — é o pai direto do ArchitectOverlay.
  // useDragElement usa este ref para calcular posições % corretamente.
  const cardRef = useRef<HTMLElement | null>(null);
  // layoutRef aponta para a div interna com aspectRatio — usada como container de referência pelo drag
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const { headline, body, imageUrl: variationImageUrl, backgroundColor, textColor, headlineColor, bodyColor, accentColor, layout } = variation;

  // ── Background resolution (priority: solid > bgValue.url > variation.imageUrl) ──
  const isSolid = bgValue?.type === "solid";
  const resolvedImageUrl = isSolid
    ? undefined
    : (bgValue?.url ?? variationImageUrl);

  const ratio: AspectRatio = ratioOverride ?? variation.aspectRatio ?? "1:1";
  const aspectRatioCSS = ASPECT_RATIO_VALUES[ratio];
  const isStory = ratio === "9:16";

  // ── Cores ──
  // forceVariationColors (Workbench): variation colors take priority so edits are reflected immediately.
  // Normal (HoloDeck preview): theme colors take priority as expected.
  // Quando há um tema ativo, o background do visual deve ser transparente
  // para que o ThemeRenderer controle o fundo (evita sobrescrita)
  const effectiveBg = isSolid && bgValue?.color
    ? bgValue.color
    : (forceVariationColors && backgroundColor)
      ? backgroundColor
      : theme ? "transparent" : (backgroundColor || "#1a1a2e");
  const effectiveText = (forceVariationColors && textColor)
    ? textColor
    : theme ? theme.colors.text : (textColor || "#ffffff");

  // Cores independentes por elemento — fazem fallback para effectiveText quando não definidas
  const effectiveHeadlineText = (forceVariationColors && headlineColor) ? headlineColor : effectiveText;
  const effectiveBodyText = (forceVariationColors && bodyColor) ? bodyColor : effectiveText;
  const effectiveAccent = (forceVariationColors && accentColor)
    ? accentColor
    : theme ? theme.colors.accent : (accentColor || "#a855f7");

  // Cores do card vêm do tema quando disponível
  const cardBg = theme ? theme.colors.bg : effectiveBg;
  const cardText = theme ? theme.colors.text : effectiveText;
  const cardAccent = theme ? theme.colors.accent : effectiveAccent;

  // Debug log para verificar cores
  if (theme) {
    console.log("[PostCard] Theme applied:", {
      id: theme.id,
      label: theme.label,
      bg: theme.colors.bg,
      text: theme.colors.text,
      accent: theme.colors.accent,
      effectiveBg,
      cardBg,
    });
  }
  const headingFont = theme ? theme.typography.headingFont : "var(--font-display)";
  const bodyFont = theme ? theme.typography.bodyFont : "inherit";
  const textAlign = theme ? (theme.layout.alignment as React.CSSProperties["textAlign"]) : undefined;

  // ── Auto-fit: Ajusta texto automaticamente ao mudar aspect ratio ──
  const autoFit = useTextAutoFit({
    headline,
    body: body || "",
    aspectRatio: ratio,
    isCompact: compact,
  });

  // ── Tamanhos adaptativos (sempre usa auto-fit) ──
  // Theme controla apenas fontes. Tamanhos sempre vêm do auto-fit
  // para evitar overflow em cards menores ou aspect ratios diferentes.
  const headingSize = `calc(${autoFit.headlineSize} * ${variation.headlineFontSize ?? 1})`;
  const bodySize = `calc(${autoFit.bodySize} * ${variation.bodyFontSize ?? 1})`;

  // ── Line clamp dinâmico baseado no aspect ratio ──
  const headlineLineClamp = autoFit.headlineLineClamp;
  const bodyLineClamp = autoFit.bodyLineClamp;

  // ── Padding dinâmico baseado no aspect ratio ──
  const dynamicPadding = autoFit.padding;

  // ── Layout patterns distintos ──
  const isLayoutCentered = layout === "centered";
  const isLayoutLeftAligned = layout === "left-aligned";
  const isLayoutSplit = layout === "split";
  const isLayoutMinimal = layout === "minimal";

  // ── Imagem de fundo com filtros ──────────────────────────────────────────────
  const is = imageSettings;
  const objPos = bgOverlay
    ? `${bgOverlay.position.x}% ${bgOverlay.position.y}%`
    : "50% 50%";

  const imgStyle: React.CSSProperties = is
    ? {
      filter: `brightness(${is.brightness}) contrast(${is.contrast}) saturate(${is.saturation}) blur(${is.blur}px)`,
      transform: `scale(${is.zoom})`,
      transformOrigin: "center",
      width: "100%",
      height: "100%",
      objectFit: "cover" as const,
      objectPosition: objPos,
    }
    : { width: "100%", height: "100%", objectFit: "cover" as const, objectPosition: objPos };

  // Overlay: bgOverlay has priority over imageSettings overlay
  const overlayColor = bgOverlay?.color ?? is?.overlayColor ?? "#000000";
  const overlayOpacity = bgOverlay?.opacity ?? is?.overlayOpacity ?? 0;
  const blendMode = is?.blendMode ?? "normal";

  const overlayDiv = overlayOpacity > 0 ? (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: overlayColor,
        opacity: overlayOpacity,
        mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
      }}
    />
  ) : null;

  const renderBgImage = (gradientStyle: string) =>
    resolvedImageUrl ? (
      <div className="absolute inset-0">
        <img src={resolvedImageUrl} alt="" style={imgStyle} />
        {overlayDiv}
        <div
          className="absolute inset-0"
          style={{ background: gradientStyle }}
        />
      </div>
    ) : null;

  const renderAdvancedTextElements = () => {
    if (!variation.textElements || variation.textElements.length === 0) return null;
    return (
      <div className="absolute inset-0 z-20 pointer-events-none">
        {variation.textElements.map(el => (
          <AdvancedTextNode
            key={el.id}
            element={el}
            isSelected={false}
            onSelect={() => { }}
            onChange={() => { }}
            scale={1}
          />
        ))}
      </div>
    );
  };

  // ── ArchitectOverlay shared props ──────────────────────────────────────────
  const architectProps: ArchitectOverlayProps | null = advancedLayout ? {
    al: advancedLayout,
    headline,
    body: body || "",
    effectiveText,
    headlineTextColor: effectiveHeadlineText,
    bodyTextColor: effectiveBodyText,
    accentColor: effectiveAccent,
    headingFont,
    bodyFont,
    headingSize: isLayoutCentered || isLayoutMinimal ? `calc(${headingSize} * 1.15)` : headingSize,
    bodySize,
    cardRef: layoutRef as React.RefObject<HTMLElement | null>,
    onDragPosition,
    onResizeBlock,
    snapEnabled,
  } : null;

  // Helper para aplicar line-clamp dinâmico
  const getLineClampClass = (lines: number | undefined) => {
    if (!lines) return "";
    return `line-clamp-${lines}`;
  };

  // ══════════════════════════════════════════════════════════════════
  // STORY LAYOUT (9:16)
  // ══════════════════════════════════════════════════════════════════
  const storyContent = (
    <div
      ref={layoutRef}
      className="relative flex flex-col w-full overflow-hidden"
      style={{
        background: effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1rem" : dynamicPadding,
      }}
    >
      {renderBgImage(`linear-gradient(to bottom,
        ${effectiveBg}22 0%,
        ${effectiveBg}99 40%,
        ${effectiveBg}ee 100%)`)}

      {architectProps ? (
        <ArchitectOverlay {...architectProps} />
      ) : (
        // ── Default story layout ──
        <div className="relative z-10 flex flex-col justify-center flex-1 gap-4">
          {!compact && (
            <AccentBar color={effectiveAccent} width="3rem" height="3px" align="flex-start" />
          )}
          <h2
            className="font-bold"
            style={{
              color: effectiveHeadlineText,
              fontFamily: headingFont,
              fontSize: headingSize,
              lineHeight: 1.25,
              textAlign: textAlign ?? "left",
              wordBreak: "break-word",
              overflowWrap: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {headline}
          </h2>
          {body && !compact && (
            <div
              className="w-full rounded-full"
              style={{ height: "1px", background: `${effectiveAccent}30` }}
            />
          )}
          {body && (
            <p
              className={compact ? "line-clamp-2" : ""}
              style={{
                color: effectiveBodyText,
                fontFamily: bodyFont,
                fontSize: bodySize,
                lineHeight: 1.65,
                opacity: 0.85,
                textAlign: textAlign ?? "left",
                whiteSpace: "pre-wrap",
              }}
            >
              {body}
            </p>
          )}
        </div>
      )}

      {/* Absolute text elements from Architect 2.0 */}
      {renderAdvancedTextElements()}
    </div>
  );


  // ══════════════════════════════════════════════════════════════════
  // LAYOUT: CENTERED - Texto centralizado verticalmente
  // ══════════════════════════════════════════════════════════════════
  const centeredLayout = (
    <div
      ref={layoutRef}
      className="relative flex flex-col w-full overflow-hidden"
      style={{
        background: effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1rem" : dynamicPadding,
      }}
    >
      {renderBgImage(`linear-gradient(to bottom, ${effectiveBg}22 0%, ${effectiveBg}66 50%, ${effectiveBg}ee 100%)`)}

      {architectProps ? (
        <ArchitectOverlay {...architectProps} />
      ) : (
        // CENTERED: Texto no meio, centralizado
        <div className="relative z-10 flex flex-col justify-center items-center flex-1 text-center gap-3">
          {variation.postMode === 'carousel' && !compact && (
            <div className="absolute top-0 right-0 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1 border border-white/10">
              <Layers size={12} className="text-white" />
              <span className="text-[10px] font-medium text-white">Carrossel</span>
            </div>
          )}
          {!compact && (
            <AccentBar color={effectiveAccent} width="3rem" height="3px" align="center" />
          )}
          <h2
            className={`font-bold leading-tight ${!compact && headlineLineClamp ? getLineClampClass(headlineLineClamp) : ""}`}
            style={{ color: effectiveHeadlineText, fontFamily: headingFont, fontSize: `calc(${headingSize} * 1.15)`, whiteSpace: "pre-wrap" }}
          >
            {headline}
          </h2>
          {body && (
            <p
              className={`${compact ? "line-clamp-2" : getLineClampClass(bodyLineClamp) || "line-clamp-4"} opacity-75 max-w-[90%]`}
              style={{ color: effectiveBodyText, fontFamily: bodyFont, fontSize: bodySize, lineHeight: 1.6, whiteSpace: "pre-wrap" }}
            >
              {body}
            </p>
          )}
        </div>
      )}

      {/* Absolute text elements from Architect 2.0 */}
      {renderAdvancedTextElements()}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT: LEFT-ALIGNED - Texto na base, alinhado à esquerda (clássico)
  // ══════════════════════════════════════════════════════════════════
  const leftAlignedLayout = (
    <div
      ref={layoutRef}
      className="relative flex flex-col w-full overflow-hidden"
      style={{
        background: effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1rem" : dynamicPadding,
      }}
    >
      {renderBgImage(`linear-gradient(to bottom, ${effectiveBg}11 0%, ${effectiveBg}88 60%, ${effectiveBg}ee 100%)`)}

      {architectProps ? (
        <ArchitectOverlay {...architectProps} />
      ) : (
        // LEFT-ALIGNED: Texto na base, alinhado à esquerda
        <div className="relative z-10 flex flex-col gap-2 mt-auto w-full text-left items-start">
          {variation.postMode === 'carousel' && !compact && (
            <div className="absolute top-[-30px] right-0 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1 border border-white/10">
              <Layers size={12} className="text-white" />
              <span className="text-[10px] font-medium text-white">Carrossel</span>
            </div>
          )}
          {!compact && (
            <AccentBar color={effectiveAccent} width="2.5rem" height="3px" align="flex-start" />
          )}
          <h2
            className={`font-bold leading-tight ${!compact && headlineLineClamp ? getLineClampClass(headlineLineClamp) : ""}`}
            style={{ color: effectiveHeadlineText, fontFamily: headingFont, fontSize: headingSize, whiteSpace: "pre-wrap" }}
          >
            {headline}
          </h2>
          {body && (
            <p
              className={`${compact ? "line-clamp-1" : getLineClampClass(bodyLineClamp) || "line-clamp-3"} opacity-80`}
              style={{ color: effectiveBodyText, fontFamily: bodyFont, fontSize: bodySize, lineHeight: 1.55 }}
            >
              {body}
            </p>
          )}
        </div>
      )}

      {/* Absolute text elements from Architect 2.0 */}
      {renderAdvancedTextElements()}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT: SPLIT — Bipartido: card dividido em duas metades
  // Metade imagem (sem gradiente, objeto puro) + metade texto (fundo sólido)
  // variation.splitImagePosition controla qual metade tem a imagem ('top' | 'bottom')
  // ══════════════════════════════════════════════════════════════════
  const splitLayout = (() => {
    const imageOnTop = variation.splitImagePosition !== 'bottom';

    const ImageHalf = (
      <div
        className="relative w-full overflow-hidden"
        style={{ flex: '0 0 50%', minHeight: compact ? 60 : undefined }}
      >
        {resolvedImageUrl ? (
          <img
            src={resolvedImageUrl}
            alt=""
            style={{ ...imgStyle, objectFit: 'cover', width: '100%', height: '100%', position: 'absolute', inset: 0 }}
          />
        ) : (
          // Placeholder quando não há imagem
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `color-mix(in srgb, ${cardBg} 80%, white 20%)`, minHeight: compact ? 60 : 120 }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              style={{ color: `${cardText}40`, opacity: 0.5 }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
      </div>
    );

    const TextHalf = (
      <div
        className="flex flex-col justify-center items-start gap-2 relative"
        style={{
          flex: '1 1 50%',
          padding: compact ? '0.75rem' : dynamicPadding,
          background: cardBg,
        }}
      >
        {!compact && (
          <AccentBar color={effectiveAccent} width="2rem" height="3px" align="flex-start" />
        )}
        <h2
          className={`font-bold leading-tight ${!compact && headlineLineClamp ? getLineClampClass(headlineLineClamp) : ''}`}
          style={{
            color: effectiveHeadlineText,
            fontFamily: headingFont,
            fontSize: headingSize,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
          }}
        >
          {headline}
        </h2>
        {body && (
          <p
            className={`${compact ? 'line-clamp-2' : getLineClampClass(bodyLineClamp) || 'line-clamp-3'} opacity-80`}
            style={{
              color: effectiveBodyText,
              fontFamily: bodyFont,
              fontSize: bodySize,
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'break-word',
            }}
          >
            {body}
          </p>
        )}
      </div>
    );

    return (
      <div
        ref={layoutRef}
        className={`relative flex ${imageOnTop ? 'flex-col' : 'flex-col-reverse'} w-full overflow-hidden`}
        style={{
          background: cardBg,
          aspectRatio: compact ? undefined : aspectRatioCSS,
          minHeight: compact ? 80 : undefined,
        }}
      >
        {ImageHalf}
        {/* No modo não-Arquiteto, mostra o TextHalf; no Arquiteto, o overlay flutua sobre o card inteiro */}
        {!architectProps && TextHalf}

        {/* Architect overlay flutua sobre o card inteiro (imagem + texto) */}
        {architectProps && (
          <ArchitectOverlay {...architectProps} />
        )}

        {/* Absolute text elements from Architect 2.0 */}
        {renderAdvancedTextElements()}
      </div>
    );
  })();



  // ══════════════════════════════════════════════════════════════════
  // LAYOUT: MINIMAL - Apenas headline centralizado, sem corpo, ultra-clean
  // ══════════════════════════════════════════════════════════════════
  const minimalLayout = (
    <div
      ref={layoutRef}
      className="relative flex flex-col w-full overflow-hidden"
      style={{
        background: effectiveBg,
        aspectRatio: compact ? undefined : aspectRatioCSS,
        minHeight: compact ? 80 : undefined,
        padding: compact ? "1.5rem" : (typeof dynamicPadding === 'number' ? dynamicPadding * 1.5 : dynamicPadding),
      }}
    >
      {renderBgImage(`linear-gradient(to bottom, ${effectiveBg}00 0%, ${effectiveBg}22 100%)`)}

      {architectProps ? (
        <ArchitectOverlay {...architectProps} />
      ) : (
        // MINIMAL: Apenas headline, tipografia grande, muito espaço negativo
        <div className="relative z-10 flex flex-col justify-center items-center flex-1 text-center">
          {variation.postMode === 'carousel' && !compact && (
            <div className="absolute top-0 right-0 bg-black/30 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1">
              <Layers size={10} className="text-white/80" />
              <span className="text-[9px] font-medium text-white/80">Carrossel</span>
            </div>
          )}
          <h2
            className="font-bold leading-[1.1] tracking-tight"
            style={{
              color: effectiveHeadlineText,
              fontFamily: headingFont,
              fontSize: compact ? headingSize : `calc(${headingSize} * 1.4)`,
              maxWidth: "95%",
              whiteSpace: "pre-wrap",
            }}
          >
            {headline}
          </h2>
          {/* Corpo NÃO aparece no layout minimal - apenas headline */}
        </div>
      )}

      {/* Absolute text elements from Architect 2.0 */}
      {renderAdvancedTextElements()}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════
  // Seletor de layout
  // ══════════════════════════════════════════════════════════════════
  const visual = isStory
    ? storyContent
    : isLayoutCentered
      ? centeredLayout
      : isLayoutSplit
        ? splitLayout
        : isLayoutMinimal
          ? minimalLayout
          : leftAlignedLayout; // fallback padrão (clássico)

  if (theme) {
    return (
      <ThemeRenderer theme={theme} className={compact ? "rounded-xl" : "rounded-2xl"} cardRef={cardRef}>
        {visual}
      </ThemeRenderer>
    );
  }

  return (
    <div
      ref={(el) => { (cardRef as React.MutableRefObject<HTMLElement | null>).current = el; }}
      className={compact ? "rounded-xl overflow-hidden" : "rounded-2xl overflow-hidden"}
      style={{ background: effectiveBg }}
    >
      {visual}
    </div>
  );
}
