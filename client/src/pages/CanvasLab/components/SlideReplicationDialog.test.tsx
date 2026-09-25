// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { INITIAL_POST } from "./types";
import SlideReplicationDialog from "./SlideReplicationDialog";

describe("SlideReplicationDialog", () => {
  it("exige propriedades e destinos antes de aplicar", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onApply = vi.fn();
    const post = {
      ...INITIAL_POST,
      slides: [
        { id: "a", step: "1", headline: "Origem", subtext: "" },
        { id: "b", step: "2", headline: "Destino", subtext: "" },
      ],
    };
    act(() => root.render(<SlideReplicationDialog open post={post} onOpenChange={vi.fn()} onApply={onApply} />));
    const button = (name: string) => Array.from(document.querySelectorAll("button")).find(item => item.textContent?.includes(name)) as HTMLButtonElement;
    expect(button("Escolher slides").disabled).toBe(true);
    const font = Array.from(document.querySelectorAll("label")).find(item => item.textContent?.includes("Família tipográfica"));
    act(() => (font?.querySelector("input") as HTMLInputElement).click());
    expect(button("Escolher slides").disabled).toBe(false);
    act(() => button("Escolher slides").click());
    expect(button("Aplicar aos 0 slides").disabled).toBe(true);
    act(() => (document.querySelector('button[aria-label="Slide 2: Destino"]') as HTMLButtonElement).click());
    act(() => button("Aplicar ao 1 slide").click());
    expect(onApply).toHaveBeenCalledWith(["font"], [1]);
    act(() => root.unmount());
    host.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });
});
