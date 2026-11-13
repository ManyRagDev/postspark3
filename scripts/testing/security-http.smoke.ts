/** Local dependency smoke only: no dotenv, application bootstrap or external service.
 * Run: node --import tsx scripts/testing/security-http.smoke.ts
 * Cookie identity below is a fixture, not Supabase authentication validation.
 */
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { gzipSync } from "node:zlib";
import express from "express";
import { parse as parseCookie } from "cookie";
import { initTRPC, TRPCError } from "@trpc/server";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createTRPCProxyClient, httpLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";

const fixtureTime = new Date("2026-11-12T12:34:56.789Z");
const t = initTRPC.context<{ user: string | null }>().create({
  transformer: superjson,
  errorFormatter: ({ shape }) => ({ ...shape, data: { ...shape.data, stack: undefined, fixtureTime } }),
});
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Fixture session required" });
  return next({ ctx: { user: ctx.user } });
});
const router = t.router({
  public: t.procedure.query(() => ({ date: fixtureTime, amount: 42n })),
  protected: protectedProcedure.query(({ ctx }) => ({ user: ctx.user })),
  echo: t.procedure.input((value: unknown) => {
    assert(value instanceof Date, "SuperJSON must restore mutation input Date");
    return value;
  }).mutation(({ input }) => ({ date: input })),
  failure: t.procedure.query(() => { throw new TRPCError({ code: "BAD_REQUEST", message: "Fixture failure" }); }),
});
const app = express();
assert.equal(app.get("trust proxy"), false);
app.post("/webhook", express.raw({ type: "application/json", limit: "4kb" }), (req, res) => {
  assert(Buffer.isBuffer(req.body));
  res.json({ base64: req.body.toString("base64") });
});
app.use(express.json({ limit: "4kb" }));
app.use(express.urlencoded({ limit: "4kb", extended: true }));
app.get("/health", (req, res) => res.json({ ok: true, ip: req.ip, ips: req.ips }));
app.post("/echo", (req, res) => res.json(req.body));
app.use(["/api/trpc", "/trpc"], createExpressMiddleware({
  router,
  createContext: ({ req }) => ({ user: parseCookie(req.headers.cookie ?? "").fixture_session === "valid" ? "fixture-admin" : null }),
}));
const errors: string[] = [];
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  errors.push(error.type ?? error.code ?? error.message);
  res.status(error.status ?? 500).json({ error: error.type ?? "parse_error" });
});
const server = createServer(app);
server.requestTimeout = 5_000;
server.headersTimeout = 5_000;

try {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const exchange = (path: string, body?: Buffer, headers: Record<string, string> = {}) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request(`${origin}${path}`, {
      method: body ? "POST" : "GET", headers: { ...headers, ...(body ? { "content-length": String(body.length) } : {}) }, timeout: 5_000,
    }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("loopback request timed out")));
    req.end(body);
  });
  const raw = Buffer.from('{ "amount" : 42,\n "text":"acentuação" }\n');
  const webhook = await exchange("/webhook", raw, { "content-type": "application/json" });
  assert.equal(webhook.status, 200);
  assert.deepEqual(Buffer.from(webhook.body.base64, "base64"), raw);

  const healthyGzip = gzipSync(Buffer.from('{"ok":true}'));
  assert.deepEqual(await exchange("/echo", healthyGzip, { "content-type": "application/json", "content-encoding": "gzip" }), { status: 200, body: { ok: true } });
  const corrupt = Buffer.concat([healthyGzip, Buffer.from("trailing-invalid-gzip-bytes")]);
  assert(corrupt.length < 128, "This is a bounded malformed frame, not a decompression bomb");
  const bad = await exchange("/echo", corrupt, { "content-type": "application/json", "content-encoding": "gzip" });
  assert.equal(bad.status, 400, JSON.stringify(bad));
  assert(errors.length > 0, "Malformed compression must reach the error handler");
  // Wait for decoder stream errors queued after the HTTP response, then prove
  // that the same process and listener remain healthy.
  await new Promise(resolve => setTimeout(resolve, 100));
  const healthy = await exchange("/health", undefined, { "x-forwarded-for": "203.0.113.10" });
  assert.deepEqual(healthy, { status: 200, body: { ok: true, ip: "127.0.0.1", ips: [] } });

  const client = (cookie?: string, prefix = "/api/trpc") => createTRPCProxyClient<typeof router>({
    links: [httpLink({ url: `${origin}${prefix}`, transformer: superjson, headers: cookie ? { cookie } : {}, fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(5_000) }) })],
  });
  const anonymous = client();
  assert.deepEqual(await anonymous.public.query(), { date: fixtureTime, amount: 42n });
  assert.deepEqual(await anonymous.echo.mutate(fixtureTime), { date: fixtureTime });
  await assert.rejects(anonymous.protected.query(), error => {
    assert(error instanceof TRPCClientError);
    assert.equal(error.data.code, "UNAUTHORIZED");
    assert.equal(error.data.httpStatus, 401);
    assert.deepEqual(error.data.fixtureTime, fixtureTime);
    assert.equal(error.data.stack, undefined);
    return true;
  });
  assert.deepEqual(await client("fixture_session=valid").protected.query(), { user: "fixture-admin" });
  assert.deepEqual(await client(undefined, "/trpc").public.query(), { date: fixtureTime, amount: 42n });
  await assert.rejects(anonymous.failure.query(), error => {
    assert(error instanceof TRPCClientError);
    assert.equal(error.message, "Fixture failure");
    assert.equal(error.data.code, "BAD_REQUEST");
    assert.equal(error.data.httpStatus, 400);
    assert.deepEqual(error.data.fixtureTime, fixtureTime);
    assert.equal(error.data.stack, undefined);
    return true;
  });
  console.log(JSON.stringify({ ok: true, transport: "loopback-http", checks: ["compressed-trailing-bytes-rejected", "process-survives", "raw-webhook-bytes", "default-proxy-trust", "trpc-public", "trpc-cookie-fixture", "superjson-input-output-errors"], applicationAuthValidated: false, externalCalls: 0 }));
} finally {
  if (server.listening) await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}
