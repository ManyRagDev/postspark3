import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { arsenalApi } from "@/lib/arsenalApi";
import { supabase } from "@/lib/supabaseClient";
import {
  arsenalDefinitionSchema,
  arsenalImportSchema,
} from "@shared/arsenalCatalog";
import {
  arsenalHash,
  designContentDocumentSchema,
  type DesignContentV2, type DesignContent,
} from "@shared/arsenalContent";
import type { ArsenalOffer } from "@shared/arsenalGeneration";
import { previewArsenalOffer } from "../CanvasLab/lib/arsenalGenerationCompiler";
import {
  CanvasPostStage,
  type CanvasPostStageRef,
} from "../CanvasLab/components/CanvasPostStage";
import type { CanvasPostModel } from "../CanvasLab/components/types";

const button =
  "rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40";
const sample: DesignContentV2 = {
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
  caption: "Uma prévia de revisão; não representa conteúdo gerado.",
  hashtags: [],
};
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes))
    .map(n => n.toString(16).padStart(2, "0"))
    .join("");

/** Persistent catalogue. Portable recipes and reference evaluations stay in the lab below. */
export default function ArsenalPanel() {
  const [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    offer: ArsenalOffer;
    post: CanvasPostModel;
    content: DesignContent;
  } | null>(null);
  const [copy, setCopy] = useState(JSON.stringify(sample, null, 2)),
    [notes, setNotes] = useState("");
  const [license, setLicense] = useState(""),
    [weight, setWeight] = useState(400);
  const stage = useRef<CanvasPostStageRef>(null);
  const library = trpc.designCatalog.listArsenal.useQuery(
    { offset },
    { retry: false }
  );
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await library.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operação indisponível");
    } finally {
      setBusy(false);
    }
  };
  const open = async (versionId: string, variantKey: string) =>
    act(async () => {
      const content = designContentDocumentSchema.parse(JSON.parse(copy));
      const offer = await arsenalApi.designCatalog.previewArsenal.query(
        { versionId, variantKey },
        { signal: AbortSignal.timeout(8000) }
      );
      if (!offer) throw new Error("Variante não encontrada");
      const post = await previewArsenalOffer(offer, content);
      setPreview({ offer, post, content });
    });
  const review = (decision: "approved" | "rejected") =>
    act(async () => {
      if (!preview || !stage.current)
        throw new Error("Abra a prévia antes de avaliar");
      const dataUrl = stage.current.exportPng4K();
      if (!dataUrl) throw new Error("PNG ainda indisponível");
      const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), c =>
        c.charCodeAt(0)
      );
      const pngHash = hex(await crypto.subtle.digest("SHA-256", bytes));
      const c = preview.offer.candidate;
      await arsenalApi.designCatalog.reviewArsenal.mutate({
        versionId: c.versionId,
        variantKey: c.variantKey,
        definitionHash: c.definitionHash,
        variantHash: c.variantHash,
        pngHash,
        briefingHash: arsenalHash(preview.content),
        decision,
        notes,
      });
    });
  const upload = async (file: File) =>
    act(async () => {
      if (!supabase) throw new Error("Supabase indisponível");
      if (file.size > 8 * 1024 * 1024)
        throw new Error("Limite de 8 MiB por asset");
      const sha256 = hex(
        await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
      );
      const signed =
        await arsenalApi.designCatalog.requestArsenalAssetUpload.mutate({
          sha256,
        });
      const result = await supabase.storage
        .from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType:
            file.type ||
            ({ woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" }[
              file.name.split(".").pop() as "woff2" | "ttf" | "otf"
            ] ??
              "application/octet-stream"),
        });
      if (result.error) throw result.error;
      await arsenalApi.designCatalog.finalizeArsenalAssetUpload.mutate({
        sha256,
        license: license || undefined,
        weight,
      });
    });
  const importFile = async (file: File) =>
    act(async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error("Pacote excede 2 MiB");
      await arsenalApi.designCatalog.prepareArsenalDraft.mutate(
        arsenalImportSchema.parse(JSON.parse(await file.text()))
      );
    });
  return (
    <section
      className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5"
      aria-label="Biblioteca Arsenal V2"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Arsenal V2 · catálogo compartilhado
        </h2>
        <button
          className={button}
          disabled={busy}
          onClick={() => void library.refetch()}
        >
          Atualizar biblioteca
        </button>
      </div>
      <p className="text-sm text-slate-400">
        {library.data?.total ?? 0} versões no servidor. Cada formato exige uma
        avaliação própria antes da publicação. Fontes e peças permanecem
        disponíveis para os posts já entregues.
      </p>
      {library.error && (
        <p role="alert" className="text-red-300">
          {library.error.message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {busy && <p role="status">Preparando…</p>}
      <details>
        <summary className="cursor-pointer">Incorporar novo design</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            1. Licença/procedência da fonte
            <input
              aria-label="Licença do asset"
              className="block w-full rounded bg-slate-900 p-2"
              value={license}
              onChange={e => setLicense(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Peso da fonte
            <input
              aria-label="Peso do asset"
              type="number"
              min={100}
              max={900}
              step={100}
              value={weight}
              onChange={e => setWeight(Number(e.target.value))}
              className="block rounded bg-slate-900 p-2"
            />
          </label>
          <label className="text-sm">
            2. Bytes do asset privado
            <input
              aria-label="Enviar asset do Arsenal"
              type="file"
              disabled={busy}
              accept=".woff2,.ttf,.otf,.png,.jpg,.jpeg,.webp"
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </label>
          <label className="text-sm">
            3. Pacote de catálogo
            <input
              aria-label="Importar pacote Arsenal V2"
              type="file"
              disabled={busy}
              accept=".json"
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importFile(f);
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Use postspark.arsenal.import com bindings e política de marca
          explícitos. Uma receita portátil precisa ser convertida antes da
          importação. O draft não herda aprovação de outra imagem.
        </p>
      </details>
      <label className="block text-sm">
        Conteúdo para avaliar a composição
        <textarea
          aria-label="Conteúdo da prévia Arsenal"
          value={copy}
          onChange={e => setCopy(e.target.value)}
          className="mt-2 h-32 w-full rounded bg-slate-950 p-3 font-mono text-xs"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {library.data?.entries.map(entry => {
          const d = arsenalDefinitionSchema.safeParse(entry.definition);
          return (
            <article
              key={entry.id}
              className="rounded-xl border border-white/10 p-3"
            >
              <h3 className="font-medium">
                {d.success ? d.data.name : "Definição inválida"} · v
                {entry.version}
              </h3>
              <p className="text-xs text-slate-400">
                {entry.status} · {entry.content_hash.slice(0, 12)}
              </p>
              {d.success ? (
                d.data.variants.map(v => {
                  const index = library.data.index.some(
                    i =>
                      i.version_id === entry.id &&
                      i.variant_key === v.variantKey
                  );
                  const human = library.data.evidence.find(
                    e =>
                      e.version_id === entry.id &&
                      e.variant_key === v.variantKey &&
                      e.kind === "human"
                  );
                  const linked = v.assetIds.every(id =>
                    library.data.assets.some(
                      a => a.version_id === entry.id && a.asset_id === id
                    )
                  );
                  return (
                    <div key={v.variantKey} className="mt-3">
                      <p className="text-xs">
                        {v.aspectRatio} · índice {index ? "pronto" : "pendente"}{" "}
                        · assets {linked ? "prontos" : "pendentes"} · revisão{" "}
                        {human?.decision ?? "pendente"}
                        {v.bindings.some(b => b.kind === "media")
                          ? " · exige foto"
                          : " · sem foto"}
                      </p>
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => void open(entry.id, v.variantKey)}
                      >
                        Revisar {v.aspectRatio}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p role="alert">{d.error.message}</p>
              )}
              <button
                className={button + " mt-3"}
                disabled={busy || entry.status !== "draft"}
                onClick={() =>
                  void act(async () => {
                    await arsenalApi.designCatalog.publishArsenal.mutate({
                      versionId: entry.id,
                      status: "approved",
                    });
                  })
                }
              >
                Publicar versão revisada
              </button>
            </article>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          className={button}
          disabled={offset === 0 || busy}
          onClick={() => setOffset(n => Math.max(0, n - 50))}
        >
          Anterior
        </button>
        <button
          className={button}
          disabled={offset + 50 >= (library.data?.total ?? 0) || busy}
          onClick={() => setOffset(n => n + 50)}
        >
          Próxima
        </button>
      </div>
      {preview && (
        <div className="space-y-3 border-t border-white/10 pt-4">
          <h3>
            {preview.offer.name} · {preview.offer.candidate.variant.aspectRatio}
          </h3>
          <div className="flex justify-center overflow-hidden">
            <CanvasPostStage
              key={preview.post.id}
              ref={stage}
              post={preview.post}
              zoom={0.8}
              isReadOnly
            />
          </div>
          <p role="status" className="text-sm">
            {preview.post.slides[0].composition?.state} ·{" "}
            {preview.post.slides[0].composition?.issues.join("; ") ||
              "sem pendências técnicas nesta prévia"}
          </p>
          <label className="block text-sm">
            Observações da avaliação
            <input
              aria-label="Observações da revisão"
              className="block w-full rounded bg-slate-900 p-2"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              disabled={
                busy ||
                preview.post.slides[0].composition?.state === "needs_adjustment"
              }
              onClick={() => void review("approved")}
            >
              Aprovar esta variante visualmente
            </button>
            <button
              className={button}
              disabled={busy}
              onClick={() => void review("rejected")}
            >
              Rejeitar esta variante
            </button>
          </div>
          <p className="text-xs text-slate-400">
            A decisão registra sua conta, os hashes da variante, do conteúdo e
            do PNG exportado pelo CanvasLab. A publicação confere todas as
            variantes no banco.
          </p>
        </div>
      )}
    </section>
  );
}
