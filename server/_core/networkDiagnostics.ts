import { AsyncLocalStorage } from "node:async_hooks";
import { channel } from "node:diagnostics_channel";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Express, Request, Response } from "express";
import { ENV } from "./env";
import { writeLocalDiagnostic } from "../ai/localDiagnostics";
import {
  diagnosticEndpoint,
  diagnosticCategory,
  diagnosticBrowser,
  diagnosticPage,
  diagnosticId,
  type NetworkCapture,
} from "@shared/networkDiagnostics";

type Metadata = Record<string, unknown>;
const context = new AsyncLocalStorage<Metadata>();
export const withNetworkDiagnosticScope = <T>(
  scope: Metadata,
  work: () => T
): T => context.run(scope, work);
const CONTROL = "network-capture.json";
const allowedScenarios = [
  "observed",
  "backend-idle",
  "studio-visible",
  "studio-hidden",
  "generation-active",
];
export function validCapture(
  value: any,
  now = Date.now()
): value is NetworkCapture {
  return Boolean(
    value &&
      diagnosticId(value.id) &&
      allowedScenarios.includes(value.scenario) &&
      Number.isFinite(value.start) &&
      Number.isFinite(value.until) &&
      value.start <= now &&
      value.until > now &&
      value.until > value.start &&
      value.until - value.start <= 2 * 60 * 60_000
  );
}
function byteLength(chunk: unknown): number {
  return typeof chunk === "string"
    ? Buffer.byteLength(chunk)
    : ArrayBuffer.isView(chunk)
      ? chunk.byteLength
      : 0;
}

