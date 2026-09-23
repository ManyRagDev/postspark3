import type { CanvasPostModel } from "../components/types";

/**
 * Estrutura imutável de histórico para o CanvasPostModel (Etapa 8 §4).
 * Mantém pilhas de estados passados e futuros com limite de profundidade para
 * garantir fluidez de renderização sem vazamento de memória.
 */
export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export const DEFAULT_MAX_HISTORY_DEPTH = 30;

/** Inicializa o histórico com o documento de abertura. */
export function createHistory<T>(initialPresent: T): HistoryState<T> {
  return {
    past: [],
    present: initialPresent,
    future: [],
  };
}

/**
 * Adiciona uma nova alteração ao histórico.
 * Invalida o futuro e limita o tamanho da pilha de histórico.
 */
export function pushHistory<T>(
  history: HistoryState<T>,
  nextPresent: T,
  maxDepth = DEFAULT_MAX_HISTORY_DEPTH,
): HistoryState<T> {
  if (history.present === nextPresent) return history;

  const newPast = [...history.past, history.present];
  if (newPast.length > maxDepth) {
    newPast.shift();
  }

  return {
    past: newPast,
    present: nextPresent,
    future: [],
  };
}

/** Desfaz a última ação restaurando o estado imediatamente anterior. */
export function undoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.past.length === 0) return history;

  const previous = history.past[history.past.length - 1];
  const newPast = history.past.slice(0, history.past.length - 1);

  return {
    past: newPast,
    present: previous,
    future: [history.present, ...history.future],
  };
}

/** Refaz a ação previamente desfeita. */
export function redoHistory<T>(history: HistoryState<T>): HistoryState<T> {
  if (history.future.length === 0) return history;

  const next = history.future[0];
  const newFuture = history.future.slice(1);

  return {
    past: [...history.past, history.present],
    present: next,
    future: newFuture,
  };
}

export function canUndo<T>(history: HistoryState<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: HistoryState<T>): boolean {
  return history.future.length > 0;
}
