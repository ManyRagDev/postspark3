/** Test entry: real App, routes, Supabase SDK and cookie bridge. Network is simulated by the runner. */
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "@/lib/trpc";
import { AuthProvider } from "@/_core/hooks/useAuth";
import App from "@/App";
import { browserMeasurer } from "@/lib/browserMeasurer";
import { setTypographyMeasurer } from "@shared/typography/measurer";
import "@/index.css";

setTypographyMeasurer(browserMeasurer);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const client = trpc.createClient({ links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })] });
createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={client} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}><AuthProvider><App /></AuthProvider></QueryClientProvider>
  </trpc.Provider>
);
