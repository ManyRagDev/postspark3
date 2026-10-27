// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { expect, it, vi } from "vitest";
import { trpc } from "@/lib/trpc";

const state = vi.hoisted(() => ({
  callback: undefined as undefined | ((event: string, session: { access_token: string }) => void),
  subscribe: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: { auth: {
    getSession: async () => ({ data: { session: { access_token: "isolated-token" } } }),
    onAuthStateChange: (callback: typeof state.callback) => {
      state.callback = callback;
      state.subscribe();
      queueMicrotask(() => callback!("INITIAL_SESSION", { access_token: "isolated-token" }));
      return { data: { subscription: { unsubscribe: state.unsubscribe } } };
    },
  } },
}));
vi.mock("@/lib/catalogCache", () => ({ clearCatalogCache: vi.fn() }));
import { AuthProvider, useAuth } from "./useAuth";

function Consumer() {
  return <span>{useAuth().user?.id}</span>;
}

it("real tRPC utilities, repeated renders and auth events do not restart session synchronization or idle queries", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  const bridgeFetch = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", bridgeFetch);
  const calls: string[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  const client = trpc.createClient({ links: [() => ({ op }) => observable(observer => {
    calls.push(op.path);
    observer.next({ result: { data: { id: "isolated-owner" } } });
    observer.complete();
  })] });
  const element = document.createElement("div");
  const root = createRoot(element);
  const render = () => root.render(
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{Array.from({ length: 5 }, (_, index) => <Consumer key={index} />)}</AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
  try {
    await act(async () => { render(); });
    await act(async () => { await vi.waitFor(() => expect(bridgeFetch).toHaveBeenCalledTimes(1)); });
    // Drain the invalidation after the cookie exchange before measuring idleness.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    const initialCalls = calls.length;
    expect(initialCalls).toBeGreaterThan(0);
    expect(initialCalls).toBeLessThanOrEqual(2);
    for (let index = 0; index < 10; index++) {
      await act(async () => {
        render();
        state.callback!("SIGNED_IN", { access_token: "isolated-token" });
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
    }
    expect(element.querySelectorAll("span")).toHaveLength(5);
    expect(state.subscribe).toHaveBeenCalledTimes(1);
    expect(bridgeFetch).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(initialCalls);
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60_000); });
    expect(bridgeFetch).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(initialCalls);
  } finally {
    vi.useRealTimers();
    await act(async () => root.unmount());
    queryClient.clear();
    focusManager.setFocused(undefined);
    vi.unstubAllGlobals();
  }
  expect(state.unsubscribe).toHaveBeenCalledTimes(1);
});
