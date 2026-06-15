export type GenerationPhase = "extracting" | "generating";

export interface GenerationProgressState {
  percentage: number;
  label: string;
  detail: string;
  isTakingLong: boolean;
}

export function getGenerationProgress(
  elapsedSeconds: number,
  phase: GenerationPhase,
): GenerationProgressState {
  const elapsed = Math.max(0, elapsedSeconds);

  if (phase === "extracting") {
    const percentage = Math.min(28, 8 + Math.round(elapsed * 0.65));
    return {
      percentage,
      label: "Lendo o site e a identidade da marca",
      detail: "Mapeando conteúdo, sinais visuais e objetivos antes de criar.",
      isTakingLong: elapsed >= 45,
    };
  }

  if (elapsed < 10) {
    return {
      percentage: 30 + Math.round(elapsed * 1.0),
      label: "Planejando caminhos criativos",
      detail: "Definindo temas, público, objetivo e ângulos distintos.",
      isTakingLong: false,
    };
  }
  if (elapsed < 30) {
    return {
      percentage: 40 + Math.round((elapsed - 10) * 0.9),
      label: "Sintetizando as variações",
      detail: "Construindo copies e composições completas para cada alternativa.",
      isTakingLong: false,
    };
  }
  if (elapsed < 60) {
    return {
      percentage: 58 + Math.round((elapsed - 30) * 0.6),
      label: "Calibrando relevância e identidade",
      detail: "Conferindo aderência ao assunto, à marca e ao objetivo.",
      isTakingLong: false,
    };
  }
  if (elapsed < 100) {
    return {
      percentage: 76 + Math.round((elapsed - 60) * 0.3),
      label: "Avaliando qualidade e originalidade",
      detail: "Comparando as opções e corrigindo inconsistências importantes.",
      isTakingLong: elapsed >= 75,
    };
  }

  return {
    percentage: Math.min(94, 88 + Math.round((elapsed - 100) * 0.05)),
    label: "Finalizando a melhor versão",
    detail: "A geração continua ativa. Etapas de revisão podem levar mais tempo.",
    isTakingLong: true,
  };
}

export function formatGenerationElapsed(elapsedSeconds: number): string {
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return minutes > 0
    ? `${minutes}:${seconds.toString().padStart(2, "0")}`
    : `${seconds}s`;
}
