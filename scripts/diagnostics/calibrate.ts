import assert from "node:assert/strict";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import {
  mkdtemp,
  writeFile,
  mkdir,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import { ENV } from "../../server/_core/env";
import {
  NetworkCaptureCollector,
  withNetworkDiagnosticScope,
  installNetworkDiagnostics,
} from "../../server/_core/networkDiagnostics";
// No Supabase or provider access: every fetch is restricted to this local stub.
const records: any[] = [],
  body = JSON.stringify({ message: "private-body-content ".repeat(2000) }),
  compressed = gzipSync(body);
const upload = "private-upload-á",
  uploadBytes = Buffer.byteLength(upload);
const server = createServer((req, res) => {
  req.resume();
  if (req.url?.startsWith("/rest/v1/rpc/catalog_manifest")) {
    res.writeHead(200, {
      "Content-Encoding": "gzip",
      "Content-Length": compressed.length,
    });
    res.end(compressed);
    return;
  }
  if (req.url?.startsWith("/rest/v1/posts")) {
    res.writeHead(200);
    res.write("chunk-one");
    res.end("-two");
    return;
  }
  res.writeHead(503);
  res.end("unavailable");
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw Error("local_bind_failed");
const origin = `http://127.0.0.1:${address.port}`,
  nativeFetch = globalThis.fetch;
const allowedOrigins = new Set([origin]);
globalThis.fetch = (input, init) => {
  const u = new URL(String(input));
  if (!allowedOrigins.has(u.origin))
    throw Error("CALIBRATION_EXTERNAL_NETWORK_FORBIDDEN");
  return nativeFetch(input, init);
};
const collector = new NetworkCaptureCollector(
  e => records.push(e),
  origin,
  "backend"
);
collector.start();
try {
  const first = await withNetworkDiagnosticScope(
    { traceId: "calibration" },
    () =>
      fetch(origin + "/rest/v1/rpc/catalog_manifest?secret=private-query", {
        method: "POST",
        headers: { Authorization: "Bearer private-token" },
        body: upload,
      })
  );
  assert.equal(await first.text(), body);
  assert.equal(
    await (await fetch(origin + "/rest/v1/posts")).text(),
    "chunk-one-two"
  );
  const failed = await fetch(origin + "/rest/v1/rpc/generation_v5_claim");
  assert.equal(failed.status, 503);
  await failed.text();
  const ends = records.filter(e => e.event === "supabase.end");
  assert.equal(ends.length, 3);
  assert.equal(ends[0].responseBodyBytes, compressed.length);
  assert.equal(ends[0].requestBodyBytes, uploadBytes);
  assert.equal(ends[1].responseBodyBytes, 13);
  assert.equal(ends[2].status, 503);
  for (const value of [
    upload,
    "private-query",
    "private-token",
    "private-body-content",
  ])
    assert(!JSON.stringify(records).includes(value));
  collector.stop();
  const cwd = process.cwd(),
    temp = await mkdtemp(join(tmpdir(), "postspark-network-calibration-"));
  let installed: ReturnType<typeof installNetworkDiagnostics> | undefined;
  let backend: ReturnType<typeof createServer> | undefined;
  try {
    process.chdir(temp);
    await mkdir(".postspark-local", { mode: 0o700 });
    const capture = {
      id: randomUUID(),
      scenario: "observed",
      start: Date.now(),
      until: Date.now() + 60_000,
    };
    await writeFile(
      ".postspark-local/network-capture.json",
      JSON.stringify(capture),
      { mode: 0o600 }
    );
    (ENV as any).localDemandEnabled = true;
    (ENV as any).isProduction = false;
    (ENV as any).supabaseUrl = origin;
    delete process.env.VERCEL;
    const app = express();
    app.use(express.json());
    installed = installNetworkDiagnostics("backend", app);
    await installed.ready;
    app.get("/api/trpc/auth.me", async (_req, res) =>
      res.json({
        result: await (await fetch(origin + "/rest/v1/posts")).text(),
      })
    );
    backend = createServer(app);
    await new Promise<void>(resolve =>
      backend!.listen(0, "127.0.0.1", resolve)
    );
    const bound = backend.address();
    if (!bound || typeof bound === "string") throw Error("local_bind_failed");
    const backendOrigin = `http://127.0.0.1:${bound.port}`;
    allowedOrigins.add(backendOrigin);
    const trace = randomUUID();
    const response = await fetch(backendOrigin + "/api/trpc/auth.me", {
      headers: { "X-PostSpark-Request-ID": trace, "User-Agent": "Firefox/132" },
    });
    const responseBody = await response.text();
    assert.equal(response.status, 200);
    const denied = await fetch(
      backendOrigin + "/api/_local/diagnostics/browser",
      {
        method: "POST",
        headers: {
          Origin: "https://attacker.invalid",
          "Content-Type": "application/json",
        },
        body: "{}",
      }
    );
    assert.equal(denied.status, 403);
    await denied.text();
    installed.stop();
    let journal: any[] = [];
    for (let attempt = 0; attempt < 100; attempt++) {
      const names = await readdir(".postspark-local/diagnostics");
      journal = (
        await Promise.all(
          names.map(name =>
            readFile(join(".postspark-local/diagnostics", name), "utf8")
          )
        )
      )
        .join("\n")
        .split("\n")
        .filter(Boolean)
        .map(line => JSON.parse(line));
      if (journal.some(e => e.event === "collector.seal")) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert(
      journal.some(e => e.event === "collector.seal" && e.writeFailures === 0)
    );
    assert(
      journal.some(
        e =>
          e.event === "supabase.start" &&
          e.context.traceId === trace &&
          e.context.browser === "Firefox"
      )
    );
    assert(
      journal.some(
        e =>
          e.event === "api.end" &&
          e.responseBodyBytes === Buffer.byteLength(responseBody)
      )
    );
  } finally {
    installed?.stop();
    backend?.closeAllConnections();
    if (backend)
      await new Promise<void>(resolve => backend!.close(() => resolve()));
    process.chdir(cwd);
    await rm(temp, { recursive: true, force: true });
  }
  console.log(
    JSON.stringify(
      {
        kind: "LOCAL_STUB_CALIBRATION",
        node: process.version,
        undici: process.versions.undici,
        requests: ends.length,
        compressedResponseBodyBytes: compressed.length,
        decodedPayloadBytes: Buffer.byteLength(body),
        requestBodyBytes: uploadBytes,
        chunkedResponseBodyBytes: ends[1].responseBodyBytes,
        apiCorrelationVerified: true,
        journalSealVerified: true,
        crossOriginControlRejected: true,
        credentialsRetained: false,
        externalRequests: 0,
      },
      null,
      2
    )
  );
} finally {
  collector.stop();
  globalThis.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
