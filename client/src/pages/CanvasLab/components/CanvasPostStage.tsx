import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Group, Image as KonvaImage, Transformer, Line, Circle } from "react-konva";
import type { BgImageTransform, CanvasPostModel, ElementPosition, LogoPositionType, TextLegibilityEffect } from "./types";
import { isDarkColor, resolveLegibleTextColor } from "./types";
import { getKonvaTextMetrics } from "./textMetrics";
import { useDynamicFont } from "@/hooks/useDynamicFont";
import JSZip from "jszip";
import { Check, X } from "lucide-react";

export interface CanvasPostStageRef {
  exportPng4K: () => string;
  exportZip4K: (onProgress?: (current: number, total: number) => void) => Promise<Blob>;
}

interface CanvasPostStageProps {
  post: CanvasPostModel;
  zoom: number;
  onUpdateElementPosition?: (elementKey: "headlinePos" | "subtextPos" | "badgePos" | "barPos" | "logoPos", pos: ElementPosition) => void;
  onSelectElement?: (elementId: string | null) => void;
  isReadOnly?: boolean;
  isEditingBackground?: boolean;
  onUpdateBgTransform?: (transform: BgImageTransform) => void;
  onEnterBackgroundEdit?: () => void;
  onUpdateText?: (field: "headline" | "subtext" | "badgeText", value: string) => void;
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
        fill={isDarkText ? "rgba(255, 255, 255, 0.88)" : "rgba(12, 12, 16, 0.82)"}
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
        fill={isDarkText ? "rgba(255, 255, 255, 0.92)" : "rgba(12, 12, 16, 0.88)"}
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
        fill={isDarkText ? "rgba(255, 255, 255, 0.22)" : "rgba(0, 0, 0, 0.38)"}
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
        fill={accentColor}
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
        fill={isDarkText ? "#FFFFFF" : "#000000"}
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
              fill={isDarkText ? "rgba(255, 255, 255, 0.9)" : "rgba(12, 12, 16, 0.85)"}
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

function getTextEffectProps(effect: TextLegibilityEffect, isDarkText: boolean, isHeadline: boolean) {
  if (effect === "shadow") {
    return {
      shadowColor: isDarkText ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.95)",
      shadowBlur: 12,
      shadowOffsetX: 0,
      shadowOffsetY: isDarkText ? 0 : 3,
      shadowOpacity: 0.9,
    };
  }
  if (effect === "outline") {
    return {
      stroke: isDarkText ? "#FFFFFF" : "#000000",
      strokeWidth: isHeadline ? 3 : 2,
      fillAfterStrokeEnabled: true,
    };
  }
  return {};
}

