import { afterAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { once } from "node:events";
import { CaptureBrowser, CaptureGate } from "./browser";
import { createCaptureApp } from "./app";
import { fetchPublicResource } from "./publicFetch";

describe("real Chromium capture", () => {
  const token = "capture-integration-token-with-32-characters";
  let privateRequests = 0;
  const attempts: string[] = [];
  const sentinel = http.createServer((_req, res) => {
    privateRequests++;
    res.end("PRIVATE");
  });
  sentinel.on("upgrade", (_req, socket) => {
    privateRequests++;
    socket.destroy();
  });
  const browser = new CaptureBrowser(async (url, options) => {
    attempts.push(url);
    const parsed = new URL(url);
    if (parsed.hostname === "93.184.216.34") {
      if (parsed.pathname === "/allowed.svg")
        return {
          status: 200,
          headers: { "content-type": "image/svg+xml" },
          body: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="cyan"/></svg>'
          ),
        };
      const port = (sentinel.address() as { port: number }).port;
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: Buffer.from(
          `<html><head><style>body{background:#fff8dd;color:#122f2a;font:24px sans-serif}</style></head><body><h1>PostSpark capture</h1><img id="allowed" src="/allowed.svg"><img src="http://127.0.0.1:${port}/image"><iframe src="http://127.0.0.1:${port}/frame"></iframe><a href="/sobre">Sobre</a><script>new WebSocket('ws://127.0.0.1:${port}/socket')</script></body></html>`
        ),
      };
    }
    return fetchPublicResource(url, options);
  });
  const { app, close } = createCaptureApp(token, browser);
  const server = http.createServer(app);
  let base: string;
  const ready = (async () => {
    sentinel.listen(0, "127.0.0.1");
    await once(sentinel, "listening");
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  })();
  const post = async (path: string, body: unknown, authorized = true) => {
    await ready;
    return fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorized ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  };
  afterAll(async () => {
    await close();
    server.closeAllConnections();
    server.close();
    sentinel.closeAllConnections();
    sentinel.close();
  });

  it("requires authentication and bounded input", async () => {
    expect(
      (await post("/screenshot", { url: "https://example.com" }, false)).status
    ).toBe(401);
    expect(
      (
        await post("/screenshot", {
          url: "https://example.com",
          viewport: { width: 90000, height: 90000 },
        })
      ).status
    ).toBe(400);
    expect(
      (
        await post("/screenshot/multi", {
          urls: Array(6).fill("https://example.com"),
        })
      ).status
    ).toBe(400);
  });

  it("renders public resources while refusing private frames, images and sockets", async () => {
    const response = await post("/screenshot", {
      url: "http://93.184.216.34/fixture",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    const png = Buffer.from(await response.arrayBuffer());
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1440);
    expect(png.readUInt32BE(20)).toBe(900);
    expect(attempts.some(url => url.endsWith("/allowed.svg"))).toBe(true);
    expect(attempts.some(url => url.includes("127.0.0.1"))).toBe(true);
    expect(privateRequests).toBe(0);
  }, 30000);

  it("preserves mobile, batch, elements and discovery contracts", async () => {
    const url = "http://93.184.216.34/fixture";
    const mobile = Buffer.from(
      await (await post("/screenshot/mobile", { url })).arrayBuffer()
    );
    expect(mobile.readUInt32BE(16)).toBe(390);
    expect(mobile.readUInt32BE(20)).toBe(844);
    const [batch, elements] = await Promise.all([
      post("/screenshot/multi", { urls: [url] }).then(r => r.json()),
      post("/screenshot/element", { url, selectors: ["h1", ".missing"] }).then(
        r => r.json()
      ),
    ]);
    expect(
      Buffer.from(batch.screenshots[url], "base64")
        .subarray(0, 8)
        .toString("hex")
    ).toBe("89504e470d0a1a0a");
    expect(elements.elements.h1).toBeTruthy();
    expect(elements.notFound).toEqual([".missing"]);
    const discovered = await (await post("/discover", { url })).json();
    expect(discovered.discoveredPages).toEqual([
      { url: "http://93.184.216.34/sobre", label: "Sobre", priority: "high" },
    ]);
    expect(privateRequests).toBe(0);
  }, 60000);

  it("works through the PostSpark adapter with service authentication", async () => {
    await ready;
    vi.stubEnv("SCREENSHOT_SERVICE_URL", base);
    vi.stubEnv("SCREENSHOT_SERVICE_TOKEN", token);
    vi.stubEnv("SCREENSHOT_PUBLIC_NETWORK_ONLY", "true");
    vi.resetModules();
    try {
      const adapter = await import("../screenshotService");
      const url = "http://93.184.216.34/fixture";
      const [desktop, mobile] = await Promise.all([
        adapter.captureScreenshot(url),
        adapter.captureScreenshot(url, "mobile"),
      ]);
      expect(Buffer.from(desktop!).readUInt32BE(16)).toBe(1440);
      expect(Buffer.from(mobile!).readUInt32BE(16)).toBe(390);
      const batch = await adapter.captureMultipleScreenshots([url]);
      expect(Buffer.from(batch[url]).subarray(0, 8).toString("hex")).toBe(
        "89504e470d0a1a0a"
      );
      expect(
        (await adapter.captureElements(url, ["h1"])).h1.byteLength
      ).toBeGreaterThan(100);
      expect((await adapter.discoverPages(url))[0].label).toBe("Sobre");
      expect(privateRequests).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  }, 60000);
});

it("releases the browser slot after failure and skips canceled queued work", async () => {
  const gate = new CaptureGate(),
    canceled = new AbortController();
  let release!: () => void;
  const first = gate.run(
    new AbortController().signal,
    () =>
      new Promise<void>(done => {
        release = done;
      })
  );
  await Promise.resolve();
  let ran = false;
  const second = gate.run(canceled.signal, async () => {
    ran = true;
  });
  canceled.abort();
  release();
  await first;
  await expect(second).rejects.toThrow();
  expect(ran).toBe(false);
  await expect(
    gate.run(new AbortController().signal, async () => {
      throw new Error("failed capture");
    })
  ).rejects.toThrow("failed capture");
  await expect(
    gate.run(new AbortController().signal, async () => "recovered")
  ).resolves.toBe("recovered");
});
