// Run inside the frozen runtime on the private processing network. No user data.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
const address =
  process.env.IMAGE_EDITOR_SMOKE_URL ?? "http://image-editor:9417";
const token = process.env.ADVANCED_IMAGE_PROCESSOR_TOKEN;
assert(token);
const canvas = createCanvas(64, 64),
  context = canvas.getContext("2d");
context.fillStyle = "#ce5730";
context.fillRect(8, 8, 48, 48);
const imageData = canvas.toDataURL("image/png"),
  digest = createHash("sha256")
    .update(Buffer.from(imageData.split(",")[1], "base64"))
    .digest("hex");
const original = context.getImageData(0, 0, 64, 64).data;
const points = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.75, 0.75],
  [0.25, 0.75],
];
const cases = [
  {
    operation: { kind: "adjust", brightness: 15, contrast: 5, saturation: -10 },
    format: "png",
    size: [64, 64],
  },
  {
    operation: { kind: "crop", x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    format: "png",
    size: [32, 32],
  },
  {
    operation: { kind: "resize", width: 32, height: 32 },
    format: "png",
    size: [32, 32],
  },
  {
    operation: { kind: "mask", points, feather: 1 },
    format: "png",
    size: [64, 64],
  },
  {
    operation: {
      kind: "blur",
      points: [
        [0, 0],
        [0.9, 0],
        [0.9, 0.9],
        [0, 0.9],
      ],
      feather: 3,
      radius: 5,
    },
    format: "png",
    size: [64, 64],
  },
  { operation: { kind: "trim" }, format: "png", size: [48, 48] },
  {
    operation: { kind: "adjust", brightness: 0, contrast: 0, saturation: 0 },
    format: "webp",
    size: [64, 64],
  },
];
const report = { createdAt: new Date().toISOString(), cases: [] };
for (const test of cases) {
  const requestId = randomUUID(),
    started = performance.now();
  const response = await fetch(new URL("/process", address), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      requestId,
      imageData,
      actor: "00000000-0000-4000-8000-000000000001",
      operation: test.operation,
      format: test.format,
    }),
    signal: AbortSignal.timeout(95_000),
  });
  assert.equal(
    response.status,
    200,
    `Operation ${test.operation.kind}: ${await response
      .clone()
      .text()
      .then(t => t.slice(0, 180))}`
  );
  const result = await response.json();
  assert.equal(result.requestId, requestId);
  assert.equal(result.sourceSha256, digest);
  assert.deepEqual(
    [result.resultDimensions.width, result.resultDimensions.height],
    test.size
  );
  const bytes = Buffer.from(result.imageData.split(",")[1], "base64");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    result.resultSha256
  );
  const image = await loadImage(bytes),
    decoded = createCanvas(image.width, image.height);
  decoded.getContext("2d").drawImage(image, 0, 0);
  const pixels = decoded
    .getContext("2d")
    .getImageData(0, 0, image.width, image.height).data;
  if (test.operation.kind === "adjust" && test.format === "png")
    assert.notEqual(pixels[(32 * 64 + 32) * 4], original[(32 * 64 + 32) * 4]);
  if (test.operation.kind === "mask") {
    assert.equal(pixels[3], 0);
    assert.equal(pixels[(32 * 64 + 32) * 4 + 3], 255);
  }
  if (test.format === "webp")
    assert.deepEqual(Buffer.from(pixels), Buffer.from(original));
  report.cases.push({
    operation: test.operation.kind,
    format: test.format,
    dimensions: test.size,
    bytes: bytes.length,
    milliseconds: Math.round(performance.now() - started),
    passed: true,
  });
}
const denied = await fetch(new URL("/process", address), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
assert.equal(denied.status, 401);
const forbidden = await fetch(new URL("/process", address), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    requestId: randomUUID(),
    imageData,
    actor: "00000000-0000-4000-8000-000000000001",
    operation: { kind: "select.subject" },
    format: "png",
  }),
});
assert.equal(forbidden.status, 400);
report.authenticatedTransport = true;
report.arbitraryCommandsRejected = true;
report.success = true;
console.log(JSON.stringify(report, null, 2));
