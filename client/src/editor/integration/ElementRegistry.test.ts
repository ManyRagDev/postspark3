import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { ElementRegistry, type RegisteredInteractiveElement } from "./ElementRegistry";

const entry = (id: "headline" | "body"): RegisteredInteractiveElement => ({
  id,
  kind: "block",
  nodeRef: createRef<HTMLElement>(),
  handlePolicy: "horizontal",
  accentColor: "#fff",
  snapEligible: true,
  getPositioningContainer: node => node,
  resolveInitialGeometry: context => ({
    id,
    kind: "block",
    rect: context.measuredDocumentRect,
    rotationDeg: 0,
  } as ReturnType<RegisteredInteractiveElement["resolveInitialGeometry"]>),
  resolveConstraints: () => ({}),
});

describe("ElementRegistry", () => {
  it("registers, locates and cleans up stable element identities", () => {
    const registry = new ElementRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const unregister = registry.register(entry("headline"));
    expect(registry.get("headline")?.kind).toBe("block");
    expect(registry.values()).toHaveLength(1);
    unregister();
    expect(registry.get("headline")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not let stale cleanup remove a replacement registration", () => {
    const registry = new ElementRegistry();
    const staleCleanup = registry.register(entry("body"));
    const replacement = entry("body");
    registry.register(replacement);
    staleCleanup();
    expect(registry.get("body")).toBe(replacement);
  });
});
