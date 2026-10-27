import { useEffect, useState } from "react";
import type { ProposalDelivery } from "@shared/generationContracts";
import { proposalDeliveryKey } from "./studioGenerationState";

// Presentation estimates, not elapsed-time predictions or completion receipts.
const STAGES: Record<string, [number, number, number]> = {
  planned: [6, 12, 30],
  waiting_input: [10, 16, 45],
  running: [18, 65, 90],
  checking: [70, 88, 60],
  recovering: [60, 88, 60],
  delivery_pending: [90, 96, 20],
  ready: [98, 98, 1], // Client materialization is still pending while the skeleton exists.
};

export function estimateProposalProgress(status: string, elapsedSeconds = 0) {
  const [start, ceiling, pace] = STAGES[status] ?? STAGES.planned;
  return Math.round(start + (ceiling - start) * (1 - Math.exp(-Math.max(0, elapsedSeconds) / pace)));
}

interface Entry { status: string; startedAt: number; value: number }
export type ProposalProgressValues = Record<string, number>;

/** Kept above the empty/filled gallery so a sibling becoming ready cannot reset a bar. */
export function useProposalProgress(proposals?: ProposalDelivery[]): ProposalProgressValues {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  useEffect(() => {
    const now = Date.now();
    setEntries(previous => Object.fromEntries((proposals ?? [])
      .filter(p => p.status in STAGES)
      .map(p => {
        const key = proposalDeliveryKey(p.proposalId, p.revision);
        const old = previous[key];
        const startedAt = old?.status === p.status ? old.startedAt : now;
        return [key, { status: p.status, startedAt, value: Math.max(old?.value ?? 0, estimateProposalProgress(p.status, (now - startedAt) / 1000)) }];
      })));
  }, [proposals]);

  const active = Object.values(entries).some(e => e.status !== "ready");
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setEntries(previous => Object.fromEntries(
      Object.entries(previous).map(([key, e]) => [key, {
        ...e, value: Math.max(e.value, estimateProposalProgress(e.status, (Date.now() - e.startedAt) / 1000)),
      }]),
    )), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return Object.fromEntries(Object.entries(entries).map(([key, e]) => [key, e.value]));
}
