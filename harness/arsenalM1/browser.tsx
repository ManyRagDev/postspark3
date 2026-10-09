import { trpc } from "../../client/src/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster, toast } from "sonner";
import CanvasLabPage from "../../client/src/pages/CanvasLab/CanvasLabPage";
import { createArsenalFixturePost } from "../../client/src/pages/CanvasLab/lib/arsenalFixture";
import {
  canvasModelToSavePayload,
  normalizeCanvasModel,
} from "../../client/src/pages/CanvasLab/lib/saveAdapter";
import type { CanvasPostModel } from "../../client/src/pages/CanvasLab/components/types";
import "../../client/src/index.css";

function App() {
  const [post, setPost] = useState<CanvasPostModel | null>(null),
    [error, setError] = useState("");
  const [key, setKey] = useState(0);
  const [exportImage, setExportImage] = useState<string | null>(null);
  // Observe the PNG produced by the official Stage export. No alternate renderer.
  useEffect(() => {
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith("data:image/png")) {
        setExportImage(this.href);
      }
      original.call(this);
    };
    return () => {
      HTMLAnchorElement.prototype.click = original;
    };
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("arsenal-m1-save");
    if (saved) {
      try {
        setPost(normalizeCanvasModel(JSON.parse(saved)));
        return;
      } catch (e) {
        setError((e as Error).message);
      }
    }
    createArsenalFixturePost()
      .then(setPost)
      .catch(e => setError(e.message));
  }, []);
  return (
    <>
      <div className="flex gap-3 items-center bg-slate-950 px-4 py-2 text-xs text-slate-200">
        <span>
          Conferência local · editor oficial · save em localStorage, sem banco
        </span>
        <button
          onClick={() => {
            const json = localStorage.getItem("arsenal-m1-save");
            if (json) {
              setPost(normalizeCanvasModel(JSON.parse(json)));
              setKey(n => n + 1);
            }
          }}
        >
          Reabrir último save local
        </button>
        <button
          onClick={() => {
            createArsenalFixturePost().then(setPost);
            setKey(n => n + 1);
          }}
        >
          Reiniciar fixture
        </button>
        <button
          onClick={async () => {
            await fetch("/harness/arsenalM1/test-font-failure?enabled=1");
            location.reload();
          }}
        >
          Simular fonte indisponível
        </button>
        <button
          onClick={async () => {
            await fetch("/harness/arsenalM1/test-font-failure?enabled=0");
            location.reload();
          }}
        >
          Recuperar fontes
        </button>
        <span>{error}</span>
      </div>
      {post && (
        <div className="h-[calc(100dvh-40px)]">
          <CanvasLabPage
            key={key}
            initialPost={post}
            hasSavedPost={Boolean(localStorage.getItem("arsenal-m1-save"))}
            onSave={async model => {
              const payload = canvasModelToSavePayload(model, {
                inputType: "text",
                inputContent: "M1 fixture",
              });
              localStorage.setItem(
                "arsenal-m1-save",
                JSON.stringify(payload.canvasModel)
              );
              return true;
            }}
          />
        </div>
      )}
      <Toaster />
      {exportImage && (
        <div className="fixed bottom-3 left-3 z-[100] rounded-lg bg-slate-950 p-3 text-white">
          <p className="text-xs">PNG produzido pelo CanvasLab</p>
          <a href={exportImage} download="arsenal-m1-oficial.png">
            <img
              src={exportImage}
              alt="PNG exportado pelo CanvasLab oficial"
              className="max-h-40"
            />
          </a>
          <button className="text-xs" onClick={() => setExportImage(null)}>
            Fechar evidência PNG
          </button>
          <button
            className="block text-xs"
            onClick={async () => {
              const png = await (await fetch(exportImage)).blob();
              const response = await fetch(
                "/harness/arsenalM1/capture-export",
                { method: "POST", body: png }
              );
              if (response.ok)
                toast.success(
                  "PNG oficial registrado em artifacts/arsenal-m1/browser-export.png"
                );
              else toast.error("Não foi possível registrar o PNG local.");
            }}
          >
            Registrar PNG local
          </button>
        </div>
      )}
    </>
  );
}
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const client = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/harness-trpc",
      transformer: superjson,
      fetch: async input => {
        const url = String(input),
          names = url.split("/harness-trpc/")[1].split("?")[0].split(",");
        return new Response(
          JSON.stringify(
            names.map(() => ({ result: { data: { json: null } } }))
          ),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    }),
  ],
});
createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={client} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
