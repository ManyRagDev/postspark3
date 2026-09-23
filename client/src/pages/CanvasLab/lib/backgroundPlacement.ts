import type {
  BackgroundPlacement,
  FitMode,
  SplitBgPosition,
  BgImageTransform,
} from "../components/types";

export interface ComputedBackgroundLayout {
  /** Posição X de renderização no canvas/stage */
  x: number;
  /** Posição Y de renderização no canvas/stage */
  y: number;
  /** Largura renderizada no canvas */
  width: number;
  /** Altura renderizada no canvas */
  height: number;
  /** Coordenadas de crop interno na imagem original (se aplicável) */
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Fatores adicionais de escala e rotação aplicados */
  scaleX: number;
  scaleY: number;
  rotation: number;
}

/**
 * Cria um objeto BackgroundPlacement padrão com defaults seguros.
 */
export function createDefaultPlacement(mode: FitMode = "cover"): BackgroundPlacement {
  return {
    fitMode: mode,
    focalPoint: { x: 0.5, y: 0.5 },
  };
}

/**
 * Calcula o crop proporcional para preenchimento total (cover),
 * ancorando no ponto focal desejado.
 */
export function computeCoverCrop(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
  focalPoint: { x: number; y: number } = { x: 0.5, y: 0.5 }
): { x: number; y: number; width: number; height: number } {
  if (!imageWidth || !imageHeight || !targetWidth || !targetHeight) {
    return { x: 0, y: 0, width: imageWidth || 1, height: imageHeight || 1 };
  }

  const imageRatio = imageWidth / imageHeight;
  const targetRatio = targetWidth / targetHeight;

  let cropWidth = imageWidth;
  let cropHeight = imageHeight;
  let cropX = 0;
  let cropY = 0;

  if (imageRatio > targetRatio) {
    // Imagem mais larga que o container: corta as laterais
    cropWidth = imageHeight * targetRatio;
    cropHeight = imageHeight;
    const maxExcessX = imageWidth - cropWidth;
    cropX = maxExcessX * Math.max(0, Math.min(1, focalPoint.x));
    cropY = 0;
  } else {
    // Imagem mais alta que o container: corta topo/base
    cropWidth = imageWidth;
    cropHeight = imageWidth / targetRatio;
    cropX = 0;
    const maxExcessY = imageHeight - cropHeight;
    cropY = maxExcessY * Math.max(0, Math.min(1, focalPoint.y));
  }

  return {
    x: Math.round(cropX),
    y: Math.round(cropY),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  };
}

/**
 * Ponto de entrada canônico para calcular a geometria de fundo determinística.
 * Preserva o asset original (URL/Storage) e nunca o corrompe.
 */
export function computeBackgroundGeometry(params: {
  imageWidth: number;
  imageHeight: number;
  baseWidth: number;
  baseHeight: number;
  placement?: BackgroundPlacement;
  transformOverride?: BgImageTransform;
  splitBgPos?: SplitBgPosition;
  isBrutalSplit?: boolean;
}): ComputedBackgroundLayout {
  const {
    imageWidth,
    imageHeight,
    baseWidth,
    baseHeight,
    placement,
    transformOverride,
    splitBgPos = "bottom",
    isBrutalSplit = false,
  } = params;

  const isSplitHalf = isBrutalSplit && splitBgPos !== "full";
  const targetBgWidth = baseWidth;
  const targetBgHeight = isSplitHalf ? baseHeight * 0.5 : baseHeight;
  const targetBgY = isSplitHalf && splitBgPos === "bottom" ? baseHeight * 0.5 : 0;

  const fitMode: FitMode = placement?.fitMode ?? "cover";
  const focalPoint = placement?.focalPoint ?? { x: 0.5, y: 0.5 };

  let x = 0;
  let y = targetBgY;
  let width = targetBgWidth;
  let height = targetBgHeight;
  let crop: { x: number; y: number; width: number; height: number } | undefined;

  switch (fitMode) {
    case "cover": {
      crop = computeCoverCrop(imageWidth, imageHeight, targetBgWidth, targetBgHeight, focalPoint);
      width = targetBgWidth;
      height = targetBgHeight;
      x = 0;
      y = targetBgY;
      break;
    }

    case "contain": {
      // Exibe a imagem inteira sem cortes, mantendo proporção original
      crop = { x: 0, y: 0, width: imageWidth, height: imageHeight };
      const scale = Math.min(targetBgWidth / imageWidth, targetBgHeight / imageHeight);
      width = Math.round(imageWidth * scale);
      height = Math.round(imageHeight * scale);
      x = Math.round((targetBgWidth - width) / 2);
      y = Math.round(targetBgY + (targetBgHeight - height) / 2);
      break;
    }

    case "original": {
      // Exibe no tamanho original 1:1, centralizada no quadro
      crop = { x: 0, y: 0, width: imageWidth, height: imageHeight };
      width = imageWidth;
      height = imageHeight;
      x = Math.round((targetBgWidth - width) / 2);
      y = Math.round(targetBgY + (targetBgHeight - height) / 2);
      break;
    }

    case "custom": {
      if (placement?.crop) {
        crop = placement.crop;
      } else {
        crop = computeCoverCrop(imageWidth, imageHeight, targetBgWidth, targetBgHeight, focalPoint);
      }
      width = targetBgWidth;
      height = targetBgHeight;
      x = 0;
      y = targetBgY;
      break;
    }
  }

  // Aplica transformações manuais do usuário (arrasto, zoom, rotação)
  const activeTransform = transformOverride ?? placement?.transform;
  const finalX = activeTransform?.x !== undefined ? activeTransform.x : x;
  const finalY = activeTransform?.y !== undefined ? activeTransform.y : y;
  const finalScaleX = activeTransform?.scaleX ?? 1;
  const finalScaleY = activeTransform?.scaleY ?? 1;
  const finalRotation = activeTransform?.rotation ?? 0;

  return {
    x: finalX,
    y: finalY,
    width,
    height,
    crop,
    scaleX: finalScaleX,
    scaleY: finalScaleY,
    rotation: finalRotation,
  };
}
