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
});
