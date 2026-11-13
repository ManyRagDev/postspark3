import { expect, it, vi } from "vitest";
import { demandSessionQuery, demandSessionTimeouts } from "./demandSession";

it("sets database timeouts before the client timer so locks cannot trap LISTEN indefinitely", () => {
  expect(demandSessionTimeouts.lock_timeout).toBeLessThan(demandSessionTimeouts.statement_timeout);
  expect(demandSessionTimeouts.statement_timeout).toBeLessThan(demandSessionTimeouts.query_timeout);
});
it("invalidates a socket on client read timeout instead of reusing a potentially executing transaction", async () => {
  const error = new Error("Query read timeout"), invalidate = vi.fn();
  await expect(demandSessionQuery(async () => { throw error; }, invalidate)).rejects.toBe(error);
  expect(invalidate).toHaveBeenCalledOnce();
});
it("preserves the session after PostgreSQL cancelled a statement or rejected a query", async () => {
  const invalidate = vi.fn();
  for (const code of ["57014", "55P03", "23505"]) {
    const error = Object.assign(new Error("database error"), { code });
    await expect(demandSessionQuery(async () => { throw error; }, invalidate)).rejects.toBe(error);
  }
  expect(invalidate).not.toHaveBeenCalled();
});
