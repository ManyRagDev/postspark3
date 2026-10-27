import { channel } from "node:diagnostics_channel";
import { expect, it } from "vitest";
import { ENV } from "./env";
import {
  NetworkCaptureCollector,
  validCapture,
  withNetworkDiagnosticScope,
  installNetworkDiagnostics,
} from "./networkDiagnostics";
import {
  diagnosticEndpoint,
  diagnosticBrowser,
} from "@shared/networkDiagnostics";

it("does not install collection or local control routes in production", async () => {
  const before = {
    local: ENV.localDemandEnabled,
    production: ENV.isProduction,
  };
  try {
    ENV.localDemandEnabled = true;
    ENV.isProduction = true;
    const forbidden = () => {
      throw Error("production_route_installed");
    };
    const handle = installNetworkDiagnostics("backend", {
      get: forbidden,
      post: forbidden,
      use: forbidden,
    } as any);
    await handle.ready;
    handle.stop();
  } finally {
    ENV.localDemandEnabled = before.local;
    ENV.isProduction = before.production;
  }
});

it("counts each actual attempt, preserves handlers and context, and never records credentials, queries or bodies", () => {
  const records: any[] = [];
  const collector = new NetworkCaptureCollector(
    e => records.push(e),
    "https://example.supabase.co",
    "backend"
  );
  collector.start();
  const request = {
    origin: "https://example.supabase.co",
    path: "/rest/v1/rpc/catalog_manifest?token=private-query",
    method: "POST",
    body: "private-body",
    headers: "Authorization: private-token",
    onData(chunk: Buffer) {
      expect(this).toBe(request);
      return false;
    },
    onBodySent(_chunk?: Buffer) {
      return "sent";
    },
  };
  const original = request.onData;
  try {
    withNetworkDiagnosticScope(
      { traceId: "one", route: "/api/trpc/generation.capabilities" },
      () => channel("undici:request:create").publish({ request })
    );
    expect(request.onData(Buffer.from("abc"))).toBe(false);
    expect(request.onBodySent(Buffer.from("request"))).toBe("sent");
    channel("undici:request:headers").publish({
      request,
      response: {
        statusCode: 200,
        headers: [Buffer.from("content-length"), Buffer.from("3")],
      },
    });
    channel("undici:request:trailers").publish({ request });
    channel("undici:request:trailers").publish({ request });
    expect(records.filter(e => e.event === "supabase.end")).toHaveLength(1);
    expect(records.at(-1)).toMatchObject({
      requestBodyBytes: 7,
      responseBodyBytes: 3,
      complete: true,
      status: 200,
      context: { traceId: "one" },
    });
    expect(request.onData).toBe(original);
    for (const value of ["private-query", "private-body", "private-token"])
      expect(JSON.stringify(records)).not.toContain(value);
  } finally {
    collector.stop();
  }
});
it("does not invent zero bytes for unsupported handlers and marks interrupted requests incomplete", () => {
  const records: any[] = [];
  const collector = new NetworkCaptureCollector(
    e => records.push(e),
    "https://example.supabase.co",
    "worker"
  );
  collector.start();
  const foreign = {
    origin: "https://provider.example",
    path: "/paid",
    method: "POST",
  };
  channel("undici:request:create").publish({ request: foreign });
  expect(records).toHaveLength(0);
  const frozen = Object.freeze({
    origin: "https://example.supabase.co",
    path: "/rest/v1/posts",
    method: "GET",
    onData: (_chunk: Buffer) => true,
    onBodySent: () => {},
  });
  channel("undici:request:create").publish({ request: frozen });
  expect(frozen.onData(Buffer.from("body"))).toBe(true);
  channel("undici:request:trailers").publish({ request: frozen });
  expect(records.at(-1)).toMatchObject({
    event: "supabase.end",
    complete: true,
    responseBodyBytes: null,
    byteMode: "unavailable",
  });
  channel("undici:request:create").publish({
    request: {
      origin: "https://example.supabase.co",
      path: "/auth/v1/user",
      method: "GET",
    },
  });
  collector.stop();
  expect(records.at(-1)).toMatchObject({
    event: "supabase.end",
    complete: false,
    responseBodyBytes: null,
    requestBodyBytes: null,
    byteMode: "unavailable",
  });
});
it("rejects indefinite captures and redacts private paths, storage objects and unsupported auth actions", () => {
  expect(
    validCapture(
      {
        id: "e436481f-3728-4a55-af91-31553d205157",
        scenario: "observed",
        start: 1000,
        until: 2000,
      },
      1500
    )
  ).toBe(true);
  expect(
    validCapture(
      {
        id: "e436481f-3728-4a55-af91-31553d205157",
        scenario: "observed",
        start: 1000,
        until: Infinity,
      },
      1500
    )
  ).toBe(false);
  expect(
    diagnosticEndpoint(
      "https://example.supabase.co/storage/v1/object/private/person@email.com/secret.png?token=private"
    )
  ).toBe("/storage/v1/:object");
  expect(
    diagnosticEndpoint("https://example.supabase.co/auth/v1/person@email.com")
  ).toBe("/auth/v1/:action");
  expect(diagnosticBrowser("Mozilla Firefox/132")).toBe("Firefox");
  expect(diagnosticBrowser("Mozilla OPR/114")).toBe("Opera");
});
