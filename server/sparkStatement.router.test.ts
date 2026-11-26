import { it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import { rpcCall } from "./billing";
import type { TrpcContext } from "./_core/context";

vi.mock("./billing", async original => ({
  ...(await original<typeof import("./billing")>()),
  rpcCall: vi.fn(),
}));

it("takes the statement payer exclusively from the authenticated session", async () => {
  const ctx = {
    req: { headers: {} },
    res: {},
    user: { id: "owner", role: "user" },
  } as TrpcContext;
  const call = appRouter.createCaller(ctx).billing.statement;
  vi.mocked(rpcCall).mockResolvedValue({ data: [], error: null });
  await expect(call({ payer: "another" } as never)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  await expect(
    appRouter.createCaller({ ...ctx, user: null }).billing.statement({})
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(rpcCall).not.toHaveBeenCalled();
  await expect(call({ before: "25" })).resolves.toEqual({
    entries: [],
    next: null,
  });
  expect(rpcCall).toHaveBeenCalledWith("read_spark_statement", {
    p_payer: "owner",
    p_before: "25",
  });
  await expect(call({ before: "9223372036854775808" })).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  const ledgerRows = Array.from({ length: 21 }, (_, i) => ({
    cursor: String(40 - i),
    occurred_at: "2026-01-01T12:00:00Z",
    delta: -1,
    balance: 50 - i,
    metadata: "private",
  }));
  vi.mocked(rpcCall).mockResolvedValue({ data: ledgerRows, error: null });
  const page = await call({});
  expect(page.entries).toHaveLength(20);
  expect(page.next).toBe("21");
  expect(page.entries[0]).not.toHaveProperty("metadata");
});
