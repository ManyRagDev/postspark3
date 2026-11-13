import { channel } from "node:diagnostics_channel";
import { expect, it } from "vitest";
import { runWithGenerationTrace, type GenerationTrace } from "../generationTrace";
import { startGenerationResourceMetrics } from "./generationResourceMetrics";

it("attributes bounded transfer totals to the active generation without retaining content", () => {
  const finish = startGenerationResourceMetrics("request-one", "https://database.test");
  const request = () => ({origin:"https://database.test",path:"/rest/v1/rpc/private?key=secret",method:"POST",onData(_b:Buffer){},onBodySent(_b:Buffer){}});
  const transfer = (id: string, origin: string) => runWithGenerationTrace({id} as GenerationTrace, () => {
    const r = {...request(),origin};
    channel("undici:request:create").publish({request:r});
    r.onBodySent(Buffer.from("private")); r.onData(Buffer.from("reply"));
    channel("undici:request:headers").publish({request:r,response:{statusCode:200,headers:[]}});
    channel("undici:request:trailers").publish({request:r});
  });
  transfer("request-two", "https://database.test");
  transfer("request-one", "https://database.test");
  transfer("request-one", "https://openrouter.ai");
  const summary = finish();
  expect(summary.transfers).toEqual({
    database_api:{calls:1,failed:0,sentBodyBytes:7,receivedBodyBytes:5,unknownByteCalls:0},
    provider:{calls:1,failed:0,sentBodyBytes:7,receivedBodyBytes:5,unknownByteCalls:0},
  });
  expect(summary.processResourcesSharedWithConcurrentWork).toBe(true);
  for (const value of ["private", "secret", "database.test", "reply"]) expect(JSON.stringify(summary)).not.toContain(value);
});
