import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { arsenalApi } from "../../client/src/lib/arsenalApi";
import { arsenalDefinitionSchema } from "../../shared/arsenalCatalog";
import { arsenalHash, type DesignContentV2 } from "../../shared/arsenalContent";
import { previewArsenalOffer } from "../../client/src/pages/CanvasLab/lib/arsenalGenerationCompiler";
import {
  CanvasPostStage,
  type CanvasPostStageRef,
} from "../../client/src/pages/CanvasLab/components/CanvasPostStage";
import type { ArsenalOffer } from "../../shared/arsenalGeneration";
import type { CanvasPostModel } from "../../client/src/pages/CanvasLab/components/types";
import "../../client/src/index.css";
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
  caption: "Prévia para revisão humana.",
  hashtags: [],
};
type Preview = {
  offer: ArsenalOffer;
  post: CanvasPostModel;
  durationMs: number;
};
function Card({ preview }: { preview: Preview }) {
  const ref = useRef<CanvasPostStageRef>(null),
    [status, setStatus] = useState(""),
    [png, setPng] = useState<string | null>(null);
  const c = preview.post.slides[0].composition!;
  const capture = async () => {
    try {
      const png = ref.current!.exportPng4K();
      setPng(png);
      const bytes = Uint8Array.from(atob(png.split(",")[1]), c =>
        c.charCodeAt(0)
      );
      const pngHash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
      )
        .map(n => n.toString(16).padStart(2, "0"))
        .join("");
      const result = await fetch("/harness/arsenalV2/capture", {
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
          durationMs: preview.durationMs,
          source: "browser-official-stage",
          approval: "pending",
        }),
      });
      if (!result.ok) throw new Error(await result.text());
      setStatus("PNG e hashes registrados; revisão humana pendente.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  return (
    <article className="rounded border border-white/20 p-3">
      <h2 className="font-semibold">
        {preview.offer.name} · {c.base.aspectRatio}
      </h2>
      <p className="mb-2 text-xs">{c.origin.candidateId}</p>
      <div className="flex justify-center">
        <CanvasPostStage ref={ref} post={preview.post} zoom={0.85} isReadOnly />
      </div>
      <p role="status" className="mt-2 text-xs">
        {c.state} ·{" "}
        {c.issues.join("; ") || "sem pendências técnicas nesta prévia"} ·{" "}
        {Math.round(preview.durationMs)} ms
      </p>
      <button
        className="my-2 rounded border p-2"
        onClick={() => void capture()}
      >
        Registrar PNG da prévia
      </button>
      <p>{status}</p>
      {png && (
        <a href={png} download={c.origin.variantKey + ".png"}>
          Baixar PNG oficial
        </a>
      )}
    </article>
  );
}
async function coldBatch() {
  const library = await arsenalApi.designCatalog.listArsenal.query({
    offset: 0,
  });
  const entry = library.entries.find(
    e => e.id === "21b3f6c0-8c18-429a-af12-10ae791f1864"
  );
  if (!entry) throw new Error("Versão real ausente");
  const d = arsenalDefinitionSchema.parse(entry.definition);
  const offers = await Promise.all(
    d.variants.map(v =>
      arsenalApi.designCatalog.previewArsenal.query({
        versionId: entry.id,
        variantKey: v.variantKey,
      })
    )
  );
  const t = performance.now();
  const posts = await Promise.all(
    offers.map(o => {
      if (!o) throw new Error("Oferta ausente");
      return previewArsenalOffer(o, content);
    })
  );
  const durationMs = performance.now() - t;
  const report = {
    source: "browser-official-compiler",
    condition:
      "fresh page/module font promises; private font fetch cache=no-store",
    batches: 1,
    variations: 3,
    technicallyValid: posts.filter(p => !p.slides[0].composition!.issues.length)
      .length,
    durationMs,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    contentHash: arsenalHash(content),
    productionGeneration: false,
    approval: "pending",
  };
  const r = await fetch("/harness/arsenalV2/cold-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!r.ok) throw new Error(await r.text());
  return `Carga inicial: ${report.technicallyValid}/3 válidas, ${Math.round(durationMs)} ms. Recarregue a página antes do próximo lote.`;
}
async function benchmark(previews: Preview[]) {
  const minimal = previews.filter(
    p => p.offer.candidate.versionId === "21b3f6c0-8c18-429a-af12-10ae791f1864"
  );
  if (minimal.length !== 3)
    throw new Error("Prepare os três formatos reais antes do benchmark");
  const durations = [];
  let valid = 0;
  for (let batch = 0; batch < 30; batch++) {
    const started = performance.now();
    const posts = await Promise.all(
      minimal.map(p => previewArsenalOffer(p.offer, content))
    );
    durations.push(performance.now() - started);
    valid += posts.filter(p => !p.slides[0].composition!.issues.length).length;
  }
  const ordered = [...durations].sort((a, b) => a - b);
  const report = {
    source: "browser-official-compiler",
    condition: "verified font promises already cached",
    productionGeneration: false,
    approval: "pending",
    batches: 30,
    variations: 90,
    technicallyValid: valid,
    durationsMs: durations,
    p95Ms: ordered[28],
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    contentHash: arsenalHash(content),
    candidates: minimal.map(p => p.offer.candidate.candidateId),
  };
  const response = await fetch("/harness/arsenalV2/benchmark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!response.ok) throw new Error(await response.text());
  return `30 lotes / 90 composições; ${valid} válidas; p95 ${Math.round(report.p95Ms)} ms em cache. Não é geração paga nem aceite humano.`;
}
function App() {
  const [previews, setPreviews] = useState<Preview[]>([]),
    [status, setStatus] = useState("Aguardando consulta autenticada."),
    [busy, setBusy] = useState(false);
  const [coldDone, setColdDone] = useState(false);
  const load = async () => {
    setBusy(true);
    setStatus("Lendo drafts e resolvendo fontes privadas…");
    try {
      const library = await arsenalApi.designCatalog.listArsenal.query({
        offset: 0,
      });
      const variants = library.entries.flatMap(entry => {
        const d = arsenalDefinitionSchema.parse(entry.definition);
        return d.variants
          .filter(v => !v.bindings.some(b => b.kind === "media"))
          .map(v => ({ versionId: entry.id, variantKey: v.variantKey }));
      });
      const rows: Preview[] = [];
      for (const v of variants) {
        const start = performance.now();
        const offer = await arsenalApi.designCatalog.previewArsenal.query(v);
        if (!offer) throw new Error("Oferta ausente");
        const post = await previewArsenalOffer(offer, content);
        rows.push({ offer, post, durationMs: performance.now() - start });
      }
      setPreviews(rows);
      setStatus(
        rows.length +
          " prévias reais sem foto; nenhuma aprovação foi registrada."
      );
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <button
        className="m-2 rounded border p-3"
        disabled={busy || coldDone || previews.length > 0}
        onClick={async () => {
          setBusy(true);
          setColdDone(true);
          try {
            setStatus(await coldBatch());
          } catch (e) {
            setStatus((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Medir lote com carga inicial
      </button>
      <h1 className="text-2xl">Arsenal V2 · prévias do catálogo real</h1>
      <p>
        Supabase spbuwcwmxlycchuwhfir → sessão autenticada → fontes privadas →
        CanvasLab oficial.
      </p>
      <p>Conteúdo de teste: “Sua ideia merece espaço.” / “Crie com clareza.”</p>
      <button
        className="my-4 rounded border p-3"
        disabled={busy}
        onClick={() => void load()}
      >
        Preparar prévias sem foto
      </button>
      <button
        className="m-2 rounded border p-3"
        disabled={busy || previews.length !== 7}
        onClick={async () => {
          setBusy(true);
          try {
            setStatus(await benchmark(previews));
          } catch (e) {
            setStatus((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Medir 30 lotes em cache
      </button>
      <p role="status">{status}</p>
      <div className="mt-4 grid gap-6 md:grid-cols-3">
        {previews.map(p => (
          <Card key={p.offer.candidate.candidateId} preview={p} />
        ))}
      </div>
    </main>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
import.meta.hot?.dispose(() => root.unmount());
