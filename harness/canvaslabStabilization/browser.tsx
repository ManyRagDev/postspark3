import React, { useState, useEffect } from "react";
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
import { createArsenalFixtureComposition } from "../../client/src/pages/CanvasLab/lib/arsenalFixture";
import { arsenalHash } from "../../shared/arsenalContent";
import {
  editArsenalContent,
  overrideArsenalElement,
  resolveArsenalComposition,
} from "../../client/src/pages/CanvasLab/lib/arsenalComposition";
import { findArsenalTextElementByRole } from "../../client/src/pages/CanvasLab/lib/slideReplication";
import "../../client/src/index.css";

const SAVE_KEY = "postspark.harness.canvaslab.stabilization.v1";
function fixture(catalog = false): CanvasPostModel {
  const post = {
    ...structuredClone(INITIAL_POST),
    id: "local-stabilization",
    familyId: "editorial-poster" as const,
    fontFamily: "Arial",
    subtextFontFamily: "Arial",
    isSnapEnabled: false,
    caption: "Legenda de teste",
    palette: { background: "#ffffff", text: "#111111", accent: "#2463eb" },
    slides: [0, 1, 2].map(i => ({
      id: `slide-${i}`,
      step: `${i + 1}`,
      headline: `Título do slide ${i + 1}`,
      subtext: `Texto de apoio ${i + 1}`,
      headlinePos: { x: 30.75, y: 80.125 },
      subtextPos: { x: 30.75, y: 220.125 },
      extraTexts: [
        {
          id: `extra-${i}`,
          text: "Selo comum",
          x: 30.75,
          y: 290.125,
          width: 150,
          fontSize: 18,
          color: "#111111",
        },
      ],
      extraShapes: [
        {
          id: `shape-${i}`,
          x: 190.5,
          y: 290.125,
          width: 60.25,
          height: 60.5,
          color: "#2463eb",
        },
      ],
    })),
    currentSlideIndex: 0,
  };
  if (!catalog) return post;
  let c = createArsenalFixtureComposition();
  const base = {
    ...c.base,
    bindings: c.base.bindings.map(b =>
      b.source === "sectionLabel" ? { ...b, source: "body" as const } : b
    ),
  };
  const content = {
    ...c.content,
    body: "Corpo da composição",
    sectionLabel: null,
  };
  c = resolveArsenalComposition({
    ...c,
    base,
    content,
    origin: { ...c.origin, variantHash: arsenalHash(base) },
    userContentHash: arsenalHash(content),
  });
  post.slides = post.slides.map((slide, i) => {
    let composition = editArsenalContent(c, {
      ...c.content,
      headline: `Título ${i + 1}`,
      body: `Corpo ${i + 1}`,
    });
    if (!i)
      composition = overrideArsenalElement(
        composition,
        findArsenalTextElementByRole(composition, "body")!.id,
        { fontSize: 49, lineHeight: 1.7, fill: "#123456", align: "right" }
      );
    return { ...slide, extraTexts: [], extraShapes: [], composition };
  });
  return post;
}
function App() {
  const [post, setPost] = useState<CanvasPostModel>(() => fixture());
  const [session, setSession] = useState(0),
    [saved, setSaved] = useState(false),
    [message, setMessage] = useState("");
  const [capture, setCapture] = useState("");
  useEffect(() => {
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (
        this.download &&
        (this.href.startsWith("data:image/png") ||
          this.href.startsWith("blob:"))
      ) {
        const extension = this.download.endsWith(".zip") ? "zip" : "png";
        void fetch(this.href)
          .then(r => r.blob())
          .then(async blob => {
            const response = await fetch(`/capture.${extension}`, {
              method: "POST",
              body: blob,
            });
            setCapture(
              response.ok
                ? `Exportação ${extension.toUpperCase()} capturada: ${blob.size} bytes`
                : "Falha na captura local"
            );
          });
        return;
      }
      original.call(this);
    };
    return () => {
      HTMLAnchorElement.prototype.click = original;
    };
  }, []);
  const reopen = () => {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    setPost(savedPostToCanvasModel({ id: 1, canvas_model: JSON.parse(raw) }));
    setSession(s => s + 1);
    setMessage("Documento reaberto do JSON salvo");
  };
  return (
    <>
      <div className="flex flex-wrap gap-2 bg-slate-900 p-2 text-xs text-white">
        <span className="p-2">
          Conferência local · sem geração ou persistência remota
        </span>
        <button
          className="min-h-11 rounded border px-3"
          onClick={() => {
            setPost(fixture());
            setSession(s => s + 1);
            setSaved(false);
          }}
        >
          Peça nativa
        </button>
        <button
          className="min-h-11 rounded border px-3"
          onClick={() => {
            setPost(fixture(true));
            setSession(s => s + 1);
            setSaved(false);
          }}
        >
          Peça de catálogo
        </button>
        <button className="min-h-11 rounded border px-3" onClick={reopen}>
          Reabrir JSON salvo
        </button>
        <output className="p-2">{message}</output>
        <output className="p-2">{capture}</output>
      </div>
      <CanvasLabPage
        key={session}
        initialPost={post}
        hasSavedPost={saved}
        onSave={async (next: CanvasPostModel) => {
          const payload = canvasModelToSavePayload(next, {
            inputType: "text",
            inputContent: "Conferência local",
          });
          localStorage.setItem(SAVE_KEY, JSON.stringify(payload.canvasModel));
          setSaved(true);
          setMessage("JSON salvo localmente");
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
          { headers: { "Content-Type": "application/json" } }
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
