import { describe, expect, it } from "vitest";
import { runStateGraph, type StateGraphDefinition } from "./graphEngine";

describe("graphEngine", () => {
  it("runs nodes through conditional edges", async () => {
    type State = { value: number };
    const definition: StateGraphDefinition<State, undefined> = {
      start: "increment",
      nodes: {
        increment: (state) => ({ value: state.value + 1 }),
        double: (state) => ({ value: state.value * 2 }),
      },
      next: (nodeId, state) => {
        if (nodeId === "increment" && state.value < 2) return "increment";
        if (nodeId === "increment") return "double";
        return null;
      },
    };

    const result = await runStateGraph({
      initialState: { value: 0 },
      definition,
      context: undefined,
    });

    expect(result.visited).toEqual(["increment", "increment", "double"]);
    expect(result.state).toEqual({ value: 4 });
  });

  it("fails fast on missing nodes and transition loops", async () => {
    await expect(
      runStateGraph({
        initialState: {},
        definition: {
          start: "missing",
          nodes: {},
          next: () => null,
        },
        context: undefined,
      }),
    ).rejects.toThrow(/not registered/);

    await expect(
      runStateGraph({
        initialState: {},
        definition: {
          start: "loop",
          maxTransitions: 2,
          nodes: { loop: (state) => state },
          next: () => "loop",
        },
        context: undefined,
      }),
    ).rejects.toThrow(/exceeded 2 transition/);
  });
});
