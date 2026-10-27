// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ get: vi.fn(), refresh: vi.fn() }));
vi.mock("./supabaseClient", () => ({
  supabase: { auth: { getSession: state.get, refreshSession: state.refresh } },
}));
function locks() {
  const queues = new Map<string, Promise<unknown>>();
  return {
    request: (name: string, run: () => unknown) => {
      const result = (queues.get(name) ?? Promise.resolve()).then(run);
      queues.set(
        name,
        result.catch(() => {})
      );
      return result;
    },
  };
}
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: locks(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true }))
  );
  state.get.mockResolvedValue({
    data: {
      session: {
        access_token: "token-a",
        expires_at: Date.now() / 1000 + 3600,
      },
    },
  });
  state.refresh.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
describe("shared cookie bridge", () => {
  it("repairs a missing cookie once for concurrent explicit login completion", async () => {
    const bridge = await import("./authBridge");
    await bridge.exchangeSupabaseSession("token-a");
    vi.mocked(fetch).mockClear();
    await Promise.all(Array.from({length:5},()=>bridge.resyncSupabaseSession("token-a")));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("five callers in each of two independent tabs perform one cookie synchronization", async () => {
    const first = await import("./authBridge");
    vi.resetModules();
    const second = await import("./authBridge");
    await Promise.all(
      Array.from({ length: 5 }, () =>
        first.exchangeSupabaseSession("token-a")
      ).concat(
        Array.from({ length: 5 }, () =>
          second.exchangeSupabaseSession("token-a")
        )
      )
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("postspark.session-bridge.v2")).not.toContain(
      "token-a"
    );
  });
  it("refreshes an expired session once at use, without an idle timer", async () => {
    const bridge = await import("./authBridge");
    state.get.mockResolvedValue({
      data: { session: { access_token: "old", expires_at: 1 } },
    });
    state.refresh.mockResolvedValue({
      data: {
        session: {
          access_token: "renewed",
          expires_at: Date.now() / 1000 + 3600,
        },
      },
    });
    await Promise.all(
      Array.from({ length: 5 }, () => bridge.ensureSessionForRequest())
    );
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(30 * 60000);
    expect(state.refresh).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("logout waits for a pending exchange and leaves the cookie cleared", async () => {
    const bridge = await import("./authBridge");
    let finish!: () => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = () => resolve({ ok: true } as Response);
        })
    );
    const exchange = bridge.exchangeSupabaseSession("old").catch(e => e);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const logout = bridge.clearSessionBridge();
    finish();
    await Promise.all([exchange, logout]);
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe(
      "/api/auth/supabase-logout"
    );
    expect(localStorage.getItem("postspark.session-bridge.v2")).toBe(
      "signed-out"
    );
  });
  it("does not cache a denied access check", async () => {
    const bridge = await import("./authBridge");
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "postspark_access_required" }),
    } as Response);
    await expect(bridge.exchangeSupabaseSession("denied")).rejects.toThrow(
      "postspark_access_required"
    );
    expect(localStorage.getItem("postspark.session-bridge.v2")).toBeNull();
  });
});
