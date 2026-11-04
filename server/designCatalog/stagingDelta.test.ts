import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { compactComponentCard } from "@shared/componentAssembly";
const state = vi.hoisted(() => ({ data: null as any, error: null as any, filters: [] as any[], timeout: false }));
vi.mock("../db", () => ({getDb: () => ({from: (name: string) => {
  expect(name).toBe("catalog_revisions");
  const q = {select: () => q, eq: (key: string,value: string) => { state.filters.push([key,value]); return q; },
    abortSignal: (signal: AbortSignal) => {state.timeout=signal instanceof AbortSignal; return q;},
    maybeSingle: async () => ({data: state.data,error: state.error})};
  return q;
}})}));
import { catalogStageDeltaRows, readCatalogStagingBase } from "./stagingDelta";
const rows = completeDesignTestDefinitions().map(definition => ({component_id:definition.id,definition_hash:definition.hash,definition,assets:definition.assets,card:compactComponentCard(definition),design_components:{status:"draft",definition_hash:definition.hash,source:definition.source}}));
const compact = ({definition,assets,...row}: typeof rows[number]) => row;
beforeEach(() => {state.data=null;state.error=null;state.filters=[];state.timeout=false;});
describe("staging delta transport", () => {
  it("reuses exact card snapshots and transmits new or changed rows", () => {
    expect(catalogStageDeltaRows(rows,[compact(rows[0])])).toEqual(rows.slice(1));
    expect(catalogStageDeltaRows(rows,rows.map(compact))).toEqual([]);
    const altered=rows.map((row,i)=>i?row:{...row,design_components:{...row.design_components,status:"experimental"}});
    expect(catalogStageDeltaRows(altered,rows.map(compact))).toEqual([altered[0]]);
    const label=rows.map((row,i)=>i?row:{...row,card:{...row.card,label:"Changed"}});
    expect(catalogStageDeltaRows(label,rows.map(compact))).toEqual([label[0]]);
  });
  it("does not silently retain rows omitted from the desired snapshot", () => {
    expect(()=>catalogStageDeltaRows([rows[0]],rows.map(compact))).toThrow("catalog_staging_base_mismatch");
  });
  it("chooses only a base for the read source revision and bounds the GET", async () => {
    state.data={revision:2,source_revision:619,content_hash:"a".repeat(64)};
    expect(await readCatalogStagingBase("619")).toEqual({revision:"2",hash:"a".repeat(64)});
    expect(state.filters).toEqual([["source_revision","619"]]);
    expect(state.timeout).toBe(true);
  });
  it("uses the full protocol only when no immutable base exists, not on read failures", async () => {
    expect(await readCatalogStagingBase("1")).toBeNull();
    state.error={code:"PGRST002"};
    await expect(readCatalogStagingBase("1")).rejects.toEqual(state.error);
    state.error=null;
    state.data={revision:2,source_revision:2,content_hash:"a".repeat(64)};
    await expect(readCatalogStagingBase("1")).rejects.toThrow("catalog_staging_base_invalid");
  });
});
