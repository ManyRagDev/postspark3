// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProposalDelivery } from "@shared/generationContracts";
import { useProposalProgress } from "./useProposalProgress";

let root: Root, host: HTMLDivElement;
const proposal = (id: string, status: string) => ({ proposalId: id, revision: 1, status }) as ProposalDelivery;
function Probe({ proposals }: { proposals: ProposalDelivery[] }) {
  const values = useProposalProgress(proposals);
  return <output>{JSON.stringify(values)}</output>;
}
const render = (proposals: ProposalDelivery[]) => act(() => root.render(<Probe proposals={proposals} />));
const values = () => JSON.parse(host.textContent!) as Record<string, number>;
beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });

it("advances independently, never reaches completion while pending, and does not regress during recovery", () => {
  render([proposal("a", "running"), proposal("b", "planned")]);
  act(() => vi.advanceTimersByTime(45000));
  expect(values()['a:1']).toBeGreaterThan(values()['b:1']);
  const prior = values()['a:1'];
  render([proposal("a", "checking"), proposal("b", "running")]);
  expect(values()['a:1']).toBeGreaterThanOrEqual(prior);
  act(() => vi.advanceTimersByTime(120000));
  const checked = values()['a:1'];
  render([proposal("a", "recovering"), proposal("b", "ready")]);
  expect(values()['a:1']).toBeGreaterThanOrEqual(checked);
  expect(values()['b:1']).toBeLessThan(100);
  act(() => vi.advanceTimersByTime(600000));
  expect(Math.max(...Object.values(values()))).toBeLessThan(100);
});

it("preserves pending progress when a sibling is delivered and releases timers after terminal states", () => {
  render([proposal("a", "running"), proposal("b", "running")]);
  act(() => vi.advanceTimersByTime(45000));
  const previous = values()['b:1'];
  render([proposal("a", "ready"), proposal("b", "running")]);
  expect(values()['b:1']).toBeGreaterThanOrEqual(previous);
  render([proposal("a", "ready"), proposal("b", "failed")]);
  expect(values()['b:1']).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
  render([proposal("new", "planned")]);
  expect(values()['new:1']).toBeLessThan(previous);
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  root = createRoot(host);
});
