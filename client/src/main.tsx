import {AuthProvider} from "./_core/hooks/useAuth";
import {ensureSessionForRequest,clearBridgeMarker} from "./lib/authBridge";
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";
import { browserMeasurer } from "@/lib/browserMeasurer";
import { setTypographyMeasurer } from "@shared/typography/measurer";

// CR-002: o browser mede tipografia com a fonte REALMENTE carregada (canvas).
// Sem este registro, a re-resolução de edição falharia (missing-font) e o
// renderer voltaria silenciosamente ao autofit legado.
setTypographyMeasurer(browserMeasurer);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Quando a API retorna UNAUTHORIZED, não redirecionamos para lugar nenhum.
 * O AuthGate no App.tsx exibe o LoginModal automaticamente.
 */
queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    if (error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG) {
      // Invalida a query de auth para forçar o AuthGate a aparecer
      clearBridgeMarker();
      if(event.query.queryKey?.[0]?.toString()!=="auth,me")queryClient.invalidateQueries({ queryKey: [["auth", "me"]] });
    }
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    if (error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG) {
      queryClient.invalidateQueries({ queryKey: [["auth", "me"]] });
    }
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        if(import.meta.env.DEV)await ensureSessionForRequest();
        const response = await globalThis.fetch(input, {
          ...(init ?? {}),
          headers: import.meta.env.DEV
            ? { ...Object.fromEntries(new Headers(init?.headers).entries()), "X-PostSpark-Auth-Bridge": "shared" }
            : init?.headers,
          credentials: "include",
        });
        if (!response.headers.get("content-type")?.toLowerCase().includes("json")) {
          if (response.status === 413) {
            throw new Error("O envio do post excedeu o limite da produção. Reduza algumas imagens e tente salvar novamente.");
          }
          throw new Error(`A API respondeu em formato inesperado (HTTP ${response.status}). Tente novamente em instantes.`);
        }
        return response;
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider><App /></AuthProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
