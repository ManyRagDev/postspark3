// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CanvasGridOverlay } from "./CanvasGridOverlay";

describe("CanvasGridOverlay", () => {
    let host: HTMLDivElement;

    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        host = document.createElement("div");
        document.body.append(host);
    });

    afterEach(() => {
        host.remove();
        delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    });

    it("renders the 9x9 grid as a non-exportable overlay sibling", async () => {
        const root = createRoot(host);

        await act(async () => {
            root.render(
                <div className="relative">
                    <div data-post-export-root />
                    <CanvasGridOverlay accentColor="#7F56D9" />
                </div>,
            );
        });

        const exportRoot = host.querySelector<HTMLElement>("[data-post-export-root]")!;
        expect(host.querySelector("[data-canvas-grid-overlay]")).not.toBeNull();
        expect(exportRoot.querySelector("[data-canvas-grid-overlay]")).toBeNull();
        expect(host.querySelectorAll("[data-canvas-grid-line='vertical']")).toHaveLength(9);
        expect(host.querySelectorAll("[data-canvas-grid-line='horizontal']")).toHaveLength(9);
        expect(host.querySelectorAll("[data-canvas-grid-point]")).toHaveLength(81);

        await act(async () => root.unmount());
    });
});
