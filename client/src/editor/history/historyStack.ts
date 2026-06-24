export interface DocumentTransaction {
  label: string;
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  coalesceKey?: string;
}

export interface HistoryStack {
  readonly past: readonly DocumentTransaction[];
  readonly future: readonly DocumentTransaction[];
  readonly version: number;
}

export const MAX_HISTORY_SIZE = 100;

export function createHistoryStack(): HistoryStack {
  return { past: [], future: [], version: 0 };
}

export function pushTransaction(
  stack: HistoryStack,
  beforeSnapshot: Record<string, unknown>,
  afterSnapshot: Record<string, unknown>,
  label: string,
  coalesceKey?: string,
): HistoryStack {
  const transaction: DocumentTransaction = { label, beforeSnapshot, afterSnapshot, coalesceKey };
  const newPast = [...stack.past, transaction].slice(-MAX_HISTORY_SIZE);
  return { past: newPast, future: [], version: stack.version + 1 };
}

export function undo(stack: HistoryStack): HistoryStack | null {
  if (stack.past.length === 0) return null;
  const newPast = stack.past.slice(0, -1);
  const undone = stack.past[stack.past.length - 1];
  return {
    past: newPast,
    future: [undone, ...stack.future],
    version: stack.version + 1,
  };
}

export function redo(stack: HistoryStack): HistoryStack | null {
  if (stack.future.length === 0) return null;
  const [redone, ...newFuture] = stack.future;
  return {
    past: [...stack.past, redone],
    future: newFuture,
    version: stack.version + 1,
  };
}

export function clearHistory(): HistoryStack {
  return createHistoryStack();
}

export function canUndo(stack: HistoryStack): boolean {
  return stack.past.length > 0;
}

export function canRedo(stack: HistoryStack): boolean {
  return stack.future.length > 0;
}

export function getLatestTransaction(stack: HistoryStack): DocumentTransaction | undefined {
  return stack.past[stack.past.length - 1];
}