/** Passive counts. Local-only, bounded capture. No fetch wrapper, body copies or extra remote requests. */
export class NetworkCaptureCollector {
  private pending = new Map<any, any>();
  private subscriptions: Array<[string, (message: any) => void]> = [];
  constructor(
    private emit: (event: Metadata) => void,
    private origin: string,
    private role: string
  ) {}
  private send(event: Metadata) {
    try {
      this.emit({
        at: new Date().toISOString(),
        pid: process.pid,
        role: this.role,
        ...event,
      });
    } catch {
      /* Metrics cannot fail an application request. */
    }
  }
  start() {
    const on = (name: string, handler: (message: any) => void) => {
      const guarded = (message: any) => {
        try {
          handler(message);
        } catch {
          this.send({
            event: "collector.warning",
            reason: "unsupported_request_metadata",
          });
        }
      };
      channel(name).subscribe(guarded);
      this.subscriptions.push([name, guarded]);
    };
    on("undici:request:create", ({ request }) => {
      if (new URL(request.origin).origin !== this.origin) return;
      const endpoint = diagnosticEndpoint(request.path, request.origin);
      const state = {
        requestId: randomUUID(),
        endpoint,
        category: diagnosticCategory(endpoint),
        method: request.method,
        context: context.getStore() ?? {
          source: this.role === "backend" ? "background" : "generation-worker",
        },
        callsite: (new Error().stack ?? "")
          .split("\n")
          .flatMap(
            line => line.match(/server\/[\w/.-]+\.(?:ts|js):\d+:\d+/g) ?? []
          )
          .filter(line => !line.includes("networkDiagnostics"))
          .slice(0, 3),
        started: performance.now(),
        sent: 0,
        received: 0,
        hooks: [] as any[],
        status: undefined,
        declaredBytes: undefined,
        byteMode:
          typeof request.onData === "function" &&
          typeof request.onBodySent === "function"
            ? "undici-body-hooks"
            : "unavailable",
      };
      this.pending.set(request, state);
      this.send({ event: "supabase.start", ...this.metadata(state) });
      // Node 22 / bundled Undici 6 has no public body-chunk diagnostics channels.
      // Count lengths at its handler boundary, preserving this, arguments and return values.
      // Unsupported runtimes report unknown bytes rather than a misleading zero.
      try {
        if (state.byteMode === "undici-body-hooks") {
          for (const [method, field] of [
            ["onData", "received"],
            ["onBodySent", "sent"],
          ] as const) {
            const original = request[method];
            const wrapper = function (this: unknown, ...args: any[]) {
              state[field] += byteLength(args[0]);
              return Reflect.apply(original, this, args);
            };
            request[method] = wrapper;
            state.hooks.push({ method, original, wrapper });
          }
        }
      } catch {
        for (const hook of state.hooks) {
          try {
            if (request[hook.method] === hook.wrapper)
              request[hook.method] = hook.original;
          } catch {}
        }
        state.hooks = [];
        state.byteMode = "unavailable";
      }
    });
    on("undici:request:headers", ({ request, response }) => {
      const s = this.pending.get(request);
      if (!s) return;
      s.status = response.statusCode;
      const h = response.headers ?? [];
      for (let i = 0; i + 1 < h.length; i += 2) {
        if (
          String(h[i]).toLowerCase() === "content-length" &&
          /^\d+$/.test(String(h[i + 1]))
        )
          s.declaredBytes = Number(h[i + 1]);
      }
    });
    on("undici:request:trailers", ({ request }) => this.finish(request, true));
    on("undici:request:error", ({ request }) => this.finish(request, false));
  }
  private metadata(s: any) {
    return {
      requestId: s.requestId,
      endpoint: s.endpoint,
      category: s.category,
      method: s.method,
      context: s.context,
      callsite: s.callsite,
    };
  }
  private finish(request: any, complete: boolean) {
    const s = this.pending.get(request);
    if (!s) return;
    this.pending.delete(request);
    for (const hook of s.hooks) {
      try {
        if (request[hook.method] === hook.wrapper)
          request[hook.method] = hook.original;
      } catch {}
    }
    this.send({
      event: "supabase.end",
      ...this.metadata(s),
      complete,
      status: s.status,
      durationMs: Math.round((performance.now() - s.started) * 100) / 100,
      requestBodyBytes: s.byteMode === "unavailable" ? null : s.sent,
      responseBodyBytes: s.byteMode === "unavailable" ? null : s.received,
      declaredResponseBodyBytes: s.declaredBytes,
      byteMode: s.byteMode,
    });
  }
  stop() {
    for (const [name, handler] of this.subscriptions)
      channel(name).unsubscribe(handler);
    this.subscriptions = [];
    for (const request of Array.from(this.pending.keys()))
      this.finish(request, false);
  }
}

