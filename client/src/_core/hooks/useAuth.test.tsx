// @vitest-environment happy-dom
import React, { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  exchange: vi.fn(async () => {}),
  invalidate: vi.fn(async () => {}),
  callback: undefined as any,
}));
vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "token" } },
      }),
      onAuthStateChange: (callback: any) => {
        h.callback = callback;
        h.subscribe();
        queueMicrotask(() =>
          callback("INITIAL_SESSION", { access_token: "token" })
        );
        return { data: { subscription: { unsubscribe: h.unsubscribe } } };
      },
      signOut: vi.fn(),
    },
  },
}));
vi.mock("@/lib/authBridge", () => ({
  exchangeSupabaseSession: h.exchange,
  clearSessionBridge: vi.fn(),
}));
vi.mock("@/lib/catalogCache", () => ({ clearCatalogCache: vi.fn() }));
vi.mock("@/lib/trpc", () => {
  const utils = {
    auth: { me: { invalidate: h.invalidate, setData: vi.fn() } },
  };
  return {
    trpc: {
      useUtils: () => utils,
      auth: {
        me: {
          useQuery: () => ({
            data: { id: "owner" },
            isLoading: false,
            refetch: vi.fn(),
          }),
        },
        logout: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      },
    },
  };
});
import { AuthProvider, useAuth } from "./useAuth";
function Consumer() {
  const auth = useAuth();
  return <span>{auth.user?.id}</span>;
}
it("five components share one auth subscription and one initial session operation", async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement("div"),
    root = createRoot(el);
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <AuthProvider>
            {Array.from({ length: 5 }, (_, i) => (
              <Consumer key={i} />
            ))}
          </AuthProvider>
        </QueryClientProvider>
      )
    );
    expect(h.subscribe).toHaveBeenCalledTimes(1);
    expect(h.exchange).toHaveBeenCalledTimes(1);
    expect(el.querySelectorAll("span")).toHaveLength(5);
    await act(async () => root.unmount());
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
  } finally {
    el.remove();
  }
});
