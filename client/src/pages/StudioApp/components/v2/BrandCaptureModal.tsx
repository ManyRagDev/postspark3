import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isStandaloneHttpUrl } from "@shared/generationSources";
import { trpc } from "@/lib/trpc";
import {
  brandProjectInputSchema,
  type BrandProjectInput,
} from "@shared/brandProjects";
const fields = {
  offerAndTransformation: "Oferta e transformação",
  factualDifferentials: "Fatos e diferenciais",
  targetAudience: "Público",
  painsAndObjections: "Dores e objeções",
  voiceTone: "Tom",
  forbiddenTerms: "Proibições",
  defaultCta: "CTA padrão",
} as const;
type ImportProps = {
  projectId?: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function BrandImportDialog(props: ImportProps) {
  const [address, setAddress] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [error, setError] = useState("");
  if (captureUrl) return <BrandCaptureModal {...props} url={captureUrl} />;

  return (
    <Dialog open onOpenChange={open => { if (!open) props.onClose(); }}>
      <DialogContent className="border-white/15 bg-[#181818] text-white">
        <DialogTitle>Importar marca do site</DialogTitle>
        <DialogDescription>Revise a oferta, o público, o tom de voz e as preferências visuais antes de salvar no projeto.</DialogDescription>
        <form className="grid gap-4" onSubmit={event => {
          event.preventDefault();
          const value = address.trim();
          const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
          if (!isStandaloneHttpUrl(url) || !/^https?:\/\/[^/]/i.test(url)) {
            setError("Informe um endereço de site válido.");
            return;
          }
          setCaptureUrl(new URL(url).href);
        }}>
          <label className="grid gap-2 text-sm">
            Site da marca
            <input autoFocus required inputMode="url" autoCapitalize="none" spellCheck={false}
              value={address} onChange={event => { setAddress(event.target.value); setError(""); }}
              placeholder="www.suamarca.com.br" className="min-h-11 rounded-lg border border-white/20 bg-black/30 px-3 text-base" />
          </label>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button type="submit" disabled={!address.trim()} className="min-h-11 rounded-lg bg-orange-500 px-4 font-semibold text-black disabled:opacity-50">
            Analisar marca gratuitamente
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function BrandCaptureModal({
  url,
  projectId,
  onClose,
  onSaved,
}: ImportProps & { url: string }) {
  const [captureId, setCaptureId] = useState<string>();
  const [transport, setTransport] = useState<"events" | "poll">("poll");
  const [error, setError] = useState("");
  const [project, setProject] = useState<BrandProjectInput>();
  const [updateExisting, setUpdateExisting] = useState(false);
  const saveKey = useRef(crypto.randomUUID());
  const started = useRef(false),
    start = trpc.brandProjects.captureStart.useMutation(),
    save = trpc.brandProjects.captureSave.useMutation(),
    utils = trpc.useUtils();
  const capture = trpc.brandProjects.captureGet.useQuery(
    { captureId: captureId! },
    {
      enabled: !!captureId,
      refetchInterval: q =>
        transport !== "events" &&
        ["queued", "running"].includes(q.state.data?.status ?? "")
          ? 2000
          : false,
    }
  );
  const captureEvents = useGenerationEvents(
    captureId ?? null,
    transport === "events" &&
      ["queued", "running", undefined].includes(capture.data?.status),
    () => {
      void capture.refetch();
    },
    () => {
      void capture.refetch();
    }
  );
  const begin = async (refresh = false) => {
    setError("");
    let key = sessionStorage.getItem("postspark.capture.key:" + url);
    if (!key || refresh) {
      key = crypto.randomUUID();
      sessionStorage.setItem("postspark.capture.key:" + url, key);
    }
    try {
      const c = await start.mutateAsync({ url, idempotencyKey: key, refresh });
      setCaptureId(c.id);
      setTransport(c.progressTransport ?? "poll");
      if (c.preview) setProject(c.preview);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível iniciar a captura."
      );
    }
  };
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void begin();
    }
  }, []);
  useEffect(() => {
    if (capture.data?.preview) setProject(capture.data.preview);
  }, [capture.data?.id, capture.data?.status]);
  const lastSave = useRef<string | undefined>(undefined);
  const submit = async () => {
    if (!project || !captureId) return;
    setError("");
    try {
      const valid = brandProjectInputSchema.parse({
        ...project,
        id: updateExisting ? projectId : undefined,
      });
      const body = JSON.stringify(valid);
      if (lastSave.current && lastSave.current !== body)
        saveKey.current = crypto.randomUUID();
      lastSave.current = body;
      const r = await save.mutateAsync({
        captureId,
        idempotencyKey: saveKey.current,
        project: valid,
      });
      await utils.brandProjects.list.invalidate().catch(() => {});
      onSaved(r.project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };
  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capture-title"
    >
      <section className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl bg-[#211f1b] p-4 text-[#f2ede4] md:max-h-[90vh] md:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 id="capture-title" className="text-xl">
            Revise a marca
          </h2>
          <button onClick={onClose} aria-label="Fechar captura" className="min-h-11 shrink-0 rounded-lg px-2 text-sm text-white/80 hover:bg-white/10 md:min-h-0">
            Fechar
          </button>
        </div>
        {captureEvents.error && (
          <p role="alert">
            A conexão com a captura foi interrompida.{" "}
            <button onClick={captureEvents.reconnect}>Reconectar</button>
          </p>
        )}
        <p className="my-3 text-sm [overflow-wrap:anywhere]">{url}</p>
        {!project &&
          ["queued", "running", undefined].includes(capture.data?.status) &&
          !error && (
            <p role="status">Analisando conteúdo e identidade visual…</p>
          )}
        {(error || capture.error?.message || capture.data?.error) && (
          <p role="alert" className="my-3 text-red-300">
            {error || capture.error?.message || capture.data?.error}
          </p>
        )}
        {project && (
          <>
            <p className="text-sm">
              As sugestões de público, tom e preferências visuais podem ser
              inferidas. Confira os fatos antes de salvar.
            </p>
            {project.capture?.warnings.map((w, i) => (
              <p key={i} className="my-2 text-sm text-amber-200">
                {w}
              </p>
            ))}
            <label className="my-3 block">
              Nome
              <input
                className="block w-full rounded bg-black/30 p-2"
                value={project.name}
                maxLength={120}
                onChange={e => setProject({ ...project, name: e.target.value })}
              />
            </label>
            <label className="my-3 block">
              Segmento
              <input
                className="block w-full rounded bg-black/30 p-2"
                value={project.niche}
                maxLength={120}
                onChange={e =>
                  setProject({ ...project, niche: e.target.value })
                }
              />
            </label>
            {Object.entries(fields).map(([key, label]) => (
              <label className="my-3 block" key={key}>
                {label}
                {project.capture?.inferredFields.includes(key)
                  ? " · inferido"
                  : ""}
                <textarea
                  className="block min-h-20 w-full rounded bg-black/30 p-2"
                  maxLength={
                    ["voiceTone", "defaultCta"].includes(key) ? 1000 : 2000
                  }
                  value={project.structuredData[key as keyof typeof fields]}
                  onChange={e =>
                    setProject({
                      ...project,
                      structuredData: {
                        ...project.structuredData,
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
            <fieldset className="my-4">
              <legend>Preferências visuais para a seleção</legend>
              <label>
                Cores
                <input
                  className="block w-full bg-black/30 p-2"
                  value={project.visualPreferences?.colors.join(", ") ?? ""}
                  onChange={e =>
                    setProject({
                      ...project,
                      visualPreferences: {
                        ...project.visualPreferences!,
                        colors: e.target.value
                          .split(",")
                          .map(s => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </label>
              <label>
                Fontes
                <input
                  className="block w-full bg-black/30 p-2"
                  value={project.visualPreferences?.fonts.join(", ") ?? ""}
                  onChange={e =>
                    setProject({
                      ...project,
                      visualPreferences: {
                        ...project.visualPreferences!,
                        fonts: e.target.value
                          .split(",")
                          .map(s => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </label>
            </fieldset>
            {projectId && (
              <label className="my-4 block">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={e => setUpdateExisting(e.target.checked)}
                />{" "}
                Atualizar o projeto selecionado com estes dados
              </label>
            )}
            <button
              className="rounded bg-[#e6ad55] px-4 py-2 text-black"
              disabled={save.isPending}
              onClick={() => void submit()}
            >
              {save.isPending
                ? "Salvando…"
                : updateExisting
                  ? "Atualizar projeto"
                  : "Salvar como novo projeto"}
            </button>
          </>
        )}
        <button
          className="ml-4 mt-4 underline"
          disabled={
            start.isPending ||
            ["queued", "running"].includes(capture.data?.status ?? "")
          }
          onClick={() => void begin(true)}
        >
          Analisar novamente
        </button>
      </section>
    </div>
  );
}
