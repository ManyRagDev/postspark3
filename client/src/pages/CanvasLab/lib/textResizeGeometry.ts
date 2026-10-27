export type TextResizeAnchor =
  | "middle-left"
  | "middle-right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface TextResizeSession {
  anchor: TextResizeAnchor;
  pointerStartX: number;
  pointerStartY?: number;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight?: number;
  initialScale?: number;
  initialFontSize?: number;
  minWidth: number;
}

export interface TextResizeGeometry {
  x: number;
  y: number;
  width: number;
  height?: number;
  scale?: number;
  fontSize?: number;
}

/**
 * Calcula cada frame sempre a partir do snapshot do transformstart.
 * Nenhum resultado anterior volta a alimentar o próximo frame.
 * Laterais: reflow de largura com fonte constante e borda oposta estável.
 * Quatro cantos: fator uniforme aplicado à largura, altura e escala/fonte,
 * mantendo o canto oposto fixo e escalas do nó Konva em 1.
 */
export function computeTextResizeGeometry(
  session: TextResizeSession,
  pointerX: number,
  pointerY?: number
): TextResizeGeometry {
  const deltaX = pointerX - session.pointerStartX;
  const isLateral = session.anchor === "middle-left" || session.anchor === "middle-right";

  if (isLateral) {
    if (session.anchor === "middle-right") {
      return {
        x: session.initialX,
        y: session.initialY,
        width: Math.max(session.minWidth, session.initialWidth + deltaX),
        ...(session.initialHeight !== undefined ? { height: session.initialHeight } : {}),
        ...(session.initialScale !== undefined ? { scale: session.initialScale } : {}),
        ...(session.initialFontSize !== undefined ? { fontSize: session.initialFontSize } : {}),
      };
    }

    const width = Math.max(session.minWidth, session.initialWidth - deltaX);
    return {
      x: session.initialX + session.initialWidth - width,
      y: session.initialY,
      width,
      ...(session.initialHeight !== undefined ? { height: session.initialHeight } : {}),
      ...(session.initialScale !== undefined ? { scale: session.initialScale } : {}),
      ...(session.initialFontSize !== undefined ? { fontSize: session.initialFontSize } : {}),
    };
  }

  // Corner resize: uniform scaling of width, height, and scale/fontSize
  const initialW = session.initialWidth;
  const initialH = session.initialHeight ?? initialW;

  let factor: number;
  if (session.pointerStartY !== undefined && pointerY !== undefined && session.initialHeight) {
    // 2D projection onto diagonal
    const deltaY = pointerY - session.pointerStartY;
    let effDx = deltaX;
    let effDy = deltaY;

    if (session.anchor === "top-left") {
      effDx = -deltaX;
      effDy = -deltaY;
    } else if (session.anchor === "top-right") {
      effDx = deltaX;
      effDy = -deltaY;
    } else if (session.anchor === "bottom-left") {
      effDx = -deltaX;
      effDy = deltaY;
    } else {
      // bottom-right
      effDx = deltaX;
      effDy = deltaY;
    }

    const denom = initialW * initialW + initialH * initialH;
    const proj = (effDx * initialW + effDy * initialH) / denom;
    factor = 1 + proj;
  } else {
    // 1D fallback based on pointerX
    let effDx = deltaX;
    if (session.anchor === "top-left" || session.anchor === "bottom-left") {
      effDx = -deltaX;
    }
    factor = (initialW + effDx) / initialW;
  }

  const minFactor = session.minWidth / initialW;
  const clampedFactor = Math.max(minFactor, factor);

  const newW = initialW * clampedFactor;
  const newH = initialH * clampedFactor;

  let x = session.initialX;
  let y = session.initialY;

  if (session.anchor === "bottom-right") {
    // Fixed: top-left (initialX, initialY)
    x = session.initialX;
    y = session.initialY;
  } else if (session.anchor === "bottom-left") {
    // Fixed: top-right (initialX + initialW, initialY)
    x = session.initialX + initialW - newW;
    y = session.initialY;
  } else if (session.anchor === "top-right") {
    // Fixed: bottom-left (initialX, initialY + initialH)
    x = session.initialX;
    y = session.initialY + initialH - newH;
  } else if (session.anchor === "top-left") {
    // Fixed: bottom-right (initialX + initialW, initialY + initialH)
    x = session.initialX + initialW - newW;
    y = session.initialY + initialH - newH;
  }

  return {
    x,
    y,
    width: newW,
    ...(session.initialHeight !== undefined ? { height: newH } : {}),
    ...(session.initialScale !== undefined ? { scale: session.initialScale * clampedFactor } : { scale: clampedFactor }),
    ...(session.initialFontSize !== undefined ? { fontSize: session.initialFontSize * clampedFactor } : {}),
  };
}

export function finalizeTextResizeGeometry(
  geometry: TextResizeGeometry
): TextResizeGeometry {
  return {
    x: Math.round(geometry.x),
    y: Math.round(geometry.y),
    width: Math.round(geometry.width),
    ...(geometry.height !== undefined ? { height: Math.round(geometry.height) } : {}),
    ...(geometry.scale !== undefined ? { scale: Number(geometry.scale.toFixed(4)) } : {}),
    ...(geometry.fontSize !== undefined ? { fontSize: Math.round(geometry.fontSize) } : {}),
  };
}
