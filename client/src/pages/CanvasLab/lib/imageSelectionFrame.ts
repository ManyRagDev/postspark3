export type ImagePoint = [number, number];
export type ImageSelectionFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type SelectionHandle = "move" | "nw" | "ne" | "sw" | "se";

export const fullImageFrame: ImageSelectionFrame = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};
export const selectionCorners = ["nw", "ne", "sw", "se"] as const;
const oppositeCorner = { nw: "se", ne: "sw", sw: "ne", se: "nw" } as const;

export function frameCorner(
  frame: ImageSelectionFrame,
  corner: Exclude<SelectionHandle, "move">
): ImagePoint {
  return [
    frame.x + (corner.endsWith("e") ? frame.width : 0),
    frame.y + (corner.startsWith("s") ? frame.height : 0),
  ];
}

function frameFromPoints(
  start: ImagePoint,
  end: ImagePoint
): ImageSelectionFrame {
  return {
    x: Math.min(start[0], end[0]),
    y: Math.min(start[1], end[1]),
    width: Math.abs(end[0] - start[0]),
    height: Math.abs(end[1] - start[1]),
  };
}

export function pointBounds(points: ImagePoint[]): ImageSelectionFrame | null {
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return frameFromPoints(
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)]
  );
}

export function fitSelectionRatio(
  frame: ImageSelectionFrame,
  ratio: number
): ImageSelectionFrame {
  const width = Math.min(frame.width, frame.height * ratio);
  const height = width / ratio;
  return {
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2,
    width,
    height,
  };
}

export function isFullImageFrame({ x, y, width, height }: ImageSelectionFrame) {
  return x === 0 && y === 0 && width === 1 && height === 1;
}

const within = (value: number, max: number) =>
  Math.max(0, Math.min(max, value));

export function changeSelectionFrame(
  frame: ImageSelectionFrame,
  handle: SelectionHandle | "draw",
  start: ImagePoint,
  end: ImagePoint,
  ratio?: number
): ImageSelectionFrame {
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  if (handle === "move")
    return {
      ...frame,
      x: within(frame.x + dx, 1 - frame.width),
      y: within(frame.y + dy, 1 - frame.height),
    };
  const anchor =
    handle === "draw" ? start : frameCorner(frame, oppositeCorner[handle]);
  const initial = handle === "draw" ? start : frameCorner(frame, handle);
  const x = within(initial[0] + dx, 1),
    y = within(initial[1] + dy, 1);
  if (!ratio) return frameFromPoints(anchor, [x, y]);
  const directionX =
    Math.sign(x - anchor[0]) || Math.sign(initial[0] - anchor[0]) || 1;
  const directionY =
    Math.sign(y - anchor[1]) || Math.sign(initial[1] - anchor[1]) || 1;
  const w = Math.min(
    Math.max(Math.abs(x - anchor[0]), Math.abs(y - anchor[1]) * ratio),
    directionX > 0 ? 1 - anchor[0] : anchor[0],
    (directionY > 0 ? 1 - anchor[1] : anchor[1]) * ratio
  );
  return frameFromPoints(anchor, [
    anchor[0] + directionX * w,
    anchor[1] + (directionY * w) / ratio,
  ]);
}
