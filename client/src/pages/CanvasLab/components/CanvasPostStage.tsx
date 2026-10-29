import { aspectRatioHeight } from "@shared/aspectRatios";
import { ArsenalCompositionContents } from "./ArsenalCompositionContents";
import { editArsenalElementText, overrideArsenalElement, arsenalWorldGeometry } from "../lib/arsenalComposition";
import { ensureArsenalCompositionAssets } from "../lib/arsenalAssets";
import { renderedCompositionImageCount, renderedNativeImageCount, visibleCompositionAssets, visibleExportImageNodes, exportImageNodeReady } from "../lib/exportMedia";
import type { ArsenalComposition, ArsenalLogo } from "@shared/designArsenal";
import { ensureCatalogPostFonts } from "../lib/catalogCompiler";
import { canvasTypography } from "../lib/catalogTypography";
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Stage, Layer, Rect, Text, Group, Image as KonvaImage, Transformer, Line, Circle } from "react-konva";
import type { BgImageTransform, CanvasCustomImage, CanvasCustomShape, CanvasCustomText, CanvasPostModel, ElementPosition, LogoPositionType, TextLegibilityEffect, SplitBgPosition } from "./types";
import { isDarkColor, resolveLegibleTextColor, normalizeHexColor } from "./types";
import { useDynamicFont } from "@/hooks/useDynamicFont";
import { containImageRect } from "../lib/imageContain";
import { computeBackgroundGeometry } from "../lib/backgroundPlacement";
import { resolveSlideAppearance } from "../lib/slideReplication";
import JSZip from "jszip";
import { Check, X } from "lucide-react";
import RichTextFloatingToolbar from "./RichTextFloatingToolbar";
import RichTextRenderer from "./RichTextRenderer";
import { applyRichTextFormat, reconcileRichTextChange } from "../lib/richText";
import type { CanvasRichTextChunk } from "./types";
import { getCaretGeometry, getSelectionGeometry, hitTestRichText, layoutRichText, type CaretGeometry, type RichTextLayout } from "../lib/richTextLayout";
import type { ReferenceReconstructionSpecV2 } from "@shared/referenceReconstruction";
import { ReferenceSceneContents } from "./ReferenceSceneContents";
import type { ReferenceMediaImage } from "../../Admin2/matrixMedia";
import type { RecreationLayerStyle } from "@shared/designRecreation";
import { wordRangeAt, type TextRange } from "../lib/textSelection";
import {
  computeTextResizeGeometry,
  finalizeTextResizeGeometry,
  type TextResizeAnchor,
  type TextResizeGeometry,
  type TextResizeSession,
} from "../lib/textResizeGeometry";
import { registerUserFont } from "../lib/fontResources";
import { COMPOSITION_BACKGROUND_ID, COMPOSITION_LOGO_ID, getEditorElementState, resolveEditorElementOrder } from "../lib/editorElementState";
import { collectUsedFontsForSlide, collectUsedFontsForDocument, assertFontsReady } from "../lib/exportReadiness";

export interface CanvasPostStageRef {
  exportPng4K: (maxDimension?: number) => string;
  exportZip4K: (onProgress?: (current: number, total: number) => void) => Promise<Blob>;
  exportThumbnail: () => Promise<string>;
  commitDraft: () => void;
  cancelDraft: () => void;
  hasActiveDraft: () => boolean;
  beginTextEdit: (elementId: string) => void;
  getElementGeometry: (elementId: string) => { x: number; y: number; width: number; height: number; rotation?: number; fontSize?: number } | null;
}

