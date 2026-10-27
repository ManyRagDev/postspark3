// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { useGenerationEvents } from "./useGenerationEvents";
vi.mock("@/lib/authBridge", () => ({
  ensureSessionForRequest: vi.fn(async () => {}),
}));
class Stream {
  static instances: Stream[] = [];
  close = vi.fn();
  onmessage: any;
  onerror: any;
  connected: any;
  constructor() {
    Stream.instances.push(this);
  }
  addEventListener(_name: string, fn: any) {
    this.connected = fn;
  }
}
let root: Root, el: HTMLDivElement, last: any;
const events = vi.fn(),
  connect = vi.fn();
function Consumer({ enabled = true }) {
  last = useGenerationEvents("r", enabled, events, connect);
  return null;
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  Stream.instances = [];
  vi.stubGlobal("EventSource", Stream);
  vi.useFakeTimers();
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  events.mockClear();
  connect.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  el.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("progress lifecycle", () => {
  it("receives compact progress without polling and closes while hidden or unmounted", async () => {
    await act(async () => root.render(<Consumer />));
    expect(Stream.instances).toHaveLength(1);
    await act(async () => {
      Stream.instances[0].connected();
      Stream.instances[0].onmessage({
        data: JSON.stringify({
          requestId: "r",
          status: "running",
          proposals: [],
        }),
      });
      await vi.advanceTimersByTimeAsync(30 * 60000);
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(events).toHaveBeenCalledTimes(1);
    expect(Stream.instances).toHaveLength(1);
    await act(async () => {
      Object.defineProperty(document, "hidden", { value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(Stream.instances[0].close).toHaveBeenCalledTimes(1);
    await act(async () => {
      Object.defineProperty(document, "hidden", { value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(Stream.instances).toHaveLength(2);
    await act(async () => root.render(<Consumer enabled={false} />));
    expect(Stream.instances[1].close).toHaveBeenCalled();
  });
  it("limits reconnects to three and closes immediately on logout", async () => {
    await act(async () => root.render(<Consumer />));
    for (const ms of [1000, 2000, 5000, 30000])
      await act(async () => {
        Stream.instances.at(-1)!.onerror();
        await vi.advanceTimersByTimeAsync(ms);
      });
    expect(Stream.instances).toHaveLength(4);
    expect(last.error).toBe(true);
    await act(async () => last.reconnect());
    expect(Stream.instances).toHaveLength(5);
    await act(async () =>
      window.dispatchEvent(new Event("postspark:session-ended"))
    );
    expect(Stream.instances.at(-1)!.close).toHaveBeenCalled();
  });
});
