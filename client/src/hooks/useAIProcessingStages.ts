import { useState, useEffect, useRef, useCallback } from "react";

type StagePreset = "generation" | "image";

const STAGE_PRESETS: Record<StagePreset, string[]> = {
  generation: [
    "Analisando contexto\u2026",
    "Sintetizando varia\u00e7\u00f5es\u2026",
    "Refinando tom e estilo\u2026",
    "Calibrando resultado\u2026",
  ],
  image: [
    "Interpretando descri\u00e7\u00e3o\u2026",
    "Compondo elementos visuais\u2026",
    "Renderizando imagem\u2026",
    "Aplicando ajustes finais\u2026",
  ],
};

const STAGE_INTERVAL = 3200; // ms between stage transitions

interface UseAIProcessingStagesOptions {
  isActive: boolean;
  preset: StagePreset;
}

interface UseAIProcessingStagesReturn {
  stageText: string;
  stageIndex: number;
  totalStages: number;
}

export function useAIProcessingStages({
  isActive,
  preset,
}: UseAIProcessingStagesOptions): UseAIProcessingStagesReturn {
  const [stageIndex, setStageIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stages = STAGE_PRESETS[preset];

  useEffect(() => {
    if (isActive) {
      setStageIndex(0);
      intervalRef.current = setInterval(() => {
        setStageIndex((prev) => (prev + 1) % stages.length);
      }, STAGE_INTERVAL);
    } else {
      setStageIndex(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, stages.length]);

  return {
    stageText: stages[stageIndex],
    stageIndex,
    totalStages: stages.length,
  };
}

/**
 * Hook to trigger a one-shot CSS class (e.g. flash-gold) after a boolean
 * transitions from true → false (i.e. completion).
 */
export function useCompletionFlash(isActive: boolean, duration = 800) {
  const [showFlash, setShowFlash] = useState(false);
  const wasActive = useRef(false);

  useEffect(() => {
    if (wasActive.current && !isActive) {
      setShowFlash(true);
      const timer = setTimeout(() => setShowFlash(false), duration);
      return () => clearTimeout(timer);
    }
    wasActive.current = isActive;
  }, [isActive, duration]);

  return showFlash;
}
