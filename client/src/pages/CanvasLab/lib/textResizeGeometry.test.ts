import { describe, expect, it } from "vitest";
import {
  computeTextResizeGeometry,
  finalizeTextResizeGeometry,
  type TextResizeSession,
} from "./textResizeGeometry";

const rightSession: TextResizeSession = {
  anchor: "middle-right",
  pointerStartX: 300,
  initialX: 24,
  initialY: 80,
  initialWidth: 200,
  minWidth: 40,
};

describe("textResizeGeometry", () => {
  it("keeps the left edge fixed and grows monotonically from the right handle", () => {
    const frames = [300, 310.25, 325.5, 349.75].map(pointerX =>
      computeTextResizeGeometry(rightSession, pointerX)
    );

    expect(frames.map(frame => frame.x)).toEqual([24, 24, 24, 24]);
    expect(frames.map(frame => frame.width)).toEqual([200, 210.25, 225.5, 249.75]);
  });

  it("keeps the right edge fixed when resizing from the left handle", () => {
    const session: TextResizeSession = {
      ...rightSession,
      anchor: "middle-left",
      pointerStartX: 24,
    };
    const frames = [24, 12.5, -8].map(pointerX =>
      computeTextResizeGeometry(session, pointerX)
    );

    expect(frames.map(frame => frame.x + frame.width)).toEqual([224, 224, 224]);
    expect(frames.map(frame => frame.width)).toEqual([200, 211.5, 232]);
  });

  it("clamps at the minimum without moving the fixed edge or bouncing", () => {
    const frames = [440, 470, 520].map(pointerX =>
      computeTextResizeGeometry(rightSession, pointerX)
    );

    expect(frames.map(frame => frame.width)).toEqual([340, 370, 420]);

    const leftSession: TextResizeSession = {
      ...rightSession,
      anchor: "middle-left",
      pointerStartX: 24,
    };
    const clamped = [190, 210, 250].map(pointerX =>
      computeTextResizeGeometry(leftSession, pointerX)
    );
    expect(clamped.map(frame => frame.width)).toEqual([40, 40, 40]);
    expect(clamped.map(frame => frame.x + frame.width)).toEqual([224, 224, 224]);
  });

  it("returns to the original geometry after an out-and-back gesture", () => {
    const expanded = computeTextResizeGeometry(rightSession, 360);
    const restored = computeTextResizeGeometry(rightSession, 300);

    expect(expanded.width).toBe(260);
    expect(restored).toEqual({ x: 24, y: 80, width: 200 });
  });

  it("keeps subpixel precision during the gesture and rounds only on commit", () => {
    const live = computeTextResizeGeometry(rightSession, 312.625);
    expect(live.width).toBe(212.625);
    expect(finalizeTextResizeGeometry(live)).toEqual({ x: 24, y: 80, width: 213 });
  });

  it("does not depend on any previous frame", () => {
    const direct = computeTextResizeGeometry(rightSession, 340);
    computeTextResizeGeometry(rightSession, 315);
    computeTextResizeGeometry(rightSession, 328);
    const repeated = computeTextResizeGeometry(rightSession, 340);

    expect(repeated).toEqual(direct);
  });

  describe("four corner proportional resizing", () => {
    const cornerSession: TextResizeSession = {
      anchor: "bottom-right",
      pointerStartX: 224,
      pointerStartY: 180,
      initialX: 24,
      initialY: 80,
      initialWidth: 200,
      initialHeight: 100,
      initialScale: 1.0,
      initialFontSize: 30,
      minWidth: 40,
    };

    it("proportionally scales width, height, scale, and fontSize from bottom-right handle keeping top-left fixed", () => {
      // 1.5x expansion: factor = 1.5 -> width=300, height=150, scale=1.5, fontSize=45
      // top-left fixed at (24, 80)
      const res = computeTextResizeGeometry(cornerSession, 324);
      expect(res.x).toBe(24);
      expect(res.y).toBe(80);
      expect(res.width).toBe(300);
      expect(res.height).toBe(150);
      expect(res.scale).toBe(1.5);
      expect(res.fontSize).toBe(45);
    });

    it("proportionally scales from top-left handle keeping bottom-right fixed", () => {
      // initial bottom-right is (24 + 200, 80 + 100) = (224, 180)
      const session: TextResizeSession = {
        ...cornerSession,
        anchor: "top-left",
        pointerStartX: 24,
        pointerStartY: 80,
      };
      // Moving left by 100px (factor = 1.5)
      const res = computeTextResizeGeometry(session, -76);
      expect(res.width).toBe(300);
      expect(res.height).toBe(150);
      expect(res.x).toBe(-76);
      expect(res.y).toBe(30);
      // Verify bottom-right remains exactly (224, 180)
      expect(res.x + res.width).toBe(224);
      expect((res.y ?? 0) + (res.height ?? 0)).toBe(180);
      expect(res.scale).toBe(1.5);
      expect(res.fontSize).toBe(45);
    });

    it("proportionally scales from top-right handle keeping bottom-left fixed", () => {
      // initial bottom-left is (24, 80 + 100) = (24, 180)
      const session: TextResizeSession = {
        ...cornerSession,
        anchor: "top-right",
        pointerStartX: 224,
        pointerStartY: 80,
      };
      // Moving right by 100px (factor = 1.5)
      const res = computeTextResizeGeometry(session, 324);
      expect(res.width).toBe(300);
      expect(res.height).toBe(150);
      expect(res.x).toBe(24); // left edge unchanged
      expect((res.y ?? 0) + (res.height ?? 0)).toBe(180); // bottom edge unchanged
      expect(res.scale).toBe(1.5);
      expect(res.fontSize).toBe(45);
    });

    it("proportionally scales from bottom-left handle keeping top-right fixed", () => {
      // initial top-right is (24 + 200, 80) = (224, 80)
      const session: TextResizeSession = {
        ...cornerSession,
        anchor: "bottom-left",
        pointerStartX: 24,
        pointerStartY: 180,
      };
      // Moving left by 100px (factor = 1.5)
      const res = computeTextResizeGeometry(session, -76);
      expect(res.width).toBe(300);
      expect(res.height).toBe(150);
      expect(res.x + res.width).toBe(224); // right edge unchanged
      expect(res.y).toBe(80); // top edge unchanged
      expect(res.scale).toBe(1.5);
      expect(res.fontSize).toBe(45);
    });

    it("clamps corner resize at minimum width without moving fixed corner", () => {
      const res = computeTextResizeGeometry(cornerSession, -500); // extreme shrink
      expect(res.width).toBe(40);
      expect(res.height).toBe(20); // 40 / 200 * 100
      expect(res.x).toBe(24);
      expect(res.y).toBe(80);
      expect(res.scale).toBe(0.2);
      expect(res.fontSize).toBe(6);
    });
  });
});
