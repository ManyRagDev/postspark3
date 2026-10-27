// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import CanvasSidebar from "./CanvasSidebar";
import { INITIAL_POST } from "./types";
import { canvasModelToSavePayload } from "../lib/saveAdapter";
import { fitSavePayload } from "../lib/fitSavePayload";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    post: { generateImage: { useMutation: () => ({}) } },
    designCatalog: {},
  },
}));

vi.mock("@/lib/fonts", () => ({
  FONT_CATALOG: { serif: [], display: [], sansSerif: [], mono: [] },
  loadCatalogFonts: () => {},
  loadFontByName: () => {},
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe("CanvasSidebar Font Upload and Validation (OS-006 & C02)", () => {
  it("CP-32: failed FontFace decode preserves previous document", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({}) })));
    vi.stubGlobal(
      "FontFace",
      class {
        load() {
          return Promise.reject(new Error("invalid font"));
        }
      }
    );
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { add: vi.fn() },
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const update = vi.fn();
    try {
      await act(async () =>
        root.render(<CanvasSidebar post={structuredClone(INITIAL_POST)} onUpdatePost={update} />)
      );
      const input = host.querySelector('input[accept=".ttf,.otf,.woff,.woff2"]')!;
      Object.defineProperty(input, "files", {
        value: [{ name: "corrupt.ttf", arrayBuffer: async () => new Uint8Array([0, 1, 0, 0]).buffer }],
      });
      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(update).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });

  it("RC-04 BUG-026: upload completing after session switch must not commit into new session", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({}) })));
    vi.stubGlobal("FontFace", class { async load() { return this; } });
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn() } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const update = vi.fn();
    let release!: (v: ArrayBuffer) => void;
    const pending = new Promise<ArrayBuffer>((r) => (release = r));
    function bytes(size = 28) {
      const b = new Uint8Array(size);
      b.set([0, 1, 0, 0, 0, 1]);
      return b;
    }
    try {
      await act(async () => root.render(<CanvasSidebar post={{ ...structuredClone(INITIAL_POST), id: "A" }} onUpdatePost={update} />));
      const input = host.querySelector('input[accept=".ttf,.otf,.woff,.woff2"]')!;
      Object.defineProperty(input, "files", { value: [{ name: "AuditLate.ttf", arrayBuffer: () => pending }] });
      await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
      await act(async () => root.render(<CanvasSidebar post={{ ...structuredClone(INITIAL_POST), id: "B" }} onUpdatePost={update} />));
      await act(async () => { release(bytes().buffer); await pending; await new Promise((r) => setTimeout(r, 0)); });
      expect(update).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });

  it("RC-05 BUG-026: complete request exceeding cap is rejected before font commit", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({}) })));
    vi.stubGlobal("FontFace", class { async load() { return this; } });
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn() } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const update = vi.fn();
    function bytes(size = 28) {
      const b = new Uint8Array(size);
      b.set([0, 1, 0, 0, 0, 1]);
      return b;
    }
    const url = "data:font/truetype;base64," + Buffer.alloc(950000).toString("base64");
    const post = { ...structuredClone(INITIAL_POST), userFonts: [{ family: "ExistingA", url }, { family: "ExistingB", url }] };
    expect(new TextEncoder().encode(JSON.stringify(post)).length).toBeLessThan(3500000);
    try {
      await act(async () => root.render(<CanvasSidebar post={post} onUpdatePost={update} />));
      const input = host.querySelector('input[accept=".ttf,.otf,.woff,.woff2"]')!;
      Object.defineProperty(input, "files", { value: [{ name: "AuditPayload.ttf", arrayBuffer: async () => bytes(950000).buffer }] });
      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
      });
      const patch = update.mock.calls[0]?.[0];
      if (patch) expect(new TextEncoder().encode(JSON.stringify({ ...post, ...patch })).length).toBeGreaterThan(3500000);
      expect(update).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });

  it("RC-07 BUG-026 control: structural preflight passes but decode failure aborts commit", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const load = vi.fn().mockRejectedValue(new Error("decode failed"));
    vi.stubGlobal("FontFace", class { load() { return load(); } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const update = vi.fn();
    function bytes(size = 28) {
      const b = new Uint8Array(size);
      b.set([0, 1, 0, 0, 0, 1]);
      return b;
    }
    try {
      await act(async () => root.render(<CanvasSidebar post={structuredClone(INITIAL_POST)} onUpdatePost={update} />));
      const input = host.querySelector('input[accept=".ttf,.otf,.woff,.woff2"]')!;
      Object.defineProperty(input, "files", { value: [{ name: "AuditDecodeReject.ttf", arrayBuffer: async () => bytes().buffer }] });
      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(load).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });

  it("C04-R2 BUG-031: replacing slide at same index invalidates upload target", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({}) })));
    vi.stubGlobal("FontFace", class { async load() { return this; } });
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn() } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const update = vi.fn();
    let release!: (v: ArrayBuffer) => void;
    const pending = new Promise<ArrayBuffer>((r) => (release = r));
    function bytes(size = 28) {
      const b = new Uint8Array(size);
      b.set([0, 1, 0, 0, 0, 1]);
      return b;
    }
    const a = {
      ...structuredClone(INITIAL_POST),
      id: "doc-A",
      currentSlideIndex: 0,
      slides: [{ id: "original-slide", step: "", headline: "Original", subtext: "" }],
    };
    try {
      await act(async () => root.render(<CanvasSidebar post={a} onUpdatePost={update} />));
      const input = host.querySelector('input[accept=".ttf,.otf,.woff,.woff2"]')!;
      Object.defineProperty(input, "files", { value: [{ name: "AuditReplacement.ttf", arrayBuffer: () => pending }] });
      await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
      await act(async () =>
        root.render(<CanvasSidebar post={{ ...a, slides: [{ ...a.slides[0], id: "replacement-slide" }] }} onUpdatePost={update} />)
      );
      await act(async () => {
        release(bytes().buffer);
        await pending;
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(update).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });

  it("C04-R3v BUG-032: independently sized envelope must be refused before commit", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({}) })));
    vi.stubGlobal("FontFace", class { async load() { return this; } });
    Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn() } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const update = vi.fn();
    function bytes(size = 28) {
      const b = new Uint8Array(size);
      b.set([0, 1, 0, 0, 0, 1]);
      return b;
    }
    const url = "data:font/truetype;base64," + Buffer.alloc(950000).toString("base64");
    const post = {
      ...structuredClone(INITIAL_POST),
      caption: "x".repeat(650000),
      userFonts: [{ family: "ExistingA", url }, { family: "ExistingB", url }],
    };
    const candidate = {
      ...post,
      fontFamily: "AuditEnvelope",
      userFonts: [
        ...post.userFonts,
        { family: "AuditEnvelope", format: "truetype", url: "data:font/truetype;base64," + Buffer.from(bytes()).toString("base64") },
      ],
    };
    const payload = canvasModelToSavePayload(candidate, { inputType: "text", inputContent: "audit" });
    expect(new TextEncoder().encode(JSON.stringify(candidate)).length).toBeLessThan(3500000);
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeGreaterThan(3500000);
    await expect(fitSavePayload(payload)).rejects.toThrow();
    try {
      await act(async () => root.render(<CanvasSidebar post={post} onUpdatePost={update} />));
      const input = host.querySelector('input[accept=".ttf,.otf,.woff,.woff2"]')!;
      Object.defineProperty(input, "files", { value: [{ name: "AuditEnvelope.ttf", arrayBuffer: async () => bytes().buffer }] });
      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(update).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });
});

