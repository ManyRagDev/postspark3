import type { LayoutPosition } from "@shared/postspark";
import {
  centerOfRect,
  elementGeometry,
  percentagePoint,
  type DocumentRect,
  type ElementGeometry,
  type ElementKind,
} from "../geometry";
import type { GeometryCommit } from "../interaction";

export const GRID_SNAP_COORDINATES = Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90]);

export const LAYOUT_GEOMETRY_TARGETS = Object.freeze([
  "headline",
  "body",
  "accentBar",
  "badge",
  "sticker",
  "carouselArrow",
  "card",
] as const);

export type FixedLayoutGeometryTarget = typeof LAYOUT_GEOMETRY_TARGETS[number];
export type LayoutGeometryTarget = FixedLayoutGeometryTarget | `section:${string}`;

export type EditorGeometryCommit = Readonly<{
  interaction: GeometryCommit;
  snapEnabled: boolean;
}>;

export function isLayoutGeometryTarget(value: string): value is LayoutGeometryTarget {
  if ((LAYOUT_GEOMETRY_TARGETS as readonly string[]).includes(value)) return true;
  return value.startsWith("section:") && value.slice("section:".length).trim().length > 0;
}

export function nearestGridCoordinate(value: number): number {
  return GRID_SNAP_COORDINATES.reduce((closest, coordinate) =>
    Math.abs(coordinate - value) < Math.abs(closest - value) ? coordinate : closest,
  );
}

export function readLayoutGeometry(
  target: LayoutGeometryTarget,
  kind: ElementKind,
  measuredRect: DocumentRect,
): ElementGeometry {
  return elementGeometry(target, kind, measuredRect);
}

function geometryCenterPercent(commit: GeometryCommit, snapEnabled: boolean) {
  const center = centerOfRect(commit.geometry.rect);
  const canvas = commit.viewport.documentSize;
  const raw = percentagePoint(
    (center.x / canvas.width) * 100,
    (center.y / canvas.height) * 100,
  );

  return {
    x: snapEnabled ? nearestGridCoordinate(raw.x) : raw.x,
    y: snapEnabled ? nearestGridCoordinate(raw.y) : raw.y,
  };
}

function roundedWidthPercent(commit: GeometryCommit): number {
  const width = (commit.geometry.rect.width / commit.viewport.documentSize.width) * 100;
  return Math.round(width * 10) / 10;
}

export function layoutPositionFromCommit(
  current: LayoutPosition,
  command: EditorGeometryCommit,
): LayoutPosition {
  const { interaction, snapEnabled } = command;

  if (interaction.operation === "drag") {
    return {
      ...current,
      freePosition: geometryCenterPercent(interaction, snapEnabled),
    };
  }

  const next: LayoutPosition = {
    ...current,
    width: roundedWidthPercent(interaction),
  };

  if (current.freePosition) {
    next.freePosition = geometryCenterPercent(interaction, false);
  }

  return next;
}

export function layoutPositionsEqual(left: LayoutPosition, right: LayoutPosition): boolean {
  return (
    left.position === right.position &&
    left.textAlign === right.textAlign &&
    left.width === right.width &&
    left.backgroundColor === right.backgroundColor &&
    left.borderRadius === right.borderRadius &&
    left.freePosition?.x === right.freePosition?.x &&
    left.freePosition?.y === right.freePosition?.y
  );
}
