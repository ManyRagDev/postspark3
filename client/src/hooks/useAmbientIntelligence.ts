import { useState, useEffect, useMemo, useCallback } from "react";
import type { AmbientState, AmbientConfig, AmbientResult } from "@/types/ambient";
import { detectAmbientState } from "@/lib/keywordDetector";
import { getAmbientConfig } from "@/lib/ambientStates";

const DEBOUNCE_MS = 150;

/**
 * Hook principal para Inteligência Ambiental.
 * Processa o texto do usuário e retorna o estado detectado com configurações.
 */
export function useAmbientIntelligence(text: string): AmbientResult {
  const [debouncedText, setDebouncedText] = useState(text);
  const [isForced, setIsForced] = useState(false);
  const [forcedState, setForcedState] = useState<AmbientState>("neutral");

  // Debounce do texto para evitar processamento excessivo
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(text);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // Detecta o estado baseado no texto (memoizado)
  const detection = useMemo(() => {
    if (isForced) {
      return { state: forcedState, confidence: 100, matches: [] };
    }
    return detectAmbientState(debouncedText);
  }, [debouncedText, isForced, forcedState]);

  // Obtém a configuração do estado detectado
  const config: AmbientConfig = useMemo(() => {
    return getAmbientConfig(detection.state);
  }, [detection.state]);

  // Reseta para o estado neutro
  const reset = useCallback(() => {
    setIsForced(true);
    setForcedState("neutral");
  }, []);

  // Remove o estado forçado quando o texto muda significativamente
  useEffect(() => {
    if (isForced && text.length > debouncedText.length + 10) {
      setIsForced(false);
    }
  }, [text, debouncedText, isForced]);

  return {
    state: detection.state,
    config,
    confidence: detection.confidence,
    reset,
  };
}
