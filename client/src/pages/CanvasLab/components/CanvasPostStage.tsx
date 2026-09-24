import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Stage, Layer, Rect, Text, Group, Image as KonvaImage, Transformer, Line, Circle } from "react-konva";
import type { BgImageTransform, CanvasCustomImage, CanvasCustomText, CanvasPostModel, ElementPosition, LogoPositionType, TextLegibilityEffect, SplitBgPosition } from "./types";
import { isDarkColor, resolveLegibleTextColor, normalizeHexColor } from "./types";
import { useDynamicFont } from "@/hooks/useDynamicFont";
import { computeBackgroundGeometry } from "../lib/backgroundPlacement";
import JSZip from "jszip";
import { Check, X } from "lucide-react";
import RichTextFloatingToolbar from "./RichTextFloatingToolbar";
import RichTextRenderer from "./RichTextRenderer";
import { applyRichTextFormat, reconcileRichTextChange } from "../lib/richText";
import type { CanvasRichTextChunk } from "./types";
import { getCaretGeometry, getSelectionGeometry, hitTestRichText, layoutRichText, type CaretGeometry, type RichTextLayout } from "../lib/richTextLayout";
import { wordRangeAt, type TextRange } from "../lib/textSelection";
import {
  computeTextResizeGeometry,
  finalizeTextResizeGeometry,
  type TextResizeGeometry,
  type TextResizeSession,
} from "../lib/textResizeGeometry";

export interface CanvasPostStageRef {
  exportPng4K: () => string;
  exportZip4K: (onProgress?: (current: number, total: number) => void) => Promise<Blob>;
}

interface CanvasPostStageProps {
  post: CanvasPostModel;
  isMobile?: boolean;
  onUpdateRichText?: (field: "headline" | "subtext", chunks: CanvasRichTextChunk[]) => void;
  zoom: number;
  onUpdateElementPosition?: (elementKey: "headlinePos" | "subtextPos" | "badgePos" | "barPos" | "logoPos", pos: ElementPosition) => void;
  onUpdateTextTransform?: (
    elementKey: "headline" | "subtext",
    props: { x?: number; y?: number; width?: number; scale?: number },
    layoutPositions?: { headlinePos: ElementPosition; subtextPos: ElementPosition; barPos: ElementPosition }
  ) => void;
  onSelectElement?: (elementId: string | null) => void;
  selectedElementId?: string | null;
  isReadOnly?: boolean;
  isEditingBackground?: boolean;
  onUpdateBgTransform?: (transform: BgImageTransform) => void;
  onEnterBackgroundEdit?: () => void;
  onUpdateText?: (field: "headline" | "subtext" | "badgeText", value: string) => void;
  onCommitTextEdit?: (
    field: "headline" | "subtext",
    value: string,
    chunks: CanvasRichTextChunk[],
    layoutPositions?: { headlinePos: ElementPosition; subtextPos: ElementPosition; barPos: ElementPosition }
  ) => void;
  onUpdateExtraText?: (id: string, patch: Partial<CanvasCustomText>) => void;
  onUpdateExtraTextPosition?: (id: string, pos: ElementPosition) => void;
  onUpdateExtraTextContent?: (id: string, value: string) => void;
  onUpdateExtraImage?: (id: string, patch: Partial<CanvasCustomImage>) => void;
}

function BlinkingCaret({ geometry }: { geometry: CaretGeometry }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const interval = window.setInterval(() => setVisible(value => !value), 530);
    return () => window.clearInterval(interval);
  }, [geometry.x, geometry.y, geometry.height]);

  if (!visible) return null;
  return (
    <Line
      points={[geometry.x, geometry.y, geometry.x, geometry.y + geometry.height]}
      stroke="#38bdf8"
      strokeWidth={1.5}
      listening={false}
    />
  );
}

function TextSelectionHandles({
  layout,
  start,
  end,
  touchScale,
  onStart,
}: {
  layout: RichTextLayout;
  start: number;
  end: number;
  touchScale: number;
  onStart: (event: any, edge: "start" | "end", layout: RichTextLayout) => void;
}) {
  if (start === end) return null;
  return (
    <>
      {(["start", "end"] as const).map(edge => {
        const caret = getCaretGeometry(layout, edge === "start" ? start : end);
        const handleX = caret.x + (edge === "start" ? -7 : 7) * touchScale;
        const handleY = caret.y + caret.height + 7 * touchScale;
        const begin = (event: any) => onStart(event, edge, layout);
        return (
          <React.Fragment key={edge}>
            <Line points={[caret.x, caret.y + caret.height - 2, handleX, handleY]} stroke="#38bdf8" strokeWidth={2 * touchScale} listening={false} />
            <Circle x={handleX} y={handleY} radius={6 * touchScale} fill="#38bdf8" stroke="#ffffff" strokeWidth={1.5 * touchScale} listening={false} />
            <Circle x={handleX} y={handleY} radius={22 * touchScale} fill="rgba(0,0,0,0.001)" onTouchStart={begin} onMouseDown={begin} />
          </React.Fragment>
        );
      })}
    </>
  );
}

// Cálculo de crop proporcional (object-fit: cover)
function getCoverCrop(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number
) {
  if (!imageWidth || !imageHeight || !targetWidth || !targetHeight) return undefined;

  const imageRatio = imageWidth / imageHeight;
  const targetRatio = targetWidth / targetHeight;

  let cropWidth = imageWidth;
  let cropHeight = imageHeight;
  let cropX = 0;
  let cropY = 0;

  if (imageRatio > targetRatio) {
    cropWidth = imageHeight * targetRatio;
    cropHeight = imageHeight;
    cropX = (imageWidth - cropWidth) / 2;
    cropY = 0;
  } else {
    cropWidth = imageWidth;
    cropHeight = imageWidth / targetRatio;
    cropX = 0;
    cropY = (imageHeight - cropHeight) / 2;
  }

  return {
    x: Math.round(cropX),
    y: Math.round(cropY),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  };
}

// ─── HELPER CANÔNICO KONVA: IDENTIFICAÇÃO DE HIERARQUIA DE NÓS ───
function isDescendantOf(node: any, targetParent: any): boolean {
  if (!node || !targetParent) return false;
  let curr = node;
  while (curr) {
    if (curr === targetParent) return true;
    curr = curr.getParent?.();
  }
  return false;
}

interface RenderBackgroundEffectProps {
  effect: TextLegibilityEffect;
  contentWidth: number;
  textHeight: number;
  isDarkText: boolean;
  accentColor: string;
  customColor?: string;
  lines?: Array<{ text: string; width: number }>;
  lineHeightPx?: number;
  align?: "left" | "center" | "right";
}

function renderBackgroundEffect({
  effect,
  contentWidth,
  textHeight,
  isDarkText,
  accentColor,
  customColor,
  lines,
  lineHeightPx = 28,
  align = "left",
}: RenderBackgroundEffectProps) {
  if (!effect || effect === "none" || effect === "shadow" || effect === "outline") {
    return null;
  }

  if (effect === "box-card") {
    return (
      <Rect
        x={-12}
        y={-6}
        width={contentWidth + 24}
        height={textHeight + 12}
        cornerRadius={10}
        fill={customColor || (isDarkText ? "rgba(255, 255, 255, 0.88)" : "rgba(12, 12, 16, 0.82)")}
        stroke={isDarkText ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.15)"}
        strokeWidth={1}
        shadowColor="rgba(0, 0, 0, 0.3)"
        shadowBlur={10}
        shadowOffsetY={4}
        listening={false}
      />
    );
  }

  if (effect === "box-pill") {
    return (
      <Rect
        x={-16}
        y={-8}
        width={contentWidth + 32}
        height={textHeight + 16}
        cornerRadius={999}
        fill={customColor || (isDarkText ? "rgba(255, 255, 255, 0.92)" : "rgba(12, 12, 16, 0.88)")}
        stroke={isDarkText ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.2)"}
        strokeWidth={1}
        shadowColor="rgba(0, 0, 0, 0.25)"
        shadowBlur={8}
        shadowOffsetY={3}
        listening={false}
      />
    );
  }

  if (effect === "box-glass") {
    return (
      <Rect
        x={-14}
        y={-8}
        width={contentWidth + 28}
        height={textHeight + 16}
        cornerRadius={14}
        fill={customColor || (isDarkText ? "rgba(255, 255, 255, 0.22)" : "rgba(0, 0, 0, 0.38)")}
        stroke={isDarkText ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.3)"}
        strokeWidth={1.2}
        shadowColor="rgba(0, 0, 0, 0.45)"
        shadowBlur={16}
        shadowOffsetY={6}
        listening={false}
      />
    );
  }

  if (effect === "box-accent") {
    return (
      <Rect
        x={-12}
        y={-6}
        width={contentWidth + 24}
        height={textHeight + 12}
        cornerRadius={8}
        fill={customColor || accentColor}
        shadowColor="rgba(0, 0, 0, 0.35)"
        shadowBlur={8}
        shadowOffsetY={3}
        listening={false}
      />
    );
  }

  if (effect === "box-brutal") {
    return (
      <Rect
        x={-10}
        y={-6}
        width={contentWidth + 20}
        height={textHeight + 12}
        cornerRadius={0}
        fill={customColor || (isDarkText ? "#FFFFFF" : "#000000")}
        stroke={isDarkText ? "#000000" : "#FFFFFF"}
        strokeWidth={2}
        shadowColor={isDarkText ? "#000000" : "#FFFFFF"}
        shadowBlur={0}
        shadowOffsetX={3}
        shadowOffsetY={3}
        shadowOpacity={1}
        listening={false}
      />
    );
  }

  if (effect === "scrim") {
    return (
      <Rect
        x={-24}
        y={-16}
        width={contentWidth + 48}
        height={textHeight + 32}
        cornerRadius={16}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 0, y: textHeight + 32 }}
        fillLinearGradientColorStops={
          isDarkText
            ? [0, "rgba(255, 255, 255, 0.92)", 0.65, "rgba(255, 255, 255, 0.7)", 1, "rgba(255, 255, 255, 0)"]
            : [0, "rgba(0, 0, 0, 0.88)", 0.65, "rgba(0, 0, 0, 0.65)", 1, "rgba(0, 0, 0, 0)"]
        }
        listening={false}
      />
    );
  }

  if (effect === "strip-line") {
    const stripLines = lines && lines.length > 0
      ? lines
      : [{ text: "", width: contentWidth }];

    return (
      <Group listening={false}>
        {stripLines.map((line, idx) => {
          const lineWidth = Math.min(contentWidth, Math.max(30, line.width || contentWidth));
          let lineX = -6;
          if (align === "center") {
            lineX = (contentWidth - lineWidth) / 2 - 6;
          } else if (align === "right") {
            lineX = contentWidth - lineWidth - 6;
          }
          const lineY = idx * lineHeightPx - 2;

          return (
            <Rect
              key={`strip-${idx}`}
              x={lineX}
              y={lineY}
              width={lineWidth + 12}
              height={lineHeightPx}
              cornerRadius={4}
              fill={customColor || (isDarkText ? "rgba(255, 255, 255, 0.9)" : "rgba(12, 12, 16, 0.85)")}
              stroke={isDarkText ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.12)"}
              strokeWidth={1}
              shadowColor="rgba(0, 0, 0, 0.2)"
              shadowBlur={6}
              shadowOffsetY={2}
              listening={false}
            />
          );
        })}
      </Group>
    );
  }

  return null;
}

function getTextEffectProps(
  effect: TextLegibilityEffect,
  isDarkText: boolean,
  isHeadline: boolean,
  customColor?: string,
) {
  if (effect === "shadow") {
    return {
      shadowColor: customColor || (isDarkText ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.95)"),
      shadowBlur: 12,
      shadowOffsetX: 0,
      shadowOffsetY: isDarkText ? 0 : 3,
      shadowOpacity: 0.9,
    };
  }
  if (effect === "outline") {
    return {
      stroke: customColor || (isDarkText ? "#FFFFFF" : "#000000"),
      strokeWidth: isHeadline ? 3 : 2,
      fillAfterStrokeEnabled: true,
    };
  }
  return {};
}

