import { describe, expect, it, vi } from "vitest";
import { MatrixBudget, installMatrixTransport } from "./budget";

describe("bounded transport preserves pinned acceptance prices", () => {
  it("reserves the expensive tier without raising the task's endpoint price ceiling", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({id:"receipt",usage:{cost:0.001}}),{status:200}));
    const budget = new MatrixBudget(0.60,1,[],async()=>{});
    const restore = installMatrixTransport(budget,new Map([["anthropic/test",{id:"anthropic/test",context_length:1_000_000,pricing:{prompt:"0.0000005",completion:"0.0000025"}}]]));
    try {
      await globalThis.fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",body:JSON.stringify({model:"anthropic/test",max_tokens:9216,provider:{only:["anthropic"],allow_fallbacks:false,max_price:{prompt:0.101,completion:0.505}},messages:[{role:"user",content:[{type:"image_url",image_url:{url:"data:image/png;base64,test"}}]}]})});
      expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).provider).toEqual({only:["anthropic"],allow_fallbacks:false,max_price:{prompt:0.101,completion:0.505}});
      expect(budget.calls[0].reservedUsd).toBeCloseTo(0.5544224,8);
      expect(budget.calls[0].actualUsd).toBe(0.001);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {restore();fetch.mockRestore();}
  });
});
