// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProposalSkeletonCard from "./ProposalSkeletonCard";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ProposalSkeletonCard", () => {
  it("renders shimmer placeholder with correct slot and default running status", () => {
    act(() => {
      root.render(
        <ProposalSkeletonCard
          slot={1}
          aspectRatio="1:1"
          status="running"
        />
      );
    });

    expect(host.textContent).toContain("Opção 01");
    expect(host.textContent).toContain("Sintetizando direção visual...");
    expect(host.textContent).toContain("preparando direção de arte");

    // Elementos com shimmer durante o carregamento ativo
    const shimmers = host.querySelectorAll(".skeleton-shimmer");
    expect(shimmers.length).toBeGreaterThanOrEqual(3);

    // O status acessível
    const statusContainer = host.querySelector('[role="status"]');
    expect(statusContainer).not.toBeNull();
    expect(statusContainer?.getAttribute("aria-label")).toContain("Opção 01");
  });

  it("adjusts stage height based on aspect ratio (1:1 vs 4:5 vs 9:16)", () => {
    act(() => {
      root.render(
        <ProposalSkeletonCard
          slot={2}
          aspectRatio="9:16"
          cardScale={0.72}
        />
      );
    });

    const stage = host.querySelector(".skeleton-shimmer.rounded-2xl") as HTMLElement;
    expect(stage).not.toBeNull();
    // 9:16 height = 640 * 0.72 = 460.8px, width = 360 * 0.72 = 259.2px
    expect(stage.style.width).toBe("259.2px");
    expect(stage.style.height).toBe("460.8px");
  });

  it("ceases shimmer and pulse immediately when generation fails, displaying clear error state", () => {
    const handleRetry = vi.fn();
    act(() => {
      root.render(
        <ProposalSkeletonCard
          slot={3}
          status="failed"
          errorReason="Demora excessiva do provedor"
          onRetry={handleRetry}
        />
      );
    });

    // O brilho e o pulso cessam por completo
    expect(host.querySelectorAll(".skeleton-shimmer")).toHaveLength(0);
    expect(host.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(host.querySelectorAll(".animate-ping")).toHaveLength(0);

    expect(host.textContent).toContain("Não foi possível carregar");
    expect(host.textContent).toContain("Demora excessiva do provedor");
    expect(host.textContent).toContain("geração interrompida");

    const retryBtn = host.querySelector("button");
    expect(retryBtn).not.toBeNull();
    expect(retryBtn?.textContent).toContain("Tentar novamente");

    act(() => retryBtn?.click());
    expect(handleRetry).toHaveBeenCalledOnce();
  });

  it("ceases shimmer when disableShimmer is explicitly requested", () => {
    act(() => {
      root.render(
        <ProposalSkeletonCard
          slot={1}
          status="running"
          disableShimmer={true}
        />
      );
    });

    expect(host.querySelectorAll(".skeleton-shimmer")).toHaveLength(0);
  });
});
