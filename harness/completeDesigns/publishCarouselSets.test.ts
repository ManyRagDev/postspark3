import {describe,it,expect,vi} from "vitest";
const db=vi.hoisted(()=>({called:vi.fn(()=>{throw new Error("remote_access_forbidden_in_test");})}));
vi.mock("../../server/db",()=>({getDb:db.called}));
import {publishCuratedCarouselSets} from "./publishCarouselSets";
describe("operator publication preflight",()=>{
 it("cannot write from an incomplete preflight, even with an approved-looking manifest",async()=>{
  await expect(publishCuratedCarouselSets({root:"/tmp",manifest:{version:2,rows:[]},confirmedProjectRef:"confirmed",preflight:async()=>({projectRef:"confirmed"} as any)})).rejects.toThrow();expect(db.called).not.toHaveBeenCalled();
 });
 it("rejects mismatched reader/worker versions before any catalog access",async()=>{
  await expect(publishCuratedCarouselSets({root:"/tmp",manifest:{version:2,rows:[]},confirmedProjectRef:"confirmed",preflight:async()=>({projectRef:"confirmed",schema:"postspark",actorId:"11111111-1111-4111-8111-111111111111",admissionPaused:true,activeRequestIds:[],immutableDefinitionsConfirmed:true,humanReviewPrecedenceConfirmed:true,publicationGateConfirmed:true,readersCodeVersion:"new",workerCodeVersion:"old",inspectedAt:Date.now()})})).rejects.toThrow("context_unconfirmed");expect(db.called).not.toHaveBeenCalled();
 });
});
