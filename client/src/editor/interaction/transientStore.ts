import type { InteractionListener, InteractionState } from "./types";

export const IDLE_INTERACTION_STATE: InteractionState = Object.freeze({ phase: "idle" });

export interface TransientInteractionStore {
  getState(): InteractionState;
  publish(state: InteractionState): void;
  subscribe(listener: InteractionListener): () => void;
  destroy(): void;
}

export function createTransientInteractionStore(): TransientInteractionStore {
  let state = IDLE_INTERACTION_STATE;
  const listeners = new Set<InteractionListener>();

  return {
    getState: () => state,
    publish: nextState => {
      if (nextState === state) return;
      state = Object.freeze(nextState);
      listeners.forEach(listener => listener(state));
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => {
      state = IDLE_INTERACTION_STATE;
      listeners.clear();
    },
  };
}
