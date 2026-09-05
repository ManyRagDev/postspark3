/**
 * studioTipsStore — preferências do sistema de dicas do PostSpark Studio
 * (item 9 do usuário).
 *
 *  - `showTips`: checkbox global "Mostrar dicas" (persistido em localStorage
 *    via zustand/persist; default ativado na primeira visita);
 *  - `dismissed`: dicas individuais fechadas pelo usuário (chave por contexto).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StudioTipsState {
  showTips: boolean;
  dismissed: Record<string, boolean>;
  setShowTips: (value: boolean) => void;
  dismissTip: (id: string) => void;
}

export const useStudioTipsStore = create<StudioTipsState>()(
  persist(
    (set) => ({
      showTips: true,
      dismissed: {},
      setShowTips: (showTips) => set({ showTips }),
      dismissTip: (id) => set((s) => ({ dismissed: { ...s.dismissed, [id]: true } })),
    }),
    {
      name: "postspark.studio-tips",
    },
  ),
);
