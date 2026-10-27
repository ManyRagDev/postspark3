// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDynamicFont } from "./useDynamicFont";

let root: Root, host: HTMLDivElement;

function TestComponent({ fontFamily }: { fontFamily: string }) {
  const font = useDynamicFont(fontFamily);
  return <div data-testid="font">{font}</div>;
}

describe("useDynamicFont (OS-006 / AC-006-03)", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("returns font name and triggers graceful fallback timeout if fonts.ready takes too long", async () => {
    const pendingPromise = new Promise(() => {});
    Object.defineProperty(document, "fonts", {
      value: {
        ready: pendingPromise,
        check: () => false,
        load: () => pendingPromise,
      },
      writable: true,
      configurable: true,
    });

    await act(async () => {
      root.render(<TestComponent fontFamily="Inter" />);
    });

    expect(host.textContent).toBe("Inter");

    // Advance 3000ms
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(host.textContent).toBe("Inter");
  });
});
