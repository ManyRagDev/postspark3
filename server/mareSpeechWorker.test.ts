import { it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { processMareSpeech } from "./mareSpeechWorker";
import { getDb } from "./db";

vi.mock("./db", () => ({ getDb: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("transports a private clip only from the VPS, preserves the private mask and cancels the processor", async () => {
  const actor = randomUUID(),
    asset = randomUUID(),
    lease = randomUUID(),
    token = "1".repeat(40);
  const job: any = {
    id: randomUUID(),
    actor,
    asset_id: asset,
    lease,
    state: "reserved",
    created_at: new Date().toISOString(),
    options: { start: 0, end: 1, language: "pt", speech: true, mask: true },
  };
  const stored = new Map([["source", new Blob(["original-video"])]]);
  let editor = true;
  vi.mocked(getDb).mockReturnValue({
    rpc: async (name: string) => ({
      data:
        name === "mare_claim_speech"
          ? [{ ...job, lease }]
          : editor
            ? "editor"
            : "reviewer",
    }),
    storage: {
      from: () => ({
        download: async (key: string) => ({ data: stored.get(key) }),
        upload: async (key: string, blob: Blob) => {
          stored.set(key, blob);
          return {};
        },
        remove: async (keys: string[]) => {
          keys.forEach(key => stored.delete(key));
          return {};
        },
      }),
    },
    from: (table: string) => {
      if (table === "mare_assets")
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: {
              kind: "video",
              workspace_id: randomUUID(),
              actor,
              object_key: "source",
            },
          }),
        };
      return {
        update: (values: object) => ({
          eq() {
            return this;
          },
          select: async () => {
            Object.assign(job, values);
            return { data: [{ id: job.id }] };
          },
        }),
      };
    },
  } as any);
  const call = vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === "DELETE") return Response.json({});
    if (init.method === "POST") {
      expect(await (init.body as Blob).text()).toBe("original-video");
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
      expect((init.headers as Record<string, string>)["X-Mare-Language"]).toBe(
        "pt"
      );
      return Response.json({ job: token });
    }
    if (url.endsWith("/mask"))
      return new Response("mask", { headers: { "Content-Length": "4" } });
    return Response.json({
      state: "ready",
      result: { speech: { words: [] }, matte: { width: 64, height: 64 } },
    });
  });
  vi.stubGlobal("fetch", call);
  await processMareSpeech();
  expect(job.state).toBe("running");
  expect(job.processor_token).toBe(token);
  await processMareSpeech();
  expect(job.state).toBe("ready");
  expect(job.response.result.matte.width).toBe(64);
  expect(await stored.get(job.mask_key)?.text()).toBe("mask");
  job.state = "cancelled";
  await processMareSpeech();
  expect(stored.size).toBe(1);
  expect(job.processor_token).toBeNull();
  expect(
    call.mock.calls.some(
      ([key, init]) => key.endsWith(token) && init.method === "DELETE"
    )
  ).toBe(true);
  editor = false;
  job.state = "reserved";
  const calls = call.mock.calls.length;
  await processMareSpeech();
  expect(job.state).toBe("refused");
  expect(call).toHaveBeenCalledTimes(calls);
});
