/** Exercise the real capture API without AI, database access or user posts. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const base = process.env.CAPTURE_PROBE_ENDPOINT || "http://127.0.0.1:3000";
const token = process.env.SCREENSHOT_SERVICE_TOKEN;
assert(token, "SCREENSHOT_SERVICE_TOKEN is required");
const url = process.env.CAPTURE_PROBE_URL || "https://www.postspark.com.br/";
const selector = process.env.CAPTURE_PROBE_SELECTOR || "h1";
const started = Date.now();
const request = (path: string, body: unknown, authorized = true) =>
  fetch(base + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorized ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
const png = async (response: Response, width: number, height: number) => {
  assert.equal(response.status, 200);
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(body.readUInt32BE(16), width);
  assert.equal(body.readUInt32BE(20), height);
  return body;
};
assert.equal((await request("/screenshot", { url }, false)).status, 401);
assert.equal(
  (
    await request("/screenshot", {
      url: "http://169.254.169.254/latest/meta-data/",
    })
  ).status,
  503
);
const desktop = await png(await request("/screenshot", { url }), 1440, 900);
await writeFile(process.env.CAPTURE_PROBE_OUTPUT || "/tmp/postspark-capture-desktop.png", desktop);
await png(await request("/screenshot/mobile", { url }), 390, 844);
const [batch, elements] = await Promise.all([
  request("/screenshot/multi", { urls: [url] }).then(async response => {
    assert.equal(response.status, 200);
    return response.json();
  }),
  request("/screenshot/element", { url, selectors: [selector] }).then(
    async response => {
      assert.equal(response.status, 200);
      return response.json();
    }
  ),
]);
assert(batch.screenshots[url]);
assert(
  elements.elements[selector],
  `Expected visible selector ${selector} on ${url}`
);
const discovery = await request("/discover", { url });
assert.equal(discovery.status, 200);
assert(Array.isArray((await discovery.json()).discoveredPages));
console.log(
  JSON.stringify({
    capture: "passed",
    url,
    desktop: "1440x900",
    mobile: "390x844",
    batch: "passed",
    elements: "passed",
    discovery: "passed",
    unauthorized: "blocked",
    metadataDestination: "blocked",
    durationMs: Date.now() - started,
    aiCalls: 0,
  })
);
