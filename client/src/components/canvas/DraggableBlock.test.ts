import { describe, expect, it } from "vitest";
import { resolveLayoutStyle } from "./DraggableBlock";

describe("DraggableBlock layout resolution", () => {
  it("keeps wide absolute blocks inside the canvas horizontally", () => {
    const style = resolveLayoutStyle(
      {
        position: "top-left",
        textAlign: "left",
        freePosition: { x: 8, y: 58 },
        width: 84,
      },
      24,
    );

    expect(style).toMatchObject({
      position: "absolute",
      left: "42%",
      top: "58%",
      transform: "translate(-50%, -50%)",
    });
  });

  it("does not move centered absolute blocks that already fit", () => {
    const style = resolveLayoutStyle(
      {
        position: "center",
        textAlign: "center",
        freePosition: { x: 50, y: 30 },
        width: 40,
      },
      24,
    );

    expect(style.left).toBe("50%");
  });
});
