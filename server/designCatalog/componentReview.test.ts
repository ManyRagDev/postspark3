import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({hash:"a".repeat(64),inserted:[] as unknown[],error:null as null|Error}));
vi.mock("../db",()=>({getDb:()=>({from:(table:string)=>{
 if(table==="design_components")return {select:()=>({eq:()=>({single:async()=>({data:{definition_hash:state.hash},error:null})})})};
 if(table==="design_component_evidence")return {insert:async(value:unknown)=>{state.inserted.push(value);return {error:state.error};}};
 throw new Error(`unexpected table: ${table}`);
}})}));
import { effectiveComponentReview, recordAgentComponentReview } from "./componentStore";
const actor="00000000-0000-4000-8000-000000000001",id="00000000-0000-4000-8000-000000000002",hash="a".repeat(64);
const input={id,hash,pngHash:"b".repeat(64),briefingHash:"c".repeat(64),decision:"approved" as const,reviewer:"Codex gpt-6.1-sol",notes:"Rendered PNG reviewed against the supplied brief."};
beforeEach(()=>{state.hash=hash;state.inserted=[];state.error=null;});
describe("internal agent review evidence",()=>{
 it("records honest attribution separately from human review",async()=>{
  await recordAgentComponentReview(input,actor);
  expect(state.inserted).toEqual([{component_id:id,definition_hash:hash,kind:"agent_visual",decision:"approved",png_hash:input.pngHash,briefing_hash:input.briefingHash,actor_id:actor,metrics:{source:"agent_visual_review",reviewer:input.reviewer,notes:input.notes}}]);
 });
 it("refuses stale evidence and invalid artifact hashes or actor",async()=>{
  state.hash="d".repeat(64);await expect(recordAgentComponentReview(input,actor)).rejects.toThrow("Prévia");state.hash=hash;
  await expect(recordAgentComponentReview({...input,pngHash:"missing"},actor)).rejects.toThrow();
  await expect(recordAgentComponentReview({...input,reviewer:" "},actor)).rejects.toThrow();
  await expect(recordAgentComponentReview(input,"anonymous")).rejects.toThrow();expect(state.inserted).toEqual([]);
 });
 it("propagates an evidence insert failure",async()=>{state.error=new Error("database rejected evidence");await expect(recordAgentComponentReview(input,actor)).rejects.toThrow("database rejected");});
});
describe("effective catalogue review summary",()=>{
 const row=(kind:"human"|"agent_visual",decision:"approved"|"rejected",created_at:string,definition_hash=hash)=>({id:created_at,component_id:id,definition_hash,kind,decision,created_at});
 it("shows a current agent review when no human review exists",()=>{const agent=row("agent_visual","approved","2026-10-09T12:00:00Z");expect(effectiveComponentReview([agent],id,hash)).toEqual(agent);});
 it("prioritizes the latest human rejection over newer agent approval",()=>{const human=row("human","rejected","2026-10-09T11:00:00Z");expect(effectiveComponentReview([row("human","approved","2026-10-09T10:00:00Z"),row("agent_visual","approved","2026-10-09T12:00:00Z"),human],id,hash)).toEqual(human);});
 it("uses the latest agent rejection and ignores different document hashes",()=>{const rejected=row("agent_visual","rejected","2026-10-09T12:00:00Z");expect(effectiveComponentReview([row("agent_visual","approved","2026-10-09T10:00:00Z"),row("human","approved","2026-10-09T13:00:00Z","d".repeat(64)),rejected],id,hash)).toEqual(rejected);expect(effectiveComponentReview([],id,hash)).toBeNull();});
});
