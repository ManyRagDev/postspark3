import type { RefObject } from "react";
import type { InteractiveGeometryTarget } from "../adapters";
import type {
  CanvasViewport,
  DocumentRect,
  DocumentSize,
  ElementGeometry,
  ElementKind,
} from "../geometry";
import type { InteractionConstraints, InteractionIntent } from "../interaction";

export type HandlePolicy = "flow-right" | "horizontal" | "corners" | "none";

export interface GeometryMeasurementContext {
  viewport: CanvasViewport;
  canvas: HTMLElement;
  node: HTMLElement;
  nodeScreenRect: DOMRect;
  positioningContainer: HTMLElement;
  measuredDocumentRect: DocumentRect;
  measuredDocumentSize: DocumentSize;
}

export interface InteractiveElementDescriptor {
  id: InteractiveGeometryTarget;
  kind: ElementKind;
  nodeRef: RefObject<HTMLElement | null>;
  getPositioningContainer(node: HTMLElement): HTMLElement;
  resolveInitialGeometry(context: GeometryMeasurementContext): ElementGeometry;
  resolveConstraints(
    context: GeometryMeasurementContext,
    intent: InteractionIntent,
  ): InteractionConstraints;
  handlePolicy: HandlePolicy;
  snapEligible: boolean;
  accentColor: string;
  onSelect?(): void;
  onDelete?(): void;
}

export type RegisteredInteractiveElement = InteractiveElementDescriptor;

export class ElementRegistry {
  private readonly entries = new Map<string, InteractiveElementDescriptor>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  register(entry: InteractiveElementDescriptor): () => void {
    this.entries.set(entry.id, entry);
    this.emit();
    return () => {
      if (this.entries.get(entry.id) !== entry) return;
      this.entries.delete(entry.id);
      this.emit();
    };
  }

  update(entry: InteractiveElementDescriptor): void {
    if (!this.entries.has(entry.id) || this.entries.get(entry.id) === entry) return;
    this.entries.set(entry.id, entry);
    this.emit();
  }

  get(id: string): InteractiveElementDescriptor | undefined {
    return this.entries.get(id);
  }

  values(): readonly InteractiveElementDescriptor[] {
    return Array.from(this.entries.values());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getVersion = (): number => this.revision;

  clear(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this.emit();
  }

  private emit(): void {
    this.revision += 1;
    this.listeners.forEach(listener => listener());
  }
}
