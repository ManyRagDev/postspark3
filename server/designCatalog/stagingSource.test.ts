import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  revisions: ["619", "619"],
  records: [] as any[],
  cursors: [] as (string | undefined)[],
  signals: [] as AbortSignal[],
  error: null as unknown,
  outcomes: {} as Record<string, Array<{ error?: unknown; status?: number; throws?: unknown }>>,
}));
vi.mock("../db", () => ({
  getDb: () => ({
    from: (table: string) => {
      if (table === "catalog_state") return {
        select: () => ({ eq: () => ({ abortSignal: (signal: AbortSignal) => {
          state.signals.push(signal);
          return { single: async () => {
            const outcome = state.outcomes.source?.shift();
            if (outcome?.throws) throw outcome.throws;
            if (outcome?.error) return { data: null, ...outcome };
            return { data: {source_revision: state.revisions.shift()}, error: null };
          } };
        } }) }),
      };
      if (table !== "design_components") throw new Error("unexpected table");
      let cursor: string | undefined;
      const query: any = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        gt: (_field: string, value: string) => { cursor = value; return query; },
        abortSignal: async (signal: AbortSignal) => {
          state.cursors.push(cursor); state.signals.push(signal);
          const outcome = state.outcomes[cursor ?? "first"]?.shift();
          if (outcome?.throws) throw outcome.throws;
          if (outcome?.error) return { data: null, ...outcome };
          return {
            data: state.records.filter(row => !cursor || row.id > cursor).slice(0, 25),
            error: state.error,
          };
        },
      };
      return query;
    },
  }),
}));
import { readCatalogStagingSource } from "./stagingSource";

beforeEach(() => {
  state.revisions = ["619", "619"]; state.records = [];
  state.cursors = []; state.signals = []; state.error = null; state.outcomes = {};
});
const entry = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  definition_hash: "a".repeat(64), status: "draft",
  definition: {completeDesign: {}, source: {kind:"recipe",referenceId:"test"}},
  design_component_search_documents: null,
  design_component_assets: [
    {design_catalog_assets: {manifest: {id:"z",sha256:"last"}}},
    {design_catalog_assets: {manifest: {id:"a",sha256:"first"}}},
  ],
});

describe("bounded staging source read", () => {
  it("reads all pages with a strict cursor, preserves null cards, sorts assets, and excludes non-design components", async () => {
    state.records = Array.from({length: 52}, (_, i) => entry(i));
    state.records[20].definition.completeDesign = null;
    const result = await readCatalogStagingSource();
    expect(state.cursors).toEqual([undefined,entry(24).id,entry(49).id]);
    expect(result.sourceRevision).toBe("619");
    expect(result.rows).toHaveLength(51);
    expect(result.rows[0]).toEqual({
      component_id:entry(0).id,definition_hash:"a".repeat(64),card:null,
      definition:entry(0).definition,assets:[{id:"a",sha256:"first"},{id:"z",sha256:"last"}],
      design_components:{status:"draft",definition_hash:"a".repeat(64),source:entry(0).definition.source},
    });
    expect(state.signals).toHaveLength(5);
    expect(state.signals.every(signal => signal instanceof AbortSignal)).toBe(true);
  });
  it("rejects a source that changed during pagination instead of handing mixed rows to staging", async () => {
    state.records = [entry(0)]; state.revisions = ["619", "620"];
    state.outcomes.first = [{error:{code:"PGRST002",message:"Schema cache unavailable"},status:503}];
    await expect(readCatalogStagingSource()).rejects.toThrow("catalog_publication_conflict");
    expect(state.cursors).toEqual([undefined, undefined]);
  });
  it("stops after the one permitted retry of a page and does not return a partial catalog", async () => {
    state.records = [entry(0)]; state.error = new Error("TimeoutError");
    await expect(readCatalogStagingSource()).rejects.toThrow("TimeoutError");
    expect(state.revisions).toEqual(["619"]);
    expect(state.cursors).toEqual([undefined, undefined]);
  });
  it.each([
    { label: "thrown timeout", outcome: {throws: new DOMException("Deadline expired", "TimeoutError")} },
    { label: "thrown fetch failure", outcome: {throws: new TypeError("fetch failed")} },
    { label: "returned timeout", outcome: {error:{message:"TimeoutError: The operation was aborted due to timeout"},status:0} },
    { label: "HTTP 502", outcome: {error:{message:"Bad Gateway"},status:502} },
    { label: "PostgREST unavailable", outcome: {error:{code:"PGRST002",message:"Schema cache unavailable"},status:503} },
    { label: "PostgREST without HTTP status", outcome: {error:{code:"PGRST002",message:"Schema cache unavailable"}} },
  ])("recovers a $label once using a fresh signal without skipping or duplicating a page", async ({outcome}) => {
    state.records = [entry(0)]; state.outcomes.first = [outcome];
    const result = await readCatalogStagingSource();
    expect(result.rows.map(row=>row.component_id)).toEqual([entry(0).id]);
    expect(state.cursors).toEqual([undefined,undefined]);
    expect(state.signals).toHaveLength(4);
    expect(new Set(state.signals).size).toBe(4);
    expect(state.revisions).toEqual([]);
  });
  it("does not retry HTTP 401, even with a transient-looking error message", async () => {
    const failure = {message:"fetch failed",code:"PGRST002"};
    state.outcomes.first = [{error:failure,status:401}];
    await expect(readCatalogStagingSource()).rejects.toBe(failure);
    expect(state.cursors).toEqual([undefined]);
    expect(state.revisions).toEqual(["619"]);
  });
  it("shares at most four extra attempts across the source bookends and all pages", async () => {
    const failure = {code:"PGRST002",message:"Schema cache unavailable"};
    const transient = () => [{error:failure,status:503}];
    state.records = Array.from({length:100},(_,i)=>entry(i));
    state.outcomes = {source:transient(),first:transient(),[entry(24).id]:transient(),[entry(49).id]:transient(),[entry(74).id]:transient()};
    await expect(readCatalogStagingSource()).rejects.toBe(failure);
    expect(state.cursors).toEqual([undefined,undefined,entry(24).id,entry(24).id,entry(49).id,entry(49).id,entry(74).id]);
    expect(state.signals).toHaveLength(9);
    expect(new Set(state.signals).size).toBe(9);
    expect(state.revisions).toEqual(["619"]);
  });
  it("rejects missing asset relations and ambiguous indexed cards", async () => {
    state.records = [{...entry(0),design_component_assets:[{design_catalog_assets:null}]}];
    await expect(readCatalogStagingSource()).rejects.toThrow("catalog_snapshot_assets_mismatch");
    state.revisions = ["619", "619"];
    state.records = [{...entry(0),design_component_search_documents:[{card:{}},{card:{}}]}];
    await expect(readCatalogStagingSource()).rejects.toThrow("catalog_snapshot_relation_invalid");
  });
});
