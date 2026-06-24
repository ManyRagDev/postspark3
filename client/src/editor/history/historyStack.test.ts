import { describe, expect, it } from "vitest";
import {
  createHistoryStack,
  pushTransaction,
  undo,
  redo,
  canUndo,
  canRedo,
  clearHistory,
  MAX_HISTORY_SIZE,
} from "./historyStack";

describe("historyStack", () => {
  it("starts empty", () => {
    const stack = createHistoryStack();
    expect(stack.past).toEqual([]);
    expect(stack.future).toEqual([]);
    expect(canUndo(stack)).toBe(false);
    expect(canRedo(stack)).toBe(false);
  });

  it("pushes a transaction", () => {
    let stack = createHistoryStack();
    stack = pushTransaction(stack, { a: 1 }, { a: 2 }, "test");
    expect(stack.past).toHaveLength(1);
    expect(stack.future).toHaveLength(0);
    expect(canUndo(stack)).toBe(true);
    expect(canRedo(stack)).toBe(false);
  });

  it("push clears future", () => {
    let stack = createHistoryStack();
    stack = pushTransaction(stack, { a: 1 }, { a: 2 }, "first");
    stack = pushTransaction(stack, { a: 2 }, { a: 3 }, "second");
    const undone = undo(stack);
    expect(undone).not.toBeNull();
    expect(undone!.past).toHaveLength(1);
    expect(undone!.future).toHaveLength(1);

    const afterPush = pushTransaction(undone!, { a: 3 }, { a: 4 }, "third");
    expect(afterPush.past).toHaveLength(2);
    expect(afterPush.future).toHaveLength(0);
  });

  it("undo restores previous state", () => {
    let stack = createHistoryStack();
    stack = pushTransaction(stack, { v: 1 }, { v: 2 }, "initial");
    stack = pushTransaction(stack, { v: 2 }, { v: 3 }, "edit");

    const result = undo(stack);
    expect(result).not.toBeNull();
    expect(result!.past).toHaveLength(1);
    expect(result!.future).toHaveLength(1);
    expect(result!.past[0].label).toBe("initial");
  });

  it("redo restores future state", () => {
    let stack = createHistoryStack();
    stack = pushTransaction(stack, { v: 1 }, { v: 2 }, "initial");
    stack = pushTransaction(stack, { v: 2 }, { v: 3 }, "edit");

    let undone = undo(stack)!;
    expect(undone.past).toHaveLength(1);

    const redone = redo(undone);
    expect(redone).not.toBeNull();
    expect(redone!.past).toHaveLength(2);
    expect(redone!.future).toHaveLength(0);
  });

  it("canUndo and canRedo reflect stack state", () => {
    let stack = createHistoryStack();
    expect(canUndo(stack)).toBe(false);
    expect(canRedo(stack)).toBe(false);

    stack = pushTransaction(stack, { v: 1 }, { v: 2 }, "test");
    expect(canUndo(stack)).toBe(true);
    expect(canRedo(stack)).toBe(false);

    const undone = undo(stack)!;
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);
  });

  it("undo on empty returns null", () => {
    const stack = createHistoryStack();
    expect(undo(stack)).toBeNull();
  });

  it("redo on empty returns null", () => {
    const stack = createHistoryStack();
    expect(redo(stack)).toBeNull();
  });

  it("enforces max history size", () => {
    let stack = createHistoryStack();
    for (let i = 0; i < MAX_HISTORY_SIZE + 10; i++) {
      stack = pushTransaction(stack, { v: i }, { v: i + 1 }, `step-${i}`);
    }
    expect(stack.past).toHaveLength(MAX_HISTORY_SIZE);
    expect(stack.past[0].label).toBe("step-10");
    expect(stack.past[stack.past.length - 1].label).toBe(`step-${MAX_HISTORY_SIZE + 9}`);
  });

  it("clearHistory resets everything", () => {
    let stack = createHistoryStack();
    stack = pushTransaction(stack, { v: 1 }, { v: 2 }, "test");
    stack = pushTransaction(stack, { v: 2 }, { v: 3 }, "test2");

    const cleared = clearHistory();
    expect(cleared.past).toHaveLength(0);
    expect(cleared.future).toHaveLength(0);
    expect(canUndo(cleared)).toBe(false);
    expect(canRedo(cleared)).toBe(false);
  });

  it("preserves beforeSnapshot and afterSnapshot", () => {
    let stack = createHistoryStack();
    const before = { headline: "old", body: "old body" };
    const after = { headline: "new", body: "new body" };
    stack = pushTransaction(stack, before, after, "edit headline");

    expect(stack.past[0].beforeSnapshot).toEqual(before);
    expect(stack.past[0].afterSnapshot).toEqual(after);

    const undone = undo(stack)!;
    expect(undone.future[0].beforeSnapshot).toEqual(before);
    expect(undone.future[0].afterSnapshot).toEqual(after);
  });
});
