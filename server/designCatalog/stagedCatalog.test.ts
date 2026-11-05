import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeDesignTestDefinitions } from "@shared/completeDesignGeneration.fixture";
import { createComponentDefinition, compactComponentCard } from "@shared/componentAssembly";
import { arsenalHash } from "@shared/arsenalContent";
import { ENV } from "../_core/env";
const retrieval = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("./familySearchIndex", () => ({ prepareCatalogSearchIndex: retrieval.prepare }));
vi.mock("node:fs/promises", () => ({mkdir:vi.fn(),writeFile:vi.fn(),rename:vi.fn(),readFile:vi.fn(async()=>{throw new Error("ENOENT");})}));
vi.mock("./stagingDelta", async (importOriginal) => ({
  ...await importOriginal<typeof import("./stagingDelta")>(),
  readCatalogStagingBase: async () => state.base,
}));
const state = vi.hoisted(() => ({calls: [] as Array<{name: string; args: any}>, assets: [] as any[], rows: [] as any[], writes: 0, assetReads: 0, assetError: null as any,base:null as any,baseRows:[] as any[]}));
vi.mock("./stagingSource", () => ({readCatalogStagingSource: async () => {
  state.calls.push({name:"readCatalogStagingSource",args:undefined});
  return {sourceRevision:"7",rows:state.rows};
}}));
vi.mock("../db", () => ({getDb: () => ({
  rpc: async (name: string,args: any) => {
    state.calls.push({name,args});
    if(name==="catalog_staged_snapshot")return {data:{sourceRevision:"7",rows:state.rows}};
    if(name==="catalog_stage" || name==="catalog_stage_delta")return {data:8};
    if(name==="catalog_activate")return {data:args.p_revision};
    throw new Error(`unexpected RPC ${name}`);
  },
  from: () => ({select: () => ({eq: () => ({single:async()=>({data:{snapshot:{rows:state.baseRows},content_hash:arsenalHash({rows:state.baseRows})}})}),in: async () => {state.assetReads++;return {data:state.assets.map(manifest => ({id:manifest.id,manifest})),error:state.assetError};}}),upsert: () => {state.writes++;throw new Error("live write forbidden");}}),
})}));
import { withCatalogStaging, activateCatalogRevision, publishCatalog } from "./versionedCatalog";
import { prepareComponentDraft } from "./componentStore";
beforeEach(() => {state.calls=[];state.assets=[];state.rows=[];state.writes=0;state.assetReads=0;state.assetError=null;state.base=null;state.baseRows=[];});
describe("atomic staged catalog importer", () => {
  it("publishes through staging with SQL structural indexes before search preparation and activation", async () => {
    const prior = ENV.designRetrievalDirectory;
    ENV.designRetrievalDirectory = "/local/retrieval";
    try {
      const definition = completeDesignTestDefinitions()[0];
      state.rows = [{component_id:definition.id,definition_hash:definition.hash,definition,card:compactComponentCard(definition),assets:definition.assets,design_components:{status:"approved",definition_hash:definition.hash,source:definition.source}}];
      retrieval.prepare.mockImplementation(async (revision: string) => { state.calls.push({name:"search_index",args:revision}); });
      await publishCatalog();
      expect(state.calls.map(c => c.name)).toEqual(["catalog_staged_snapshot", "catalog_stage", "search_index", "catalog_activate"]);
      expect(state.calls[1].args.p_indexes[definition.id].descriptor.structure).toHaveLength(48);
    } finally { ENV.designRetrievalDirectory = prior; retrieval.prepare.mockReset(); }
  });
  it("prepares search before activation and leaves the active revision alone on index failure", async () => {
    const prior = ENV.designRetrievalDirectory;
    ENV.designRetrievalDirectory = "/local/retrieval";
    try {
      retrieval.prepare.mockImplementation(async (revision: string) => { state.calls.push({name:"search_index",args:revision}); });
      await activateCatalogRevision("8");
      expect(state.calls.map(c => c.name)).toEqual(["search_index", "catalog_activate"]);
      state.calls = [];
      retrieval.prepare.mockRejectedValueOnce(new Error("index unavailable"));
      await expect(activateCatalogRevision("9")).rejects.toThrow("index unavailable");
      expect(state.calls).toHaveLength(0);
    } finally { ENV.designRetrievalDirectory = prior; retrieval.prepare.mockReset(); }
  });
  it("automatically indexes a staged publication without activating it", async () => {
    const prior = ENV.designRetrievalDirectory;
    ENV.designRetrievalDirectory = "/local/retrieval";
    try {
      retrieval.prepare.mockImplementation(async (revision: string) => { state.calls.push({name:"search_index",args:revision}); });
      await withCatalogStaging(async () => {});
      expect(state.calls.map(c => c.name)).toEqual(["readCatalogStagingSource", "catalog_stage", "search_index"]);
      expect(state.calls[2].args).toBe("8");
    } finally { ENV.designRetrievalDirectory = prior; retrieval.prepare.mockReset(); }
  });
  it("uses the immutable base for transport, preserving full snapshot hash and newly computed indexes", async () => {
    const definitions=completeDesignTestDefinitions().slice(0,2).map((source,i)=>createComponentDefinition({...source,source:{...source.source,variantKey:`delta-test-${i}`},assets:source.assets.map(a=>({...a,kind:"catalog" as const}))}));
    const row=(definition: typeof definitions[number])=>({component_id:definition.id,definition_hash:definition.hash,definition,card:compactComponentCard(definition),assets:[...definition.assets].sort((a,b)=>a.id.localeCompare(b.id)),design_components:{status:"draft",definition_hash:definition.hash,source:definition.source}});
    state.rows=[row(definitions[0])];
    const {definition,assets,...cardRow}=state.rows[0];
    state.baseRows=[cardRow];
    state.base={revision:"123456",hash:arsenalHash({rows:state.baseRows})};
    await withCatalogStaging(async()=>{for(const d of definitions) await prepareComponentDraft(d,"11111111-1111-4111-8111-111111111111");});
    const {args}=state.calls.find(c=>c.name==="catalog_stage_delta")!;
    expect(args.p_rows).toEqual([row(definitions[1])]);
    expect(args.p_base_revision).toBe(state.base.revision);
    expect(args.p_base_hash).toBe(state.base.hash);
    expect(args.p_components.map((p:any)=>p.definition.id)).toEqual([definitions[1].id]);
    expect(Object.keys(args.p_indexes).sort()).toEqual(definitions.map(d=>d.id).sort());
    expect(args.p_hash).toBe(arsenalHash({rows:definitions.map(row).map(({definition,assets,...r})=>r).sort((a,b)=>a.component_id.localeCompare(b.component_id))}));
    expect(state.writes).toBe(0);
  });
  it("ordinary preparation propagates an asset API failure and distinguishes a missing asset before any write", async () => {
    const source = completeDesignTestDefinitions()[0];
    const definition = createComponentDefinition({...source,assets:source.assets.map(a=>({...a,kind:"catalog" as const}))});
    expect(definition.assets.length).toBeGreaterThan(0);
    state.assetError = {code:"PGRST002",message:"Schema cache unavailable"};
    const prepare = () => prepareComponentDraft(definition,"11111111-1111-4111-8111-111111111111");
    await expect(prepare()).rejects.toEqual(state.assetError);
    state.assetError = null;
    await expect(prepare()).rejects.toThrow("Assets não verificados antes do import");
    expect(state.assetReads).toBe(2);
    expect(state.calls).toHaveLength(0);
    expect(state.writes).toBe(0);
  });
  it("buffers component registration without per-component asset reads and submits assets for atomic stage verification", async () => {
    const source = completeDesignTestDefinitions()[0];
    const definition = createComponentDefinition({...source,assets:source.assets.map(a=>({...a,kind:"catalog" as const}))});
    state.assetError = {code:"PGRST002",message:"Individual asset reads must not run"};
    const result = await withCatalogStaging(async () => {
      await prepareComponentDraft(definition,"11111111-1111-4111-8111-111111111111");
      expect(state.calls).toHaveLength(0); expect(state.writes).toBe(0); return definition.id;
    });
    expect(result).toEqual({result:definition.id,revision:"8"});
    expect(state.calls.map(c=>c.name)).toEqual(["readCatalogStagingSource","catalog_stage"]);
    expect(state.calls[1].args.p_components[0].definition).toEqual(definition);
    expect(state.calls[1].args.p_components[0].definition.assets).toEqual(definition.assets);
    expect(state.assetReads).toBe(0);
    expect(state.calls[1].args.p_rows[0].card.hash).toBe(definition.hash);
    expect(state.calls[1].args.p_indexes[definition.id].descriptor.structure).toHaveLength(48);
    expect(state.writes).toBe(0);
  });
  it("reuses an identical existing definition without retransmitting registration and rejects conflicting reuse", async () => {
    const source = completeDesignTestDefinitions()[0];
    const definition = createComponentDefinition({...source,assets:source.assets.map(a=>({...a,kind:"catalog" as const}))});
    state.assets = definition.assets;
    const row = {component_id: definition.id,definition_hash: definition.hash,definition,card: null,assets: definition.assets,design_components:{status:"draft",definition_hash:definition.hash,source:definition.source}};
    state.rows = [row];
    await withCatalogStaging(() => prepareComponentDraft(definition,"11111111-1111-4111-8111-111111111111"));
    const stage = state.calls.find(c => c.name === "catalog_stage")!.args;
    expect(stage.p_components).toEqual([]);
    expect(stage.p_rows).toEqual([{...row,card:compactComponentCard(definition)}]);
    expect(stage.p_indexes[definition.id].descriptor.structure).toHaveLength(48);
    state.calls = [];
    state.rows = [{...row,definition:{...definition,label:"conflict"}}];
    await expect(withCatalogStaging(() => prepareComponentDraft(definition,"11111111-1111-4111-8111-111111111111"))).rejects.toThrow("catalog_staged_component_conflict");
    expect(state.calls.map(c => c.name)).toEqual(["readCatalogStagingSource"]);
    expect(state.writes).toBe(0);
  });
  it("does not publish a partial batch after validation fails and activates only on explicit request", async () => {
    await expect(withCatalogStaging(async()=>{throw new Error("bad component");})).rejects.toThrow("bad component");
    expect(state.calls).toHaveLength(0);
    expect(await activateCatalogRevision("8")).toBe("8");
    expect(state.calls.map(c=>c.name)).toEqual(["catalog_activate"]);
  });
});
