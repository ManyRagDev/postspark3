import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import source from "../../artifacts/arsenal-v2/instagram-4x5/package.json";
import report from "../../artifacts/arsenal-v2/instagram-4x5/report.json";
import { arsenalImportSchema } from "../../shared/arsenalCatalog";
import { arsenalOfferSchema } from "../../shared/arsenalGeneration";
import { arsenalHash, type DesignContentV2 } from "../../shared/arsenalContent";
import { previewArsenalOffer } from "../../client/src/pages/CanvasLab/lib/arsenalGenerationCompiler";
import {
  CanvasPostStage,
  type CanvasPostStageRef,
} from "../../client/src/pages/CanvasLab/components/CanvasPostStage";
import type { CanvasPostModel } from "../../client/src/pages/CanvasLab/components/types";
import {
  canvasModelToSavePayload,
  savedPostToCanvasModel,
} from "../../client/src/pages/CanvasLab/lib/saveAdapter";
import "../../client/src/index.css";

const p = arsenalImportSchema.parse(source);
const variant = p.definition.variants.find(v => v.aspectRatio === "4:5")!;
const offer = arsenalOfferSchema.parse({
  name: p.definition.name,
  description: p.definition.description,
  pieces: p.pieces,
  // Local transport uses exactly the same SHA-256/bytes/family/weight as the catalog.
  // This review does not claim to validate authenticated private asset transport.
  assets: p.definition.assets.map(a => ({ ...a, kind: "bundled" })),
  candidate: {
    candidateId: `${report.versionId}:${variant.variantKey}`,
    blueprintId: p.blueprintId,
    versionId: report.versionId,
    version: report.version,
    definitionHash: arsenalHash(p.definition),
    variantKey: variant.variantKey,
    variantHash: arsenalHash(variant),
    compilerVersion: variant.compilerVersion,
    variant,
  },
});
const content: DesignContentV2 = {
  schemaVersion: 2,
  headline: "Sua ideia merece espaço.",
  body: "Crie com clareza.",
  eyebrow: null,
  sectionLabel: null,
  callToAction: null,
  label: null,
  items: [],
  metric: null,
  attribution: null,
  comparison: null,
  caption: "Prévia 4:5 para revisão humana.",
  hashtags: [],
};
function App() {
  const [post, setPost] = useState<CanvasPostModel | null>(null);
  const [status, setStatus] = useState("Carregando fontes verificadas…");
  const [png, setPng] = useState<string | null>(null);
  const stage = useRef<CanvasPostStageRef>(null);
  useEffect(() => {
    let current = true;
    previewArsenalOffer(offer, content)
      .then(p => {
        if (current) {
          setPost(p);
          setStatus("Canvas 4:5 pronto.");
        }
      })
      .catch(e => {
        if (current) setStatus(e.message);
      });
    return () => {
      current = false;
    };
  }, []);
  const reopen = () => {
    const payload = canvasModelToSavePayload(post!, {
      inputType: "text",
      inputContent: "revisão 4:5",
    });
    const reopened = savedPostToCanvasModel({
      id: 1,
      canvas_model: JSON.parse(JSON.stringify(payload.canvasModel)),
    })!;
    if (
      arsenalHash(reopened.slides[0].composition) !==
      arsenalHash(post!.slides[0].composition)
    )
      throw new Error("Reabertura divergente");
    setPost(reopened);
    setStatus("Salvar/reabrir local: formato 4:5 e hash preservados.");
  };
  const capture = async () => {
    try {
      const png = stage.current!.exportPng4K();
      const bytes = Uint8Array.from(atob(png.split(",")[1]), c =>
        c.charCodeAt(0)
      );
      const pngHash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
      )
        .map(n => n.toString(16).padStart(2, "0"))
        .join("");
      const c = post!.slides[0].composition!;
      const res = await fetch("/harness/arsenalV2/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...c.origin,
          png,
          pngHash,
          briefingHash: arsenalHash(content),
          content,
          state: c.state,
          issues: c.issues,
          artboard: c.artboard,
          source: "browser-official-stage",
          fontTransport: "bundled-identical-bytes",
          approval: "pending",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPng(png);
      setStatus("PNG 4:5 registrado; revisão humana pendente.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  return (
    <main className="min-h-screen bg-[#10141d] p-6 text-white">
      <h1 className="text-xl">PostSpark · Instagram 4:5</h1>
      <p>Prancheta 1080 × 1350 · Canvas 360 × 450 · exportação 1440 × 1800</p>
      <p className="my-2 text-sm">
        Minimal Air · nova variante nativa · draft no catálogo · aceite visual
        pendente
      </p>
      {post && (
        <div className="my-4 flex gap-6 items-start">
          <CanvasPostStage ref={stage} post={post} zoom={1} isReadOnly />
          <div>
            <button className="block rounded border p-2 mb-2" onClick={reopen}>
              Salvar/reabrir local
            </button>
            <button
              className="block rounded border p-2 mb-2"
              onClick={() => void capture()}
            >
              Registrar PNG 4:5
            </button>
            {png && (
              <a href={png} download="minimal-air-4x5.png">
                Baixar PNG oficial
              </a>
            )}
            <p className="mt-3">
              {post.slides[0].composition!.state} ·{" "}
              {post.slides[0].composition!.issues.join("; ") ||
                "sem pendências técnicas"}
            </p>
          </div>
        </div>
      )}
      <p role="status">{status}</p>
      <p className="mt-4 text-xs">
        Prévia local com fontes de bytes idênticos. Não testa login, billing nem
        persistência remota.
      </p>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
