import { useCallback, useEffect } from "react";
import { useEditorStore } from "@/store/editorStore";

export function useEditorHistory() {
  const undo = useEditorStore(s => s.undo);
  const redo = useEditorStore(s => s.redo);
  const canUndo = useEditorStore(
    s => s.historyStack.past.length > 0
  );
  const canRedo = useEditorStore(
    s => s.historyStack.future.length > 0
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;

      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      if (event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (event.key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (event.key === "y") {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return { canUndo, canRedo, undo, redo };
}
