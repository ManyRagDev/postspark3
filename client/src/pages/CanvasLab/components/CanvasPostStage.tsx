import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Group, Image as KonvaImage, Transformer, Line, Circle } from "react-konva";
import type { CanvasPostModel, ElementPosition } from "./types";
import { useDynamicFont } from "@/hooks/useDynamicFont";
import JSZip from "jszip";

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

export const CanvasPostStage = forwardRef<CanvasPostStageRef, CanvasPostStageProps>(
  ({ post, zoom, onUpdateElementPosition, onSelectElement, isReadOnly = false }, ref) => {
    const isInteractive = !isReadOnly && Boolean(onUpdateElementPosition);
    const stageRef = useRef<any>(null);
    const transformerRef = useRef<any>(null);

    const headlineRef = useRef<any>(null);
    const subtextRef = useRef<any>(null);
    const badgeRef = useRef<any>(null);
    const barRef = useRef<any>(null);
    const logoRef = useRef<any>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({});
    const [isAltPressed, setIsAltPressed] = useState(false);

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

    useEffect(() => {
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
    }, [selectedId]);

    useImperativeHandle(ref, () => ({
      exportPng4K: () => {
        if (!stageRef.current) return "";
        setSelectedId(null);
        return stageRef.current.toDataURL({
          pixelRatio: 4,
          mimeType: "image/png",
        });
      },
      exportZip4K: async (onProgress) => {
        const zip = new JSZip();
        if (!stageRef.current) return new Blob();

        setSelectedId(null);

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
    const headlineFontSize = isBrutalBlock || isStrokeImpact ? 32 : isCinematic ? 34 : isBrutalSplit ? 28 : isCyber ? 18 : isEditorial ? 23 : 21;
    const subtextFontSize = isBrutalBlock ? 11 : isCyber ? 11 : 12;

    const headlineLines = Math.ceil((activeHeadline.length * (headlineFontSize * 0.55)) / contentWidth);
    const headlineHeight = headlineLines * (headlineFontSize * 1.25);
    const subtextLines = Math.ceil((activeSubtext.length * 6.5) / contentWidth);
    const subtextHeight = subtextLines * 16;
    const totalStackHeight = headlineHeight + subtextHeight + 20;

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
      // Split: Título na metade escura de cima, Subtítulo na base de cor vibrante
      const splitY = baseHeight * 0.56;
      defaultHeadlineY = Math.max(45, (splitY - headlineHeight) / 2 + 10);
      defaultSubtextY = splitY + 24;
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
      const bottomMargin = post.aspectRatio === "9:16" ? 64 : 32;
      defaultHeadlineY = Math.max(80, baseHeight - bottomMargin - totalStackHeight);
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
    const logoPos = currentSlide?.logoPos || { x: baseWidth - 70, y: 20 };

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
            onMouseDown={(e) => {
              if (e.target === stageRef.current) {
                setSelectedId(null);
                if (onSelectElement) onSelectElement(null);
              }
            }}
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
                  <Rect x={0} y={0} width={baseWidth} height={baseHeight * 0.5} fill={post.palette.background || "#171717"} />
                  <Rect x={0} y={baseHeight * 0.5} width={baseWidth} height={baseHeight * 0.5} fill={post.palette.accent || "#21F1A8"} />
                  <Line points={[0, baseHeight * 0.5, baseWidth, baseHeight * 0.5]} stroke="#000000" strokeWidth={2} opacity={0.4} />
                </>
              ) : isDuotone ? (
                // 1.B) DUOTONE WASH: GRADIENTE LINEAR DIAGONAL RICO A 135°
                <>
                  <Rect
                    x={0}
                    y={0}
                    width={baseWidth}
                    height={baseHeight}
                    fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                    fillLinearGradientEndPoint={{ x: baseWidth, y: baseHeight }}
                    fillLinearGradientColorStops={[0, post.palette.background || "#2A0845", 1, post.palette.accent || "#FF3366"]}
                  />
                  <Circle x={baseWidth * 0.8} y={baseHeight * 0.2} radius={120} fill={post.palette.accent} opacity={0.25} />
                </>
              ) : isCinematic ? (
                // 1.C) CINEMATIC DEPTH: Fundo escuro com moldura cinematográfica
                <>
                  <Rect x={0} y={0} width={baseWidth} height={baseHeight} fill="#08080A" />
                  <Rect x={12} y={12} width={baseWidth - 24} height={baseHeight - 24} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                </>
              ) : (
                // 1.D) FUNDO SÓLIDO BASE
                <Rect x={0} y={0} width={baseWidth} height={baseHeight} fill={post.palette.background} />
              )}

              {/* IMAGEM DE FUNDO (SE HOUVER) */}
              {bgImgElement && (
                <KonvaImage
                  image={bgImgElement}
                  x={0}
                  y={0}
                  width={baseWidth}
                  height={baseHeight}
                  crop={bgCrop}
                  opacity={0.8}
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
                  opacity={post.overlayOpacity}
                />
              )}

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
                    text="★ DESTAQUE"
                    x={8}
                    y={7}
                    fontSize={10}
                    fontFamily="Anton"
                    fontStyle="bold"
                    fill={post.palette.accent}
                    letterSpacing={1}
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
                  onDragMove={handleDragMove}
                  onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                >
                  <Rect x={0} y={0} width={activeStep.length * 7 + 16} height={22} fill="#FFFFFF" stroke="#000000" strokeWidth={1.5} />
                  <Text text={activeStep.toUpperCase()} x={8} y={6} fontSize={8.5} fontFamily="monospace" fontStyle="bold" fill="#000000" letterSpacing={1} />
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
                  onDragMove={handleDragMove}
                  onDragEnd={(e) => handleDragEnd(e, "badgePos")}
                >
                  <Rect x={0} y={0} width={activeStep.length * 7 + 22} height={22} fill="rgba(0, 240, 255, 0.08)" stroke="#00F0FF" strokeWidth={1} cornerRadius={2} />
                  <Text text={`[ ${activeStep.toUpperCase()} ]`} x={8} y={6} fontSize={8.5} fontFamily="Space Mono" fontStyle="bold" fill="#00F0FF" letterSpacing={1} />
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

              {/* ─── 5. TÍTULO PRINCIPAL INDIVIDUAL ─── */}
              <Text
                ref={headlineRef}
                text={activeHeadline}
                x={headlinePos.x}
                y={headlinePos.y}
                width={contentWidth}
                fontSize={headlineFontSize}
                fontFamily={post.fontFamily}
                fontStyle="bold"
                fill={post.palette.text}
                align={defaultAlign}
                lineHeight={isBrutalBlock ? 1.1 : 1.25}
                letterSpacing={isBrutalBlock ? 0.5 : isEditorial ? -0.2 : -0.4}
                draggable={isInteractive}
                dragBoundFunc={isInteractive ? createSnapBoundFunc(contentWidth, headlineFontSize * 1.5) : undefined}
                onClick={() => handleSelect("headline")}
                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(e, "headlinePos")}
              />

              {/* ─── 6. SUBTÍTULO / CORPO INDIVIDUAL ─── */}
              <Text
                ref={subtextRef}
                text={activeSubtext}
                x={subtextPos.x}
                y={subtextPos.y}
                width={contentWidth}
                fontSize={subtextFontSize}
                fontFamily={isCyber ? "Space Mono, monospace" : "Inter, sans-serif"}
                fill={isBrutalSplit ? "#000000" : post.palette.text}
                opacity={isBrutalSplit ? 0.95 : 0.8}
                align={defaultAlign}
                lineHeight={1.45}
                draggable={isInteractive}
                dragBoundFunc={isInteractive ? createSnapBoundFunc(contentWidth, subtextFontSize * 1.8) : undefined}
                onClick={() => handleSelect("subtext")}
                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(e, "subtextPos")}
              />

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

              {/* ─── 8. TRANSFORMER PARA O ELEMENTO SELECIONADO ─── */}
              {isInteractive && (
                <Transformer
                  ref={transformerRef}
                rotateEnabled={true}
                borderStroke="#38bdf8"
                borderStrokeWidth={1.5}
                anchorStroke="#38bdf8"
                anchorFill="#ffffff"
                anchorSize={7}
                anchorCornerRadius={2}
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
      </div>
    );
  }
);
