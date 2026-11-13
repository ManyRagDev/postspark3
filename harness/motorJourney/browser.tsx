/** Local browser harness only. API/provider responses are simulated by the runner. */
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { Route, Switch } from "wouter";
import { Toaster } from "sonner";
import { trpc } from "@/lib/trpc";
import { AuthProvider } from "@/_core/hooks/useAuth";
import Studio from "@/pages/StudioApp/StudioAppV2BPage";
import SavedPosts from "@/pages/SavedPosts";
import { INITIAL_POST } from "@/pages/CanvasLab/components/types";
import { browserMeasurer } from "@/lib/browserMeasurer";
import { setTypographyMeasurer } from "@shared/typography/measurer";
import "@/index.css";

(window as any).__motorFixture = INITIAL_POST;
setTypographyMeasurer(browserMeasurer);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
const client = trpc.createClient({ links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })] });
createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={client} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}><AuthProvider>
      <Switch><Route path="/saved-posts" component={SavedPosts} /><Route component={Studio} /></Switch>
      <Toaster />
    </AuthProvider></QueryClientProvider>
  </trpc.Provider>
);
