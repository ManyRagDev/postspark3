/**
 * useArcDrawer - Hook para gerenciar o estado do Arc Drawer (mobile)
 * 
 * Controla a abertura/fechamento do painel, altura animada,
 * e estado do radial menu.
 */

import { useState, useCallback, useEffect } from 'react';

/** IDs das seções/panels disponíveis */
export type TabId = 'text' | 'design' | 'image' | 'composition';

export type DrawerHeight = 'closed' | 'compact' | 'expanded';

export interface ArcDrawerState {
  /** Se o drawer está aberto */
  isOpen: boolean;
  /** Altura atual do drawer */
  height: DrawerHeight;
  /** Tab atualmente selecionada */
  activeTab: TabId | null;
}

const STORAGE_KEY = 'postspark-arc-drawer-v1';

const DEFAULT_STATE: ArcDrawerState = {
  isOpen: false,
  height: 'closed',
  activeTab: null,
};

export interface UseArcDrawerReturn {
  /** Estado completo */
  state: ArcDrawerState;
  /** Abre o drawer com uma tab específica */
  open: (tab: TabId) => void;
  /** Fecha o drawer */
  close: () => void;
  /** Toggle do drawer */
  toggle: () => void;
  /** Define a altura do drawer */
  setHeight: (height: DrawerHeight) => void;
  /** Seleciona uma tab */
  selectTab: (tab: TabId) => void;
  /** Altura em pixels para animação */
  heightInVh: number;
}

/**
 * Converte DrawerHeight para valor em vh
 */
function getHeightInVh(height: DrawerHeight): number {
  switch (height) {
    case 'closed':
      return 0;
    case 'compact':
      return 70;
    case 'expanded':
      return 85;
    default:
      return 0;
  }
}

export function useArcDrawer(): UseArcDrawerReturn {
  const [state, setState] = useState<ArcDrawerState>(DEFAULT_STATE);

  const open = useCallback((tab: TabId) => {
    setState((prev) => ({
      ...prev,
      isOpen: true,
      height: 'compact',
      activeTab: tab,
    }));
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
      height: 'closed',
    }));
  }, []);

  const toggle = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: !prev.isOpen,
      height: !prev.isOpen ? 'compact' : 'closed',
    }));
  }, []);

  const setHeight = useCallback((height: DrawerHeight) => {
    setState((prev) => ({
      ...prev,
      height,
      isOpen: height !== 'closed',
    }));
  }, []);

  const selectTab = useCallback((tab: TabId) => {
    setState((prev) => ({
      ...prev,
      activeTab: tab,
      isOpen: true,
      height: 'compact',
    }));
  }, []);

  const heightInVh = getHeightInVh(state.height);

  return {
    state,
    open,
    close,
    toggle,
    setHeight,
    selectTab,
    heightInVh,
  };
}

export default useArcDrawer;
