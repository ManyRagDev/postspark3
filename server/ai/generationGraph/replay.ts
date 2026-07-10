export interface ReplayableTraceCall {
  label: string;
  requestedModel?: string;
  taskRoute?: string;
  effectiveModel?: string;
  provider?: string;
  promptHash?: string;
  messages?: unknown[];
  response?: unknown;
  error?: string;
  [key: string]: unknown;
}

export interface ReplayPromptSnapshot {
  version: 1 | 2;
  replayable: boolean;
  calls: ReplayableTraceCall[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseReplayPromptSnapshot(value: unknown): ReplayPromptSnapshot {
  if (Array.isArray(value)) {
    return {
      version: 1,
      replayable: false,
      calls: value.filter(isRecord) as ReplayableTraceCall[],
    };
  }

  if (!isRecord(value)) {
    return { version: 2, replayable: false, calls: [] };
  }

  const calls = Array.isArray(value.calls)
    ? value.calls.filter(isRecord) as ReplayableTraceCall[]
    : [];

  return {
    version: value.version === 1 ? 1 : 2,
    replayable: value.replayable === true,
    calls,
  };
}

export function isReplayablePromptSnapshot(value: unknown): boolean {
  const snapshot = parseReplayPromptSnapshot(value);
  return snapshot.replayable && snapshot.calls.every((call) => "response" in call);
}

export function createReplayCallReader(value: unknown): {
  snapshot: ReplayPromptSnapshot;
  next: (label?: string) => ReplayableTraceCall | undefined;
} {
  const snapshot = parseReplayPromptSnapshot(value);
  const consumed = new Set<number>();

  return {
    snapshot,
    next: (label?: string) => {
      const index = snapshot.calls.findIndex((call, callIndex) => {
        if (consumed.has(callIndex)) return false;
        return label ? call.label === label : true;
      });
      if (index < 0) return undefined;
      consumed.add(index);
      return snapshot.calls[index];
    },
  };
}
