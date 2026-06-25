import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type RefObject,
} from "react";
import type { InteractiveGeometryTarget } from "../adapters";
import {
  createCanvasViewport,
  documentSize,
  screenPoint,
  screenRect,
  screenToDocumentRect,
  type CanvasViewport,
  type ElementGeometry,
} from "../geometry";
import {
  createInteractionController,
  type InteractionController,
  type InteractionIntent,
  type InteractionConstraints,
  type InteractionModifiers,
  type InteractionState,
} from "../interaction";
import { useEditorStore } from "@/store/editorStore";
import { buildCanvasCandidate, type SnapCandidate } from "../snap/snapEngine";
import { ElementRegistry, type RegisteredInteractiveElement } from "./ElementRegistry";
import type { PointerEvent as ReactPointerEvent } from "react";

export type InteractiveElementRegistration = RegisteredInteractiveElement;

type PointerLike = Readonly<{
  pointerId: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}>;

type BeginCanvasInteraction = Readonly<{
  event: PointerLike;
  intent: InteractionIntent;
  captureElement: HTMLElement;
  snapEnabled: boolean;
  viewport: CanvasViewport;
  initialGeometry: ElementGeometry;
  constraints: InteractionConstraints;
  candidates?: readonly SnapCandidate[];
}>;

export type ElementInteractionSnapshot = Readonly<{
  phase: "idle" | "pressing" | "dragging" | "resizing";
  draft: ElementGeometry | null;
  viewport: CanvasViewport | null;
  initial: ElementGeometry | null;
}>;

const IDLE_ELEMENT_INTERACTION: ElementInteractionSnapshot = Object.freeze({
  phase: "idle",
  draft: null,
  viewport: null,
  initial: null,
});

interface CanvasInteractionContextValue {
  controller: InteractionController;
  beginTarget(
    target: InteractiveGeometryTarget,
    intent: InteractionIntent,
    event: ReactPointerEvent<HTMLElement>,
  ): boolean;
  preview(event: PointerLike): boolean;
  commit(event: PointerLike): void;
  cancel(pointerId?: number): void;
  cancelTarget(target: InteractiveGeometryTarget, pointerId?: number): void;
  unmountTarget(target: InteractiveGeometryTarget): void;
  registry: ElementRegistry;
  register(entry: InteractiveElementRegistration): () => void;
  getCanvas(): HTMLElement | null;
  isSnapEnabled(): boolean;
}

const CanvasInteractionContext = createContext<CanvasInteractionContextValue | null>(null);

function modifiersFromPointer(event: PointerLike): InteractionModifiers {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
    control: event.ctrlKey,
  };
}

function pointFromPointer(event: PointerLike) {
  return screenPoint(event.clientX, event.clientY);
}

function selectElementState(
  state: InteractionState,
  elementId: string,
): ElementInteractionSnapshot {
  if (
    (state.phase === "pressing" || state.phase === "dragging" || state.phase === "resizing") &&
    state.initial.id === elementId
  ) {
    return Object.freeze({
      phase: state.phase,
      draft: state.phase === "pressing" ? null : state.draft,
      viewport: state.viewport,
      initial: state.initial,
    });
  }
  return IDLE_ELEMENT_INTERACTION;
}

function sameElementSnapshot(
  left: ElementInteractionSnapshot,
  right: ElementInteractionSnapshot,
): boolean {
  return left.phase === right.phase && left.draft === right.draft && left.viewport === right.viewport;
}