// ─── COMPONENTE DE IMAGEM LIVRE ADICIONAL (FOTO / STICKER / ADESIVO) ───
const CanvasCustomImageNode: React.FC<{
  item: CanvasCustomImage;
  isInteractive: boolean;
  onSelect: () => void;
  onDragMove: (e: any) => void;
  onDragEnd: (e: any) => void;
  onTransformEnd: (e: any) => void;
  createSnapBoundFunc: (width: number, height: number) => any;
  setRef: (el: any) => void;
}> = ({
  item,
  isInteractive,
  onSelect,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  createSnapBoundFunc,
  setRef,
}) => {
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!item.url) {
      setImageEl(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "Anonymous";
    img.src = item.url;
    img.onload = () => setImageEl(img);
  }, [item.url]);

  if (!imageEl) return null;

  return (
    <KonvaImage
      ref={setRef}
      image={imageEl}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height}
      rotation={item.rotation || 0}
      opacity={item.opacity ?? 1}
      cornerRadius={item.cornerRadius || 0}
      draggable={isInteractive}
      dragBoundFunc={isInteractive ? createSnapBoundFunc(item.width, item.height) : undefined}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
};

export const CanvasPostStage = forwardRef<CanvasPostStageRef, CanvasPostStageProps>(
  (
    {
      post,
      isMobile = false,
      zoom,
      onUpdateElementPosition,
      onUpdateTextTransform,
      onSelectElement,
      selectedElementId,
      isReadOnly = false,
      isEditingBackground = false,
      onUpdateBgTransform,
      onEnterBackgroundEdit,
      onUpdateText,
      onCommitTextEdit,
      onUpdateRichText,
      onUpdateExtraText,
      onUpdateExtraTextPosition,
      onUpdateExtraTextContent,
      onUpdateExtraImage,
    },
    ref
  ) => {
    const isInteractive = !isReadOnly && Boolean(onUpdateElementPosition);
    const stageRef = useRef<any>(null);
    const transformerRef = useRef<any>(null);
    const bgTransformerRef = useRef<any>(null);

    const headlineRef = useRef<any>(null);
    const subtextRef = useRef<any>(null);
    const headlineResizeFrameRef = useRef<any>(null);
    const subtextResizeFrameRef = useRef<any>(null);
    const badgeRef = useRef<any>(null);
    const barRef = useRef<any>(null);
    const logoRef = useRef<any>(null);
    const bgImageRef = useRef<any>(null);
    const extraTextRefs = useRef<Record<string, any>>({});
    const extraImageRefs = useRef<Record<string, any>>({});

    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Índice de slide usado exclusivamente durante a exportação ZIP offscreen:
    // o mesmo motor renderiza cada slide de forma determinística, em vez de
    // capturar repetidamente o slide visível (Etapa 2 §7.6).
    const [exportSlideIndex, setExportSlideIndex] = useState<number | null>(null);

    useEffect(() => {
      if (selectedElementId !== undefined) {
        setSelectedId(selectedElementId);
      }
    }, [selectedElementId]);

    const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({});
    const [isAltPressed, setIsAltPressed] = useState(false);

    // Estado da edição direta no canvas (Inline On-Canvas Editor)
    const [editingTarget, setEditingTarget] = useState<string | null>(null);
    const [editingText, setEditingText] = useState("");
    const [editingRichText, setEditingRichText] = useState<CanvasRichTextChunk[] | undefined>();
    const [editingSelection, setEditingSelection] = useState({ start: 0, end: 0 });
    const selectionAnchorRef = useRef<number | null>(null);
    const activeSelectionHandleRef = useRef<{ target: string; anchor: number; layout: RichTextLayout } | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressPointRef = useRef<{ x: number; y: number } | null>(null);
    useEffect(() => () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    }, []);
    const pendingSelectionRef = useRef<TextRange | null>(null);
    const editingTargetRef = useRef(editingTarget);
    editingTargetRef.current = editingTarget;
    const editingTextRef = useRef(editingText);
    editingTextRef.current = editingText;
    const editingRichTextRef = useRef(editingRichText);
    editingRichTextRef.current = editingRichText;
    const stageContainerRef = useRef<HTMLDivElement>(null);
    const editorWrapperRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const [bgImgElement, setBgImgElement] = useState<HTMLImageElement | null>(null);
    const [logoImgElement, setLogoImgElement] = useState<HTMLImageElement | null>(null);
    useDynamicFont(post.fontFamily, post.customFontUrl);

    // Redesenho reativo quando as fontes web terminam de carregar no navegador
    useEffect(() => {
      if (typeof document !== "undefined" && document.fonts) {
        let isMounted = true;
        document.fonts.ready.then(() => {
          if (isMounted && stageRef.current) {
            stageRef.current.getLayers().forEach((layer: any) => layer.batchDraw());
          }
        });
        return () => {
          isMounted = false;
        };
      }
    }, [post.fontFamily]);

    const [localHeadlineWidth, setLocalHeadlineWidth] = useState<number | null>(null);
    const [localSubtextWidth, setLocalSubtextWidth] = useState<number | null>(null);
    const [localHeadlinePosition, setLocalHeadlinePosition] = useState<ElementPosition | null>(null);
    const [localSubtextPosition, setLocalSubtextPosition] = useState<ElementPosition | null>(null);
    const [textLayoutSnapshot, setTextLayoutSnapshot] = useState<{
      headlinePos: ElementPosition;
      subtextPos: ElementPosition;
      barPos: ElementPosition;
    } | null>(null);
    const textLayoutSnapshotRef = useRef(textLayoutSnapshot);
    textLayoutSnapshotRef.current = textLayoutSnapshot;
    const textResizeSessionRef = useRef<(TextResizeSession & {
      elementKey: "headline" | "subtext";
    }) | null>(null);
    const textResizeDraftRef = useRef<TextResizeGeometry | null>(null);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Alt") setIsAltPressed(true);
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === "Alt") setIsAltPressed(false);
      };
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
      };
    }, []);

    const baseWidth = 360;
    const baseHeight =
      post.aspectRatio === "9:16" ? 640 : post.aspectRatio === "5:6" ? 432 : 360;

    // Durante o ZIP, o índice de exportação prevalece sobre o slide ativo —
    // este é o ÚNICO motor de renderização; nenhuma segunda máquina é criada.
    const currentSlide =
      post.slides[exportSlideIndex ?? post.currentSlideIndex] || post.slides[0];
    const activeBg = currentSlide?.bgImage || post.bgImage;
    const bgTransform = currentSlide?.bgTransform || post.bgTransform;

    useEffect(() => {
      if (!activeBg) {
        setBgImgElement(null);
        return;
      }
      const img = new window.Image();
      img.crossOrigin = "Anonymous";
      img.src = activeBg;
      img.onload = () => setBgImgElement(img);
    }, [activeBg]);

    useEffect(() => {
      if (!post.logoUrl) {
        setLogoImgElement(null);
        return;
      }
      const img = new window.Image();
      img.crossOrigin = "Anonymous";
      img.src = post.logoUrl;
      img.onload = () => setLogoImgElement(img);
    }, [post.logoUrl]);

    // Vincula o Transformer normal aos elementos de texto/marca quando não estiver em modo de fundo
    useEffect(() => {
      if (isEditingBackground || editingTarget) {
        transformerRef.current?.nodes([]);
        transformerRef.current?.getLayer()?.batchDraw();
        return;
      }
      if (!transformerRef.current) return;
      let targetNode = null;
      if (selectedId === "headline") targetNode = headlineResizeFrameRef.current;
      else if (selectedId === "subtext") targetNode = subtextResizeFrameRef.current;
      else if (selectedId === "badge") targetNode = badgeRef.current;
      else if (selectedId === "bar") targetNode = barRef.current;
      else if (selectedId === "logo") targetNode = logoRef.current;
      else if (selectedId && extraTextRefs.current[selectedId]) {
        targetNode = extraTextRefs.current[selectedId];
      } else if (selectedId && extraImageRefs.current[selectedId]) {
        targetNode = extraImageRefs.current[selectedId];
      }

      if (targetNode) {
        transformerRef.current.nodes([targetNode]);
        transformerRef.current.getLayer()?.batchDraw();
      } else {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    }, [selectedId, isEditingBackground, editingTarget]);

    // Vincula o Transformer exclusivo ao Plano de Fundo quando isEditingBackground === true (Estilo Canva)
    useEffect(() => {
      if (!bgTransformerRef.current) return;
      if (isEditingBackground && bgImageRef.current) {
        bgTransformerRef.current.nodes([bgImageRef.current]);
        bgTransformerRef.current.getLayer()?.batchDraw();
      } else {
        bgTransformerRef.current.nodes([]);
        bgTransformerRef.current.getLayer()?.batchDraw();
      }
    }, [isEditingBackground, bgImgElement]);

    useImperativeHandle(ref, () => ({
      exportPng4K: () => {
        if (!stageRef.current) return "";
        setSelectedId(null);
        transformerRef.current?.nodes([]);
        bgTransformerRef.current?.nodes([]);
        stageRef.current.getLayers().forEach((l: any) => l.batchDraw());
        return stageRef.current.toDataURL({
          pixelRatio: 4,
          mimeType: "image/png",
        });
      },
      exportZip4K: async (onProgress) => {
        const zip = new JSZip();
        const stage = stageRef.current;
        if (!stage) return new Blob();

        setSelectedId(null);
        transformerRef.current?.nodes([]);
        bgTransformerRef.current?.nodes([]);

        const awaitFrame = () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const awaitStageImagesLoaded = async (timeoutMs: number): Promise<void> => {
          const started = Date.now();
          while (Date.now() - started < timeoutMs) {
            const imageNodes = stage.find("Image") as any[];
            const pending = imageNodes.filter((node) => {
              const img = node?.image?.();
              return !img || !img.complete || !img.naturalWidth;
            });
            if (pending.length === 0) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        };

        for (let i = 0; i < post.slides.length; i++) {
          if (onProgress) onProgress(i + 1, post.slides.length);
          // Renderiza o slide i no mesmo motor e aguarda composição + assets.
          setExportSlideIndex(i);
          await awaitFrame();
          await awaitFrame();
          try {
            await Promise.race([
              (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready,
              Promise.resolve(),
            ]);
          } catch {
            /* fontes não disponíveis — segue com o fallback do motor */
          }
          await awaitStageImagesLoaded(2000);

          stage.getLayers().forEach((l: any) => l.batchDraw());
          const dataUrl = stage.toDataURL({
            pixelRatio: 4,
            mimeType: "image/png",
          });
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
          zip.file(`slide-${i + 1}.png`, base64Data, { base64: true });
        }

        setExportSlideIndex(null);
        await awaitFrame();
        stage.getLayers().forEach((l: any) => l.batchDraw());
        return await zip.generateAsync({ type: "blob" });
      },
    }));

    const activeHeadline = currentSlide ? currentSlide.headline : post.headline;
    const activeSubtext = currentSlide ? currentSlide.subtext : post.subtext;
    const activeHeadlineChunks = currentSlide?.headlineRich ?? post.headlineRich;
    const activeSubtextChunks = currentSlide?.subtextRich ?? post.subtextRich;
    const displayHeadline = editingTarget === "headline" ? editingText : activeHeadline;
    const displaySubtext = editingTarget === "subtext" ? editingText : activeSubtext;
    const displayHeadlineChunks = editingTarget === "headline" ? editingRichText : activeHeadlineChunks;
    const displaySubtextChunks = editingTarget === "subtext" ? editingRichText : activeSubtextChunks;
    const isCarousel = Boolean(post.slides && post.slides.length > 1);
    const isBadgeVisible = Boolean(post.showBadge && post.badgeText?.trim());
    const isStepVisible = Boolean(isCarousel && post.showStep && currentSlide?.step?.trim());

    // Texto principal do badge superior: se showBadge estiver ativo, prioriza badgeText.
    // Se não, se for carrossel e showStep estiver ativo, exibe currentSlide.step.
    const persistedBadgeText = isBadgeVisible
      ? (post.badgeText || "")
      : isStepVisible
      ? (currentSlide?.step || "")
      : "";
    const primaryBadgeText = editingTarget === "badge" ? editingText : persistedBadgeText;

    const hasVisibleBadge = Boolean(primaryBadgeText.trim());

    // Se AMBOS estiverem visíveis no carrossel, o secundário (contador numérico) é exibido como chip discreto
    const showSecondarySlideChip = isBadgeVisible && isStepVisible;
    const secondarySlideText = currentSlide?.step || "";
    const activeExtraTexts = currentSlide?.extraTexts || post.extraTexts || [];
    const activeExtraImages = currentSlide?.extraImages || post.extraImages || [];

    // --- CARACTERÍSTICAS DA FAMÍLIA ATIVA ---
    const fam = post.familyId || "editorial-poster";
    const isEditorial = fam === "editorial-poster";
    const isGlass = fam === "glass-veil";
    const isBrutalBlock = fam === "chromatic-block";
    const isBrutalSplit = fam === "brutal-split";
    const isStrokeImpact = fam === "stroke-impact";
    const isCyber = fam === "cyber-glitch" || (fam as string) === "glitch-signal";
    const isCinematic = fam === "cinematic-depth";
    const isDuotone = fam === "duotone-wash";
    const isKinetic = fam === "kinetic-type";
    const isDataPunch = fam === "data-punch";
    const isQuote = fam === "quote-authority";

    const contentWidth = baseWidth - (isGlass ? 56 : 48);
    const activeHeadlineWidth = Math.max(40, localHeadlineWidth ?? currentSlide?.headlineWidth ?? contentWidth);
    const activeSubtextWidth = Math.max(40, localSubtextWidth ?? currentSlide?.subtextWidth ?? contentWidth);
    const activeHeadlineScale = currentSlide?.headlineScale ?? 1;
    const activeSubtextScale = currentSlide?.subtextScale ?? 1;

    const pointerXForNode = (node: any): number | null => {
      const pointer = node?.getStage?.()?.getPointerPosition?.();
      return pointer && Number.isFinite(pointer.x) ? pointer.x : null;
    };

    const handleTextTransformStart = (
      e: any,
      elementKey: "headline" | "subtext",
      initialWidth: number,
      initialPosition: ElementPosition,
      layoutPositions: { headlinePos: ElementPosition; subtextPos: ElementPosition; barPos: ElementPosition }
    ) => {
      const anchor = transformerRef.current?.getActiveAnchor();
      const pointerStartX = pointerXForNode(e.target);
      if ((anchor !== "middle-left" && anchor !== "middle-right") || pointerStartX === null) {
        textResizeSessionRef.current = null;
        textResizeDraftRef.current = null;
        return;
      }

      const session = {
        elementKey,
        anchor,
        pointerStartX,
        initialX: initialPosition.x,
        initialY: initialPosition.y,
        initialWidth,
        minWidth: 40,
      };
      textResizeSessionRef.current = session;
      textResizeDraftRef.current = {
        x: initialPosition.x,
        y: initialPosition.y,
        width: initialWidth,
      };
      textLayoutSnapshotRef.current = layoutPositions;
      setTextLayoutSnapshot(layoutPositions);
      e.target.setAttrs({
        x: initialPosition.x,
        y: initialPosition.y,
        width: initialWidth,
        scaleX: 1,
        scaleY: 1,
      });
    };

    const handleTextTransform = (
      e: any,
      elementKey: "headline" | "subtext",
      setLocalWidth: React.Dispatch<React.SetStateAction<number | null>>,
      setLocalPosition: React.Dispatch<React.SetStateAction<ElementPosition | null>>
    ) => {
      const session = textResizeSessionRef.current;
      const pointerX = pointerXForNode(e.target);
      if (!session || session.elementKey !== elementKey || pointerX === null) return;

      const geometry = computeTextResizeGeometry(session, pointerX);
      textResizeDraftRef.current = geometry;
      e.target.setAttrs({
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        scaleX: 1,
        scaleY: 1,
      });
      setLocalPosition({ x: geometry.x, y: geometry.y });
      setLocalWidth(geometry.width);
    };

    const handleTextTransformEnd = (
      e: any,
      elementKey: "headline" | "subtext",
      setLocalWidth: React.Dispatch<React.SetStateAction<number | null>>,
      setLocalPosition: React.Dispatch<React.SetStateAction<ElementPosition | null>>
    ) => {
      const node = e.target;
      const session = textResizeSessionRef.current;
      const liveGeometry = textResizeDraftRef.current || (session ? {
        x: session.initialX,
        y: session.initialY,
        width: session.initialWidth,
      } : {
        x: node.x(),
        y: node.y(),
        width: node.width(),
      });
      const finalGeometry = finalizeTextResizeGeometry(liveGeometry);
      node.setAttrs({
        ...finalGeometry,
        scaleX: 1,
        scaleY: 1,
      });
      const transformedPosition = { x: finalGeometry.x, y: finalGeometry.y };
      const snapshot = textLayoutSnapshotRef.current;
      onUpdateTextTransform?.(elementKey, {
        width: finalGeometry.width,
        ...transformedPosition,
      }, snapshot ? {
        ...snapshot,
        [`${elementKey}Pos`]: transformedPosition,
      } : undefined);
      textResizeSessionRef.current = null;
      textResizeDraftRef.current = null;
      textLayoutSnapshotRef.current = null;
      setLocalWidth(null);
      setLocalPosition(null);
      setTextLayoutSnapshot(null);
    };

    // ─── TAMANHOS BASE POR FAMÍLIA × ESCALA DO USUÁRIO (item 2) ───
    const headlineBaseSize =
      isBrutalBlock || isStrokeImpact
        ? 32
        : isCinematic
        ? 34
        : isKinetic
        ? 30
        : isBrutalSplit
        ? 28
        : isDataPunch
        ? 28
        : isQuote
        ? 26
        : isCyber
        ? 18
        : isEditorial
        ? 23
        : 22;
    const subtextBaseSize = isBrutalBlock ? 11 : isCyber ? 11 : 12;
    const effHeadlineSizeBase = headlineBaseSize * (post.headlineSizeScale ?? 1) * activeHeadlineScale;
    const effSubtextSize = subtextBaseSize * (post.subtextSizeScale ?? 1) * activeSubtextScale;

    // O tamanho tipográfico é estável. Alterar a largura redistribui apenas as
    // palavras entre linhas; nunca reduz a fonte implicitamente.
    const SPLIT_LINE_RATIO = 0.5;
    const MIN_TEXT_GAP = 8;
    const splitLineY = baseHeight * SPLIT_LINE_RATIO;
    const layoutBottomMargin = post.aspectRatio === "9:16" ? 64 : 32;

    const headlineMetricsFor = (size: number) =>
      layoutRichText({
        text: displayHeadline,
        richText: displayHeadlineChunks,
        width: activeHeadlineWidth,
        fontSize: size,
        fontFamily: post.fontFamily,
        fontStyle: "bold",
        fill: post.palette.headlineColor || post.palette.text,
        align: post.headlineAlign || "left",
        letterSpacing: isBrutalBlock ? 0.5 : isEditorial ? -0.2 : -0.4,
        lineHeight: isBrutalBlock ? 1.1 : 1.25,
      });

    const subtextMetricsFor = (size: number) =>
      layoutRichText({
        text: displaySubtext,
        richText: displaySubtextChunks,
        width: activeSubtextWidth,
        fontSize: size,
        fontFamily: isCyber ? "Space Mono, monospace" : "Inter, sans-serif",
        fontStyle: "normal",
        fill: post.palette.subtextColor || post.palette.text,
        align: post.bodyAlign || "left",
        lineHeight: 1.45,
      });

    const headlineFontSize = effHeadlineSizeBase;
    const subtextFontSize = effSubtextSize;

    const headlineMetrics = headlineMetricsFor(headlineFontSize);
    const subtextMetrics = subtextMetricsFor(subtextFontSize);

    const headlineHeight = headlineMetrics.height;
    const subtextHeight = subtextMetrics.height;
    const totalStackHeight = headlineHeight + subtextHeight + 20;
    const headlineSelectionRects = editingTarget === "headline"
      ? getSelectionGeometry(headlineMetrics, editingSelection.start, editingSelection.end)
      : [];
    const subtextSelectionRects = editingTarget === "subtext"
      ? getSelectionGeometry(subtextMetrics, editingSelection.start, editingSelection.end)
      : [];
    const headlineCaret = editingTarget === "headline"
      ? getCaretGeometry(headlineMetrics, editingSelection.end)
      : null;
    const subtextCaret = editingTarget === "subtext"
      ? getCaretGeometry(subtextMetrics, editingSelection.end)
      : null;

    // ─── CORES COM CONTRASTE GARANTIDO POR METADE (item 1) ───
    // O guardião (lib/contrast.ts) já resolve e persiste no modelo; aqui só
    // consumimos, com fallback legado para modelos sem overrides.
    const rawHeadlineColor = post.palette.headlineColor || post.palette.text;
    const rawSubtextColor =
      post.palette.subtextColor ||
      (isBrutalSplit
        ? resolveLegibleTextColor(post.palette.accent, post.palette.text)
        : post.palette.text);

    const headlineEffect: TextLegibilityEffect = post.headlineEffect || "none";
    const subtextEffect: TextLegibilityEffect = post.subtextEffect || "none";

    const isDarkHeadline = isDarkColor(rawHeadlineColor);
    const isDarkSubtext = isDarkColor(rawSubtextColor);

    const headlineColor =
      headlineEffect === "box-accent"
        ? resolveLegibleTextColor(post.palette.accent, rawHeadlineColor)
        : headlineEffect === "box-brutal"
        ? (isDarkHeadline ? "#000000" : "#FFFFFF")
        : rawHeadlineColor;

    const subtextColor =
      subtextEffect === "box-accent"
        ? resolveLegibleTextColor(post.palette.accent, rawSubtextColor)
        : subtextEffect === "box-brutal"
        ? (isDarkSubtext ? "#000000" : "#FFFFFF")
        : rawSubtextColor;

    const headlineLines = headlineMetrics.lines.map(line => ({ text: "", width: line.width }));
    const subtextLines = subtextMetrics.lines.map(line => ({ text: "", width: line.width }));

    // Posições Padrão Customizadas por Família
    let defaultHeadlineY = 0;
    let defaultSubtextY = 0;
    let defaultBadgeY = 24;
    let defaultBadgeX = 24;
    let defaultBarY = 0;
    let defaultAlign: "left" | "center" | "right" = post.headlineAlign || "left";
    const subtextAlign: "left" | "center" | "right" = post.bodyAlign || "left";

    if (isBrutalBlock) {
      // Brutalismo: Centralizado verticalmente com tipografia massiva
      defaultHeadlineY = Math.max(60, (baseHeight - totalStackHeight) / 2 - 10);
      defaultSubtextY = defaultHeadlineY + headlineHeight + 12;
      defaultBadgeX = baseWidth - 115;
      defaultBadgeY = 22;
      defaultBarY = defaultSubtextY + subtextHeight + 16;
    } else if (isBrutalSplit) {
      // Split: Título na metade escura de cima, Subtítulo na base de cor vibrante.
      // A linha de corte de COR e a âncora de TEXTO usam a MESMA linha (50%):
      // o subtítulo nunca sobreporá o título — fica no mínimo na linha de corte.
      defaultHeadlineY = Math.max(45, (splitLineY - headlineHeight) / 2 + 10);
      defaultSubtextY = Math.max(splitLineY + 16, defaultHeadlineY + headlineHeight + MIN_TEXT_GAP);
      defaultBadgeX = 24;
      defaultBadgeY = 18;
      defaultBarY = baseHeight - 20;
    } else if (isGlass) {
      // Glass: Card flutuante central
      defaultBadgeX = (baseWidth - 120) / 2;
      defaultBadgeY = 32;
      defaultHeadlineY = Math.max(80, baseHeight - 48 - totalStackHeight);
      defaultSubtextY = defaultHeadlineY + headlineHeight + 10;
      defaultBarY = defaultSubtextY + subtextHeight + 14;
    } else if (isDuotone) {
      // Duotone: Composição centrada e fluida
      defaultBadgeX = 24;
      defaultBadgeY = 24;
      defaultHeadlineY = Math.max(70, (baseHeight - totalStackHeight) / 2 + 15);
      defaultSubtextY = defaultHeadlineY + headlineHeight + 12;
      defaultBarY = defaultSubtextY + subtextHeight + 16;
    } else {
      // Distribuição harmônica e centrada (preserva a posição estável do texto com ou sem foto de fundo)
      const availableHeight = baseHeight - layoutBottomMargin;
      defaultHeadlineY = Math.max(
        hasVisibleBadge ? 54 : 36,
        Math.round((availableHeight - totalStackHeight) / 2)
      );
      defaultSubtextY = defaultHeadlineY + headlineHeight + 12;
      defaultBadgeX = 24;
      defaultBadgeY = 22;
      defaultBarY = defaultSubtextY + subtextHeight + 16;
    }

    const badgePos = currentSlide?.badgePos || { x: defaultBadgeX, y: defaultBadgeY };
    const headlinePos = localHeadlinePosition ?? textLayoutSnapshot?.headlinePos ?? currentSlide?.headlinePos ?? { x: 24, y: defaultHeadlineY };
    const subtextPos = localSubtextPosition ?? textLayoutSnapshot?.subtextPos ?? currentSlide?.subtextPos ?? { x: 24, y: defaultSubtextY };
    const barPos = textLayoutSnapshot?.barPos ?? currentSlide?.barPos ?? {
      x: defaultAlign === "center" ? (baseWidth - 42) / 2 : defaultAlign === "right" ? baseWidth - 24 - 42 : 24,
      y: defaultBarY,
    };
    const freezeTextLayout = () => {
      const snapshot = { headlinePos, subtextPos, barPos };
      textLayoutSnapshotRef.current = snapshot;
      setTextLayoutSnapshot(snapshot);
    };
    // ─── LOGO: posição inicial derivada de logoPosition (4 posições válidas);
    // o drag do usuário (logoPos por slide) sempre prevalece sobre o default ───
    const defaultLogoPositions: Record<LogoPositionType, ElementPosition> = {
      "top-left": { x: 16, y: 16 },
      "top-right": { x: baseWidth - 62, y: 16 },
      "bottom-left": { x: 16, y: baseHeight - 40 },
      "bottom-right": { x: baseWidth - 62, y: baseHeight - 40 },
    };
    const logoPos = currentSlide?.logoPos || defaultLogoPositions[post.logoPosition || "top-right"];

    const splitBgPos: SplitBgPosition = currentSlide?.splitBgPosition || post.splitBgPosition || "bottom";
    const isSplitHalf = isBrutalSplit && splitBgPos !== "full";
    const targetBgWidth = baseWidth;
    const targetBgHeight = isSplitHalf ? baseHeight * 0.5 : baseHeight;
    const targetBgY = isSplitHalf && splitBgPos === "bottom" ? baseHeight * 0.5 : 0;

    const bgPlacement = currentSlide?.bgPlacement || post.bgPlacement;
    const computedBgLayout = bgImgElement
      ? computeBackgroundGeometry({
          imageWidth: bgImgElement.naturalWidth || bgImgElement.width,
          imageHeight: bgImgElement.naturalHeight || bgImgElement.height,
          baseWidth,
          baseHeight,
          placement: bgPlacement,
          transformOverride: bgTransform,
          splitBgPos,
          isBrutalSplit,
        })
      : undefined;

    const bgCrop = computedBgLayout?.crop;

    // ─── MAGNET SNAP CALCULATION VIA DRAGBOUNDFUNC (Konva Canonical) ───
    const createSnapBoundFunc = (elemWidth: number, elemHeight: number) => {
      return (pos: { x: number; y: number }) => {
        const isSnap = post.isSnapEnabled !== false && !isAltPressed;
        if (!isSnap) {
          setSnapLines({});
          return pos;
        }

        const tolerance = 12;
        let resX = pos.x;
        let resY = pos.y;
        let guideX: number | undefined;
        let guideY: number | undefined;

        const leftX = pos.x;
        const centerX = pos.x + elemWidth / 2;
        const rightX = pos.x + elemWidth;

        const topY = pos.y;
        const centerY = pos.y + elemHeight / 2;
        const bottomY = pos.y + elemHeight;

        // Grade 5x5 (20%, 40%, 50%, 60%, 80%) + Margens (24px)
        const gridX = [24, baseWidth * 0.2, baseWidth * 0.4, baseWidth * 0.5, baseWidth * 0.6, baseWidth * 0.8, baseWidth - 24];
        const gridY = [24, baseHeight * 0.2, baseHeight * 0.4, baseHeight * 0.5, baseHeight * 0.6, baseHeight * 0.8, baseHeight - 24];

        for (const gx of gridX) {
          if (Math.abs(leftX - gx) <= tolerance) {
            resX = gx;
            guideX = gx;
            break;
          } else if (Math.abs(centerX - gx) <= tolerance) {
            resX = gx - elemWidth / 2;
            guideX = gx;
            break;
          } else if (Math.abs(rightX - gx) <= tolerance) {
            resX = gx - elemWidth;
            guideX = gx;
            break;
          }
        }

        for (const gy of gridY) {
          if (Math.abs(topY - gy) <= tolerance) {
            resY = gy;
            guideY = gy;
            break;
          } else if (Math.abs(centerY - gy) <= tolerance) {
            resY = gy - elemHeight / 2;
            guideY = gy;
            break;
          } else if (Math.abs(bottomY - gy) <= tolerance) {
            resY = gy - elemHeight;
            guideY = gy;
            break;
          }
        }

        setSnapLines({ x: guideX, y: guideY });
        return { x: resX, y: resY };
      };
    };

    const handleDragMove = () => {
      // Keep snap visual lines active during drag
    };

    const handleTextDragMove = (e: any, resizeFrame: React.MutableRefObject<any>) => {
      handleDragMove();
      resizeFrame.current?.position({ x: e.target.x(), y: e.target.y() });
      transformerRef.current?.forceUpdate?.();
    };

    const handleDragEnd = (
      e: any,
      elementKey: "headlinePos" | "subtextPos" | "badgePos" | "barPos" | "logoPos",
      resizeFrame?: React.MutableRefObject<any>
    ) => {
      setSnapLines({});
      resizeFrame?.current?.position({ x: e.target.x(), y: e.target.y() });
      if (onUpdateElementPosition) {
        onUpdateElementPosition(elementKey, {
          x: Math.round(e.target.x()),
          y: Math.round(e.target.y()),
        });
      }
    };

    const handleSelect = (id: string) => {
      setSelectedId(id);
      if (onSelectElement) onSelectElement(id);
    };

    const syncNativeSelection = (start: number, end = start) => {
      const textarea = textareaRef.current;
      setEditingSelection({ start, end });
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start, end);
      textarea.dispatchEvent(new Event("select", { bubbles: true }));
    };

    const pointerInNode = (event: any, node: any): { x: number; y: number } | null => {
      const stage = event?.target?.getStage?.();
      const pointer = stage?.getPointerPosition?.();
      if (!pointer || !node) return null;
      return node.getAbsoluteTransform().copy().invert().point(pointer);
    };

    const caretIndexFromEvent = (event: any, target: string, layout?: RichTextLayout): number => {
      if (!layout) return editingTextRef.current.length;
      const node = target === "headline"
        ? headlineRef.current
        : target === "subtext"
        ? subtextRef.current
        : extraTextRefs.current[target];
      const point = pointerInNode(event, node);
      return point ? hitTestRichText(layout, point.x, point.y) : layout.glyphs.at(-1)?.end ?? 0;
    };

    // ─── Ações de Edição Direta no Canvas ───
    const startEditing = (target: string, event?: any, targetLayout?: RichTextLayout) => {
      if (isReadOnly || isEditingBackground) return;
      transformerRef.current?.nodes([]);
      transformerRef.current?.getLayer()?.batchDraw();
      let initialText = "";
      let initialChunks: CanvasRichTextChunk[] | undefined;
      let caretIndex = 0;
      if (target === "headline") {
        initialText = activeHeadline;
        initialChunks = applyRichTextFormat(activeHeadline, activeHeadlineChunks, {}, 0, 0);
        caretIndex = caretIndexFromEvent(event, target, headlineMetrics);
      } else if (target === "subtext") {
        initialText = activeSubtext;
        initialChunks = applyRichTextFormat(activeSubtext, activeSubtextChunks, {}, 0, 0);
        caretIndex = caretIndexFromEvent(event, target, subtextMetrics);
      } else if (target === "badge") {
        initialText = persistedBadgeText;
        caretIndex = initialText.length;
      }
      else {
        const found = activeExtraTexts.find((t) => t.id === target);
        if (found) {
          initialText = found.text;
          initialChunks = found.textRich;
          caretIndex = targetLayout
            ? caretIndexFromEvent(event, target, targetLayout)
            : initialText.length;
        }
      }
      setSelectedId(target);
      onSelectElement?.(target);
      if (target === "headline" || target === "subtext") {
        freezeTextLayout();
      }
      const initialSelection = event
        ? wordRangeAt(initialText, caretIndex)
        : { start: 0, end: initialText.length };
      setEditingTarget(target);
      setEditingText(initialText);
      setEditingRichText(initialChunks);
      pendingSelectionRef.current = initialSelection;
      setEditingSelection(initialSelection);
    };

    const handleCommitText = () => {
      const target = editingTargetRef.current;
      const val = editingTextRef.current;
      if (target) {
        if (target === "headline" || target === "subtext") {
          const chunks = editingRichTextRef.current || [{ text: val }];
          if (onCommitTextEdit) {
            onCommitTextEdit(target, val, chunks, textLayoutSnapshotRef.current || undefined);
          }
          else {
            onUpdateText?.(target, val);
            onUpdateRichText?.(target, chunks);
          }
        } else if (target === "badge") {
          onUpdateText?.("badgeText", val);
        } else if (onUpdateExtraText) {
          onUpdateExtraText(target, {
            text: val,
            textRich: editingRichTextRef.current,
          });
        } else if (onUpdateExtraTextContent) {
          onUpdateExtraTextContent(target, val);
        }
      }
      setEditingTarget(null);
      setEditingRichText(undefined);
      setTextLayoutSnapshot(null);
      selectionAnchorRef.current = null;
      activeSelectionHandleRef.current = null;
    };

    const handleCancelText = () => {
      setEditingTarget(null);
      setEditingRichText(undefined);
      setTextLayoutSnapshot(null);
      selectionAnchorRef.current = null;
      activeSelectionHandleRef.current = null;
    };

    useEffect(() => {
      if (!editingTarget) return;
      const commitWhenLeavingCanvas = (event: PointerEvent) => {
        const target = event.target as Node | null;
        if (target && stageContainerRef.current?.contains(target)) return;
        if (target instanceof Element && target.closest("[data-text-edit-chrome]")) return;
        handleCommitText();
      };
      document.addEventListener("pointerdown", commitWhenLeavingCanvas, true);
      return () => document.removeEventListener("pointerdown", commitWhenLeavingCanvas, true);
    }, [editingTarget]);

    useEffect(() => {
      if (editingTarget && textareaRef.current) {
        const el = textareaRef.current;
        el.focus();
        const range = pendingSelectionRef.current ?? { start: el.value.length, end: el.value.length };
        pendingSelectionRef.current = null;
        el.setSelectionRange(range.start, range.end);
        setEditingSelection(range);
        el.dispatchEvent(new Event("select", { bubbles: true }));
      }
    }, [editingTarget]);

    const handleEditingPointerDown = (event: any, target: string, layout: RichTextLayout) => {
      if (editingTarget !== target) return;
      event.cancelBubble = true;
      event.evt?.preventDefault?.();
      const index = caretIndexFromEvent(event, target, layout);
      selectionAnchorRef.current = index;
      syncNativeSelection(index);
    };

    const handleTextClick = (event: any, target: string, layout: RichTextLayout) => {
      handleSelect(target);
      if ((event.evt?.detail ?? 0) < 3) return;
      if (editingTargetRef.current === target) syncNativeSelection(0, editingTextRef.current.length);
      else startEditing(target, undefined, layout);
    };

    const handleTextDoubleClick = (event: any, target: string, layout: RichTextLayout) => {
      if (editingTargetRef.current === target) {
        const index = caretIndexFromEvent(event, target, layout);
        const range = wordRangeAt(editingTextRef.current, index);
        syncNativeSelection(range.start, range.end);
      } else {
        startEditing(target, event, layout);
      }
    };

    const clearLongPress = () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      longPressPointRef.current = null;
    };

    const handleTextTouchStart = (event: any, target: string, layout: RichTextLayout) => {
      handleEditingPointerDown(event, target, layout);
      if (editingTargetRef.current || !isMobile) return;
      clearLongPress();
      const touch = event.evt?.touches?.[0];
      if (!touch) return;
      longPressPointRef.current = { x: touch.clientX, y: touch.clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressPointRef.current = null;
        startEditing(target, event, layout);
      }, 450);
    };

    const handleTextTouchMove = (event: any, target: string, layout: RichTextLayout) => {
      const touch = event.evt?.touches?.[0];
      const start = longPressPointRef.current;
      if (touch && start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 8) clearLongPress();
      handleEditingPointerMove(event, target, layout);
    };

    const handleSelectionHandleStart = (event: any, target: string, edge: "start" | "end", layout: RichTextLayout) => {
      event.cancelBubble = true;
      event.evt?.preventDefault?.();
      selectionAnchorRef.current = null;
      activeSelectionHandleRef.current = {
        target,
        anchor: edge === "start" ? editingSelection.end : editingSelection.start,
        layout,
      };
    };

    const handleStageSelectionMove = (event: any) => {
      const drag = activeSelectionHandleRef.current;
      if (!drag) return;
      event.evt?.preventDefault?.();
      const index = caretIndexFromEvent(event, drag.target, drag.layout);
      syncNativeSelection(Math.min(drag.anchor, index), Math.max(drag.anchor, index));
    };

    const handleEditingPointerMove = (event: any, target: string, layout: RichTextLayout) => {
      if (editingTarget !== target || selectionAnchorRef.current === null) return;
      const index = caretIndexFromEvent(event, target, layout);
      syncNativeSelection(selectionAnchorRef.current, index);
    };

    const handleEditingPointerUp = () => {
      selectionAnchorRef.current = null;
      activeSelectionHandleRef.current = null;
      clearLongPress();
    };

    const handleStagePointerDown = (e: any) => {
      // Ignora clique no Transformer ou em suas âncoras
      const isTransformer =
        e.target?.getParent?.()?.className === "Transformer" ||
        e.target?.className === "Transformer";
      if (isTransformer) return;

      // Se o clique foi em um dos grupos selecionáveis, deixa seus handlers próprios agirem
      const isHeadline = isDescendantOf(e.target, headlineRef.current);
      const isSubtext = isDescendantOf(e.target, subtextRef.current);
      const isBadge = isDescendantOf(e.target, badgeRef.current);
      const isBar = isDescendantOf(e.target, barRef.current);
      const isLogo = isDescendantOf(e.target, logoRef.current);
      const isExtraText = Object.values(extraTextRefs.current).some((ref) => isDescendantOf(e.target, ref));
      const isExtraImage = Object.values(extraImageRefs.current).some((ref) => isDescendantOf(e.target, ref));

      // Clicar em outro elemento conclui primeiro a edição corrente. Isso evita
      // que seleção visual e alvo do teclado fiquem apontando para objetos distintos.
      if (editingTarget) {
        const editingNode = editingTarget === "headline"
          ? headlineRef.current
          : editingTarget === "subtext"
          ? subtextRef.current
          : editingTarget === "badge"
          ? badgeRef.current
          : extraTextRefs.current[editingTarget];
        if (!isDescendantOf(e.target, editingNode)) handleCommitText();
      }

      if (isHeadline || isSubtext || isBadge || isBar || isLogo || isExtraText || isExtraImage) {
        return;
      }

      // Se estiver no modo de edição de fundo, o clique no fundo é tratado pelo transformer de fundo
      if (isEditingBackground) {
        return;
      }

      // Clique fora (no fundo do canvas, imagem de fundo ou área vazia): desseleciona e conclui edição
      if (editingTarget) {
        handleCommitText();
      }
      setSelectedId(null);
      if (onSelectElement) onSelectElement(null);
    };

    const scaledWidth = baseWidth * zoom;
    const scaledHeight = baseHeight * zoom;
    const touchScale = isMobile
      ? Math.min(5, Math.max(1, baseWidth / (stageContainerRef.current?.getBoundingClientRect().width || baseWidth)))
      : 1;

    return (
      <div
        ref={stageContainerRef}
        className="relative select-none shrink-0 transition-transform duration-200"
        style={{
          width: scaledWidth,
          height: scaledHeight,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedId(null);
            if (onSelectElement) onSelectElement(null);
          }
        }}
      >
        <div
          className="rounded-[28px] overflow-hidden shadow-[0_32px_90px_rgba(0,0,0,0.9)] border border-white/15 relative"
          style={{
            width: baseWidth,
            height: baseHeight,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
          <Stage
            ref={stageRef}
            width={baseWidth}
            height={baseHeight}
            onMouseDown={handleStagePointerDown}
            onTouchStart={handleStagePointerDown}
            onMouseUp={handleEditingPointerUp}
            onTouchEnd={handleEditingPointerUp}
            onMouseMove={handleStageSelectionMove}
            onTouchMove={handleStageSelectionMove}
            onTouchCancel={handleEditingPointerUp}
          >
            <Layer listening={isInteractive}>
              {/* ─── 0. GRADE GUIA 5x5 DE ALINHAMENTO MAGNÉTICO (GPU-Accelerated) ─── */}
              {post.isSnapEnabled !== false && (
                <>
                  {[0.2, 0.4, 0.5, 0.6, 0.8].map((ratio) => (
                    <Line
                      key={`grid-x-${ratio}`}
                      points={[baseWidth * ratio, 0, baseWidth * ratio, baseHeight]}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={1}
                      dash={[4, 4]}
                      listening={false}
                    />
                  ))}
                  {[0.2, 0.4, 0.5, 0.6, 0.8].map((ratio) => (
                    <Line
                      key={`grid-y-${ratio}`}
                      points={[0, baseHeight * ratio, baseWidth, baseHeight * ratio]}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={1}
                      dash={[4, 4]}
                      listening={false}
                    />
                  ))}
                </>
              )}

              {/* ─── 1. FUNDOS ESPECÍFICOS DE CADA FAMÍLIA ─── */}
              {isBrutalSplit ? (
                // 1.A) BRUTAL SPLIT (@design.deb): 2 BLOCOS CROMÁTICOS LIMPOS SEM SELO
                <>
                  <Rect name="canvas-bg" x={0} y={0} width={baseWidth} height={baseHeight * 0.5} fill={post.palette.background || "#171717"} />
                  <Rect name="canvas-bg" x={0} y={baseHeight * 0.5} width={baseWidth} height={baseHeight * 0.5} fill={post.palette.accent || "#21F1A8"} />
                </>
              ) : isDuotone ? (
                // 1.B) DUOTONE WASH: GRADIENTE LINEAR DIAGONAL RICO A 135°
                <>
                  <Rect
                    name="canvas-bg"
                    x={0}
                    y={0}
                    width={baseWidth}
                    height={baseHeight}
                    fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                    fillLinearGradientEndPoint={{ x: baseWidth, y: baseHeight }}
                    fillLinearGradientColorStops={[0, post.palette.background || "#2A0845", 1, post.palette.accent || "#FF3366"]}
                  />
                  <Circle name="canvas-bg" x={baseWidth * 0.8} y={baseHeight * 0.2} radius={120} fill={post.palette.accent} opacity={0.25} listening={false} />
                </>
              ) : isCinematic ? (
                // 1.C) CINEMATIC DEPTH: Fundo escuro com moldura cinematográfica
                <>
                  <Rect name="canvas-bg" x={0} y={0} width={baseWidth} height={baseHeight} fill={post.palette.background || "#08080A"} />
                  <Rect x={12} y={12} width={baseWidth - 24} height={baseHeight - 24} stroke="rgba(255,255,255,0.08)" strokeWidth={1} listening={false} />
                </>
              ) : (
                // 1.D) FUNDO SÓLIDO BASE
                <Rect name="canvas-bg" x={0} y={0} width={baseWidth} height={baseHeight} fill={post.palette.background} />
              )}

              {/* IMAGEM DE FUNDO COM SUPORTE A EDIÇÃO ESTILO CANVA E RECORTE DO BRUTAL SPLIT */}
              {bgImgElement && (() => {
                const bgImageNode = (
                  <KonvaImage
                    ref={bgImageRef}
                    image={bgImgElement}
                    x={computedBgLayout ? computedBgLayout.x : (bgTransform?.x ?? 0)}
                    y={computedBgLayout ? computedBgLayout.y : (bgTransform?.y ?? targetBgY)}
                    scaleX={computedBgLayout ? computedBgLayout.scaleX : (bgTransform?.scaleX ?? 1)}
                    scaleY={computedBgLayout ? computedBgLayout.scaleY : (bgTransform?.scaleY ?? 1)}
                    rotation={computedBgLayout ? computedBgLayout.rotation : (bgTransform?.rotation ?? 0)}
                    width={computedBgLayout ? computedBgLayout.width : targetBgWidth}
                    height={computedBgLayout ? computedBgLayout.height : targetBgHeight}
                    crop={bgCrop}
                    opacity={isEditingBackground ? 0.95 : 0.8}
                    draggable={isInteractive && isEditingBackground}
                    onDblClick={() => {
                      if (!isEditingBackground && onEnterBackgroundEdit) {
                        onEnterBackgroundEdit();
                      }
                    }}
                    onDragEnd={(e) => {
                      if (!onUpdateBgTransform) return;
                      onUpdateBgTransform({
                        x: Math.round(e.target.x()),
                        y: Math.round(e.target.y()),
                        scaleX: Number(e.target.scaleX().toFixed(3)),
                        scaleY: Number(e.target.scaleY().toFixed(3)),
                        rotation: Math.round(e.target.rotation()),
                      });
                    }}
                    onTransformEnd={() => {
                      if (!onUpdateBgTransform) return;
                      const node = bgImageRef.current;
                      if (!node) return;
                      onUpdateBgTransform({
                        x: Math.round(node.x()),
                        y: Math.round(node.y()),
                        scaleX: Number(node.scaleX().toFixed(3)),
                        scaleY: Number(node.scaleY().toFixed(3)),
                        rotation: Math.round(node.rotation()),
                      });
                    }}
                  />
                );

                const effectiveOverlayColor = normalizeHexColor(post.overlayColor || post.palette.background || "#000000");
                const mode = post.overlayMode || "gradient-bottom";
                const opacity = isEditingBackground ? 0.2 : (post.overlayOpacity ?? 0.55);

                const overlayNode = (() => {
                  if (mode === "solid") {
                    return (
                      <Rect
                        x={0}
                        y={targetBgY}
                        width={targetBgWidth}
                        height={targetBgHeight}
                        fill={effectiveOverlayColor}
                        opacity={opacity}
                        listening={false}
                      />
                    );
                  }

                  if (mode === "radial") {
                    return (
                      <Rect
                        x={0}
                        y={targetBgY}
                        width={targetBgWidth}
                        height={targetBgHeight}
                        fillRadialGradientStartPoint={{ x: targetBgWidth / 2, y: targetBgY + targetBgHeight / 2 }}
                        fillRadialGradientStartRadius={0}
                        fillRadialGradientEndPoint={{ x: targetBgWidth / 2, y: targetBgY + targetBgHeight / 2 }}
                        fillRadialGradientEndRadius={Math.max(targetBgWidth, targetBgHeight) * 0.72}
                        fillRadialGradientColorStops={[
                          0,
                          `${effectiveOverlayColor}00`,
                          0.45,
                          `${effectiveOverlayColor}66`,
                          1,
                          effectiveOverlayColor,
                        ]}
                        opacity={opacity}
                        listening={false}
                      />
                    );
                  }

                  if (mode === "gradient-top") {
                    return (
                      <Rect
                        x={0}
                        y={targetBgY}
                        width={targetBgWidth}
                        height={targetBgHeight}
                        fillLinearGradientStartPoint={{ x: 0, y: targetBgY }}
                        fillLinearGradientEndPoint={{ x: 0, y: targetBgY + targetBgHeight }}
                        fillLinearGradientColorStops={[
                          0,
                          effectiveOverlayColor,
                          0.5,
                          `${effectiveOverlayColor}BB`,
                          1,
                          `${effectiveOverlayColor}22`,
                        ]}
                        opacity={opacity}
                        listening={false}
                      />
                    );
                  }

                  // Padrão: gradient-bottom (suave no topo, denso na base)
                  return (
                    <Rect
                      x={0}
                      y={targetBgY}
                      width={targetBgWidth}
                      height={targetBgHeight}
                      fillLinearGradientStartPoint={{ x: 0, y: targetBgY }}
                      fillLinearGradientEndPoint={{ x: 0, y: targetBgY + targetBgHeight }}
                      fillLinearGradientColorStops={[
                        0,
                        `${effectiveOverlayColor}22`,
                        0.5,
                        `${effectiveOverlayColor}BB`,
                        1,
                        effectiveOverlayColor,
                      ]}
                      opacity={opacity}
                      listening={false}
                    />
                  );
                })();

                if (isSplitHalf) {
                  return (
                    <Group
                      clip={{
                        x: 0,
                        y: targetBgY,
                        width: targetBgWidth,
                        height: targetBgHeight,
                      }}
                    >
                      {bgImageNode}
                      {overlayNode}
                    </Group>
                  );
                }

                return (
                  <>
                    {bgImageNode}
                    {overlayNode}
                  </>
                );
              })()}

              {/* Linha divisória do Brutal Split (sempre no topo dos blocos de fundo) */}
              {isBrutalSplit && (
                <Line
                  points={[0, baseHeight * 0.5, baseWidth, baseHeight * 0.5]}
                  stroke="#000000"
                  strokeWidth={2}
                  opacity={0.4}
                  listening={false}
                />
              )}

              {/* ─── PRIMEIRO PLANO (TEXTOS E ELEMENTOS GRÁFICOS) ─── */}
              {/* Quando isEditingBackground === true (Estilo Canva), o primeiro plano atenua e não captura cliques */}
              <Group
                listening={!isEditingBackground && isInteractive}
                opacity={isEditingBackground ? 0.35 : 1}
              >
                {/* ─── 2. DETALHES GRÁFICOS ÚNICOS DE CADA FAMÍLIA ─── */}

              {/* 2.A) EDITORIAL: Aspas Gigantes no Fundo + Divisória Fina */}
              {isEditorial && (
                <>
                  <Text
                    text="“"
                    x={24}
                    y={16}
                    fontSize={72}
                    fontFamily="Playfair Display, serif"
                    fontStyle="italic"
                    fill={post.palette.accent}
                    opacity={0.25}
                    listening={false}
                  />
                  <Line
                    points={[24, defaultSubtextY - 6, baseWidth - 24, defaultSubtextY - 6]}
                    stroke={post.palette.accent}
                    strokeWidth={0.8}
                    opacity={0.35}
                  />
                </>
              )}

              {/* 2.B) GLASS VEIL: Card de Vidro Translúcido Flutuante (Frosted Glass) */}
              {isGlass && (
                <Rect
                  x={16}
                  y={16}
                  width={baseWidth - 32}
                  height={baseHeight - 32}
                  cornerRadius={22}
                  fill="rgba(255, 255, 255, 0.05)"
                  stroke="rgba(255, 255, 255, 0.16)"
                  strokeWidth={1.2}
                  shadowColor="rgba(0,0,0,0.5)"
                  shadowBlur={20}
                  shadowOffset={{ x: 0, y: 8 }}
                  listening={false}
                />
              )}

              {/* 2.C) CYBER & TECH: Grid de Linhas / Pontos Ciano + Miras de Canto (+) */}
              {isCyber && (
                <>
                  {/* Miras nos 4 Cantos */}
                  <Text text="+" x={14} y={12} fontSize={14} fontFamily="Space Mono" fill="#00F0FF" opacity={0.6} />
                  <Text text="+" x={baseWidth - 24} y={12} fontSize={14} fontFamily="Space Mono" fill="#00F0FF" opacity={0.6} />
                  <Text text="+" x={14} y={baseHeight - 24} fontSize={14} fontFamily="Space Mono" fill="#00F0FF" opacity={0.6} />
                  <Text text="+" x={baseWidth - 24} y={baseHeight - 24} fontSize={14} fontFamily="Space Mono" fill="#00F0FF" opacity={0.6} />
                  {/* Coordenada Tech no Rodapé */}
                  <Text
                    text="// SYS_VER.2026 // POST_INIT"
                    x={24}
                    y={baseHeight - 22}
                    fontSize={8}
                    fontFamily="Space Mono"
                    fill="#00F0FF"
                    opacity={0.4}
                  />
                </>
              )}

              {/* ─── 3. BADGES / TAGS INDIVIDUAIS COM ESTILOS PRÓPRIOS ─── */}
              {hasVisibleBadge && (
                isBrutalBlock ? (
                  // 3.A) BRUTALISMO: Sticker Angular Rotacionado no Canto Superior
                  <Group
                    ref={badgeRef}
                    x={badgePos.x}
                    y={badgePos.y}
                    rotation={-4}
                    draggable={isInteractive}
                    dragBoundFunc={isInteractive ? createSnapBoundFunc(Math.max(95, primaryBadgeText.length * 8 + 20), 26) : undefined}
                    onClick={() => handleSelect("badge")}
                    onDblClick={() => startEditing("badge")}
                    onDblTap={() => startEditing("badge")}
                    onDragMove={handleDragMove}
                    onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                  >
                    <Rect
                      x={0}
                      y={0}
                      width={Math.max(95, primaryBadgeText.length * 8 + 20)}
                      height={26}
                      fill="#000000"
                      stroke={post.palette.accent}
                      strokeWidth={2}
                      shadowColor="rgba(0,0,0,0.8)"
                      shadowBlur={6}
                      shadowOffset={{ x: 2, y: 3 }}
                    />
                    <Text
                      text={primaryBadgeText.toUpperCase()}
                      x={8}
                      y={7}
                      fontSize={10}
                      fontFamily="Anton"
                      fontStyle="bold"
                      fill={post.palette.accent}
                      letterSpacing={1}
                      opacity={1}
                      onDblClick={() => startEditing("badge")}
                      onDblTap={() => startEditing("badge")}
                    />
                  </Group>
                ) : isBrutalSplit ? (
                  // 3.B) BRUTAL SPLIT: Tag Neobrutalista Quadrada
                  <Group
                    ref={badgeRef}
                    x={badgePos.x}
                    y={badgePos.y}
                    draggable={isInteractive}
                    dragBoundFunc={isInteractive ? createSnapBoundFunc(primaryBadgeText.length * 7 + 16, 22) : undefined}
                    onClick={() => handleSelect("badge")}
                    onDblClick={() => startEditing("badge")}
                    onDblTap={() => startEditing("badge")}
                    onDragMove={handleDragMove}
                    onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                  >
                    <Rect x={0} y={0} width={primaryBadgeText.length * 7 + 16} height={22} fill="#FFFFFF" stroke="#000000" strokeWidth={1.5} />
                    <Text text={primaryBadgeText.toUpperCase()} x={8} y={6} fontSize={8.5} fontFamily="monospace" fontStyle="bold" fill="#000000" letterSpacing={1} opacity={1} onDblClick={() => startEditing("badge")} onDblTap={() => startEditing("badge")} />
                  </Group>
                ) : isCyber ? (
                  // 3.C) CYBER: Badge Terminal Neon
                  <Group
                    ref={badgeRef}
                    x={badgePos.x}
                    y={badgePos.y}
                    draggable={isInteractive}
                    dragBoundFunc={isInteractive ? createSnapBoundFunc(primaryBadgeText.length * 7 + 22, 22) : undefined}
                    onClick={() => handleSelect("badge")}
                    onDblClick={() => startEditing("badge")}
                    onDblTap={() => startEditing("badge")}
                    onDragMove={handleDragMove}
                    onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                  >
                    <Rect x={0} y={0} width={primaryBadgeText.length * 7 + 22} height={22} fill="rgba(0, 240, 255, 0.08)" stroke="#00F0FF" strokeWidth={1} cornerRadius={2} />
                    <Text text={`[ ${primaryBadgeText.toUpperCase()} ]`} x={8} y={6} fontSize={8.5} fontFamily="Space Mono" fontStyle="bold" fill="#00F0FF" letterSpacing={1} opacity={1} onDblClick={() => startEditing("badge")} onDblTap={() => startEditing("badge")} />
                  </Group>
                ) : (
                  // 3.D) PADRÃO / EDITORIAL / GLASS / DUOTONE: Pílula Refinada
                  <Group
                    ref={badgeRef}
                    x={badgePos.x}
                    y={badgePos.y}
                    draggable={isInteractive}
                    dragBoundFunc={isInteractive ? createSnapBoundFunc(primaryBadgeText.length * 7 + 18, 22) : undefined}
                    onClick={() => handleSelect("badge")}
                    onDblClick={() => startEditing("badge")}
                    onDblTap={() => startEditing("badge")}
                    onDragMove={handleDragMove}
                    onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                  >
                    <Rect
                      x={0}
                      y={0}
                      width={primaryBadgeText.length * 7 + 18}
                      height={22}
                      cornerRadius={11}
                      fill={isGlass ? "rgba(255,255,255,0.12)" : `${post.palette.accent}22`}
                      stroke={isGlass ? "rgba(255,255,255,0.25)" : `${post.palette.accent}66`}
                      strokeWidth={1}
                    />
                    <Text
                      text={primaryBadgeText.toUpperCase()}
                      x={9}
                      y={6}
                      fontSize={8.5}
                      fontFamily="monospace"
                      fontStyle="bold"
                      fill={isGlass ? "#FFFFFF" : post.palette.accent}
                      letterSpacing={1.5}
                      opacity={1}
                      onDblClick={() => startEditing("badge")}
                      onDblTap={() => startEditing("badge")}
                    />
                  </Group>
                )
              )}

              {/* ─── 3.E) CHIP SECUNDÁRIO DE PAGINAÇÃO DE CARROSSEL (QUANDO AMBOS ATIVOS) ─── */}
              {showSecondarySlideChip && (
                <Group
                  x={Math.max(20, baseWidth - (secondarySlideText.length * 6.5 + 16) - 24)}
                  y={28}
                  listening={false}
                >
                  <Rect
                    x={0}
                    y={0}
                    width={secondarySlideText.length * 6.5 + 16}
                    height={20}
                    cornerRadius={10}
                    fill="rgba(0, 0, 0, 0.45)"
                    stroke="rgba(255, 255, 255, 0.18)"
                    strokeWidth={0.8}
                  />
                  <Text
                    text={secondarySlideText.toUpperCase()}
                    x={8}
                    y={5}
                    fontSize={8}
                    fontFamily="monospace"
                    fontStyle="bold"
                    fill="rgba(255, 255, 255, 0.8)"
                    letterSpacing={1}
                  />
                </Group>
              )}

              {/* ─── 4. LOGO DA MARCA (SE HOUVER) ─── */}
              {logoImgElement && (
                <KonvaImage
                  ref={logoRef}
                  image={logoImgElement}
                  x={logoPos.x}
                  y={logoPos.y}
                  width={46}
                  height={24}
                  draggable={isInteractive}
                  dragBoundFunc={isInteractive ? createSnapBoundFunc(46, 24) : undefined}
                  onClick={() => handleSelect("logo")}
                  onDragMove={handleDragMove}
                  onDragEnd={(e) => handleDragEnd(e, "logoPos")}
                />
              )}

              {/* ─── 5. TÍTULO PRINCIPAL INDIVIDUAL (COM SUPORTE A EFEITOS DE LEGIBILIDADE) ─── */}
              <Rect
                ref={headlineResizeFrameRef}
                x={headlinePos.x}
                y={headlinePos.y}
                width={activeHeadlineWidth}
                height={Math.max(headlineHeight, headlineFontSize)}
                fill="#000000"
                opacity={0}
                listening={false}
                onTransformStart={(e) => handleTextTransformStart(
                  e,
                  "headline",
                  activeHeadlineWidth,
                  headlinePos,
                  { headlinePos, subtextPos, barPos }
                )}
                onTransform={(e) => handleTextTransform(
                  e,
                  "headline",
                  setLocalHeadlineWidth,
                  setLocalHeadlinePosition
                )}
                onTransformEnd={(e) => handleTextTransformEnd(
                  e,
                  "headline",
                  setLocalHeadlineWidth,
                  setLocalHeadlinePosition
                )}
              />
              <Group
                ref={headlineRef}
                x={headlinePos.x}
                y={headlinePos.y}
                draggable={isInteractive && editingTarget !== "headline"}
                dragBoundFunc={isInteractive ? createSnapBoundFunc(activeHeadlineWidth, headlineHeight) : undefined}
                onClick={(event) => handleTextClick(event, "headline", headlineMetrics)}
                onTap={() => handleSelect("headline")}
                onDblClick={(event) => handleTextDoubleClick(event, "headline", headlineMetrics)}
                onDblTap={(event) => handleTextDoubleClick(event, "headline", headlineMetrics)}
                onMouseDown={(event) => handleEditingPointerDown(event, "headline", headlineMetrics)}
                onMouseMove={(event) => handleEditingPointerMove(event, "headline", headlineMetrics)}
                onMouseUp={handleEditingPointerUp}
                onTouchStart={(event) => handleTextTouchStart(event, "headline", headlineMetrics)}
                onTouchMove={(event) => handleTextTouchMove(event, "headline", headlineMetrics)}
                onTouchEnd={handleEditingPointerUp}
                onTouchCancel={handleEditingPointerUp}
                onDragMove={(e) => handleTextDragMove(e, headlineResizeFrameRef)}
                onDragEnd={(e) => handleDragEnd(e, "headlinePos", headlineResizeFrameRef)}
                width={activeHeadlineWidth}
              >
                <Rect
                  width={activeHeadlineWidth}
                  height={Math.max(headlineHeight, headlineFontSize)}
                  fill="rgba(0,0,0,0.001)"
                  stroke={editingTarget === "headline" ? "#38bdf8" : undefined}
                  strokeWidth={editingTarget === "headline" ? 1 : 0}
                  dash={editingTarget === "headline" ? [4, 4] : undefined}
                />
                {renderBackgroundEffect({
                  effect: headlineEffect,
                  contentWidth: activeHeadlineWidth,
                  textHeight: headlineHeight,
                  isDarkText: isDarkHeadline,
                  accentColor: post.palette.accent,
                  customColor: post.headlineEffectColor,
                  lines: headlineLines,
                  lineHeightPx: headlineFontSize * (isBrutalBlock ? 1.1 : 1.25),
                  align: defaultAlign,
                })}
                {headlineSelectionRects.map(rect => (
                  <Rect
                    key={`headline-selection-${rect.lineIndex}`}
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill="rgba(56, 189, 248, 0.34)"
                    listening={false}
                  />
                ))}
                <RichTextRenderer
                  text={displayHeadline}
                  richText={displayHeadlineChunks}
                  x={0}
                  y={0}
                  width={activeHeadlineWidth}
                  fontSize={headlineFontSize}
                  fontFamily={post.fontFamily}
                  fontStyle="bold"
                  fill={headlineColor}
                  align={defaultAlign}
                  lineHeight={isBrutalBlock ? 1.1 : 1.25}
                  letterSpacing={isBrutalBlock ? 0.5 : isEditorial ? -0.2 : -0.4}
                  opacity={1}
                  {...getTextEffectProps(headlineEffect, isDarkHeadline, true, post.headlineEffectColor)}
                />
                {headlineCaret && editingSelection.start === editingSelection.end && (
                  <BlinkingCaret geometry={headlineCaret} />
                )}
                {isMobile && editingTarget === "headline" && <TextSelectionHandles layout={headlineMetrics} start={editingSelection.start} end={editingSelection.end} touchScale={touchScale} onStart={(event, edge, layout) => handleSelectionHandleStart(event, "headline", edge, layout)} />}
              </Group>

              {/* ─── 6. SUBTÍTULO / CORPO INDIVIDUAL (COM SUPORTE A EFEITOS DE LEGIBILIDADE) ─── */}
              <Rect
                ref={subtextResizeFrameRef}
                x={subtextPos.x}
                y={subtextPos.y}
                width={activeSubtextWidth}
                height={Math.max(subtextHeight, subtextFontSize)}
                fill="#000000"
                opacity={0}
                listening={false}
                onTransformStart={(e) => handleTextTransformStart(
                  e,
                  "subtext",
                  activeSubtextWidth,
                  subtextPos,
                  { headlinePos, subtextPos, barPos }
                )}
                onTransform={(e) => handleTextTransform(
                  e,
                  "subtext",
                  setLocalSubtextWidth,
                  setLocalSubtextPosition
                )}
                onTransformEnd={(e) => handleTextTransformEnd(
                  e,
                  "subtext",
                  setLocalSubtextWidth,
                  setLocalSubtextPosition
                )}
              />
              <Group
                ref={subtextRef}
                x={subtextPos.x}
                y={subtextPos.y}
                draggable={isInteractive && editingTarget !== "subtext"}
                dragBoundFunc={isInteractive ? createSnapBoundFunc(activeSubtextWidth, subtextHeight) : undefined}
                onClick={(event) => handleTextClick(event, "subtext", subtextMetrics)}
                onTap={() => handleSelect("subtext")}
                onDblClick={(event) => handleTextDoubleClick(event, "subtext", subtextMetrics)}
                onDblTap={(event) => handleTextDoubleClick(event, "subtext", subtextMetrics)}
                onMouseDown={(event) => handleEditingPointerDown(event, "subtext", subtextMetrics)}
                onMouseMove={(event) => handleEditingPointerMove(event, "subtext", subtextMetrics)}
                onMouseUp={handleEditingPointerUp}
                onTouchStart={(event) => handleTextTouchStart(event, "subtext", subtextMetrics)}
                onTouchMove={(event) => handleTextTouchMove(event, "subtext", subtextMetrics)}
                onTouchEnd={handleEditingPointerUp}
                onTouchCancel={handleEditingPointerUp}
                onDragMove={(e) => handleTextDragMove(e, subtextResizeFrameRef)}
                onDragEnd={(e) => handleDragEnd(e, "subtextPos", subtextResizeFrameRef)}
                width={activeSubtextWidth}
              >
                <Rect
                  width={activeSubtextWidth}
                  height={Math.max(subtextHeight, subtextFontSize)}
                  fill="rgba(0,0,0,0.001)"
                  stroke={editingTarget === "subtext" ? "#38bdf8" : undefined}
                  strokeWidth={editingTarget === "subtext" ? 1 : 0}
                  dash={editingTarget === "subtext" ? [4, 4] : undefined}
                />
                {renderBackgroundEffect({
                  effect: subtextEffect,
                  contentWidth: activeSubtextWidth,
                  textHeight: subtextHeight,
                  isDarkText: isDarkSubtext,
                  accentColor: post.palette.accent,
                  customColor: post.subtextEffectColor,
                  lines: subtextLines,
                  lineHeightPx: subtextFontSize * 1.45,
                  align: subtextAlign,
                })}
                {subtextSelectionRects.map(rect => (
                  <Rect
                    key={`subtext-selection-${rect.lineIndex}`}
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill="rgba(56, 189, 248, 0.34)"
                    listening={false}
                  />
                ))}
                <RichTextRenderer
                  text={displaySubtext}
                  richText={displaySubtextChunks}
                  x={0}
                  y={0}
                  width={activeSubtextWidth}
                  fontSize={subtextFontSize}
                  fontFamily={isCyber ? "Space Mono, monospace" : "Inter, sans-serif"}
                  fill={subtextColor}
                  opacity={isBrutalSplit ? 0.95 : 0.85}
                  align={subtextAlign}
                  lineHeight={1.45}
                  {...getTextEffectProps(subtextEffect, isDarkSubtext, false, post.subtextEffectColor)}
                />
                {subtextCaret && editingSelection.start === editingSelection.end && (
                  <BlinkingCaret geometry={subtextCaret} />
                )}
                {isMobile && editingTarget === "subtext" && <TextSelectionHandles layout={subtextMetrics} start={editingSelection.start} end={editingSelection.end} touchScale={touchScale} onStart={(event, edge, layout) => handleSelectionHandleStart(event, "subtext", edge, layout)} />}
              </Group>

              {/* ─── 7. BARRA DECORATIVA DE ACENTO (OCULTA NO BRUTALISMO/CYBER) ─── */}
              {!isBrutalBlock && !isCyber && (
                <Rect
                  ref={barRef}
                  x={barPos.x}
                  y={barPos.y}
                  width={isEditorial ? 48 : 36}
                  height={isEditorial ? 2 : 3}
                  cornerRadius={2}
                  fill={post.palette.accent}
                  draggable={isInteractive}
                  dragBoundFunc={isInteractive ? createSnapBoundFunc(isEditorial ? 48 : 36, 4) : undefined}
                  onClick={() => handleSelect("bar")}
                  onDragMove={handleDragMove}
                  onDragEnd={(e) => handleDragEnd(e, "barPos")}
                />
              )}

              {/* ─── 7.B) CAIXAS DE TEXTO LIVRES ADICIONAIS ─── */}
              {activeExtraTexts.map((item) => {
                const itemText = editingTarget === item.id ? editingText : item.text;
                const itemRich = editingTarget === item.id ? editingRichText : item.textRich;
                const itemX = item.x ?? Math.round(baseWidth * 0.1);
                const itemY = item.y ?? Math.round(baseHeight * 0.65);
                const itemSize = (item.fontSize || 16) * (item.sizeScale || 1);
                const rawItemColor = item.color || post.palette.text;
                const itemAlign = item.align || "left";
                const itemEffect: TextLegibilityEffect = item.effect || "none";
                const isDarkItem = isDarkColor(rawItemColor);
                const itemColor =
                  itemEffect === "box-accent"
                    ? resolveLegibleTextColor(item.effectColor || post.palette.accent, rawItemColor)
                    : itemEffect === "box-brutal"
                    ? (isDarkItem ? "#000000" : "#FFFFFF")
                    : rawItemColor;
                const itemFont =
                  item.fontFamily ||
                  (isCyber
                    ? "Space Mono, monospace"
                    : isEditorial
                    ? "Playfair Display, serif"
                    : "Inter, sans-serif");
                const itemWidth = item.width || contentWidth;

                const itemMetrics = layoutRichText({
                  text: itemText,
                  richText: itemRich,
                  width: itemWidth,
                  fontSize: itemSize,
                  fontFamily: itemFont,
                  fontStyle:
                    item.fontWeight === "bold"
                      ? "bold"
                      : item.fontStyle === "italic"
                      ? "italic"
                      : "normal",
                  fill: itemColor,
                  align: itemAlign,
                  lineHeight: 1.3,
                });
                const itemSelectionRects = editingTarget === item.id
                  ? getSelectionGeometry(itemMetrics, editingSelection.start, editingSelection.end)
                  : [];
                const itemCaret = editingTarget === item.id
                  ? getCaretGeometry(itemMetrics, editingSelection.end)
                  : null;

                return (
                  <Group
                    key={item.id}
                    ref={(el) => {
                      if (el) extraTextRefs.current[item.id] = el;
                      else delete extraTextRefs.current[item.id];
                    }}
                    x={itemX}
                    y={itemY}
                    rotation={item.rotation || 0}
                    opacity={item.opacity ?? 1}
                    draggable={isInteractive && editingTarget !== item.id}
                    dragBoundFunc={
                      isInteractive
                        ? createSnapBoundFunc(itemWidth, itemMetrics.height)
                        : undefined
                    }
                    onClick={(event) => handleTextClick(event, item.id, itemMetrics)}
                    onTap={() => handleSelect(item.id)}
                    onDblClick={(event) => handleTextDoubleClick(event, item.id, itemMetrics)}
                    onDblTap={(event) => handleTextDoubleClick(event, item.id, itemMetrics)}
                    onMouseDown={(event) => handleEditingPointerDown(event, item.id, itemMetrics)}
                    onMouseMove={(event) => handleEditingPointerMove(event, item.id, itemMetrics)}
                    onMouseUp={handleEditingPointerUp}
                    onTouchStart={(event) => handleTextTouchStart(event, item.id, itemMetrics)}
                    onTouchMove={(event) => handleTextTouchMove(event, item.id, itemMetrics)}
                    onTouchEnd={handleEditingPointerUp}
                    onTouchCancel={handleEditingPointerUp}
                    onDragMove={handleDragMove}
                    onDragEnd={(e) => {
                      setSnapLines({});
                      const newX = Math.round(e.target.x());
                      const newY = Math.round(e.target.y());
                      if (onUpdateExtraText) {
                        onUpdateExtraText(item.id, {
                          x: newX,
                          y: newY,
                        });
                      } else if (onUpdateExtraTextPosition) {
                        onUpdateExtraTextPosition(item.id, {
                          x: newX,
                          y: newY,
                        });
                      }
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      const currentWidth = item.width || contentWidth;
                      const newWidth = Math.max(40, Math.round(currentWidth * scaleX));
                      const newRotation = Math.round(node.rotation());
                      const newX = Math.round(node.x());
                      const newY = Math.round(node.y());
                      // Invariante Konva: reseta escalas para 1 para não acumular distorções
                      node.scaleX(1);
                      node.scaleY(1);
                      if (onUpdateExtraText) {
                        onUpdateExtraText(item.id, {
                          x: newX,
                          y: newY,
                          width: newWidth,
                          rotation: newRotation,
                        });
                      } else if (onUpdateExtraTextPosition) {
                        onUpdateExtraTextPosition(item.id, {
                          x: newX,
                          y: newY,
                        });
                      }
                    }}
                  >
                    <Rect
                      width={itemWidth}
                      height={Math.max(itemMetrics.height, itemSize)}
                      fill="rgba(0,0,0,0.001)"
                      stroke={editingTarget === item.id ? "#38bdf8" : undefined}
                      strokeWidth={editingTarget === item.id ? 1 : 0}
                      dash={editingTarget === item.id ? [4, 4] : undefined}
                    />
                    {renderBackgroundEffect({
                      effect: itemEffect,
                      contentWidth: itemWidth,
                      textHeight: itemMetrics.height,
                      isDarkText: isDarkItem,
                      accentColor: post.palette.accent,
                      customColor: item.effectColor,
                      lines: itemMetrics.lines.map(line => ({ text: "", width: line.width })),
                      lineHeightPx: itemSize * 1.3,
                      align: itemAlign,
                    })}
                    {itemSelectionRects.map(rect => (
                      <Rect
                        key={`${item.id}-selection-${rect.lineIndex}`}
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        fill="rgba(56, 189, 248, 0.34)"
                        listening={false}
                      />
                    ))}
                    <RichTextRenderer
                      text={itemText}
                      richText={itemRich}
                      x={0}
                      y={0}
                      width={itemWidth}
                      fontSize={itemSize}
                      fontFamily={itemFont}
                      fontStyle={
                        item.fontWeight === "bold"
                          ? "bold"
                          : item.fontStyle === "italic"
                          ? "italic"
                          : "normal"
                      }
                      fill={itemColor}
                      align={itemAlign}
                      lineHeight={1.3}
                      opacity={1}
                      {...getTextEffectProps(
                        itemEffect,
                        isDarkItem,
                        false,
                        item.effectColor
                      )}
                    />
                    {itemCaret && editingSelection.start === editingSelection.end && (
                      <BlinkingCaret geometry={itemCaret} />
                    )}
                    {isMobile && editingTarget === item.id && <TextSelectionHandles layout={itemMetrics} start={editingSelection.start} end={editingSelection.end} touchScale={touchScale} onStart={(event, edge, layout) => handleSelectionHandleStart(event, item.id, edge, layout)} />}
                  </Group>
                );
              })}
              </Group>

              {/* ─── 7.C) IMAGENS LIVRES ADICIONAIS (FOTOS / ADESIVOS / STICKERS) ─── */}
              {activeExtraImages.map((imgItem) => (
                <CanvasCustomImageNode
                  key={imgItem.id}
                  item={imgItem}
                  isInteractive={isInteractive}
                  createSnapBoundFunc={createSnapBoundFunc}
                  setRef={(el) => {
                    if (el) extraImageRefs.current[imgItem.id] = el;
                    else delete extraImageRefs.current[imgItem.id];
                  }}
                  onSelect={() => handleSelect(imgItem.id)}
                  onDragMove={handleDragMove}
                  onDragEnd={(e) => {
                    setSnapLines({});
                    if (onUpdateExtraImage) {
                      onUpdateExtraImage(imgItem.id, {
                        x: Math.round(e.target.x()),
                        y: Math.round(e.target.y()),
                      });
                    }
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    const newWidth = Math.max(20, Math.round(node.width() * scaleX));
                    const newHeight = Math.max(20, Math.round(node.height() * scaleY));
                    const newRotation = Math.round(node.rotation());
                    const newX = Math.round(node.x());
                    const newY = Math.round(node.y());
                    // Invariante Konva: reseta escalas para 1 para não acumular distorções
                    node.scaleX(1);
                    node.scaleY(1);
                    if (onUpdateExtraImage) {
                      onUpdateExtraImage(imgItem.id, {
                        x: newX,
                        y: newY,
                        width: newWidth,
                        height: newHeight,
                        rotation: newRotation,
                      });
                    }
                  }}
                />
              ))}

              {/* ─── 8. TRANSFORMER PARA ELEMENTOS DE TEXTO/MARCA/IMAGENS ─── */}
              {isInteractive && !isEditingBackground && (
                <Transformer
                  ref={transformerRef}
                  rotateEnabled={selectedId !== "headline" && selectedId !== "subtext"}
                  rotationSnaps={[0, 90, 180, 270]}
                  borderStroke="#38bdf8"
                  borderStrokeWidth={1.5}
                  anchorStroke="#38bdf8"
                  anchorFill="#ffffff"
                  anchorSize={7}
                  anchorCornerRadius={2}
                  keepRatio={Boolean(selectedId && extraImageRefs.current[selectedId])}
                  enabledAnchors={
                    selectedId && extraImageRefs.current[selectedId]
                      ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                      : selectedId === "headline" || selectedId === "subtext"
                      ? ["middle-left", "middle-right"]
                      : ["top-left", "top-right", "bottom-left", "bottom-right"]
                  }
                  boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 40 ? oldBox : newBox}
                  onDblClick={() => {
                    if (selectedId === "headline" || selectedId === "subtext" || selectedId === "badge") {
                      startEditing(selectedId);
                    }
                  }}
                  onDblTap={() => {
                    if (selectedId === "headline" || selectedId === "subtext" || selectedId === "badge") {
                      startEditing(selectedId);
                    }
                  }}
                />
              )}

              {/* ─── 8.B TRANSFORMER DEDICADO DO PLANO DE FUNDO (ESTILO CANVA) ─── */}
              {isInteractive && isEditingBackground && (
                <Transformer
                  ref={bgTransformerRef}
                  rotateEnabled={false}
                  keepRatio={true}
                  enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                  borderStroke="#FF5C00"
                  borderStrokeWidth={2}
                  anchorStroke="#FF5C00"
                  anchorFill="#ffffff"
                  anchorSize={9}
                  anchorCornerRadius={2}
                  boundBoxFunc={(oldBox, newBox) => {
                    if (newBox.width < 80 || newBox.height < 80) return oldBox;
                    return newBox;
                  }}
                />
              )}

              {/* ─── 9. LINHAS GUIAS MAGNÉTICAS DE SNAP ─── */}
              {snapLines.x !== undefined && (
                <Line
                  points={[snapLines.x, 0, snapLines.x, baseHeight]}
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  dash={[4, 4]}
                />
              )}
              {snapLines.y !== undefined && (
                <Line
                  points={[0, snapLines.y, baseWidth, snapLines.y]}
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  dash={[4, 4]}
                />
              )}
            </Layer>
          </Stage>
        </div>

        {/* Input invisível: teclado/clipboard/IME. Texto, seleção e caret permanecem no Konva. */}
        {editingTarget && (() => {
          const isHeadline = editingTarget === "headline";
          const isSubtext = editingTarget === "subtext";
          const isBadge = editingTarget === "badge";
          const extraItem = !isHeadline && !isSubtext && !isBadge
            ? activeExtraTexts.find(item => item.id === editingTarget)
            : null;
          const targetX = isHeadline
            ? headlinePos.x
            : isSubtext
            ? subtextPos.x
            : isBadge
            ? badgePos.x
            : (extraItem?.x ?? Math.round(baseWidth * 0.1));
          const targetY = isHeadline
            ? headlinePos.y
            : isSubtext
            ? subtextPos.y
            : isBadge
            ? badgePos.y
            : (extraItem?.y ?? Math.round(baseHeight * 0.65));
          const targetWidth = isBadge
            ? Math.max(130, primaryBadgeText.length * 8 + 36)
            : isHeadline
            ? activeHeadlineWidth
            : isSubtext
            ? activeSubtextWidth
            : (extraItem?.width ?? contentWidth);
          const targetHeight = isHeadline ? headlineHeight : isSubtext ? subtextHeight : 28;

          return (
            <div
              ref={editorWrapperRef}
              className="absolute z-40 pointer-events-none"
              style={{
                left: targetX,
                top: targetY,
                width: targetWidth,
                height: Math.max(1, targetHeight),
              }}
            >
              <div
                data-text-edit-chrome
                className="absolute hidden md:flex items-center gap-1.5 bg-[#0C1017]/95 backdrop-blur-md px-2.5 py-1 rounded-full border border-sky-400/60 shadow-[0_8px_24px_rgba(0,0,0,0.85)] text-white select-none whitespace-nowrap z-50 pointer-events-auto"
                style={{ top: targetY > 45 ? -38 : targetHeight + 8, left: 0 }}
              >
                <button
                  type="button"
                  onMouseDown={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleCommitText();
                  }}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-400 hover:bg-sky-300 text-black font-bold text-[11px] cursor-pointer transition-all shadow-sm active:scale-95"
                  title="Concluir edição"
                >
                  <Check size={12} strokeWidth={3} />
                  <span>Concluir</span>
                </button>
                <button
                  type="button"
                  onMouseDown={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleCancelText();
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-[11px] cursor-pointer transition-all active:scale-95"
                  title="Cancelar edição"
                >
                  <X size={12} />
                  <span>Cancelar</span>
                </button>
                <span className="text-[9px] text-white/40 pl-1 border-l border-white/15 hidden sm:inline font-sans">
                  {isBadge ? "Enter salva" : "Ctrl+Enter salva"}
                </span>
              </div>

              {isMobile && document.getElementById("canvas-mobile-text-actions-slot") && createPortal(
                <div data-text-edit-chrome className="flex items-center justify-between gap-2 rounded-2xl border border-sky-400/40 bg-[#0C1017]/95 px-2 py-1.5 text-white shadow-xl backdrop-blur-md">
                  <button type="button" onClick={() => syncNativeSelection(0, editingTextRef.current.length)} className="min-h-10 rounded-xl px-3 text-xs text-white/80">Selecionar tudo</button>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCancelText} className="min-h-10 rounded-xl px-3 text-xs text-white/80">Cancelar</button>
                    <button type="button" onClick={handleCommitText} className="min-h-10 rounded-xl bg-sky-400 px-4 text-xs font-bold text-black">Concluir</button>
                  </div>
                </div>,
                document.getElementById("canvas-mobile-text-actions-slot")!
              )}

              {(isHeadline || isSubtext || extraItem) && (
                <RichTextFloatingToolbar
                  selection={editingSelection}
                  anchorRef={editorWrapperRef}
                  palette={post.palette}
                  baseColor={isHeadline ? headlineColor : isSubtext ? subtextColor : extraItem?.color || post.palette.text}
                  richText={editingRichText}
                  baseBold={isHeadline || extraItem?.fontWeight === "bold"}
                  baseItalic={extraItem?.fontStyle === "italic"}
                  onRestoreFocus={() => window.requestAnimationFrame(() => {
                    if (editingTargetRef.current) textareaRef.current?.focus({ preventScroll: true });
                  })}
                  onApplyFormat={(format, selectionStart, selectionEnd, restoreFocus = true) => {
                    setEditingRichText(
                      applyRichTextFormat(
                        editingTextRef.current,
                        editingRichTextRef.current,
                        format,
                        selectionStart,
                        selectionEnd
                      )
                    );
                    if (restoreFocus) syncNativeSelection(selectionStart, selectionEnd);
                  }}
                />
              )}

              <textarea
                ref={textareaRef}
                value={editingText}
                onChange={event => {
                  const nextText = event.target.value;
                  if (isHeadline || isSubtext || extraItem) {
                    setEditingRichText(
                      reconcileRichTextChange(editingTextRef.current, nextText, editingRichTextRef.current)
                    );
                  }
                  setEditingText(nextText);
                }}
                onSelect={event => {
                  setEditingSelection({
                    start: event.currentTarget.selectionStart,
                    end: event.currentTarget.selectionEnd,
                  });
                }}
                onKeyDown={event => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    handleCancelText();
                  } else if (event.key === "Enter" && (isBadge || event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    event.stopPropagation();
                    handleCommitText();
                  }
                }}
                className="absolute opacity-0 pointer-events-none resize-none"
                style={{
                  left: -10000,
                  top: 0,
                  width: 1,
                  height: 1,
                }}
                aria-label="Edição direta de texto no canvas"
                autoFocus
                spellCheck={false}
              />
            </div>
          );
        })()}
      </div>
    );
  }
);
