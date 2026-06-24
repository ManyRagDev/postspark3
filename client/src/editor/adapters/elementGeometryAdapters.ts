import type { ImageElement, TextElement } from "@shared/postspark";
import {
  documentRect,
  elementGeometry,
  type DocumentSize,
  type ElementGeometry,
} from "../geometry";
import type { GeometryCommit } from "../interaction";
import type { LayoutGeometryTarget } from "./layoutPositionAdapter";

export type TextGeometryTarget = `textElement:${string}`;
export type ImageGeometryTarget = `imageElement:${string}`;
export type InteractiveGeometryTarget = LayoutGeometryTarget | TextGeometryTarget | ImageGeometryTarget;

export interface GeometryAdapter<Model> {
  read(model: Model, measuredSize: DocumentSize): ElementGeometry;
  apply(model: Model, commit: GeometryCommit): Model;
  equals(left: Model, right: Model): boolean;
}

export function isTextGeometryTarget(value: string): value is TextGeometryTarget {
  return value.startsWith("textElement:") && value.slice("textElement:".length).trim().length > 0;
}

export function isImageGeometryTarget(value: string): value is ImageGeometryTarget {
  return value.startsWith("imageElement:") && value.slice("imageElement:".length).trim().length > 0;
}

export function readTextGeometry(element: TextElement, measuredSize: DocumentSize): ElementGeometry {
  return elementGeometry(
    `textElement:${element.id}`,
    "text",
    documentRect(
      element.x,
      element.y,
      element.width === "auto" ? measuredSize.width : element.width,
      element.height === "auto" ? measuredSize.height : element.height,
    ),
    element.rotation,
  );
}

export function textElementFromCommit(current: TextElement, commit: GeometryCommit): TextElement {
  return {
    ...current,
    x: commit.geometry.rect.x,
    y: commit.geometry.rect.y,
    width: commit.operation === "resize" ? commit.geometry.rect.width : current.width,
    height: commit.operation === "resize" ? "auto" : current.height,
  };
}

export function readImageGeometry(element: ImageElement, measuredSize: DocumentSize): ElementGeometry {
  return elementGeometry(
    `imageElement:${element.id}`,
    "image",
    documentRect(
      element.x,
      element.y,
      element.width,
      element.height === "auto" ? measuredSize.height : element.height,
    ),
    element.rotation,
  );
}

export function imageElementFromCommit(current: ImageElement, commit: GeometryCommit): ImageElement {
  return {
    ...current,
    x: commit.geometry.rect.x,
    y: commit.geometry.rect.y,
    width: commit.operation === "resize" ? commit.geometry.rect.width : current.width,
    height: commit.operation === "resize" && current.height !== "auto"
      ? commit.geometry.rect.height
      : current.height,
  };
}

export function textElementsEqual(left: TextElement, right: TextElement): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function imageElementsEqual(left: ImageElement, right: ImageElement): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export const textGeometryAdapter: GeometryAdapter<TextElement> = Object.freeze({
  read: readTextGeometry,
  apply: textElementFromCommit,
  equals: textElementsEqual,
});

export const imageGeometryAdapter: GeometryAdapter<ImageElement> = Object.freeze({
  read: readImageGeometry,
  apply: imageElementFromCommit,
  equals: imageElementsEqual,
});