export function CanvasInteractionProvider({
  children,
  canvasRef,
}: PropsWithChildren<{ canvasRef: RefObject<HTMLElement | null> }>) {
  const currentSlideIndex = useEditorStore(state => state.currentSlideIndex);
  const aspectRatio = useEditorStore(state => state.aspectRatio);
  const activeMetaRef = useRef<{ snapEnabled: boolean } | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const controllerRef = useRef<InteractionController | null>(null);
  const registryRef = useRef<ElementRegistry | null>(null);
  if (!registryRef.current) registryRef.current = new ElementRegistry();
  const registry = registryRef.current;

  if (!controllerRef.current) {
    controllerRef.current = createInteractionController({
      scheduler: {
        request: callback => requestAnimationFrame(callback),
        cancel: handle => cancelAnimationFrame(handle),
      },
      commitPort: {
        commit: interaction => {
          useEditorStore.getState().commitGeometry({
            interaction,
            snapEnabled: activeMetaRef.current?.snapEnabled ?? false,
          });

        },
      },
      errorPort: {
        report: (error, context) => {
          if (import.meta.env.DEV) console.warn("[WorkbenchInteraction] controller error", context, error);
        },
      },
    });
  }

  const controller = controllerRef.current;

  const stopObserving = useCallback(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
  }, []);

  const cancel = useCallback((pointerId?: number) => {
    controller.cancelInteraction("pointer-cancel", pointerId);
    activeMetaRef.current = null;
    stopObserving();
  }, [controller, stopObserving]);

  const cancelTarget = useCallback((target: InteractiveGeometryTarget, pointerId?: number) => {
    const state = controller.getState();
    if (
      (state.phase === "pressing" || state.phase === "dragging" || state.phase === "resizing") &&
      state.initial.id === target
    ) cancel(pointerId);
  }, [cancel, controller]);

  const unmountTarget = useCallback((target: InteractiveGeometryTarget) => {
    const state = controller.getState();
    if (
      (state.phase === "pressing" || state.phase === "dragging" || state.phase === "resizing") &&
      state.initial.id === target
    ) {
      controller.cancelInteraction("element-unmounted");
      activeMetaRef.current = null;
      stopObserving();
    }
  }, [controller, stopObserving]);

  const begin = useCallback((input: BeginCanvasInteraction): boolean => {
    try {
      const canvasElement = canvasRef.current;
      if (!canvasElement) return false;
      if (canvasElement.clientWidth <= 0 || canvasElement.clientHeight <= 0) return false;

      const accepted = controller.beginInteraction({
        pointerId: input.event.pointerId,
        point: pointFromPointer(input.event),
        viewport: input.viewport,
        element: input.initialGeometry,
        intent: input.intent,
        modifiers: modifiersFromPointer(input.event),
        constraints: input.constraints,
        candidates: input.candidates,
        capture: {
          capture: pointerId => input.captureElement.setPointerCapture(pointerId),
          release: pointerId => input.captureElement.releasePointerCapture(pointerId),
        },
      });

      if (!accepted) return false;
      activeMetaRef.current = { snapEnabled: input.snapEnabled };

      if (typeof ResizeObserver !== "undefined") {
        const initialWidth = canvasElement.clientWidth;
        const initialHeight = canvasElement.clientHeight;
        stopObserving();
        resizeObserverRef.current = new ResizeObserver(() => {
          if (
            canvasElement.clientWidth !== initialWidth ||
            canvasElement.clientHeight !== initialHeight
          ) {
            controller.cancelInteraction("viewport-invalidated");
            activeMetaRef.current = null;
            stopObserving();
          }
        });
        resizeObserverRef.current.observe(canvasElement);
      }

      return true;
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[WorkbenchInteraction] measurement failed", error);
      return false;
    }
  }, [canvasRef, controller, stopObserving]);

  const beginTarget = useCallback((
    target: InteractiveGeometryTarget,
    intent: InteractionIntent,
    event: ReactPointerEvent<HTMLElement>,
  ): boolean => {
    const descriptor = registry.get(target);
    const canvas = canvasRef.current;
    const node = descriptor?.nodeRef.current;
    if (!descriptor || !canvas || !node) return false;
    try {
      const rootRect = canvas.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return false;
      const viewport = createCanvasViewport(
        screenRect(rootRect.left, rootRect.top, rootRect.width, rootRect.height),
        documentSize(canvas.clientWidth, canvas.clientHeight),
      );
      const measuredDocumentRect = screenToDocumentRect(
        screenRect(nodeRect.left, nodeRect.top, nodeRect.width, nodeRect.height),
        viewport,
      );
      const measurement = {
        viewport,
        canvas,
        node,
        nodeScreenRect: nodeRect,
        positioningContainer: descriptor.getPositioningContainer(node),
        measuredDocumentRect,
        measuredDocumentSize: documentSize(
          Math.max(measuredDocumentRect.width, Number.EPSILON),
          Math.max(measuredDocumentRect.height, Number.EPSILON),
        ),
      };
      descriptor.onSelect?.();
      event.preventDefault();
      event.stopPropagation();

      const candidates: SnapCandidate[] = [buildCanvasCandidate("canvas", canvas.clientWidth, canvas.clientHeight)];
      for (const entry of registry.values()) {
        if (entry.id === target || !entry.snapEligible) continue;
        const cNode = entry.nodeRef.current;
        if (!cNode) continue;
        try {
          const cRect = cNode.getBoundingClientRect();
          const cDoc = screenToDocumentRect(
            screenRect(cRect.left, cRect.top, cRect.width, cRect.height),
            viewport,
          );
          candidates.push({ id: entry.id, rect: cDoc });
        } catch { /* skip unmeasurable */ }
      }

      return begin({
        event,
        intent,
        captureElement: event.currentTarget,
        snapEnabled: intent.type === "drag" && descriptor.snapEligible,
        viewport,
        initialGeometry: descriptor.resolveInitialGeometry(measurement),
        constraints: descriptor.resolveConstraints(measurement, intent),
        candidates,
      });
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[WorkbenchInteraction] descriptor measurement failed", error);
      return false;
    }
  }, [begin, canvasRef, registry]);

  const preview = useCallback((event: PointerLike) => controller.previewInteraction({
    pointerId: event.pointerId,
    point: pointFromPointer(event),
    modifiers: modifiersFromPointer(event),
  }), [controller]);

  const commit = useCallback((event: PointerLike) => {
    controller.commitInteraction({
      pointerId: event.pointerId,
      point: pointFromPointer(event),
      modifiers: modifiersFromPointer(event),
    });
    activeMetaRef.current = null;
    stopObserving();
  }, [controller, stopObserving]);

  useEffect(() => {
    controller.cancelInteraction("viewport-invalidated");
    activeMetaRef.current = null;
    stopObserving();
  }, [aspectRatio, controller, currentSlideIndex, stopObserving]);

  useEffect(() => {
    const handleResize = () => {
      controller.cancelInteraction("viewport-invalidated");
      activeMetaRef.current = null;
      stopObserving();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      controller.cancelInteraction("escape");
      activeMetaRef.current = null;
      stopObserving();
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyDown);
      stopObserving();
      registry.clear();
      controller.dispose();
    };
  }, [controller, registry, stopObserving]);

  const context = useMemo<CanvasInteractionContextValue>(() => ({
    controller,
    beginTarget,
    preview,
    commit,
    cancel,
    cancelTarget,
    unmountTarget,
    registry,
    register: entry => registry.register(entry),
    getCanvas: () => canvasRef.current,
    isSnapEnabled: () => activeMetaRef.current?.snapEnabled ?? false,
  }), [beginTarget, cancel, cancelTarget, commit, controller, preview, registry, unmountTarget]);

  return (
    <CanvasInteractionContext.Provider value={context}>
      {children}
    </CanvasInteractionContext.Provider>
  );
}

export function useCanvasInteraction() {
  return useContext(CanvasInteractionContext);
}

export function useElementInteraction(elementId: string): ElementInteractionSnapshot {
  const context = useCanvasInteraction();
  const [snapshot, setSnapshot] = useState<ElementInteractionSnapshot>(() =>
    context ? selectElementState(context.controller.getState(), elementId) : IDLE_ELEMENT_INTERACTION,
  );

  useEffect(() => {
    if (!context) {
      setSnapshot(IDLE_ELEMENT_INTERACTION);
      return;
    }

    const update = (state: InteractionState) => {
      const next = selectElementState(state, elementId);
      setSnapshot(current => sameElementSnapshot(current, next) ? current : next);
    };
    update(context.controller.getState());
    return context.controller.subscribe(update);
  }, [context, elementId]);

  return snapshot;
}
