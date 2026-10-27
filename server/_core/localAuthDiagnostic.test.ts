import { beforeEach, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "@shared/const";
const state=vi.hoisted(()=>({enabled:true,write:vi.fn(async(_runId:string,_event:Record<string,unknown>)=>{})}));
vi.mock("../ai/localDiagnostics",()=>({localDiagnosticsEnabled:()=>state.enabled,writeLocalDiagnostic:state.write}));
import { recordLocalAuth } from "./localAuthDiagnostic";
beforeEach(()=>{state.enabled=true;state.write.mockClear();});
it("correlates a bridge with its cookie without persisting tokens, credentials or URL query parameters",()=>{
 const token="private-session-token";
 recordLocalAuth({headers:{cookie:`${COOKIE_NAME}=${token}`,"x-postspark-auth-bridge":"shared",origin:"http://localhost:3000",referer:"http://localhost:3000/auth/google-callback?code=private-oauth-code#private-fragment"},hostname:"localhost",originalUrl:"/api/auth/supabase-session?secret=private-query"} as any,"bridge.received",token);
 expect(state.write).toHaveBeenCalledWith("auth-session",expect.objectContaining({cookiePresent:true,cookieMatchesToken:true,sessionFingerprint:expect.stringMatching(/^[a-f0-9]{16}$/),bridge:"shared",route:"/api/auth/supabase-session",referrerPath:"/auth/google-callback"}));
 const saved=JSON.stringify(state.write.mock.calls);
 for(const secret of [token,"private-oauth-code","private-fragment","private-query"]) expect(saved).not.toContain(secret);
});
it("leaves production unchanged and distinguishes a missing cookie locally",()=>{
 state.enabled=false;
 recordLocalAuth({headers:{},url:"/api/trpc/auth.me"} as any,"request.cookie_missing");
 expect(state.write).not.toHaveBeenCalled();
 state.enabled=true;
 recordLocalAuth({headers:{},url:"/api/trpc/auth.me"} as any,"request.cookie_missing");
 expect(state.write).toHaveBeenCalledWith("auth-session",expect.objectContaining({cookiePresent:false,bridge:"unmarked"}));
 expect(state.write.mock.calls[0][1]).not.toHaveProperty("sessionFingerprint");
});