export function installNetworkDiagnostics(
  role: "backend" | "worker",
  app?: Express
) {
  if (!ENV.localDemandEnabled || ENV.isProduction || process.env.VERCEL)
    return { stop: () => {}, ready: Promise.resolve() };
  const directory = join(process.cwd(), ".postspark-local");
  const boot = randomUUID().slice(0, 8);
  let capture: NetworkCapture | undefined;
  let collector: NetworkCaptureCollector | undefined,
    pulse: ReturnType<typeof setInterval> | undefined,
    end: ReturnType<typeof setTimeout> | undefined;
  let watcher: FSWatcher | undefined,
    closed = false;
  let journal:
    | {
        capture: NetworkCapture;
        file: string;
        failures: number;
        writes: Set<Promise<unknown>>;
      }
    | undefined;
  const clients = new Set<Response>();
  const record = (event: Metadata) => {
    const target = journal;
    if (!target) return;
    const write = writeLocalDiagnostic(target.file, {
      captureId: target.capture.id,
      at: new Date().toISOString(),
      pid: process.pid,
      role,
      ...event,
    }).catch(() => {
      target.failures++;
      process.stderr.write(
        "[diagnostics] Falha ao gravar medição de rede local.\n"
      );
    });
    target.writes.add(write);
    void write.finally(() => target.writes.delete(write));
  };
  const announce = () => {
    for (const res of Array.from(clients))
      res.write(`data: ${JSON.stringify(capture ?? null)}\n\n`);
  };
  const stop = () => {
    const target = journal;
    collector?.stop();
    collector = undefined;
    clearInterval(pulse);
    clearTimeout(end);
    record({ event: "collector.stop" });
    capture = undefined;
    journal = undefined;
    announce();
    if (target)
      void Promise.all(Array.from(target.writes))
        .then(() =>
          writeLocalDiagnostic(target.file, {
            captureId: target.capture.id,
            at: new Date().toISOString(),
            pid: process.pid,
            role,
            event: "collector.seal",
            writeFailures: target.failures,
          })
        )
        .then(() => {
          if (role !== "backend" || closed || Date.now() < target.capture.until)
            return;
          // One offline report at the end of a bounded capture. No scheduler or remote calls.
          const child = spawn(
            process.execPath,
            [
              "--import",
              "tsx",
              join(process.cwd(), "scripts", "diagnostics", "network.ts"),
              "report",
              target.capture.id,
            ],
            { stdio: ["ignore", "ignore", "pipe"] }
          );
          child.stderr?.on("data", chunk => process.stderr.write(chunk));
          child.once("error", () =>
            process.stderr.write(
              "[diagnostics] Falha ao gerar relatório local final.\n"
            )
          );
          child.once("exit", code => {
            if (code)
              process.stderr.write(
                "[diagnostics] Relatório local terminou com falha.\n"
              );
          });
        })
        .catch(() =>
          process.stderr.write(
            "[diagnostics] Captura local sem selo de integridade; relatório será inconclusivo.\n"
          )
        );
  };
  const reload = async () => {
    let next: NetworkCapture | undefined;
    try {
      const value = JSON.parse(
        await readFile(join(directory, CONTROL), "utf8")
      );
      if (validCapture(value)) next = value;
    } catch {}
    if (closed || next?.id === capture?.id) return;
    stop();
    if (!next) return;
    capture = next;
    journal = {
      capture: next,
      file: `network-${next.id}-${process.pid}-${boot}`,
      failures: 0,
      writes: new Set(),
    };
    record({
      event: "collector.start",
      node: process.version,
      undici: process.versions.undici,
      scenario: next.scenario,
      until: next.until,
    });
    collector = new NetworkCaptureCollector(
      record,
      new URL(ENV.supabaseUrl).origin,
      role
    );
    collector.start();
    pulse = setInterval(() => record({ event: "collector.pulse" }), 10_000);
    pulse.unref();
    end = setTimeout(stop, Math.max(1, next.until - Date.now()));
    end.unref();
    announce();
  };
  // Watch only local control changes. No network polling and no always-on heartbeat.
  const ready = mkdir(directory, { recursive: true, mode: 0o700 })
    .then(async () => {
      if (closed) return;
      watcher = watch(directory, (_event, file) => {
        if (String(file) === CONTROL)
          void reload().catch(() =>
            process.stderr.write(
              "[diagnostics] Falha ao iniciar captura local.\n"
            )
          );
      });
      watcher.unref();
      await reload();
    })
    .catch(() =>
      process.stderr.write(
        "[diagnostics] Controle de medição local indisponível.\n"
      )
    );
  const local = (req: Request, res: Response, next: () => void) => {
    const address = req.socket.remoteAddress;
    const host = ["localhost", "127.0.0.1", "[::1]"].includes(req.hostname);
    let origin = true;
    try {
      if (req.headers.origin)
        origin = new URL(req.headers.origin).host === req.headers.host;
    } catch {
      origin = false;
    }
    if (
      !host ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address ?? "") ||
      !origin ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      res.sendStatus(403);
      return;
    }
    next();
  };
  if (app) {
    app.get("/api/_local/diagnostics/events", local, (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-store");
      res.flushHeaders();
      clients.add(res);
      res.write(`data: ${JSON.stringify(capture ?? null)}\n\n`);
      req.once("close", () => clients.delete(res));
    });
    app.post("/api/_local/diagnostics/browser", local, (req, res) => {
      const v = req.body;
      if (!capture || v?.captureId !== capture.id || !diagnosticId(v.tabId)) {
        res.sendStatus(204);
        return;
      }
      if (!Array.isArray(v.events) || v.events.length > 100) {
        res.sendStatus(400);
        return;
      }
      record({
        event: "diagnostic.browser_batch",
        entries: v.events.length,
        declaredBodyBytes: /^\d+$/.test(String(req.headers["content-length"]))
          ? Number(req.headers["content-length"])
          : null,
      });
      for (const item of v.events) {
        if (!["presence", "fetch", "resource"].includes(item?.kind)) continue;
        const visible = item.visibility === "visible" ? "visible" : "hidden";
        record({
          event: "browser." + item.kind,
          tabId: v.tabId,
          pageInstanceId: diagnosticId(v.pageInstanceId),
          visibility: visible,
          page: diagnosticPage(String(item.page)),
          ...(item.kind === "fetch" || item.kind === "resource"
            ? {
                endpoint: diagnosticEndpoint(
                  String(item.endpoint),
                  "http://localhost"
                ),
                destination:
                  item.destination === "supabase" ? "supabase" : "backend",
                status: Number.isInteger(item.status) ? item.status : undefined,
                durationMs:
                  typeof item.durationMs === "number" && item.durationMs >= 0
                    ? Math.min(item.durationMs, 86400000)
                    : undefined,
                responseBodyBytes:
                  typeof item.responseBodyBytes === "number" &&
                  item.responseBodyBytes >= 0
                    ? Math.min(item.responseBodyBytes, 1e10)
                    : null,
                ...(diagnosticId(item.requestId)
                  ? { requestId: item.requestId }
                  : {}),
              }
            : {}),
          clientObservedAt:
            typeof item.at === "number" && Number.isFinite(item.at)
              ? item.at
              : undefined,
        });
      }
      res.sendStatus(204);
    });
    app.use((req, res, next) => {
      if (
        !capture ||
        !req.path.startsWith("/api/") ||
        req.path.startsWith("/api/_local/diagnostics/")
      ) {
        next();
        return;
      }
      const traceId =
        diagnosticId(req.headers["x-postspark-request-id"]) ?? randomUUID();
      const scope = {
        traceId,
        source: "frontend-api",
        route: diagnosticEndpoint(req.path, "http://localhost"),
        tabId: diagnosticId(req.headers["x-postspark-tab-id"]),
        pageInstanceId: diagnosticId(req.headers["x-postspark-page-id"]),
        visibility: ["visible", "hidden"].includes(
          String(req.headers["x-postspark-visibility"])
        )
          ? req.headers["x-postspark-visibility"]
          : "unknown",
        browser: diagnosticBrowser(req.headers["user-agent"] ?? ""),
      };
      const started = performance.now();
      let bytes = 0;
      const write = res.write,
        endResponse = res.end;
      res.write = function (this: Response, ...args: any[]) {
        bytes += byteLength(args[0]);
        return Reflect.apply(write, this, args);
      } as typeof res.write;
      res.end = function (this: Response, ...args: any[]) {
        bytes += byteLength(args[0]);
        return Reflect.apply(endResponse, this, args);
      } as typeof res.end;
      record({ event: "api.start", ...scope });
      let done = false;
      const finish = (complete: boolean) => {
        if (done) return;
        done = true;
        record({
          event: "api.end",
          ...scope,
          complete,
          status: res.statusCode,
          responseBodyBytes: bytes,
          durationMs: Math.round(performance.now() - started),
        });
      };
      res.once("finish", () => finish(true));
      res.once("close", () => finish(false));
      context.run(scope, next);
    });
  }
  return {
    ready,
    stop: () => {
      closed = true;
      watcher?.close();
      stop();
      for (const client of Array.from(clients)) client.end();
      clients.clear();
    },
  };
}
