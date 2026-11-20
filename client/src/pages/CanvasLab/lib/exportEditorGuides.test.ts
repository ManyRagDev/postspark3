import { expect, it, vi } from "vitest";
import { withoutEditorGuides } from "./exportEditorGuides";
it("omits selection and guides from capture and restores original visibility even on failure", () => {
  const guide = (initial: boolean) => {
    let shown = initial;
    return {
      visible: (value?: boolean) =>
        value === undefined ? shown : (shown = value),
      hide: () => {
        shown = false;
      },
    };
  };
  const selected = guide(true),
    hidden = guide(false),
    draw = vi.fn();
  const stage = {
    find: (selector: string) =>
      selector === "Transformer" ? [selected] : [hidden],
    getLayers: () => [{ draw }],
  };
  expect(() =>
    withoutEditorGuides(stage, () => {
      expect(selected.visible()).toBe(false);
      expect(hidden.visible()).toBe(false);
      throw new Error("capture failed");
    })
  ).toThrow("capture failed");
  expect(selected.visible()).toBe(true);
  expect(hidden.visible()).toBe(false);
  expect(draw).toHaveBeenCalledTimes(2);
});
