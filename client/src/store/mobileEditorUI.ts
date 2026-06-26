/**
 * mobileEditorUI — estado de chrome do editor mobile.
 *
 * Mantido separado do editorStore (que carrega o documento) porque o App.tsx
 * e o CanvasWorkspace precisam ler estes flags sem importar todo o peso do editor.
 */
import { create } from "zustand";

interface MobileEditorUIState {
  /** Editor mobile em tela cheia ativo — esconde chrome global flutuante. */
  immersive: boolean;
  setImmersive: (value: boolean) => void;
  /** Altura atual do bottom sheet de edição (px). 0 quando fechado. */
  sheetHeightPx: number;
  setSheetHeightPx: (value: number) => void;
  /** Nonce que cresce sempre que algo pede pra minimizar o sheet (ex.: toque no canvas). */
  collapseNonce: number;
  requestCollapse: () => void;
}

export const useMobileEditorUI = create<MobileEditorUIState>((set) => ({
  immersive: false,
  setImmersive: (immersive) => set({ immersive }),
  sheetHeightPx: 0,
  setSheetHeightPx: (sheetHeightPx) => set({ sheetHeightPx }),
  collapseNonce: 0,
  requestCollapse: () => set((s) => ({ collapseNonce: s.collapseNonce + 1 })),
}));
