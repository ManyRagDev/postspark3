import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

/** Image work has its own request so cancelling a preview cancels its HTTP transport. */
export const imageEditorApi = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),
    }),
  ],
});
