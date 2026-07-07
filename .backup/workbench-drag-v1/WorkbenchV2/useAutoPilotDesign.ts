import { useState, type RefObject } from "react";
import html2canvas from "html2canvas-pro";
import { trpc } from "@/lib/trpc";
import { layoutToAdvanced } from "@/lib/layoutToAdvanced";
import { useEditorStore } from "@/store/editorStore";

export function useAutoPilotDesign(canvasRef?: RefObject<HTMLDivElement | null>) {
  const [isAutoPiloting, setIsAutoPiloting] = useState(false);
  const mutation = trpc.post.autoPilotDesign.useMutation();
  const bgValue = useEditorStore(state => state.bgValue);
  const canAutoPilot = bgValue.type !== "none";

  const runAutoPilot = async () => {
    const root = canvasRef?.current;
    const state = useEditorStore.getState();
    const variation = state.activeVariation;
    if (!root || !variation || isAutoPiloting || !canAutoPilot) return;
    setIsAutoPiloting(true);
    try {
      const canvas = await html2canvas(root, { useCORS: true, scale: 2, backgroundColor: null });
      const rootRect = root.getBoundingClientRect();
      const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-layout-id]")).map(element => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.dataset.layoutId!,
          x: ((rect.left + rect.width / 2 - rootRect.left) / rootRect.width) * 100,
          y: ((rect.top + rect.height / 2 - rootRect.top) / rootRect.height) * 100,
          width: (rect.width / rootRect.width) * 100,
          height: (rect.height / rootRect.height) * 100,
        };
      });
      const result = await mutation.mutateAsync({
        imageBase64: canvas.toDataURL("image/webp", 0.8),
        currentState: {
          variation,
          aspectRatio: state.aspectRatio,
          layoutSettings: state.layoutSettings,
          imageSettings: state.imageSettings,
          bgValue: state.bgValue,
          bgOverlay: state.bgOverlay,
          canvas: { width: rootRect.width, height: rootRect.height },
          elements,
        },
      });

      if (Array.isArray(result.suggestedElements)) {
        const layoutPatch: Record<string, unknown> = {};
        const sectionLayouts = { ...(state.layoutSettings.sectionLayouts ?? {}) };
        const textSuggestions = new Map<string, { suggestion: typeof result.suggestedElements[number]; measured?: typeof elements[number] }>();
        for (const suggestion of result.suggestedElements) {
          const x = Math.min(95, Math.max(5, Number(suggestion.x)));
          const y = Math.min(95, Math.max(5, Number(suggestion.y)));
          const width = Math.min(96, Math.max(12, Number(suggestion.width)));
          if (![x, y, width].every(Number.isFinite)) continue;
          const position = {
            freePosition: { x, y }, width, textAlign: suggestion.textAlign,
            ...(suggestion.backgroundColor ? { backgroundColor: suggestion.backgroundColor } : {}),
            ...(Number.isFinite(suggestion.borderRadius) ? { borderRadius: suggestion.borderRadius } : {}),
          };
          if (suggestion.id.startsWith("textElement:")) {
            textSuggestions.set(suggestion.id.slice(12), { suggestion, measured: elements.find(item => item.id === suggestion.id) });
          } else if (suggestion.id.startsWith("section:")) {
            const id = suggestion.id.slice(8);
            if (sectionLayouts[id]) sectionLayouts[id] = { ...sectionLayouts[id], ...position };
          } else if (suggestion.id in state.layoutSettings && suggestion.id !== "card") {
            layoutPatch[suggestion.id] = { ...((state.layoutSettings as unknown as Record<string, object>)[suggestion.id]), ...position };
          }
        }
        state.updateLayoutSettings({ ...layoutPatch, sectionLayouts });
        if (textSuggestions.size && variation.textElements?.length) {
          state.updateVariation({
            textElements: variation.textElements.map(element => {
              const entry = textSuggestions.get(element.id);
              if (!entry) return element;
              const width = Math.min(96, Math.max(12, Number(entry.suggestion.width)));
              const measuredHeight = Number(entry.measured?.height) || 8;
              return {
                ...element,
                x: Math.max(0, ((Number(entry.suggestion.x) - width / 2) / 100) * root.clientWidth),
                y: Math.max(0, ((Number(entry.suggestion.y) - measuredHeight / 2) / 100) * root.clientHeight),
                width: (width / 100) * root.clientWidth,
                styles: { ...element.styles, textAlign: entry.suggestion.textAlign },
              };
            }),
          });
        }
      }
      if (result.suggestedLayoutMoves) {
        const moves = result.suggestedLayoutMoves;
        state.updateLayoutSettings(
          moves.headline?.position && moves.headline.position === moves.body?.position
            ? layoutToAdvanced(variation.layout === "centered" ? "split" : "minimal")
            : moves,
        );
      }
      if (result.textColor) state.updateVariation({ textColor: result.textColor });
    } catch (error) {
      console.error("AI Adjustment failed:", error);
    } finally {
      setIsAutoPiloting(false);
    }
  };

  return { isAutoPiloting, canAutoPilot, runAutoPilot } as const;
}
