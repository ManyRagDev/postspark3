import { useCallback, useLayoutEffect, useRef, type PointerEvent } from "react";
import { useCanvasInteraction, useElementInteraction } from "./CanvasInteractionProvider";
import type { InteractiveElementDescriptor } from "./ElementRegistry";

export function useInteractiveElement(descriptor: InteractiveElementDescriptor) {
  const interaction = useCanvasInteraction();
  const descriptorRef = useRef(descriptor);
  descriptorRef.current = descriptor;

  useLayoutEffect(() => {
    if (!interaction) return;
    const cleanup = interaction.register(descriptorRef.current);
    return () => {
      // Cleanup first, then unmount to avoid canceling active interactions
      cleanup();
      interaction.unmountTarget(descriptor.id);
    };
  }, [descriptor.id, interaction]);

  useLayoutEffect(() => {
    interaction?.registry.update(descriptor);
  }, [descriptor, interaction]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).dataset.handle) return;
    interaction?.beginTarget(descriptor.id, { type: "drag" }, event);
  }, [descriptor.id, interaction]);

  return {
    bind: {
      onPointerDown,
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (interaction?.preview(event)) event.preventDefault();
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => interaction?.commit(event),
      onPointerCancel: (event: PointerEvent<HTMLElement>) => interaction?.cancel(event.pointerId),
      onLostPointerCapture: (event: PointerEvent<HTMLElement>) => interaction?.cancel(event.pointerId),
    } as const,
    ...useElementInteraction(descriptor.id),
  };
}
