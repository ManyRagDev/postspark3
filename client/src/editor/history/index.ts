export {
  type DocumentTransaction,
  type HistoryStack,
  MAX_HISTORY_SIZE,
  createHistoryStack,
  pushTransaction,
  undo,
  redo,
  clearHistory,
  canUndo,
  canRedo,
  getLatestTransaction,
} from "./historyStack";
