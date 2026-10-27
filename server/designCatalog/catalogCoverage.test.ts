import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertCatalogCoverage } from "@shared/designElection";
import { reconcileCatalogCoverage, retrieveCoveredCatalog } from "./catalogCoverage";
import { electionCatalogFixture, electionCatalogRequest } from "./designElection.fixture";
const state = vi.hoisted(() => ({ snapshots: [] as any[], round:0, reads:[] as any[] }));
vi.mock("../db",()=>({getDb:()=>({from:(table:string)=>{
  const q:any={};let offset=0;
  for(const m of ["select","eq","not","order"]) q[m]=()=>q;
  q.range=(a:number,b:number)=>{offset=a;state.reads.push({table,a,b});return q;};
  q.abortSignal=async()=>{
    if(table==='design_components'&&offset===0)state.round++;
    const snapshot=state.snapshots[Math.min(state.round-1,state.snapshots.length-1)];
    const rows=table==='design_components'?snapshot.registered:snapshot.indexed;
    return {data:rows.slice(offset,offset+100),error:null};
  };return q;
}})}));
beforeEach(()=>{state.snapshots=[];state.round=0;state.reads=[];});
describe("registered catalog coverage",()=>{
  it("finds a registered design absent from the index and blocks complete coverage",()=>{
    const {inventory}=electionCatalogFixture(3);inventory.indexed.pop();
    const r=reconcileCatalogCoverage(electionCatalogRequest,inventory);
    expect(r.coverage.entries.at(-1)).toMatchObject({indexState:"missing",disposition:"blocked",reasons:["index_missing"]});
    expect(()=>assertCatalogCoverage(r.coverage,r.cards)).toThrow('catalog_coverage_incomplete');
  });
  it("accounts for drafts and superseded revisions without reviving an old capability",()=>{
    const {inventory}=electionCatalogFixture(3);
    inventory.registered[1].status='draft';
    inventory.registered[2].source=inventory.registered[0].source;
    inventory.registered[2].design={...inventory.registered[2].design,authorshipRevision:1};
    inventory.registered[2].status='archived';
    const r=reconcileCatalogCoverage(electionCatalogRequest,inventory);
    expect(r.coverage.entries.map(e=>e.reasons)).toEqual([['superseded_authorship'],['draft_not_enabled'],['archived']]);
    expect(r.cards).toEqual([]);expect(()=>assertCatalogCoverage(r.coverage,r.cards)).not.toThrow();
  });
  it("rejects an indexed hash mismatch and detects an ambiguous authored revision",()=>{
    const {inventory}=electionCatalogFixture(3);
    inventory.indexed[0].definition_hash='a'.repeat(64);
    inventory.registered[2].source=inventory.registered[1].source;
    const r=reconcileCatalogCoverage(electionCatalogRequest,inventory);
    expect(r.coverage.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['index_identity_mismatch','authorship_revision_ambiguous']));
    expect(()=>assertCatalogCoverage(r.coverage,r.cards)).toThrow();
  });
  it("paginates both authoritative registrations and index and verifies a stable second read",async()=>{
    state.snapshots=[electionCatalogFixture(101).inventory];
    const r=await retrieveCoveredCatalog(electionCatalogRequest);
    expect(r.coverage.entries).toHaveLength(101);expect(r.cards).toHaveLength(101);
    expect(state.round).toBe(2);expect(state.reads).toHaveLength(8);
    expect(state.reads.some(r=>r.table==='design_components'&&r.a===100)).toBe(true);
    expect(()=>assertCatalogCoverage(r.coverage,r.cards)).not.toThrow();
  });
  it("does not certify a catalog that changes between the two reads",async()=>{
    state.snapshots=[electionCatalogFixture(2).inventory,electionCatalogFixture(3).inventory];
    const r=await retrieveCoveredCatalog(electionCatalogRequest);
    expect(r.coverage.consistency).toBe('changed_during_read');
    expect(()=>assertCatalogCoverage(r.coverage,r.cards)).toThrow('catalog_coverage_incomplete');
  });
});
