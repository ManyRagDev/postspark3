import type { ClientConfig } from "pg";

/** Server cancellation precedes the client timeout. query_timeout alone does not
 * cancel an already sent query and can leave LISTEN trapped in its transaction.
 */
export const demandSessionTimeouts = {
  statement_timeout: 10_000,
  lock_timeout: 3_000,
  query_timeout: 15_000,
} satisfies ClientConfig;

export async function demandSessionQuery<T>(work: () => Promise<T>, invalidate: () => void): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof Error && error.message === "Query read timeout") invalidate();
    throw error;
  }
}
