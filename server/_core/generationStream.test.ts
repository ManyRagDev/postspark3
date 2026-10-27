import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { COOKIE_NAME } from "@shared/const";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn() }));
vi.mock("./sdk", () => ({ sdk: { authenticateRequest: mocks.auth } }));
vi.mock("../ai/workflows/localDemandStore", () => ({
  ownedGenerationSubscription: mocks.get,
}));
vi.mock("./env", () => ({ ENV: { localDemandEnabled: true } }));
import { registerGenerationStream } from "./generationStream";
import { generationEvents } from "../ai/workflows/generationEvents";
let handle: any;
const id = "00000000-0000-4000-8000-000000000001";
function response() {
  const r: any = new EventEmitter();
  r.sendStatus = vi.fn();
  r.setHeader = vi.fn();
  r.flushHeaders = vi.fn();
  r.write = vi.fn();
  r.end = vi.fn(() => r.emit("close"));
  return r;
}
const request = () => ({
  params: { id },
  headers: {
    cookie: `${COOKIE_NAME}=x.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 3600 })).toString("base64url")}.x`,
  },
});
beforeEach(() => {
  vi.useFakeTimers();
  registerGenerationStream({
    get: (_path: string, handler: any) => {
      handle = handler;
    },
  } as any);
  mocks.auth.mockReset().mockResolvedValue({ id: "owner" });
  mocks.get
    .mockReset()
    .mockResolvedValue({ id, ownerId: "owner", executionMode: "local-demand" });
});
afterEach(() => {
  vi.useRealTimers();
  generationEvents.removeAllListeners();
});
describe("authenticated progress transport", () => {
  it("does no database polling during thirty idle minutes and cleans listeners", async () => {
    const res = response();
    await handle(request(), res);
    await vi.advanceTimersByTimeAsync(30 * 60000);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(res.write).toHaveBeenCalledTimes(1);
    res.end();
    expect(generationEvents.listenerCount(id)).toBe(0);
  });
  it("checks ownership and closes on revoked access at progress or token expiry", async () => {
    const res = response();
    await handle(request(), res);
    generationEvents.emit(id, {
      requestId: id,
      ownerId: "other",
      status: "running",
      proposals: [],
    });
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    mocks.auth.mockRejectedValue(new Error("revoked"));
    generationEvents.emit(id, {
      requestId: id,
      ownerId: "owner",
      status: "running",
      proposals: [],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(res.end).toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledTimes(1);
  });
  it("never subscribes to a missing or foreign request", async () => {
    mocks.get.mockResolvedValue(null);
    const res = response();
    await handle(request(), res);
    expect(mocks.get).toHaveBeenCalledWith(id, "owner");
    expect(res.sendStatus).toHaveBeenCalledWith(404);
    expect(generationEvents.listenerCount(id)).toBe(0);
  });
});
