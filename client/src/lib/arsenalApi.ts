import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
/** Same authenticated backend as the React hooks; usable from the pure compiler/asset loader. */
export const arsenalApi = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),
    }),
  ],
});
