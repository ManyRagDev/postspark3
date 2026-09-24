export type TextResizeAnchor = "middle-left" | "middle-right";

export interface TextResizeSession {
  anchor: TextResizeAnchor;
  pointerStartX: number;
  initialX: number;
  initialY: number;
  initialWidth: number;
  minWidth: number;
}

export interface TextResizeGeometry {
  x: number;
  y: number;
  width: number;
}

/**
 * Calcula cada frame sempre a partir do snapshot do transformstart.
 * Nenhum resultado anterior volta a alimentar o próximo frame.
 */
export function computeTextResizeGeometry(
  session: TextResizeSession,
  pointerX: number
): TextResizeGeometry {
  const deltaX = pointerX - session.pointerStartX;

  if (session.anchor === "middle-right") {
    return {
      x: session.initialX,
      y: session.initialY,
      width: Math.max(session.minWidth, session.initialWidth + deltaX),
    };
  }

  const width = Math.max(session.minWidth, session.initialWidth - deltaX);
  return {
    x: session.initialX + session.initialWidth - width,
    y: session.initialY,
    width,
  };
}

export function finalizeTextResizeGeometry(
  geometry: TextResizeGeometry
): TextResizeGeometry {
  return {
    x: Math.round(geometry.x),
    y: Math.round(geometry.y),
    width: Math.round(geometry.width),
  };
}
