import { describe, expect, it } from "vitest";
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
} from "./canvasHistory";

describe("canvasHistory", () => {
  it("initializes history with empty past and future", () => {
    const history = createHistory({ text: "initial" });
    expect(history.present).toEqual({ text: "initial" });
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("pushes new state into past and clears future", () => {
    let history = createHistory({ v: 1 });
    history = pushHistory(history, { v: 2 });

    expect(history.present).toEqual({ v: 2 });
    expect(history.past).toEqual([{ v: 1 }]);
    expect(history.future).toEqual([]);
    expect(canUndo(history)).toBe(true);
    expect(canRedo(history)).toBe(false);

    history = pushHistory(history, { v: 3 });
    expect(history.present).toEqual({ v: 3 });
    expect(history.past).toEqual([{ v: 1 }, { v: 2 }]);
  });

  it("undo restores previous state and moves present to future", () => {
    let history = createHistory({ step: 1 });
    history = pushHistory(history, { step: 2 });
    history = pushHistory(history, { step: 3 });

    history = undoHistory(history);
    expect(history.present).toEqual({ step: 2 });
    expect(history.past).toEqual([{ step: 1 }]);
    expect(history.future).toEqual([{ step: 3 }]);
    expect(canUndo(history)).toBe(true);
    expect(canRedo(history)).toBe(true);

    history = undoHistory(history);
    expect(history.present).toEqual({ step: 1 });
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([{ step: 2 }, { step: 3 }]);
    expect(canUndo(history)).toBe(false);

    // Undo além do limite é no-op
    const noop = undoHistory(history);
    expect(noop).toBe(history);
  });

  it("redo advances to next state in future", () => {
    let history = createHistory({ step: 1 });
    history = pushHistory(history, { step: 2 });
    history = pushHistory(history, { step: 3 });

    history = undoHistory(history);
    history = undoHistory(history);

    history = redoHistory(history);
    expect(history.present).toEqual({ step: 2 });
    expect(history.past).toEqual([{ step: 1 }]);
    expect(history.future).toEqual([{ step: 3 }]);

    history = redoHistory(history);
    expect(history.present).toEqual({ step: 3 });
    expect(history.past).toEqual([{ step: 1 }, { step: 2 }]);
    expect(history.future).toEqual([]);
    expect(canRedo(history)).toBe(false);

    // Redo além do limite é no-op
    const noop = redoHistory(history);
    expect(noop).toBe(history);
  });

  it("pushing new state after undo clears future (branching history)", () => {
    let history = createHistory({ val: "A" });
    history = pushHistory(history, { val: "B" });
    history = pushHistory(history, { val: "C" });

    history = undoHistory(history); // Present: B, Future: [C]
    expect(canRedo(history)).toBe(true);

    history = pushHistory(history, { val: "D" }); // Novo branch: D
    expect(history.present).toEqual({ val: "D" });
    expect(history.past).toEqual([{ val: "A" }, { val: "B" }]);
    expect(history.future).toEqual([]); // Future C foi descartado
    expect(canRedo(history)).toBe(false);
  });

  it("enforces maxDepth limiting memory consumption", () => {
    let history = createHistory({ n: 0 });
    for (let i = 1; i <= 10; i++) {
      history = pushHistory(history, { n: i }, 3); // max 3 no past
    }

    expect(history.past.length).toBe(3);
    expect(history.past).toEqual([{ n: 7 }, { n: 8 }, { n: 9 }]);
    expect(history.present).toEqual({ n: 10 });
  });
});