export const CanvasPostStage = forwardRef<CanvasPostStageRef, CanvasPostStageProps>(
  (
    {
      post,
      zoom,
      onUpdateElementPosition,
      onSelectElement,
      isReadOnly = false,
      isEditingBackground = false,
      onUpdateBgTransform,
      onEnterBackgroundEdit,
      onUpdateText,
    },
    ref
  ) => {
    const isInteractive = !isReadOnly && Boolean(onUpdateElementPosition);
    const stageRef = useRef<any>(null);
    const transformerRef = useRef<any>(null);
    const bgTransformerRef = useRef<any>(null);

    const headlineRef = useRef<any>(null);
    const subtextRef = useRef<any>(null);
    const badgeRef = useRef<any>(null);
    const barRef = useRef<any>(null);
    const logoRef = useRef<any>(null);
    const bgImageRef = useRef<any>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({});
    const [isAltPressed, setIsAltPressed] = useState(false);

    // Estado da edição direta no canvas (Inline On-Canvas Editor)
    const [editingTarget, setEditingTarget] = useState<"headline" | "subtext" | "badge" | null>(null);
    const [editingText, setEditingText] = useState("");
    const editingTargetRef = useRef(editingTarget);
    editingTargetRef.current = editingTarget;
    const editingTextRef = useRef(editingText);
    editingTextRef.current = editingText;
    const editorWrapperRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const [bgImgElement, setBgImgElement] = useState<HTMLImageElement | null>(null);
    const [logoImgElement, setLogoImgElement] = useState<HTMLImageElement | null>(null);

    useDynamicFont(post.fontFamily, post.customFontUrl);

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

    const currentSlide = post.slides[post.currentSlideIndex] || post.slides[0];
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
      if (isEditingBackground) {
        transformerRef.current?.nodes([]);
        transformerRef.current?.getLayer()?.batchDraw();
        return;
      }
      if (!transformerRef.current) return;
      let targetNode = null;
      if (selectedId === "headline") targetNode = headlineRef.current;
      else if (selectedId === "subtext") targetNode = subtextRef.current;
      else if (selectedId === "badge") targetNode = badgeRef.current;
      else if (selectedId === "bar") targetNode = barRef.current;
      else if (selectedId === "logo") targetNode = logoRef.current;

      if (targetNode) {
        transformerRef.current.nodes([targetNode]);
        transformerRef.current.getLayer()?.batchDraw();
      } else {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    }, [selectedId, isEditingBackground]);

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
        if (!stageRef.current) return new Blob();

        setSelectedId(null);
        transformerRef.current?.nodes([]);
        bgTransformerRef.current?.nodes([]);
        stageRef.current.getLayers().forEach((l: any) => l.batchDraw());

        for (let i = 0; i < post.slides.length; i++) {
          if (onProgress) onProgress(i + 1, post.slides.length);
          const dataUrl = stageRef.current.toDataURL({
            pixelRatio: 4,
            mimeType: "image/png",
          });
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
          zip.file(`slide-${i + 1}.png`, base64Data, { base64: true });
        }

        return await zip.generateAsync({ type: "blob" });
      },
    }));

    const activeHeadline = currentSlide ? currentSlide.headline : post.headline;
    const activeSubtext = currentSlide ? currentSlide.subtext : post.subtext;
    const activeStep = currentSlide ? currentSlide.step : post.badgeText;

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

    const contentWidth = baseWidth - (isGlass ? 56 : 48);

    // ─── TAMANHOS BASE POR FAMÍLIA × ESCALA DO USUÁRIO (item 2) ───
    const headlineBaseSize = isBrutalBlock || isStrokeImpact ? 32 : isCinematic ? 34 : isBrutalSplit ? 28 : isCyber ? 18 : isEditorial ? 23 : 21;
    const subtextBaseSize = isBrutalBlock ? 11 : isCyber ? 11 : 12;
    const effHeadlineSizeBase = headlineBaseSize * (post.headlineSizeScale ?? 1);
    const effSubtextSize = subtextBaseSize * (post.subtextSizeScale ?? 1);

    // ─── MOTOR ANTI-SOBREPOSIÇÃO (item 4) ───
    // Medidas derivadas do tamanho efetivo; em títulos longos a fonte do
    // título é reduzida em até 3 passos (0.88×) antes de permitir qualquer
    // invasão entre título/corpo, linha de corte do split ou margem inferior.
    const SPLIT_LINE_RATIO = 0.5;
    const MIN_TEXT_GAP = 8;
    const splitLineY = baseHeight * SPLIT_LINE_RATIO;
    const layoutBottomMargin = post.aspectRatio === "9:16" ? 64 : 32;

    const headlineMetricsFor = (size: number) =>
      getKonvaTextMetrics({
        text: activeHeadline,
        width: contentWidth,
        fontSize: size,
        fontFamily: post.fontFamily,
        fontStyle: "bold",
        letterSpacing: isBrutalBlock ? 0.5 : isEditorial ? -0.2 : -0.4,
        lineHeight: isBrutalBlock ? 1.1 : 1.25,
      });

    const subtextMetricsFor = (size: number) =>
      getKonvaTextMetrics({
        text: activeSubtext,
        width: contentWidth,
        fontSize: size,
        fontFamily: isCyber ? "Space Mono, monospace" : "Inter, sans-serif",
        fontStyle: "normal",
        lineHeight: 1.45,
      });

    const fitsWithSizes = (hSize: number, sSize: number): boolean => {
      const hHeight = headlineMetricsFor(hSize).height;
      const sHeight = subtextMetricsFor(sSize).height;
      if (isBrutalSplit) {
        // Título inteiro precisa caber na metade de cima (badge termina em ~45)
        return 45 + hHeight + MIN_TEXT_GAP <= splitLineY;
      }
      const stack = hHeight + sHeight + 20;
      const topLimit = isBrutalBlock ? 60 : isGlass ? 80 : isDuotone ? 70 : 80;
      const bottomLimit = isBrutalBlock ? 24 : isGlass ? 32 : isDuotone ? 24 : layoutBottomMargin;
      return topLimit + stack <= baseHeight - bottomLimit;
    };

    let effHeadlineSize = effHeadlineSizeBase;
    for (let attempt = 0; attempt < 3 && !fitsWithSizes(effHeadlineSize, effSubtextSize); attempt++) {
      effHeadlineSize *= 0.88;
    }

    const headlineFontSize = effHeadlineSize;
    const subtextFontSize = effSubtextSize;

    const headlineMetrics = headlineMetricsFor(headlineFontSize);
    const subtextMetrics = subtextMetricsFor(subtextFontSize);

    const headlineHeight = headlineMetrics.height;
    const subtextHeight = subtextMetrics.height;
    const totalStackHeight = headlineHeight + subtextHeight + 20;

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

    const headlineLines = headlineMetrics.lines;
    const subtextLines = subtextMetrics.lines;

    // Posições Padrão Customizadas por Família
    let defaultHeadlineY = 0;
    let defaultSubtextY = 0;
    let defaultBadgeY = 24;
    let defaultBadgeX = 24;
    let defaultBarY = 0;
    let defaultAlign: "left" | "center" | "right" = post.headlineAlign || "left";

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
      // Editorial / Cyber
      defaultHeadlineY = Math.max(80, baseHeight - layoutBottomMargin - totalStackHeight);
      defaultSubtextY = defaultHeadlineY + headlineHeight + 10;
      defaultBadgeX = 24;
      defaultBadgeY = 24;
      defaultBarY = defaultSubtextY + subtextHeight + 18;
    }

    const badgePos = currentSlide?.badgePos || { x: defaultBadgeX, y: defaultBadgeY };
    const headlinePos = currentSlide?.headlinePos || { x: 24, y: defaultHeadlineY };
    const subtextPos = currentSlide?.subtextPos || { x: 24, y: defaultSubtextY };
    const barPos = currentSlide?.barPos || {
      x: defaultAlign === "center" ? (baseWidth - 42) / 2 : defaultAlign === "right" ? baseWidth - 24 - 42 : 24,
      y: defaultBarY,
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

    const bgCrop = bgImgElement
      ? getCoverCrop(
          bgImgElement.naturalWidth || bgImgElement.width,
          bgImgElement.naturalHeight || bgImgElement.height,
          baseWidth,
          baseHeight
        )
      : undefined;

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

    const handleDragEnd = (e: any, elementKey: "headlinePos" | "subtextPos" | "badgePos" | "barPos" | "logoPos") => {
      setSnapLines({});
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

    // ─── Ações de Edição Direta no Canvas ───
    const startEditing = (target: "headline" | "subtext" | "badge") => {
      if (isReadOnly || isEditingBackground || !onUpdateText) return;
      setSelectedId(null);
      if (onSelectElement) onSelectElement(null);
      transformerRef.current?.nodes([]);
      transformerRef.current?.getLayer()?.batchDraw();
      setEditingTarget(target);
      let initialText = "";
      if (target === "headline") initialText = activeHeadline;
      else if (target === "subtext") initialText = activeSubtext;
      else if (target === "badge") initialText = activeStep;
      setEditingText(initialText);
    };

    const handleCommitText = () => {
      const target = editingTargetRef.current;
      const val = editingTextRef.current;
      if (target && onUpdateText) {
        const fieldKey = target === "badge" ? "badgeText" : target;
        onUpdateText(fieldKey, val);
      }
      setEditingTarget(null);
    };

    const handleCancelText = () => {
      setEditingTarget(null);
    };

    useEffect(() => {
      if (!editingTarget) return;

      const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
        if (editorWrapperRef.current && !editorWrapperRef.current.contains(e.target as Node)) {
          handleCommitText();
        }
      };

      const timer = window.setTimeout(() => {
        window.addEventListener("mousedown", handlePointerDownOutside);
        window.addEventListener("touchstart", handlePointerDownOutside);
      }, 120);

      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("mousedown", handlePointerDownOutside);
        window.removeEventListener("touchstart", handlePointerDownOutside);
      };
    }, [editingTarget]);

    useEffect(() => {
      if (editingTarget && textareaRef.current) {
        const el = textareaRef.current;
        el.focus();
        el.selectionStart = el.value.length;
        el.selectionEnd = el.value.length;
        el.style.height = "auto";
        el.style.height = `${Math.max(el.scrollHeight, 28)}px`;
      }
    }, [editingTarget]);

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

      if (isHeadline || isSubtext || isBadge || isBar || isLogo) {
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

    return (
      <div
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
                  <Line points={[0, baseHeight * 0.5, baseWidth, baseHeight * 0.5]} stroke="#000000" strokeWidth={2} opacity={0.4} listening={false} />
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
                  <Rect name="canvas-bg" x={0} y={0} width={baseWidth} height={baseHeight} fill="#08080A" />
                  <Rect x={12} y={12} width={baseWidth - 24} height={baseHeight - 24} stroke="rgba(255,255,255,0.08)" strokeWidth={1} listening={false} />
                </>
              ) : (
                // 1.D) FUNDO SÓLIDO BASE
                <Rect name="canvas-bg" x={0} y={0} width={baseWidth} height={baseHeight} fill={post.palette.background} />
              )}

              {/* IMAGEM DE FUNDO COM SUPORTE A EDIÇÃO ESTILO CANVA */}
              {bgImgElement && (
                <KonvaImage
                  ref={bgImageRef}
                  image={bgImgElement}
                  x={bgTransform?.x ?? 0}
                  y={bgTransform?.y ?? 0}
                  scaleX={bgTransform?.scaleX ?? 1}
                  scaleY={bgTransform?.scaleY ?? 1}
                  rotation={bgTransform?.rotation ?? 0}
                  width={baseWidth}
                  height={baseHeight}
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
              )}

              {/* GRADIENTE / SCRIM DE CONTRASTE */}
              {bgImgElement && (
                <Rect
                  x={0}
                  y={0}
                  width={baseWidth}
                  height={baseHeight}
                  fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                  fillLinearGradientEndPoint={{ x: 0, y: baseHeight }}
                  fillLinearGradientColorStops={[
                    0,
                    `${post.palette.background}22`,
                    0.5,
                    `${post.palette.background}BB`,
                    1,
                    post.palette.background,
                  ]}
                  opacity={isEditingBackground ? 0.2 : post.overlayOpacity}
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
              {isBrutalBlock ? (
                // 3.A) BRUTALISMO: Sticker Angular Rotacionado no Canto Superior
                <Group
                  ref={badgeRef}
                  x={badgePos.x}
                  y={badgePos.y}
                  rotation={-4}
                  draggable={isInteractive}
                  dragBoundFunc={isInteractive ? createSnapBoundFunc(95, 26) : undefined}
                  onClick={() => handleSelect("badge")}
                  onDblClick={() => startEditing("badge")}
                  onDblTap={() => startEditing("badge")}
                  onDragMove={handleDragMove}
                  onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                >
                  <Rect
                    x={0}
                    y={0}
                    width={95}
                    height={26}
                    fill="#000000"
                    stroke={post.palette.accent}
                    strokeWidth={2}
                    shadowColor="rgba(0,0,0,0.8)"
                    shadowBlur={6}
                    shadowOffset={{ x: 2, y: 3 }}
                  />
                  <Text
                    text={activeStep ? activeStep.toUpperCase() : "★ DESTAQUE"}
                    x={8}
                    y={7}
                    fontSize={10}
                    fontFamily="Anton"
                    fontStyle="bold"
                    fill={post.palette.accent}
                    letterSpacing={1}
                    opacity={editingTarget === "badge" ? 0 : 1}
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
                  dragBoundFunc={isInteractive ? createSnapBoundFunc(activeStep.length * 7 + 16, 22) : undefined}
                  onClick={() => handleSelect("badge")}
                  onDblClick={() => startEditing("badge")}
                  onDblTap={() => startEditing("badge")}
                  onDragMove={handleDragMove}
                  onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                >
                  <Rect x={0} y={0} width={activeStep.length * 7 + 16} height={22} fill="#FFFFFF" stroke="#000000" strokeWidth={1.5} />
                  <Text text={activeStep.toUpperCase()} x={8} y={6} fontSize={8.5} fontFamily="monospace" fontStyle="bold" fill="#000000" letterSpacing={1} opacity={editingTarget === "badge" ? 0 : 1} onDblClick={() => startEditing("badge")} onDblTap={() => startEditing("badge")} />
                </Group>
              ) : isCyber ? (
                // 3.C) CYBER: Badge Terminal Neon
                <Group
                  ref={badgeRef}
                  x={badgePos.x}
                  y={badgePos.y}
                  draggable={isInteractive}
                  dragBoundFunc={isInteractive ? createSnapBoundFunc(activeStep.length * 7 + 22, 22) : undefined}
                  onClick={() => handleSelect("badge")}
                  onDblClick={() => startEditing("badge")}
                  onDblTap={() => startEditing("badge")}
                  onDragMove={handleDragMove}
                  onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                >
                  <Rect x={0} y={0} width={activeStep.length * 7 + 22} height={22} fill="rgba(0, 240, 255, 0.08)" stroke="#00F0FF" strokeWidth={1} cornerRadius={2} />
                  <Text text={`[ ${activeStep.toUpperCase()} ]`} x={8} y={6} fontSize={8.5} fontFamily="Space Mono" fontStyle="bold" fill="#00F0FF" letterSpacing={1} opacity={editingTarget === "badge" ? 0 : 1} onDblClick={() => startEditing("badge")} onDblTap={() => startEditing("badge")} />
                </Group>
              ) : (
                // 3.D) PADRÃO / EDITORIAL / GLASS / DUOTONE: Pílula Refinada
                <Group
                  ref={badgeRef}
                  x={badgePos.x}
                  y={badgePos.y}
                  draggable={isInteractive}
                  dragBoundFunc={isInteractive ? createSnapBoundFunc(activeStep.length * 7 + 18, 22) : undefined}
                  onClick={() => handleSelect("badge")}
                  onDblClick={() => startEditing("badge")}
                  onDblTap={() => startEditing("badge")}
                  onDragMove={handleDragMove}
                  onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                >
                  <Rect
                    x={0}
                    y={0}
                    width={activeStep.length * 7 + 18}
                    height={22}
                    cornerRadius={11}
                    fill={isGlass ? "rgba(255,255,255,0.12)" : `${post.palette.accent}22`}
                    stroke={isGlass ? "rgba(255,255,255,0.25)" : `${post.palette.accent}66`}
                    strokeWidth={1}
                  />
                  <Text
                    text={activeStep.toUpperCase()}
                    x={9}
                    y={6}
                    fontSize={8.5}
                    fontFamily="monospace"
                    fontStyle="bold"
                    fill={isGlass ? "#FFFFFF" : post.palette.accent}
                    letterSpacing={1.5}
                    opacity={editingTarget === "badge" ? 0 : 1}
                    onDblClick={() => startEditing("badge")}
                    onDblTap={() => startEditing("badge")}
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
              <Group
                ref={headlineRef}
                x={headlinePos.x}
                y={headlinePos.y}
                draggable={isInteractive}
                dragBoundFunc={isInteractive ? createSnapBoundFunc(contentWidth, headlineHeight) : undefined}
                onClick={() => handleSelect("headline")}
                onDblClick={() => startEditing("headline")}
                onDblTap={() => startEditing("headline")}
                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(e, "headlinePos")}
              >
                {renderBackgroundEffect({
                  effect: headlineEffect,
                  contentWidth,
                  textHeight: headlineHeight,
                  isDarkText: isDarkHeadline,
                  accentColor: post.palette.accent,
                  lines: headlineLines,
                  lineHeightPx: headlineFontSize * (isBrutalBlock ? 1.1 : 1.25),
                  align: defaultAlign,
                })}
                <Text
                  text={activeHeadline}
                  x={0}
                  y={0}
                  width={contentWidth}
                  fontSize={headlineFontSize}
                  fontFamily={post.fontFamily}
                  fontStyle="bold"
                  fill={headlineColor}
                  align={defaultAlign}
                  lineHeight={isBrutalBlock ? 1.1 : 1.25}
                  letterSpacing={isBrutalBlock ? 0.5 : isEditorial ? -0.2 : -0.4}
                  opacity={editingTarget === "headline" ? 0 : 1}
                  onDblClick={() => startEditing("headline")}
                  onDblTap={() => startEditing("headline")}
                  {...getTextEffectProps(headlineEffect, isDarkHeadline, true)}
                />
              </Group>

              {/* ─── 6. SUBTÍTULO / CORPO INDIVIDUAL (COM SUPORTE A EFEITOS DE LEGIBILIDADE) ─── */}
              <Group
                ref={subtextRef}
                x={subtextPos.x}
                y={subtextPos.y}
                draggable={isInteractive}
                dragBoundFunc={isInteractive ? createSnapBoundFunc(contentWidth, subtextHeight) : undefined}
                onClick={() => handleSelect("subtext")}
                onDblClick={() => startEditing("subtext")}
                onDblTap={() => startEditing("subtext")}
                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(e, "subtextPos")}
              >
                {renderBackgroundEffect({
                  effect: subtextEffect,
                  contentWidth,
                  textHeight: subtextHeight,
                  isDarkText: isDarkSubtext,
                  accentColor: post.palette.accent,
                  lines: subtextLines,
                  lineHeightPx: subtextFontSize * 1.45,
                  align: defaultAlign,
                })}
                <Text
                  text={activeSubtext}
                  x={0}
                  y={0}
                  width={contentWidth}
                  fontSize={subtextFontSize}
                  fontFamily={isCyber ? "Space Mono, monospace" : "Inter, sans-serif"}
                  fill={subtextColor}
                  opacity={editingTarget === "subtext" ? 0 : isBrutalSplit ? 0.95 : 0.85}
                  align={defaultAlign}
                  lineHeight={1.45}
                  onDblClick={() => startEditing("subtext")}
                  onDblTap={() => startEditing("subtext")}
                  {...getTextEffectProps(subtextEffect, isDarkSubtext, false)}
                />
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
              </Group>

              {/* ─── 8. TRANSFORMER PARA ELEMENTOS DE TEXTO/MARCA ─── */}
              {isInteractive && !isEditingBackground && (
                <Transformer
                  ref={transformerRef}
                  rotateEnabled={true}
                  borderStroke="#38bdf8"
                  borderStrokeWidth={1.5}
                  anchorStroke="#38bdf8"
                  anchorFill="#ffffff"
                  anchorSize={7}
                  anchorCornerRadius={2}
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

          {/* ─── 10. OVERLAY DE EDIÇÃO DIRETA DE TEXTO NO PALCO (CANVAS INLINE EDITOR) ─── */}
          {editingTarget && (
            <div
              ref={editorWrapperRef}
              className="absolute pointer-events-auto select-text z-40"
              style={{
                left:
                  editingTarget === "headline"
                    ? headlinePos.x
                    : editingTarget === "subtext"
                    ? subtextPos.x
                    : badgePos.x,
                top:
                  editingTarget === "headline"
                    ? headlinePos.y
                    : editingTarget === "subtext"
                    ? subtextPos.y
                    : badgePos.y,
                width:
                  editingTarget === "badge"
                    ? Math.max(130, activeStep.length * 8 + 36)
                    : contentWidth,
                transform: editingTarget === "badge" && isBrutalBlock ? "rotate(-4deg)" : undefined,
                transformOrigin: "top left",
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* BARRA FLUTUANTE DE AÇÕES (CONCLUIR / CANCELAR) */}
              <div
                className="absolute flex items-center gap-1.5 bg-[#0C1017]/95 backdrop-blur-md px-2.5 py-1 rounded-full border border-sky-400/60 shadow-[0_8px_24px_rgba(0,0,0,0.85)] text-white select-none whitespace-nowrap z-50 pointer-events-auto"
                style={{
                  top:
                    (editingTarget === "headline"
                      ? headlinePos.y
                      : editingTarget === "subtext"
                      ? subtextPos.y
                      : badgePos.y) > 45
                      ? -36
                      : (editingTarget === "badge"
                          ? 28
                          : (editingTarget === "headline" ? headlineHeight : subtextHeight)) + 8,
                  left: 0,
                }}
              >
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCommitText();
                  }}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-400 hover:bg-sky-300 text-black font-bold text-[11px] cursor-pointer transition-all shadow-sm active:scale-95"
                  title="Concluir e aplicar no post (Enter)"
                >
                  <Check size={12} strokeWidth={3} />
                  <span>Concluir</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCancelText();
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-[11px] cursor-pointer transition-all active:scale-95"
                  title="Cancelar edição (Esc)"
                >
                  <X size={12} />
                  <span>Cancelar</span>
                </button>
                <span className="text-[9px] text-white/40 pl-1 border-l border-white/15 hidden sm:inline font-sans">
                  {editingTarget === "badge" ? "Enter salva" : "Ctrl+Enter salva"}
                </span>
              </div>

              {/* TEXTAREA COM TIPOGRAFIA RIGOROSAMENTE ESPELHADA */}
              <textarea
                ref={textareaRef}
                value={editingText}
                onChange={(e) => {
                  setEditingText(e.target.value);
                  if (textareaRef.current) {
                    textareaRef.current.style.height = "auto";
                    textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 24)}px`;
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCancelText();
                  } else if (e.key === "Enter") {
                    if (editingTarget === "badge" || e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCommitText();
                    }
                  }
                }}
                className="w-full bg-transparent resize-none border-0 outline-none p-0 m-0 shadow-none block"
                style={{
                  fontFamily:
                    editingTarget === "headline"
                      ? post.fontFamily
                      : editingTarget === "subtext"
                      ? (isCyber ? "Space Mono, monospace" : "Inter, sans-serif")
                      : (isBrutalBlock ? "Anton" : isCyber ? "Space Mono" : "monospace"),
                  fontSize: `${
                    editingTarget === "headline"
                      ? headlineFontSize
                      : editingTarget === "subtext"
                      ? subtextFontSize
                      : isBrutalBlock
                      ? 10
                      : 8.5
                  }px`,
                  fontWeight: editingTarget === "subtext" ? 400 : 700,
                  fontStyle: editingTarget === "headline" && isEditorial ? "normal" : undefined,
                  lineHeight:
                    editingTarget === "headline"
                      ? (isBrutalBlock ? 1.1 : 1.25)
                      : editingTarget === "subtext"
                      ? 1.45
                      : 1.2,
                  letterSpacing:
                    editingTarget === "headline"
                      ? `${isBrutalBlock ? 0.5 : isEditorial ? -0.2 : -0.4}px`
                      : editingTarget === "badge"
                      ? "1.5px"
                      : "normal",
                  color:
                    editingTarget === "headline"
                      ? headlineColor
                      : editingTarget === "subtext"
                      ? subtextColor
                      : isBrutalBlock
                      ? post.palette.accent
                      : isBrutalSplit
                      ? "#000000"
                      : isGlass
                      ? "#FFFFFF"
                      : post.palette.accent,
                  textAlign: editingTarget === "badge" ? "left" : defaultAlign,
                  textTransform: editingTarget === "badge" ? "uppercase" : "none",
                  outline: "2px dashed rgba(56, 189, 248, 0.9)",
                  outlineOffset: "3px",
                  borderRadius: "4px",
                  caretColor: "#38bdf8",
                  overflow: "hidden",
                }}
                autoFocus
                rows={editingTarget === "badge" ? 1 : 2}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);
