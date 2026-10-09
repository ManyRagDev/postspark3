import { beforeEach, describe, it, expect, vi } from "vitest";
import { componentAssemblyFixture } from "../../shared/componentAssembly.fixture";
import {
  createComponentDefinition,
  compactComponentCard,
} from "../../shared/componentAssembly";
const state = vi.hoisted(() => ({
  pages: [] as any[][],
  calls: [] as any[],
  index: 0,
}));
vi.mock("../db", () => ({
  getDb: () => ({
    from: (table: string) => {
      state.calls.push(["from", table]);
      const q: any = {};
      for (const method of ["select", "eq", "contains", "in", "order", "range"])
        q[method] = (...args: any[]) => {
          state.calls.push([method, ...args]);
          return q;
        };
      q.abortSignal = async () => ({
        data: state.pages[state.index++] ?? [],
        error: null,
      });
      return q;
    },
  }),
}));
import { retrieveCompleteDesignCards } from "./completeDesignStore";
function row(n: number) {
  const c = createComponentDefinition({
    ...componentAssemblyFixture()[0],
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    roles: ["static", "cover", "development", "closing"],
    completeDesign: {
      family: `family-${n % 10}`,
      baselineVerified: true,
      colors: ["#FF0000"],
    },
  });
  return {
    component_id: c.id,
    definition_hash: c.hash,
    card: compactComponentCard(c),
    descriptor: { structure: Array(48).fill(0.1) },
  };
}
const query = {
  aspectRatio: "4:5",
  postMode: "static" as const,
  text: "Uma ideia",
  slideCount: 1,
  experimental: true,
};
beforeEach(() => {
  state.pages = [];
  state.calls = [];
  state.index = 0;
});
describe("whole design catalog retrieval", () => {
  it("paginates compact cards, filters baseline/status and offers finite complete families", async () => {
    state.pages = [Array.from({ length: 100 }, (_, i) => row(i)), [row(100)]];
    const cards = await retrieveCompleteDesignCards(query);
    expect(state.index).toBe(2);
    expect(state.calls).toContainEqual([
      "eq",
      "card->completeDesign->>baselineVerified",
      "true",
    ]);
    expect(state.calls).toContainEqual([
      "in",
      "design_components.status",
      ["draft", "approved"],
    ]);
    expect(new Set(cards.map(c => c.completeDesign?.family)).size).toBe(10);
    expect(
      state.calls
        .filter(c => c[0] === "from")
        .every(c => c[1] === "design_component_search_documents")
    ).toBe(true);
  });
  it("preserves brand requirements by eligibility and never re-colors an incompatible scene", async () => {
    state.pages = [[row(1)]];
    expect(
      await retrieveCompleteDesignCards({
        ...query,
        experimental: false,
        brandColors: ["#00FF00"],
      })
    ).toEqual([]);
    expect(state.calls).toContainEqual([
      "in",
      "design_components.status",
      ["approved"],
    ]);
  });
  it("rejects stale indexed identities", async () => {
    state.pages = [[{ ...row(1), definition_hash: "f".repeat(64) }]];
    await expect(retrieveCompleteDesignCards(query)).rejects.toThrow(
      "complete_design_index_mismatch"
    );
  });
});
