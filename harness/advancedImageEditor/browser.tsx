import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { Toaster } from "sonner";
import { trpc } from "../../client/src/lib/trpc";
import { AuthProvider } from "../../client/src/_core/hooks/useAuth";
import CanvasLabPage from "../../client/src/pages/CanvasLab/CanvasLabPage";
import {
  INITIAL_POST,
  type CanvasPostModel,
} from "../../client/src/pages/CanvasLab/components/types";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "../../client/src/pages/CanvasLab/lib/saveAdapter";
import "../../client/src/index.css";
function fixture(): CanvasPostModel {
  return {
    ...structuredClone(INITIAL_POST),
    id: "advanced-local",
    fontFamily: "Arial",
    palette: { background: "#f6f6f6", text: "#111111", accent: "#f97316" },
    currentSlideIndex: 0,
    slides: [0, 1].map(i => ({
      id: `slide-${i}`,
      step: `${i + 1}`,
      headline: `Teste de imagem ${i + 1}`,
      subtext: "O texto e a posição permanecem.",
      headlinePos: { x: 24, y: 24 },
      subtextPos: { x: 24, y: 85 },
      extraImages: [
        {
          id: `photo-${i}`,
          url: "/fixture-image",
          x: 90.125,
          y: 140.75,
          width: 180,
          height: 180,
          rotation: 0,
          opacity: 1,
        },
      ],
    })),
  };
}
function App() {
  const [post, setPost] = useState(fixture),
    [session, setSession] = useState(0),
    [saved, setSaved] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (
        (this.download.toLowerCase().endsWith(".png") || this.download.toLowerCase().endsWith(".zip")) &&
        (this.href.startsWith("data:image/png") ||
          this.href.startsWith("blob:"))
      ) {
        const capturePath = this.download.toLowerCase().endsWith(".zip") ? "/capture.zip" : "/capture.png";
        void fetch(this.href)
          .then(r => r.blob())
          .then(blob => fetch(capturePath, { method: "POST", body: blob }))
          .then(() => setMessage("Arquivo exportado e capturado"));
        return;
      }
      original.call(this);
    };
    return () => {
      HTMLAnchorElement.prototype.click = original;
    };
  }, []);
  return (
    <>
      <div className="flex flex-wrap gap-2 bg-slate-900 p-2 text-xs text-white">
        <span className="p-2">
          Conferência local · CLI/API reais · identidade e mídia de teste
        </span>
        <button
          className="min-h-11 rounded border px-3"
          onClick={async () => {
            const response = await fetch("/saved-model");
            if (!response.ok) return;
            const data = await response.json();
            setPost(
              savedPostToCanvasModel({ id: 1, canvas_model: data.canvasModel })
            );
            setSaved(true);
            setSession(s => s + 1);
            setMessage("Documento reaberto do arquivo salvo");
          }}
        >
          Reabrir salvo
        </button>
        <button
          className="min-h-11 rounded border px-3"
          onClick={() => {
            setPost(fixture());
            setSession(s => s + 1);
            setSaved(false);
            setMessage("Nova peça de teste");
          }}
        >
          Nova peça
        </button>
        <output className="self-center" aria-live="polite">
          {message}
        </output>
      </div>
      <CanvasLabPage
        key={session}
        initialPost={post}
        hasSavedPost={saved}
        onSave={async next => {
          const payload = canvasModelToSavePayload(next, {
            inputType: "text",
            inputContent: "Local image editing journey",
          });
          const response = await fetch("/save-model", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) return false;
          setSaved(true);
          setMessage(
            `Documento salvo · ${Object.keys(next.advancedImageAssets ?? {}).length} edição(ões) de imagem`
          );
          return true;
        }}
      />
      <Toaster />
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
      fetch: async input =>
        new Response(
          JSON.stringify(
            String(input)
              .split("/harness-trpc/")[1]
              .split("?")[0]
              .split(",")
              .map(() => ({ result: { data: { json: null } } }))
          ),
          { headers: { "content-type": "application/json" } }
        ),
    }),
  ],
});
const root =
  import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <trpc.Provider client={client} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
