import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Konva from "konva";
import CanvasLabPage from "../../client/src/pages/CanvasLab/CanvasLabPage";
import { type CanvasPostModel } from "../../client/src/pages/CanvasLab/components/types";
import { createTestComposedPost } from "./fixtures";
import { canvasModelToSavePayload, savedPostToCanvasModel } from "../../client/src/pages/CanvasLab/lib/saveAdapter";
import { readArsenalComposition } from "@shared/designArsenal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "../../client/src/lib/trpc";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch: () => Promise.resolve(new Response(JSON.stringify({ result: { data: null } }), { headers: { "content-type": "application/json" } })),
    }),
  ],
});

(window as any).audit = {
  Konva,
  saveCalls: [] as CanvasPostModel[],
  canvasModelToSavePayload,
  savedPostToCanvasModel,
  readArsenalComposition,
};

function HarnessApp() {
  const [post, setPost] = useState<CanvasPostModel>(createTestComposedPost());
  const [key, setKey] = useState(0);

  (window as any).audit.getPost = () => post;
  (window as any).audit.setPost = (next: CanvasPostModel) => {
    setPost(next);
    setKey((k) => k + 1);
  };

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <CanvasLabPage
        key={key}
        initialPost={post}
        onSave={async (savedPost) => {
          (window as any).audit.saveCalls.push(structuredClone(savedPost));
          return true;
        }}
      />
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <HarnessApp />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

