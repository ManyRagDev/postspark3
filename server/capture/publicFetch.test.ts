import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { fetchPublicResource } from "./publicFetch";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

function reply(
  status: number,
  headers: Record<string, string>,
  body = Buffer.from("PNG bytes")
) {
  const incoming = Object.assign(new EventEmitter(), {
    statusCode: status,
    headers,
    destroyed: false,
    destroy(error: Error) {
      this.destroyed = true;
      queueMicrotask(() => this.emit("error", error));
      return this;
    },
  });
  const request = Object.assign(new EventEmitter(), {
    end: () =>
      queueMicrotask(() => {
        if (incoming.destroyed) return;
        incoming.emit("data", body);
        incoming.emit("end");
      }),
  });
  const spy = vi.spyOn(https, "request").mockImplementation(((
    _url: unknown,
    _options: unknown,
    callback: (r: unknown) => void
  ) => {
    callback(incoming);
    return request;
  }) as typeof https.request);
  return spy;
}

describe("capture network boundary", () => {
  it.each([
    "http://127.1/",
    "http://2130706433/",
    "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "file:///etc/passwd",
    "https://user:password@example.com/",
  ])("rejects %s before opening a socket", async url => {
    const spy = vi.spyOn(http, "request");
    await expect(
      fetchPublicResource(url, { signal: AbortSignal.timeout(1000) })
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a DNS answer containing both public and private addresses", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.3", family: 4 },
    ] as never);
    const spy = vi.spyOn(https, "request");
    await expect(
      fetchPublicResource("https://fixture.example/", {
        signal: AbortSignal.timeout(1000),
      })
    ).rejects.toThrow("público");
    expect(spy).not.toHaveBeenCalled();
  });

  it("pins the validated address and rejects rebinding on the next request", async () => {
    vi.mocked(lookup)
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }] as never)
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as never);
    const spy = reply(200, { "content-type": "image/png" });
    const response = await fetchPublicResource("https://fixture.example/", {
      signal: AbortSignal.timeout(1000),
      headers: { authorization: "NEVER FORWARD", accept: "image/*" },
    });
    expect(response.body.toString()).toBe("PNG bytes");
    const options = spy.mock.calls[0][1] as Record<string, any>;
    const done = vi.fn();
    options.lookup("fixture.example", {}, done);
    expect(done).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect(options.family).toBe(4);
    expect(options.headers.authorization).toBeUndefined();
    expect(options.headers.accept).toBe("image/*");
    await expect(
      fetchPublicResource("https://fixture.example/", {
        signal: AbortSignal.timeout(1000),
      })
    ).rejects.toThrow("público");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rejects redirects to metadata before returning them to Chromium", async () => {
    reply(302, { location: "http://169.254.169.254/latest/meta-data/" });
    await expect(
      fetchPublicResource("https://93.184.216.34/", {
        signal: AbortSignal.timeout(1000),
      })
    ).rejects.toThrow("público");
  });

  it("limits response size even when content-length is absent", async () => {
    reply(200, {}, Buffer.alloc(100));
    await expect(
      fetchPublicResource("https://93.184.216.34/", {
        signal: AbortSignal.timeout(1000),
        maxBytes: 50,
      })
    ).rejects.toThrow("limit");
  });
});