interface CanvasPostStageProps {
  post: CanvasPostModel;
  onUpdateComposition?: (composition: ArsenalComposition) => void;
  /** Cena privada de diagnóstico; usa o mesmo Stage/Konva sem criar um post de produto. */
  diagnosticScene?: ReferenceReconstructionSpecV2;
  diagnosticTextMode?: "wrap" | "fixed-lines";
  diagnosticLayerStyles?: RecreationLayerStyle[];
  diagnosticMediaImages?: ReferenceMediaImage[];
  diagnosticNeutralFrame?: boolean;
  isMobile?: boolean;
  onUpdateRichText?: (field: "headline" | "subtext", chunks: CanvasRichTextChunk[]) => void;
  zoom: number;
  /** Actual CSS scale when the editor viewport applies fitting outside this Stage. */
  displayScale?: number;
  onUpdateElementPosition?: (elementKey: "headlinePos" | "subtextPos" | "badgePos" | "barPos" | "logoPos", pos: ElementPosition) => void;
  onUpdateTextTransform?: (
    elementKey: "headline" | "subtext",
    props: { x?: number; y?: number; width?: number; scale?: number },
    layoutPositions?: { headlinePos: ElementPosition; subtextPos: ElementPosition; barPos: ElementPosition }
  ) => void;
  onUpdateDecorationTransform?: (
    target: "logo" | "badge" | "bar",
    transform: { scaleX: number; scaleY: number; rotation: number },
    pos?: ElementPosition
  ) => void;
  onSelectElement?: (elementId: string | null) => void;
  selectedElementId?: string | null;
  onEditingChange?: (editing: boolean) => void;
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
  onUpdateLogo?: (patch: Partial<ArsenalLogo>) => void;
  onUpdateExtraShape?: (id: string, patch: Partial<CanvasCustomShape>) => void;
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

/** React owns the drawing order, including images that finish loading later. */
function NativeElementStack({ children, order }: { children: React.ReactNode; order?: string[] }) {
  const nodes = React.Children.toArray(children).filter(React.isValidElement);
  const id = (node: React.ReactElement) => String((node.props as { name?: string }).name ?? "").replace("native-element-", "");
  const ordered = resolveEditorElementOrder(nodes.map(id), order).map(key => nodes.find(node => id(node) === key));
  return <>{ordered}</>;
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
    let active = true;
    setImageEl(null);
    const img = new window.Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => { if (active) setImageEl(img); };
    img.src = item.url;
    return () => { active = false; };
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
      crop={item.focalX === undefined && item.focalY === undefined ? undefined : (() => {
        const scale = Math.max(item.width / imageEl.naturalWidth, item.height / imageEl.naturalHeight);
        return { x: (imageEl.naturalWidth - item.width / scale) * (item.focalX ?? 0.5),
          y: (imageEl.naturalHeight - item.height / scale) * (item.focalY ?? 0.5), width: item.width / scale, height: item.height / scale };
      })()}
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
      post: documentPost,
      onUpdateComposition,
      diagnosticScene,
      diagnosticTextMode,
      diagnosticLayerStyles,
      diagnosticMediaImages,
      diagnosticNeutralFrame = false,
      isMobile = false,
      zoom,
      displayScale = zoom,
      onUpdateElementPosition,
      onUpdateTextTransform,
      onUpdateDecorationTransform,
      onSelectElement,
      selectedElementId,
      onEditingChange,
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
      onUpdateExtraShape,
      onUpdateLogo,
    },
    ref
  ) => {
    const isInteractive = !isReadOnly && Boolean(onUpdateElementPosition || onUpdateComposition);
    const stageRef = useRef<any>(null);
    // CSS zoom keeps canonical coordinates; increase only the preview backing pixels.
    useEffect(() => {
      const pixelRatio = Math.min(4, (window.devicePixelRatio || 1) * Math.max(1, displayScale));
      stageRef.current?.getLayers().forEach((layer: any) => {
        const canvas = layer.getCanvas?.();
        if (canvas && canvas.getPixelRatio() !== pixelRatio) {
          canvas.setPixelRatio(pixelRatio);
          layer.batchDraw();
        }
      });
    }, [displayScale]);
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
    const compositionNodeRefs = useRef<Record<string, any>>({});
    const extraShapeRefs = useRef<Record<string, any>>({});
    const extraImageRefs = useRef<Record<string, any>>({});

    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Índice de slide usado exclusivamente durante a exportação ZIP offscreen:
    // o mesmo motor renderiza cada slide de forma determinística, em vez de
    // capturar repetidamente o slide visível (Etapa 2 §7.6).
    const [exportSlideIndex, setExportSlideIndex] = useState<number | null>(null);
    const [exportFrozenPost, setExportFrozenPost] = useState<CanvasPostModel | null>(null);
    const activeDocument = exportFrozenPost ?? documentPost;
    const post = resolveSlideAppearance(activeDocument, exportSlideIndex ?? activeDocument.currentSlideIndex);
    const composition = post.slides[exportSlideIndex ?? post.currentSlideIndex]?.composition;
    const [arsenalFonts, setArsenalFonts] = useState<{key: string; ready: boolean; error?: string}>({key:"",ready:false});
    const arsenalFontKey = composition ? JSON.stringify(visibleCompositionAssets(composition).elements.filter(e=>e.kind === "text" || e.imageAssetId).map(e=>[e.fontAssetId,e.fontFamily,e.fontWeight,e.imageAssetId])) : "";
    useEffect(() => {
      if (!composition) return;
      let active=true;setArsenalFonts({key:arsenalFontKey,ready:false});
      void ensureArsenalCompositionAssets(visibleCompositionAssets(composition)).then(()=>{if(active)setArsenalFonts({key:arsenalFontKey,ready:true});})
        .catch(error=>{if(active)setArsenalFonts({key:arsenalFontKey,ready:false,error:String(error.message || error)});});
      return()=>{active=false;};
    },[arsenalFontKey]);
    const arsenalReady = !composition || (arsenalFonts.key === arsenalFontKey && arsenalFonts.ready);

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
    const pendingEditRef = useRef<{ slideId: string; target: string } | null>(null);
    const editingSlideRef = useRef<string | null>(null);
    const editingTargetRef = useRef(editingTarget);
    editingTargetRef.current = editingTarget;
    const editingTextRef = useRef(editingText);
    editingTextRef.current = editingText;
    const displayComposition = React.useMemo(()=>composition && editingTarget && composition.elements.some(e=>e.id===editingTarget) ? editArsenalElementText(composition,editingTarget,editingText,editingRichText) : composition,[composition,editingTarget,editingText,editingRichText]);
    const editingRichTextRef = useRef(editingRichText);
    editingRichTextRef.current = editingRichText;
    const handleCommitTextRef = useRef<() => void>(() => {});
    const handleCancelTextRef = useRef<() => void>(() => {});
    const stageContainerRef = useRef<HTMLDivElement>(null);
    const editorWrapperRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const [bgImgElement, setBgImgElement] = useState<HTMLImageElement | null>(null);
    const [logoImgElement, setLogoImgElement] = useState<HTMLImageElement | null>(null);
    const [, setCatalogFontRevision] = useState(0);
    useEffect(() => {
      if (!post.catalogCompilation || post.catalogCompilation.status === "fallback") return;
      let active = true;
      void ensureCatalogPostFonts(post).then(() => {
        if (active) setCatalogFontRevision(value => value + 1);
      }).catch(() => console.warn("[catalog.font] Fonte indisponível ao reabrir", post.catalogCompilation?.versionId));
      return () => { active = false; };
    }, [post.catalogCompilation?.versionId, post.catalogCompilation?.status, post.fontFamily, post.subtextFontFamily, post.headlineFontWeight, post.subtextFontWeight]);
    useDynamicFont(composition ? "Arial" : post.fontFamily, composition ? undefined : post.customFontUrl);
    useDynamicFont(composition ? "Arial" : post.subtextFontFamily ?? "Inter");

    useEffect(() => {
      if (post.userFonts && post.userFonts.length > 0) {
        post.userFonts.forEach((font) => {
          registerUserFont(font);
        });
      }
    }, [post.userFonts]);

    // Redesenho reativo quando as fontes web terminam de carregar no navegador
    useEffect(() => {
      if (typeof document !== "undefined" && document.fonts) {
        let isMounted = true;
        document.fonts.ready?.then?.(() => {
          if (isMounted && stageRef.current) {
            stageRef.current.getLayers().forEach((layer: any) => layer.batchDraw());
          }
        });
        return () => {
          isMounted = false;
        };
      }
    }, [post.fontFamily, post.subtextFontFamily]);

    const [localHeadlineWidth, setLocalHeadlineWidth] = useState<number | null>(null);
    const [localSubtextWidth, setLocalSubtextWidth] = useState<number | null>(null);
    const [localHeadlinePosition, setLocalHeadlinePosition] = useState<ElementPosition | null>(null);
    const [localSubtextPosition, setLocalSubtextPosition] = useState<ElementPosition | null>(null);
    const [localHeadlineScale, setLocalHeadlineScale] = useState<number | null>(null);
    const [localSubtextScale, setLocalSubtextScale] = useState<number | null>(null);
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
    const baseHeight = diagnosticScene
      ? 360 * diagnosticScene.source.heightPx / diagnosticScene.source.widthPx
      : aspectRatioHeight(post.aspectRatio);

    // Durante o ZIP, o índice de exportação prevalece sobre o slide ativo —
    // este é o ÚNICO motor de renderização; nenhuma segunda máquina é criada.
    const currentSlide =
      post.slides[exportSlideIndex ?? post.currentSlideIndex] || post.slides[0];
    const activeBg = currentSlide?.bgImage ?? post.bgImage;
    const activeLogoUrl = currentSlide.logo ? currentSlide.logo.url : post.logoUrl;
    const bgTransform = currentSlide?.bgTransform || post.bgTransform;
    const elementState = (id: string) => getEditorElementState(post, currentSlide.id, id);
    const canInteractWith = (id: string) => isInteractive && elementState(id).visible && !elementState(id).locked;
    const nativeGroupProps = (id: string) => ({ name: `native-element-${id}`, visible: elementState(id).visible,
      listening: canInteractWith(id) && (id === "background" || !isEditingBackground),
      opacity: id !== "background" && isEditingBackground ? 0.35 : 1 });
    useEffect(() => { onEditingChange?.(Boolean(editingTarget)); }, [editingTarget, onEditingChange]);
    useEffect(() => {
      if (editingTarget && (editingSlideRef.current !== currentSlide.id || !canInteractWith(editingTarget))) handleCancelTextRef.current();
    }, [currentSlide.id, currentSlide.elementStates, composition?.elementStates, isReadOnly]);

    useEffect(() => {
      if (!activeBg) {
        setBgImgElement(null);
        return;
      }
      let active = true;
      setBgImgElement(null);
      const img = new window.Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => { if (active) setBgImgElement(img); };
      img.src = activeBg;
      return () => { active = false; };
    }, [activeBg]);

    useEffect(() => {
      if (!activeLogoUrl) {
        setLogoImgElement(null);
        return;
      }
      let active = true;
      setLogoImgElement(null);
      const img = new window.Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => { if (active) setLogoImgElement(img); };
      img.src = activeLogoUrl;
      return () => { active = false; };
    }, [activeLogoUrl]);

    // Vincula o Transformer normal aos elementos de texto/marca quando não estiver em modo de fundo
    useEffect(() => {
      if (isEditingBackground || editingTarget || !selectedId || !canInteractWith(selectedId)) {
        transformerRef.current?.nodes([]);
        transformerRef.current?.getLayer()?.batchDraw();
        return;
      }
      if (!transformerRef.current) return;
      let targetNode = null;
      if (selectedId && compositionNodeRefs.current[selectedId]) targetNode = compositionNodeRefs.current[selectedId];
      else if (selectedId === "headline") targetNode = headlineResizeFrameRef.current;
      else if (selectedId === "subtext") targetNode = subtextResizeFrameRef.current;
      else if (selectedId === "badge") targetNode = badgeRef.current;
      else if (selectedId === "bar") targetNode = barRef.current;
      else if (selectedId === "logo") targetNode = logoRef.current;
      else if (selectedId && extraTextRefs.current[selectedId]) {
        targetNode = extraTextRefs.current[selectedId];
      } else if (selectedId && extraImageRefs.current[selectedId]) {
        targetNode = extraImageRefs.current[selectedId];
      } else if (selectedId) targetNode = extraShapeRefs.current[selectedId];

      if (targetNode) {
        transformerRef.current.nodes([targetNode]);
        transformerRef.current.getLayer()?.batchDraw();
      } else {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    }, [selectedId, isEditingBackground, editingTarget, composition, currentSlide.elementStates, isReadOnly, logoImgElement]);

    // Vincula o Transformer exclusivo ao Plano de Fundo quando isEditingBackground === true (Estilo Canva)
    useEffect(() => {
      if (!bgTransformerRef.current) return;
      if (isEditingBackground && canInteractWith("background") && bgImageRef.current) {
        bgTransformerRef.current.nodes([bgImageRef.current]);
        bgTransformerRef.current.getLayer()?.batchDraw();
      } else {
        bgTransformerRef.current.nodes([]);
        bgTransformerRef.current.getLayer()?.batchDraw();
      }
    }, [isEditingBackground, bgImgElement, currentSlide.elementStates, isReadOnly]);

    useImperativeHandle(ref, () => ({
      exportThumbnail: async () => {
        const stage = stageRef.current;
        if (!stage) return "";
        if (composition) { try { await ensureArsenalCompositionAssets(visibleCompositionAssets(composition)); } catch { return ""; } }

        // Capture the same 360px composition used by the editor, after its
        // font and image nodes have finished loading into Konva.
        const fontsReady = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
        if (fontsReady) {
          const loaded = await Promise.race([
            fontsReady.then(() => true).catch(() => false),
            new Promise<false>(resolve => setTimeout(() => resolve(false), 4000)),
          ]);
          if (!loaded) return "";
        }

        const expectedImages = composition ? renderedCompositionImageCount(composition) : renderedNativeImageCount(currentSlide, post);
        const started = Date.now();
        while (Date.now() - started < 4000) {
          const imageNodes = visibleExportImageNodes(stage.find("Image") as any[]);
          if (imageNodes.length >= expectedImages && imageNodes.every(exportImageNodeReady)) {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            stage.getLayers().forEach((layer: any) => layer.draw());
            try {
              return stage.toDataURL({ pixelRatio: 1.5, mimeType: "image/png" });
            } catch {
              return "";
            }
          }
          await new Promise(resolve => setTimeout(resolve, 40));
        }
        return "";
      },
      exportPng4K: (maxDimension = 3840) => {
        if (!stageRef.current) return "";
        const expectedImages = composition
          ? renderedCompositionImageCount(composition)
          : renderedNativeImageCount(currentSlide, post);
        const readyImages = visibleExportImageNodes(stageRef.current.find("Image")).filter(exportImageNodeReady).length;
        if (editingTarget || (composition && !arsenalReady) || readyImages < expectedImages) {
          throw new Error("Conclua a edição e aguarde o carregamento das fontes e da foto antes de exportar.");
        }

        // Validação estrita de fontes usadas (BUG-CL-027, BUG-CL-033, CP-31)
        if (currentSlide) {
          const usedFonts = collectUsedFontsForSlide(currentSlide, post);
          assertFontsReady(usedFonts);
        }

        setSelectedId(null);
        transformerRef.current?.nodes([]);
        bgTransformerRef.current?.nodes([]);
        stageRef.current.getLayers().forEach((l: any) => l.draw());
        const mediaGuides = stageRef.current.find(".editor-media-guide");
        mediaGuides.forEach((node: any) => node.hide());
        stageRef.current.getLayers().forEach((layer: any) => layer.draw());
        try { return stageRef.current.toDataURL({
          pixelRatio: diagnosticScene ? diagnosticScene.source.widthPx / baseWidth : Math.min(3840, Math.max(256, maxDimension)) / Math.max(baseWidth, baseHeight),
          mimeType: "image/png",
        }); } finally { mediaGuides.forEach((node: any) => node.show()); stageRef.current.getLayers().forEach((layer: any) => layer.draw()); }
      },
      exportZip4K: async (onProgress) => {
        if (editingTarget) throw new Error("Conclua a edição do texto antes de exportar.");
        // Validação estrita de fontes usadas no documento
        const usedFonts = collectUsedFontsForDocument(documentPost);
        assertFontsReady(usedFonts);
        const zip = new JSZip();
        const stage = stageRef.current;
        if (!stage) return new Blob();

        setSelectedId(null);
        transformerRef.current?.nodes([]);
        bgTransformerRef.current?.nodes([]);

        const awaitFrame = () =>
          new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const awaitStageImagesLoaded = async (timeoutMs: number, expected: number): Promise<void> => {
          const started = Date.now();
          while (Date.now() - started < timeoutMs) {
            const imageNodes = visibleExportImageNodes(stage.find("Image") as any[]);
            const pending = imageNodes.filter(node => !exportImageNodeReady(node));
            if (imageNodes.length >= expected && pending.length === 0) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          throw new Error("Uma imagem do carrossel não carregou. Aguarde e tente baixar novamente.");
        };

        const frozenPost = structuredClone(documentPost);
        setExportFrozenPost(frozenPost);
        const slidesSnapshot = frozenPost.slides.map(s => ({ ...s }));

        try {
          for (let i = 0; i < slidesSnapshot.length; i++) {
            if (onProgress) onProgress(i + 1, slidesSnapshot.length);
            // Renderiza o slide i no mesmo motor e aguarda composição + assets.
            setExportSlideIndex(i);
            await awaitFrame();
            await awaitFrame();
            try {
              const fontReady = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
              if (fontReady) {
                await Promise.race([fontReady, new Promise(resolve => setTimeout(resolve, 3000))]);
              }
            } catch {
              /* fontes não disponíveis — segue com o fallback do motor */
            }
            const slide = slidesSnapshot[i];
            if (slide.composition) { await ensureArsenalCompositionAssets(visibleCompositionAssets(slide.composition)); await awaitFrame(); }
            const expected = slide.composition ? renderedCompositionImageCount(slide.composition) : renderedNativeImageCount(slide, frozenPost);
            await awaitStageImagesLoaded(4000, expected);

            const mediaGuides = stage.find(".editor-media-guide");
            mediaGuides.forEach((node: any) => node.hide());
            stage.getLayers().forEach((l: any) => l.draw());
            let dataUrl: string;
            try { dataUrl = stage.toDataURL({
              pixelRatio: 3840 / Math.max(baseWidth, baseHeight),
              mimeType: "image/png",
            }); } finally { mediaGuides.forEach((node: any) => node.show()); }
            const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
            zip.file(`slide-${i + 1}.png`, base64Data, { base64: true });
          }

          return await zip.generateAsync({ type: "blob" });
        } finally {
          setExportSlideIndex(null);
          setExportFrozenPost(null);
          await awaitFrame();
          stage.getLayers().forEach((l: any) => l.batchDraw());
        }
      },
      commitDraft: () => {
        if (editingTargetRef.current) {
          handleCommitTextRef.current();
        }
      },
      cancelDraft: () => {
        pendingEditRef.current = null;
        if (editingTargetRef.current) {
          handleCancelTextRef.current();
        }
      },
      hasActiveDraft: () => Boolean(editingTargetRef.current),
      beginTextEdit: (elementId) => startEditing(elementId),
      getElementGeometry: (id) => {
        const node = composition ? compositionNodeRefs.current[id] : id === "headline" ? headlineResizeFrameRef.current
          : id === "subtext" ? subtextResizeFrameRef.current : id === "badge" ? badgeRef.current
          : id === "bar" ? barRef.current : id === "logo" ? logoRef.current
          : extraTextRefs.current[id] ?? extraImageRefs.current[id] ?? extraShapeRefs.current[id];
        if (composition) {
          if (id === COMPOSITION_LOGO_ID && node) { const factor = composition.artboard.width / baseWidth;
            return { x: node.x() * factor, y: node.y() * factor, width: node.width() * factor, height: node.height() * factor, rotation: 0 }; }
          const target = [...composition.elements, ...composition.groups].find(e => e.id === id);
          if (target) { const world = arsenalWorldGeometry(target, composition.groups);
            return { x: world.x, y: world.y, width: target.width * world.scale, height: target.height * world.scale,
              rotation: world.rotation, fontSize: "fontSize" in target ? target.fontSize * world.scale : undefined }; }
        }
        if (id === (composition ? COMPOSITION_BACKGROUND_ID : "background")) return { x: 0, y: 0, width: composition?.artboard.width ?? baseWidth, height: composition?.artboard.height ?? baseHeight };
        if (!node) return null;
        return { x: node.x(), y: node.y(), width: node.width() * node.scaleX(), height: node.height() * node.scaleY(), rotation: node.rotation(),
          fontSize: id === "headline" ? headlineFontSize : id === "subtext" ? subtextFontSize : activeExtraTexts.find(text => text.id === id)?.fontSize };
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
    const activeExtraTexts: CanvasCustomText[] = composition ? composition.elements.filter(e=>e.kind === "text").map(e=>{
      const w=arsenalWorldGeometry(e,composition.groups),scale=360/composition.artboard.width*composition.projection.scale;
      return {id:e.id,text:e.text,textRich:e.richText,x:w.x*scale+composition.projection.x*360/composition.artboard.width,y:w.y*scale+composition.projection.y*360/composition.artboard.width,width:e.width*scale*w.scale,fontSize:e.fontSize*scale*w.scale,fontFamily:e.fontFamily,color:e.fill,rotation:w.rotation};
    }) : currentSlide?.extraTexts || post.extraTexts || [];
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
    const activeHeadlineScale = localHeadlineScale ?? currentSlide?.headlineScale ?? 1;
    const activeSubtextScale = localSubtextScale ?? currentSlide?.subtextScale ?? 1;

    const pointerPosForNode = (node: any): { x: number; y: number } | null => {
      const pointer = node?.getStage?.()?.getPointerPosition?.();
      return pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)
        ? { x: pointer.x, y: pointer.y }
        : null;
    };

    const handleTextTransformStart = (
      e: any,
      elementKey: "headline" | "subtext",
      initialWidth: number,
      initialPosition: ElementPosition,
      layoutPositions: { headlinePos: ElementPosition; subtextPos: ElementPosition; barPos: ElementPosition },
      initialHeight: number,
      initialScale: number,
      initialFontSize: number
    ) => {
      if (!canInteractWith(elementKey)) return;
      const anchor = transformerRef.current?.getActiveAnchor() as TextResizeAnchor | undefined;
      const pointer = pointerPosForNode(e.target);
      if (!anchor || !pointer) {
        textResizeSessionRef.current = null;
        textResizeDraftRef.current = null;
        return;
      }

      const session: TextResizeSession = {
        anchor,
        pointerStartX: pointer.x,
        pointerStartY: pointer.y,
        initialX: initialPosition.x,
        initialY: initialPosition.y,
        initialWidth,
        initialHeight,
        initialScale,
        initialFontSize,
        minWidth: 40,
      };
      (session as any).elementKey = elementKey;
      textResizeSessionRef.current = session as any;
      textResizeDraftRef.current = {
        x: initialPosition.x,
        y: initialPosition.y,
        width: initialWidth,
        scale: initialScale,
        fontSize: initialFontSize,
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
      setLocalPosition: React.Dispatch<React.SetStateAction<ElementPosition | null>>,
      setLocalScale?: React.Dispatch<React.SetStateAction<number | null>>
    ) => {
      if (!canInteractWith(elementKey)) return;
      const session = textResizeSessionRef.current;
      const pointer = pointerPosForNode(e.target);
      if (!session || (session as any).elementKey !== elementKey || !pointer) return;

      const geometry = computeTextResizeGeometry(session, pointer.x, pointer.y);
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
      if (setLocalScale && geometry.scale !== undefined) {
        setLocalScale(geometry.scale);
      }
    };

    const handleTextTransformEnd = (
      e: any,
      elementKey: "headline" | "subtext",
      setLocalWidth: React.Dispatch<React.SetStateAction<number | null>>,
      setLocalPosition: React.Dispatch<React.SetStateAction<ElementPosition | null>>,
      setLocalScale?: React.Dispatch<React.SetStateAction<number | null>>
    ) => {
      const node = e.target;
      if (!canInteractWith(elementKey)) return;
      const session = textResizeSessionRef.current;
      const liveGeometry = textResizeDraftRef.current || (session ? {
        x: session.initialX,
        y: session.initialY,
        width: session.initialWidth,
        scale: session.initialScale,
      } : {
        x: node.x(),
        y: node.y(),
        width: node.width(),
        scale: 1,
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
        scale: finalGeometry.scale,
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
      if (setLocalScale) setLocalScale(null);
      setTextLayoutSnapshot(null);
    };

    const handleDecorationTransformEnd = (
      e: any,
      target: "logo" | "badge" | "bar",
      posKey: "logoPos" | "badgePos" | "barPos"
    ) => {
      if (!canInteractWith(target)) return;
      const node = e.target;
      const rawScaleX = node.scaleX();
      const rawScaleY = node.scaleY();
      const scaleX = typeof rawScaleX === "number" && Number.isFinite(rawScaleX) && rawScaleX > 0 ? Number(rawScaleX.toFixed(4)) : 1;
      const scaleY = typeof rawScaleY === "number" && Number.isFinite(rawScaleY) && rawScaleY > 0 ? Number(rawScaleY.toFixed(4)) : 1;
      const rotation = typeof node.rotation() === "number" && Number.isFinite(node.rotation()) ? Math.round(node.rotation()) : 0;
      const x = Math.round(node.x());
      const y = Math.round(node.y());
      onUpdateDecorationTransform?.(target, { scaleX, scaleY, rotation }, { x, y });
    };

    // ─── TAMANHOS BASE POR FAMÍLIA × ESCALA DO USUÁRIO (item 2) ───
    const typography = canvasTypography(fam);
    const headlineBaseSize = typography.headlineBase;
    const subtextBaseSize = typography.bodyBase;
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
        fontStyle: post.headlineFontWeight ? String(post.headlineFontWeight) : "bold",
        fill: post.palette.headlineColor || post.palette.text,
        align: post.headlineAlign || "left",
        letterSpacing: typography.headlineLetterSpacing,
        lineHeight: typography.headlineLineHeight,
      });

    const subtextMetricsFor = (size: number) =>
      layoutRichText({
        text: displaySubtext,
        richText: displaySubtextChunks,
        width: activeSubtextWidth,
        fontSize: size,
        fontFamily: post.subtextFontFamily ?? (currentSlide?.guidedComposition ? "Arial, sans-serif" : isCyber ? "Space Mono, monospace" : "Inter, sans-serif"),
        fontStyle: post.subtextFontWeight ? String(post.subtextFontWeight) : "normal",
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
    const logoWidth = currentSlide.logo?.width ?? 46;
    const logoHeight = currentSlide.logo?.height ?? 24;
    const logoScaleX = currentSlide.logo ? 1 : currentSlide.nativeDecorationTransforms?.logo?.scaleX ?? 1;
    const logoScaleY = currentSlide.logo ? 1 : currentSlide.nativeDecorationTransforms?.logo?.scaleY ?? 1;
    const scaledLogoFit = logoImgElement ? containImageRect(logoImgElement.naturalWidth, logoImgElement.naturalHeight, logoWidth * logoScaleX, logoHeight * logoScaleY) : null;
    const logoFit = scaledLogoFit ? { x: scaledLogoFit.x / logoScaleX, y: scaledLogoFit.y / logoScaleY, width: scaledLogoFit.width / logoScaleX, height: scaledLogoFit.height / logoScaleY } : undefined;
    const logo = currentSlide.logo;
    const logoPos = logo ? logo.position === "custom" ? { x: logo.x ?? 16, y: logo.y ?? 16 }
      : { x: logo.position.endsWith("right") ? baseWidth - logoWidth - 16 : 16,
          y: logo.position.startsWith("bottom") ? baseHeight - logoHeight - 16 : 16 }
      : currentSlide.logoPos || defaultLogoPositions[post.logoPosition || "top-right"];

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
      if (!canInteractWith(elementKey.replace(/Pos$/, ""))) return;
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
      if (!canInteractWith(id)) return;
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
        ? (headlineRef.current ?? compositionNodeRefs.current[target])
        : target === "subtext"
        ? (subtextRef.current ?? compositionNodeRefs.current[target])
        : (extraTextRefs.current[target] ?? compositionNodeRefs.current[target]);
      const point = pointerInNode(event, node);
      return point ? hitTestRichText(layout, point.x, point.y) : layout.glyphs.at(-1)?.end ?? 0;
    };

    // ─── Ações de Edição Direta no Canvas ───
    const startEditing = (target: string, event?: any, targetLayout?: RichTextLayout) => {
      if (!canInteractWith(target) || isEditingBackground) return;
      if (composition ? !composition.elements.some(e => e.id === target && e.kind === "text") : !["headline", "subtext", "badge", ...activeExtraTexts.map(t => t.id)].includes(target)) return;
      if (!arsenalReady) { pendingEditRef.current = { slideId: currentSlide.id, target }; return; }
      pendingEditRef.current = null;
      if (editingTargetRef.current === target) { textareaRef.current?.focus(); return; }
      if (editingTargetRef.current) handleCommitTextRef.current();
      transformerRef.current?.nodes([]);
      transformerRef.current?.getLayer()?.batchDraw();
      let initialText = "";
      let initialChunks: CanvasRichTextChunk[] | undefined;
      let caretIndex = 0;
      const compElement = composition?.elements.find(e => e.id === target);
      if (compElement) {
        initialText = compElement.text ?? "";
        initialChunks = compElement.richText;
        caretIndex = targetLayout
          ? caretIndexFromEvent(event, target, targetLayout)
          : initialText.length;
      } else if (target === "headline") {
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
      editingSlideRef.current = currentSlide.id;
      editingTargetRef.current = target;
      editingTextRef.current = initialText;
      editingRichTextRef.current = initialChunks;
      setEditingTarget(target);
      setEditingText(initialText);
      setEditingRichText(initialChunks);
      pendingSelectionRef.current = initialSelection;
      setEditingSelection(initialSelection);
    };

    useEffect(() => {
      const pending = pendingEditRef.current;
      if (!pending) return;
      if (pending.slideId !== currentSlide.id) { pendingEditRef.current = null; return; }
      if (arsenalReady) { pendingEditRef.current = null; startEditing(pending.target); }
    }, [arsenalReady, currentSlide.id]);

    const handleCommitText = () => {
      const target = editingTargetRef.current;
      const val = editingTextRef.current;
      if (target && editingSlideRef.current === currentSlide.id && canInteractWith(target)) {
        if (composition?.elements.some(e=>e.id === target)) {
          onUpdateComposition?.(editArsenalElementText(composition,target,val,editingRichTextRef.current));
        } else if (target === "headline" || target === "subtext") {
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
      editingTargetRef.current = null;
      editingSlideRef.current = null;
      setEditingTarget(null);
      setEditingRichText(undefined);
      setTextLayoutSnapshot(null);
      selectionAnchorRef.current = null;
      activeSelectionHandleRef.current = null;
    };

    const handleCancelText = () => {
      editingTargetRef.current = null;
      editingSlideRef.current = null;
      setEditingTarget(null);
      setEditingRichText(undefined);
      setTextLayoutSnapshot(null);
      selectionAnchorRef.current = null;
      activeSelectionHandleRef.current = null;
    };
    handleCommitTextRef.current = handleCommitText;
    handleCancelTextRef.current = handleCancelText;

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
      const wasSelected = selectedId === target;
      handleSelect(target);
      if ((event.evt?.detail ?? 0) >= 3) {
        if (editingTargetRef.current === target) syncNativeSelection(0, editingTextRef.current.length);
        else startEditing(target, undefined, layout);
      } else if (wasSelected && editingTargetRef.current !== target) {
        startEditing(target, event, layout);
      }
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
          ? (headlineRef.current ?? compositionNodeRefs.current[editingTarget])
          : editingTarget === "subtext"
          ? (subtextRef.current ?? compositionNodeRefs.current[editingTarget])
          : editingTarget === "badge"
          ? badgeRef.current
          : (extraTextRefs.current[editingTarget] ?? compositionNodeRefs.current[editingTarget]);
        if (editingNode && !isDescendantOf(e.target, editingNode)) handleCommitText();
      }

      const isComposition = Object.values(compositionNodeRefs.current).some(node=>isDescendantOf(e.target,node));
      if (isHeadline || isSubtext || isBadge || isBar || isLogo || isExtraText || isExtraImage || isComposition) {
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
          className={diagnosticScene && diagnosticNeutralFrame ? "overflow-hidden relative" : "rounded-[28px] overflow-hidden shadow-[0_32px_90px_rgba(0,0,0,0.9)] border border-white/15 relative"}
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
              {diagnosticScene ? <ReferenceSceneContents scene={diagnosticScene} stageWidth={baseWidth} textMode={diagnosticTextMode} layerStyles={diagnosticLayerStyles} mediaImages={diagnosticMediaImages} /> : composition ? (arsenalReady ? <ArsenalCompositionContents composition={displayComposition!}
                interactive={isInteractive && arsenalReady}
                createSnapBoundFunc={createSnapBoundFunc}
                onDragMove={handleDragMove}
                onDragEnd={() => setSnapLines({})}
                register={(id,node,isText)=>{ if(node)compositionNodeRefs.current[id]=node;else delete compositionNodeRefs.current[id];if(isText){if(node)extraTextRefs.current[id]=node;else delete extraTextRefs.current[id];} }}
                onSelect={handleSelect} onTransform={(id, patch) => {
                  if (!canInteractWith(id)) return;
                  onUpdateComposition?.(id === COMPOSITION_LOGO_ID && composition.version === 3 && composition.logo
                    ? { ...composition, logo: { ...composition.logo, ...patch, position: "custom" } }
                    : overrideArsenalElement(composition, id, patch));
                }}
                bridge={{target:editingTarget,selection:editingSelection,click:handleTextClick,doubleClick:handleTextDoubleClick,down:handleEditingPointerDown,move:handleEditingPointerMove,touchStart:handleTextTouchStart,touchMove:handleTextTouchMove,up:handleEditingPointerUp,selectionHandles:isMobile ? (id,layout)=><TextSelectionHandles layout={layout} start={editingSelection.start} end={editingSelection.end} touchScale={touchScale*composition.artboard.width/360/composition.projection.scale} onStart={(event,edge,metrics)=>handleSelectionHandleStart(event,id,edge,metrics)} /> : undefined}} /> : null) : (<React.Fragment>
              <NativeElementStack order={currentSlide.elementOrder}>
              <Group {...nativeGroupProps("background")}>
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
                    draggable={canInteractWith("background") && isEditingBackground}
                    onDblClick={() => {
                      if (canInteractWith("background") && !isEditingBackground && onEnterBackgroundEdit) {
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

                {/* ─── 2. DETALHES GRÁFICOS ÚNICOS DE CADA FAMÍLIA ─── */}

              {/* 2.A) EDITORIAL: Aspas Gigantes no Fundo + Divisória Fina */}
              {isEditorial && !currentSlide?.guidedComposition && !currentSlide?.suppressFamilyDecorations && (
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

              {currentSlide?.guidedComposition && (
                <Rect x={0} y={currentSlide.guidedComposition.readingArea.y}
                  width={baseWidth} height={currentSlide.guidedComposition.readingArea.height}
                  fill={currentSlide.guidedComposition.readingArea.color} listening={false} />
              )}

              </Group>
              <Group {...nativeGroupProps("badge")}>
              {/* ─── 3. BADGES / TAGS INDIVIDUAIS COM ESTILOS PRÓPRIOS ─── */}
              {hasVisibleBadge && (
                isBrutalBlock ? (
                  // 3.A) BRUTALISMO: Sticker Angular Rotacionado no Canto Superior
                  <Group
                    ref={badgeRef}
                    x={badgePos.x}
                    y={badgePos.y}
                    scaleX={currentSlide?.nativeDecorationTransforms?.badge?.scaleX ?? 1}
                    scaleY={currentSlide?.nativeDecorationTransforms?.badge?.scaleY ?? 1}
                    rotation={currentSlide?.nativeDecorationTransforms?.badge?.rotation ?? -4}
                    draggable={isInteractive}
                    dragBoundFunc={isInteractive ? createSnapBoundFunc(Math.max(95, primaryBadgeText.length * 8 + 20), 26) : undefined}
                    onClick={() => handleSelect("badge")}
                    onDblClick={() => startEditing("badge")}
                    onDblTap={() => startEditing("badge")}
                    onDragMove={handleDragMove}
                    onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                    onTransformEnd={(e) => handleDecorationTransformEnd(e, "badge", "badgePos")}
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
                    scaleX={currentSlide?.nativeDecorationTransforms?.badge?.scaleX ?? 1}
                    scaleY={currentSlide?.nativeDecorationTransforms?.badge?.scaleY ?? 1}
                    rotation={currentSlide?.nativeDecorationTransforms?.badge?.rotation ?? 0}
                    draggable={isInteractive}
                    dragBoundFunc={isInteractive ? createSnapBoundFunc(primaryBadgeText.length * 7 + 16, 22) : undefined}
                    onClick={() => handleSelect("badge")}
                    onDblClick={() => startEditing("badge")}
                    onDblTap={() => startEditing("badge")}
                    onDragMove={handleDragMove}
                    onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                    onTransformEnd={(e) => handleDecorationTransformEnd(e, "badge", "badgePos")}
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
                    scaleX={currentSlide?.nativeDecorationTransforms?.badge?.scaleX ?? 1}
                    scaleY={currentSlide?.nativeDecorationTransforms?.badge?.scaleY ?? 1}
                    rotation={currentSlide?.nativeDecorationTransforms?.badge?.rotation ?? 0}
                    draggable={isInteractive}
                    dragBoundFunc={isInteractive ? createSnapBoundFunc(primaryBadgeText.length * 7 + 22, 22) : undefined}
                    onClick={() => handleSelect("badge")}
                    onDblClick={() => startEditing("badge")}
                    onDblTap={() => startEditing("badge")}
                    onDragMove={handleDragMove}
                    onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                    onTransformEnd={(e) => handleDecorationTransformEnd(e, "badge", "badgePos")}
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
                    scaleX={currentSlide?.nativeDecorationTransforms?.badge?.scaleX ?? 1}
                    scaleY={currentSlide?.nativeDecorationTransforms?.badge?.scaleY ?? 1}
                    rotation={currentSlide?.nativeDecorationTransforms?.badge?.rotation ?? 0}
                    draggable={isInteractive}
                    dragBoundFunc={isInteractive ? createSnapBoundFunc(primaryBadgeText.length * 7 + 18, 22) : undefined}
                    onClick={() => handleSelect("badge")}
                    onDblClick={() => startEditing("badge")}
                    onDblTap={() => startEditing("badge")}
                    onDragMove={handleDragMove}
                    onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                    onTransformEnd={(e) => handleDecorationTransformEnd(e, "badge", "badgePos")}
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



              </Group>
              <Group {...nativeGroupProps("logo")}>
              {/* ─── 4. LOGO DA MARCA (SE HOUVER) ─── */}
              {logoImgElement && (
                <Group
                  ref={logoRef}
                  x={logoPos.x}
                  y={logoPos.y}
                  scaleX={logoScaleX}
                  scaleY={logoScaleY}
                  rotation={currentSlide.logo ? 0 : currentSlide.nativeDecorationTransforms?.logo?.rotation ?? 0}
                  width={logoWidth}
                  height={logoHeight}
                  opacity={currentSlide.logo?.opacity ?? 1}
                  draggable={isInteractive}
                  dragBoundFunc={isInteractive ? createSnapBoundFunc(46, 24) : undefined}
                  onClick={() => handleSelect("logo")}
                  onDragMove={handleDragMove}
                  onDragEnd={(event) => {
                    if (!canInteractWith("logo")) return;
                    if (onUpdateLogo) onUpdateLogo({ x: event.target.x(), y: event.target.y(), position: "custom" });
                    else handleDragEnd(event, "logoPos");
                  }}
                  onTransformEnd={(event) => {
                    if (!canInteractWith("logo")) return;
                    if (!onUpdateLogo) { handleDecorationTransformEnd(event, "logo", "logoPos"); return; }
                    const node = event.target;
                    const patch = { x: node.x(), y: node.y(), width: Math.max(8, node.width() * node.scaleX()), height: Math.max(8, node.height() * node.scaleY()), position: "custom" as const };
                    node.scaleX(1); node.scaleY(1); onUpdateLogo(patch);
                  }}
                >
                  <Rect width={logoWidth} height={logoHeight} fill="rgba(0,0,0,0)" />
                  <KonvaImage image={logoImgElement} {...logoFit} listening={false} />
                </Group>
              )}

              </Group>
              {currentSlide?.extraShapes?.map(shape => (
                <Rect
                  key={shape.id}
                  name={`native-element-${shape.id}`}
                  visible={elementState(shape.id).visible}
                  opacity={isEditingBackground ? 0.35 : 1}
                  ref={node => { if (node) extraShapeRefs.current[shape.id] = node; else delete extraShapeRefs.current[shape.id]; }}
                  x={shape.x}
                  y={shape.y}
                  width={shape.width}
                  height={shape.height}
                  fill={shape.color}
                  listening={canInteractWith(shape.id) && !isEditingBackground}
                  draggable={canInteractWith(shape.id) && !isEditingBackground && Boolean(onUpdateExtraShape)}
                  onClick={() => handleSelect(shape.id)}
                  onTap={() => handleSelect(shape.id)}
                  onDragEnd={event => { if (canInteractWith(shape.id)) onUpdateExtraShape?.(shape.id, { x: event.target.x(), y: event.target.y() }); }}
                  onTransformEnd={event => {
                    if (!canInteractWith(shape.id)) return;
                    const node = event.target;
                    const patch = { x: node.x(), y: node.y(), width: Math.max(8, node.width() * node.scaleX()), height: Math.max(8, node.height() * node.scaleY()) };
                    node.scaleX(1); node.scaleY(1); onUpdateExtraShape?.(shape.id, patch);
                  }}
                />
              ))}
              <Group {...nativeGroupProps("headline")}>
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
                  { headlinePos, subtextPos, barPos },
                  Math.max(headlineHeight, headlineFontSize),
                  activeHeadlineScale,
                  headlineFontSize
                )}
                onTransform={(e) => handleTextTransform(
                  e,
                  "headline",
                  setLocalHeadlineWidth,
                  setLocalHeadlinePosition,
                  setLocalHeadlineScale
                )}
                onTransformEnd={(e) => handleTextTransformEnd(
                  e,
                  "headline",
                  setLocalHeadlineWidth,
                  setLocalHeadlinePosition,
                  setLocalHeadlineScale
                )}
              />
              <Group
                ref={headlineRef}
                x={headlinePos.x}
                y={headlinePos.y}
                draggable={canInteractWith("headline") && editingTarget !== "headline"}
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
                  lineHeightPx: headlineFontSize * (typography.headlineLineHeight),
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
                  fontStyle={post.headlineFontWeight ? String(post.headlineFontWeight) : "bold"}
                  fill={headlineColor}
                  align={defaultAlign}
                  lineHeight={typography.headlineLineHeight}
                  letterSpacing={typography.headlineLetterSpacing}
                  opacity={1}
                  {...getTextEffectProps(headlineEffect, isDarkHeadline, true, post.headlineEffectColor)}
                />
                {headlineCaret && editingSelection.start === editingSelection.end && (
                  <BlinkingCaret geometry={headlineCaret} />
                )}
                {isMobile && editingTarget === "headline" && <TextSelectionHandles layout={headlineMetrics} start={editingSelection.start} end={editingSelection.end} touchScale={touchScale} onStart={(event, edge, layout) => handleSelectionHandleStart(event, "headline", edge, layout)} />}
              </Group>

              </Group>
              <Group {...nativeGroupProps("subtext")}>
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
                  { headlinePos, subtextPos, barPos },
                  Math.max(subtextHeight, subtextFontSize),
                  activeSubtextScale,
                  subtextFontSize
                )}
                onTransform={(e) => handleTextTransform(
                  e,
                  "subtext",
                  setLocalSubtextWidth,
                  setLocalSubtextPosition,
                  setLocalSubtextScale
                )}
                onTransformEnd={(e) => handleTextTransformEnd(
                  e,
                  "subtext",
                  setLocalSubtextWidth,
                  setLocalSubtextPosition,
                  setLocalSubtextScale
                )}
              />
              <Group
                ref={subtextRef}
                x={subtextPos.x}
                y={subtextPos.y}
                draggable={canInteractWith("subtext") && editingTarget !== "subtext"}
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
                  fontFamily={post.subtextFontFamily ?? (currentSlide?.guidedComposition ? "Arial, sans-serif" : isCyber ? "Space Mono, monospace" : "Inter, sans-serif")}
                  fontStyle={post.subtextFontWeight ? String(post.subtextFontWeight) : "normal"}
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

              </Group>
              <Group {...nativeGroupProps("bar")}>
              {/* ─── 7. BARRA DECORATIVA DE ACENTO (OCULTA NO BRUTALISMO/CYBER) ─── */}
              {!isBrutalBlock && !isCyber && !currentSlide?.suppressFamilyDecorations && (
                <Rect
                  ref={barRef}
                  x={barPos.x}
                  y={barPos.y}
                  scaleX={currentSlide?.nativeDecorationTransforms?.bar?.scaleX ?? 1}
                  scaleY={currentSlide?.nativeDecorationTransforms?.bar?.scaleY ?? 1}
                  rotation={currentSlide?.nativeDecorationTransforms?.bar?.rotation ?? 0}
                  width={isEditorial ? 48 : 36}
                  height={isEditorial ? 2 : 3}
                  cornerRadius={2}
                  fill={post.palette.accent}
                  draggable={isInteractive}
                  dragBoundFunc={isInteractive ? createSnapBoundFunc(isEditorial ? 48 : 36, 4) : undefined}
                  onClick={() => handleSelect("bar")}
                  onDragMove={handleDragMove}
                  onDragEnd={(e) => handleDragEnd(e, "barPos")}
                  onTransformEnd={(e) => handleDecorationTransformEnd(e, "bar", "barPos")}
                />
              )}

              </Group>
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
                    typeof item.fontWeight === "number"
                      ? String(item.fontWeight)
                    : item.fontWeight === "bold"
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
                  <Group key={item.id} {...nativeGroupProps(item.id)}>
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
                    draggable={canInteractWith(item.id) && editingTarget !== item.id}
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
                      const scaleY = node.scaleY();
                      if (!canInteractWith(item.id)) return;
                      const anchor = transformerRef.current?.getActiveAnchor() as TextResizeAnchor | undefined;
                      const isCorner = anchor === "top-left" || anchor === "top-right" || anchor === "bottom-left" || anchor === "bottom-right";
                      const currentWidth = item.width || contentWidth;
                      const newWidth = Math.max(40, Math.round(currentWidth * scaleX));
                      const newRotation = Math.round(node.rotation());
                      const newX = Math.round(node.x());
                      const newY = Math.round(node.y());
                      const currentFontSize = item.fontSize || 24;
                      const newFontSize = isCorner
                        ? Math.max(10, Math.round(currentFontSize * Math.max(scaleX, scaleY)))
                        : currentFontSize;
                      // Invariante Konva: reseta escalas para 1 para não acumular distorções
                      node.scaleX(1);
                      node.scaleY(1);
                      if (onUpdateExtraText) {
                        onUpdateExtraText(item.id, {
                          x: newX,
                          y: newY,
                          width: newWidth,
                          fontSize: newFontSize,
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
                        typeof item.fontWeight === "number"
                          ? String(item.fontWeight)
                        : item.fontWeight === "bold"
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
                  </Group>
                );
              })}

              {/* ─── 7.C) IMAGENS LIVRES ADICIONAIS (FOTOS / ADESIVOS / STICKERS) ─── */}
              {activeExtraImages.map((imgItem) => (
                <Group key={imgItem.id} {...nativeGroupProps(imgItem.id)}>
                <CanvasCustomImageNode
                  key={imgItem.id}
                  item={imgItem}
                  isInteractive={canInteractWith(imgItem.id) && !isEditingBackground}
                  createSnapBoundFunc={createSnapBoundFunc}
                  setRef={(el) => {
                    if (el) {
                      extraImageRefs.current[imgItem.id] = el;
                      if (selectedId === imgItem.id && canInteractWith(imgItem.id) && !isEditingBackground && !editingTarget) {
                        transformerRef.current?.nodes([el]);
                        transformerRef.current?.getLayer()?.batchDraw();
                      }
                    } else delete extraImageRefs.current[imgItem.id];
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
                </Group>
              ))}
              </NativeElementStack>

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
              </React.Fragment>)}
              {/* ─── 8. TRANSFORMER PARA ELEMENTOS DE TEXTO/MARCA/IMAGENS ─── */}
              {isInteractive && !isEditingBackground && (
                <Transformer
                  ref={transformerRef}
                  rotateEnabled={selectedId !== "headline" && selectedId !== "subtext" && selectedId !== "logo" && selectedId !== COMPOSITION_LOGO_ID && !currentSlide.extraShapes?.some(shape => shape.id === selectedId)}
                  rotationSnaps={[0, 90, 180, 270]}
                  borderStroke="#38bdf8"
                  borderStrokeWidth={1.5}
                  anchorStroke="#38bdf8"
                  anchorFill="#ffffff"
                  anchorSize={7}
                  anchorCornerRadius={2}
                  keepRatio={Boolean(selectedId && (extraImageRefs.current[selectedId] || composition?.groups.some(g=>g.id===selectedId)))}
                  enabledAnchors={
                    selectedId && extraImageRefs.current[selectedId]
                      ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                      : (selectedId === "headline" || selectedId === "subtext" || (selectedId && extraTextRefs.current[selectedId]) || composition?.elements.some(e=>e.id===selectedId && e.kind==="text"))
                      ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
                      : ["top-left", "top-right", "bottom-left", "bottom-right"]
                  }
                  boundBoxFunc={(oldBox, newBox) => Math.abs(newBox.width) < 40 ? oldBox : newBox}
                  onDblClick={() => {
                    if (selectedId && (selectedId === "headline" || selectedId === "subtext" || selectedId === "badge" || composition?.elements.some(e=>e.id===selectedId && e.kind==="text"))) {
                      startEditing(selectedId);
                    }
                  }}
                  onDblTap={() => {
                    if (selectedId && (selectedId === "headline" || selectedId === "subtext" || selectedId === "badge" || composition?.elements.some(e=>e.id===selectedId && e.kind==="text"))) {
                      startEditing(selectedId);
                    }
                  }}
                />
              )}

            </Layer>
          </Stage>
        </div>

        {composition && !arsenalReady && <div role="status" className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6 text-sm text-white">{arsenalFonts.error ? `Fonte indisponível: ${arsenalFonts.error}. Recarregue ou escolha outra fonte no painel.` : "Carregando fontes da composição…"}</div>}
        {/* Input invisível: teclado/clipboard/IME. Texto, seleção e caret permanecem no Konva. */}
        {editingTarget && (() => {
          const isHeadline = editingTarget === "headline";
          const isSubtext = editingTarget === "subtext";
          const isBadge = editingTarget === "badge";
          const compElement = composition?.elements.find(e => e.id === editingTarget);
          const compNode = compElement ? (compositionNodeRefs.current[editingTarget] ?? extraTextRefs.current[editingTarget]) : null;
          const compBox = compNode && stageRef.current ? compNode.getClientRect({ relativeTo: stageRef.current }) : null;
          const extraItem = !isHeadline && !isSubtext && !isBadge && !compElement
            ? activeExtraTexts.find(item => item.id === editingTarget)
            : null;
          const targetX = compBox
            ? compBox.x
            : isHeadline
            ? headlinePos.x
            : isSubtext
            ? subtextPos.x
            : isBadge
            ? badgePos.x
            : (extraItem?.x ?? Math.round(baseWidth * 0.1));
          const targetY = compBox
            ? compBox.y
            : isHeadline
            ? headlinePos.y
            : isSubtext
            ? subtextPos.y
            : isBadge
            ? badgePos.y
            : (extraItem?.y ?? Math.round(baseHeight * 0.65));
          const targetWidth = compBox
            ? compBox.width
            : isBadge
            ? Math.max(130, primaryBadgeText.length * 8 + 36)
            : isHeadline
            ? activeHeadlineWidth
            : isSubtext
            ? activeSubtextWidth
            : (extraItem?.width ?? contentWidth);
          const targetHeight = compBox ? compBox.height : (isHeadline ? headlineHeight : isSubtext ? subtextHeight : 28);

          return (
            <div
              ref={editorWrapperRef}
              className="absolute z-40 pointer-events-none"
              style={{
                left: targetX * zoom,
                top: targetY * zoom,
                width: targetWidth * zoom,
                height: Math.max(1, targetHeight * zoom),
              }}
            >


              {isMobile && document.getElementById("canvas-mobile-text-actions-slot") && createPortal(
                <div data-text-edit-chrome className="flex items-center justify-between gap-2 rounded-2xl border border-sky-400/40 bg-[#0C1017]/95 px-2 py-1.5 text-white shadow-xl backdrop-blur-md">
                  <button type="button" onClick={() => syncNativeSelection(0, editingTextRef.current.length)} className="min-h-11 rounded-xl px-3 text-xs text-white/80">Selecionar tudo</button>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCancelText} className="min-h-11 rounded-xl px-3 text-xs text-white/80">Cancelar</button>
                    <button type="button" onClick={handleCommitText} className="min-h-11 rounded-xl bg-sky-400 px-4 text-xs font-bold text-black">Concluir</button>
                  </div>
                </div>,
                document.getElementById("canvas-mobile-text-actions-slot")!
              )}

              <RichTextFloatingToolbar
                  actions={<>
                    <button type="button" onClick={handleCancelText} className="flex min-h-11 items-center gap-1 rounded-lg bg-white/10 px-3 text-xs text-white hover:bg-white/20" title="Cancelar edição"><X size={16} /><span>Cancelar</span></button>
                    <button type="button" onClick={handleCommitText} className="flex min-h-11 items-center gap-1 rounded-lg bg-sky-400 px-4 text-xs font-bold text-black hover:bg-sky-300" title="Concluir edição"><Check size={16} strokeWidth={3} /><span>Concluir</span></button>
                  </>}
                  selection={isBadge && !compElement ? { start: 0, end: 0 } : editingSelection}
                  anchorRef={editorWrapperRef}
                  palette={post.palette}
                  baseColor={isHeadline ? headlineColor : isSubtext ? subtextColor : (compElement?.fill ?? extraItem?.color ?? post.palette.text)}
                  richText={editingRichText}
                  baseBold={isHeadline || (compElement ? (typeof compElement.fontWeight === "number" ? compElement.fontWeight >= 600 : compElement.fontWeight === "bold") : (extraItem?.fontWeight === "bold" || (typeof extraItem?.fontWeight === "number" && extraItem.fontWeight >= 600)))}
                  baseItalic={compElement ? false : extraItem?.fontStyle === "italic"}
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

              <textarea
                ref={textareaRef}
                value={editingText}
                onChange={event => {
                  const nextText = event.target.value;
                  if (isHeadline || isSubtext || extraItem || Boolean(compElement)) {
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
