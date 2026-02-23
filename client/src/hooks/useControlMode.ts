/**
 * useControlMode - Hook para gerenciar o modo de controle global
 * 
 * Captain Mode: Interface limpa, apenas controles essenciais (~30% dos campos)
 * Architect Mode: Todos os controles disponíveis (~100% dos campos)
 * 
 * Simplificado: modo único global (não mais per-tab)
 */

import { useState, useCallback, useEffect } from 'react';

export type ControlMode = 'captain' | 'architect';

const STORAGE_KEY = 'postspark-control-mode-v2';

const DEFAULT_MODE: ControlMode = 'captain'; // Default é Captain para onboarding suave

/**
 * Carrega estado do localStorage
 */
function loadState(): ControlMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'captain' || stored === 'architect') {
      return stored;
    }
  } catch {
    // Fallback para default se localStorage falhar
  }
  return DEFAULT_MODE;
}

/**
 * Salva estado no localStorage
 */
function saveState(mode: ControlMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Silenciar erros de localStorage
  }
}

export interface UseControlModeReturn {
  /** Modo atual */
  mode: ControlMode;
  /** Define o modo */
  setMode: (mode: ControlMode) => void;
  /** Toggle do modo */
  toggleMode: () => void;
  /** Verifica se está no modo Architect */
  isArchitect: boolean;
  /** Verifica se está no modo Captain */
  isCaptain: boolean;
  /** Reseta para default */
  reset: () => void;
}

export function useControlMode(): UseControlModeReturn {
  const [mode, setModeState] = useState<ControlMode>(loadState);

  // Persistir no localStorage quando mudar
  useEffect(() => {
    saveState(mode);
  }, [mode]);

  const setMode = useCallback((newMode: ControlMode) => {
    setModeState(newMode);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => (prev === 'captain' ? 'architect' : 'captain'));
  }, []);

  const reset = useCallback(() => {
    setModeState(DEFAULT_MODE);
  }, []);

  return {
    mode,
    setMode,
    toggleMode,
    isArchitect: mode === 'architect',
    isCaptain: mode === 'captain',
    reset,
  };
}

export default useControlMode;