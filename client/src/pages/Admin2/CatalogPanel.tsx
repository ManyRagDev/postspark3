import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  catalogBlueprintSchema,
  type CatalogEntry,
  type CatalogSelection,
  type CatalogBlueprint,
} from "@shared/designCatalog";
import type { RecreationRecipe } from "@shared/designRecreation";
import {
  INITIAL_POST,
  type CanvasPostModel,
} from "@/pages/CanvasLab/components/types";
import { CanvasPostStage } from "@/pages/CanvasLab/components/CanvasPostStage";
import { compileCatalogPost } from "@/pages/CanvasLab/lib/catalogCompiler";
import {
  draftFromRecipe,
  manualCatalogDraft,
  suggestRecipeGroups,
  type RecipeGroups,
} from "./catalogDraft";
import { downloadUrl, readAdmin2File } from "./recipe";

const field =
  "w-full rounded border border-white/15 bg-slate-950 p-2 text-sm text-white";
export default function CatalogPanel({
  recipe,
  initialBlueprint,
}: {
  recipe: RecreationRecipe | null;
  initialBlueprint?: CatalogBlueprint;
}) {
  const [offset, setOffset] = useState(0);
  const catalog = trpc.designCatalog.list.useQuery(
    { offset },
    { retry: false }
  );
  const [traceFilter, setTraceFilter] = useState("");
  const events = trpc.designCatalog.events.useQuery(
    { ...(traceFilter ? { traceId: traceFilter } : {}) },
    { retry: false }
  );
  const save = trpc.designCatalog.saveDraft.useMutation();
  const status = trpc.designCatalog.setStatus.useMutation();
  const [json, setJson] = useState(() =>
    JSON.stringify(initialBlueprint ?? manualCatalogDraft(), null, 2)
  );
  const [entry, setEntry] = useState<CatalogEntry | null>(null);
  const suggested = useMemo(
    () => (recipe ? suggestRecipeGroups(recipe) : null),
    [recipe]
  );
  const [groupOverride, setGroupOverride] = useState<{
    recipe: RecreationRecipe;
    groups: RecipeGroups;
  } | null>(null);
  const groups =
    groupOverride?.recipe === recipe ? groupOverride.groups : suggested;
  const [headline, setHeadline] = useState("Uma ideia merece um bom design");
  const [body, setBody] = useState(
    "Estruture a mensagem com hierarquia, contraste e espaço para respirar."
  );
  const [previews, setPreviews] = useState<CanvasPostModel[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const preview = previews[previewIndex];
  const allFit =
    previews.length > 0 &&
    previews.every(p =>
      ["applied", "adapted"].includes(p.catalogCompilation?.status ?? "")
    );
  const [previewJson, setPreviewJson] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState(
    initialBlueprint
      ? "Blueprint importado. Clique em Conferir adaptação para visualizar com os textos de prova. Ainda não foi salvo no catálogo."
      : ""
  );
  const [busy, setBusy] = useState(false);
  const [traceInput, setTraceInput] = useState("");
  const textLayers = recipe?.scene.layers.filter(l => l.kind === "text") ?? [];
  const updateJson = (value: string) => {
    setJson(value);
    setPreviews([]);
    setPreviewIndex(0);
    setPreviewJson("");
    setAcknowledged(false);
  };
  const refresh = () => {
    void catalog.refetch();
    void events.refetch();
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Operação indisponível."
      );
    } finally {
      setBusy(false);
    }
  };
  const open = (e: CatalogEntry) => {
    setEntry(e);
    updateJson(JSON.stringify(e.definition, null, 2));
  };
  const render = async () => {
    setAcknowledged(false);
    setPreviewJson("");
    const definition = catalogBlueprintSchema.parse(JSON.parse(json));
    const selection: CatalogSelection = {
      traceId: crypto.randomUUID(),
      versionId: entry?.id ?? crypto.randomUUID(),
      blueprintId: entry?.blueprintId ?? crypto.randomUUID(),
      version: entry?.version ?? 1,
      contentHash: entry?.contentHash ?? "0".repeat(64),
      definition,
      selection: "llm",
      preserveBrandFonts: false,
    };
    const base: CanvasPostModel = {
      ...structuredClone(INITIAL_POST),
      id: "catalog-preview",
      aspectRatio: definition.formats[0],
      familyId: "editorial-poster",
      familyName: "Editorial",
      headline,
      subtext: body,
      caption: "",
      showBadge: false,
      showStep: false,
      palette: {
        background: "#F4F2EC",
        text: "#161616",
        headlineColor: "#161616",
        subtextColor: "#161616",
        accent: "#F6C62E",
      },
      slides: [{ id: "preview", step: "", headline, subtext: body }],
      currentSlideIndex: 0,
    };
    const compiled: CanvasPostModel[] = [];
    for (const format of definition.formats) {
      compiled.push(
        await compileCatalogPost(
          { ...structuredClone(base), aspectRatio: format },
          selection
        )
      );
    }
    setPreviews(compiled);
    setPreviewIndex(0);
    setPreviewJson(json);
    const refused = compiled.filter(
      p => !["applied", "adapted"].includes(p.catalogCompilation?.status ?? "")
    );
    if (refused.length)
      setMessage(
        `Revise os formatos: ${refused.map(p => `${p.aspectRatio}: ${p.catalogCompilation?.reasons.join(", ") ?? "sem compilação"}`).join("; ")}`
      );
  };
  const parsedDraft = useMemo(() => {
    try {
      return catalogBlueprintSchema.safeParse(JSON.parse(json)).data;
    } catch {
      return undefined;
    }
  }, [json]);
  const moveLayer = (id: string, role: string) => {
    if (!recipe || !groups) return;
    setGroupOverride({
      recipe,
      groups: {
        headlineIds: [
          ...groups.headlineIds.filter(v => v !== id),
          ...(role === "headline" ? [id] : []),
        ],
        bodyIds: [
          ...groups.bodyIds.filter(v => v !== id),
          ...(role === "body" ? [id] : []),
        ],
        ignored: [
          ...groups.ignored.filter(v => v.id !== id),
          ...(role === "ignored"
            ? [{ id, reason: "Excluído pelo curador" }]
            : []),
        ],
      },
    });
  };
  let exactStored = false;
  try {
    exactStored = Boolean(
      entry &&
        JSON.stringify(catalogBlueprintSchema.parse(JSON.parse(json))) ===
          JSON.stringify(entry.definition)
    );
  } catch {
    /* invalid draft cannot be approved */
  }

  return (
    <section className="space-y-5 rounded-2xl border border-cyan-300/20 bg-white/[0.025] p-5">
      <header>
        <h2 className="text-xl font-semibold">4. Catálogo para geração</h2>
        <p className="mt-2 text-sm text-slate-400">
          Publique estruturas adaptáveis após revisar a prévia. Nesta primeira
          versão: título, apoio e seus efeitos de fundo; posts estáticos.
          Referências e textos originais ficam no laboratório.
        </p>
      </header>
      {catalog.error && (
        <p role="alert" className="text-sm text-amber-200">
          {catalog.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(["editorial", "card", "bottom"] as const).map((style, i) => (
          <Button
            key={style}
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() => {
              setEntry(null);
              updateJson(JSON.stringify(manualCatalogDraft(style), null, 2));
            }}
          >
            {
              [
                "Nova estrutura editorial",
                "Nova tarja",
                "Nova leitura na base",
              ][i]
            }
          </Button>
        ))}
        <label className="cursor-pointer rounded border border-white/20 p-2 text-sm">
          Importar blueprint JSON
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={busy}
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void run(async () => {
                  const imported = await readAdmin2File(file);
                  if (imported.kind !== "blueprint")
                    throw new Error(
                      "Este arquivo é uma receita. Use Importar JSON no topo da página para abri-la."
                    );
                  const definition = imported.blueprint;
                  setEntry(null);
                  updateJson(JSON.stringify(definition, null, 2));
                  setMessage(
                    "Blueprint importado. Clique em Conferir adaptação para visualizar com os textos de prova. Ainda não foi salvo no catálogo."
                  );
                });
            }}
          />
        </label>
      </div>
      {recipe && groups && (
        <div className="space-y-3 rounded-xl border border-white/10 p-3">
          <p className="text-sm font-medium">
            Agrupar os blocos principais da referência
          </p>
          <p className="text-xs text-slate-400">
            Revise a sugestão: título ({groups.headlineIds.length}), apoio (
            {groups.bodyIds.length}) e ignorados ({groups.ignored.length}).
            Linhas do mesmo bloco viram uma peça adaptável. Sem apoio
            selecionado, tentaremos reservar espaço para um texto novo.
          </p>
          {[false, true].map(ignored => {
            const rows = textLayers
              .filter(l => groups.ignored.some(i => i.id === l.id) === ignored)
              .map(l => (
                <label
                  key={l.id}
                  className="grid items-center gap-2 text-xs sm:grid-cols-[1fr_8rem]"
                >
                  <span className="min-w-0 break-words">
                    {l.text?.slice(0, 100)}
                    <span className="block text-slate-500">
                      {l.id}
                      {ignored
                        ? ` · ${groups.ignored.find(i => i.id === l.id)?.reason}`
                        : ""}
                    </span>
                  </span>
                  <select
                    className={field}
                    disabled={busy}
                    aria-label={`Função de ${l.text?.slice(0, 60) ?? l.id}`}
                    value={
                      groups.headlineIds.includes(l.id)
                        ? "headline"
                        : groups.bodyIds.includes(l.id)
                          ? "body"
                          : "ignored"
                    }
                    onChange={e => moveLayer(l.id, e.target.value)}
                  >
                    <option value="headline">Título</option>
                    <option value="body">Apoio</option>
                    <option value="ignored">Ignorar</option>
                  </select>
                </label>
              ));
            return ignored ? (
              <details key="ignored" className="space-y-2">
                <summary className="cursor-pointer text-xs text-slate-400">
                  Textos ignorados · podem ser recuperados
                </summary>
                {rows}
              </details>
            ) : (
              <div key="selected" className="space-y-2">
                {rows}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !groups.headlineIds.length}
              onClick={() =>
                void run(async () => {
                  const definition = draftFromRecipe(
                    recipe,
                    groups.headlineIds,
                    groups.bodyIds
                  );
                  setEntry(null);
                  updateJson(JSON.stringify(definition, null, 2));
                })
              }
            >
              Preparar composição da referência
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setGroupOverride(null)}
            >
              Restaurar sugestão
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Depois de mudar os grupos, prepare a composição novamente para
            atualizar o rascunho.
          </p>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            {entry
              ? `Blueprint ${entry.blueprintId} · versão ${entry.version} · ${entry.status}`
              : "Nova composição"}
            . Edite nome, descrição, tags, intenções, áreas e estilos. Nenhum
            texto literal é salvo como peça.
          </p>
          <label className="block text-sm">
            Definição do blueprint
            <textarea
              className={`${field} mt-1 h-72 font-mono text-xs`}
              disabled={busy}
              spellCheck={false}
              value={json}
              onChange={e => updateJson(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Título de prova
            <input
              className={field}
              disabled={busy}
              value={headline}
              onChange={e => {
                setHeadline(e.target.value);
                setPreviewJson("");
                setAcknowledged(false);
              }}
            />
          </label>
          <label className="block text-sm">
            Apoio de prova
            <textarea
              className={field}
              disabled={busy}
              value={body}
              onChange={e => {
                setBody(e.target.value);
                setPreviewJson("");
                setAcknowledged(false);
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void run(render)}>
              Conferir adaptação
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const definition = catalogBlueprintSchema.parse(
                    JSON.parse(json)
                  );
                  const result = await save.mutateAsync({
                    definition,
                    blueprintId: entry?.blueprintId,
                  });
                  open(result.entry);
                  setMessage(
                    `Rascunho salvo no Supabase · trace ${result.traceId}`
                  );
                  refresh();
                })
              }
            >
              {entry
                ? "Salvar como nova versão"
                : "Salvar rascunho no Supabase"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const definition = catalogBlueprintSchema.parse(
                    JSON.parse(json)
                  );
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(definition, null, 2)], {
                      type: "application/json",
                    })
                  );
                  downloadUrl(url, "postspark-blueprint.json");
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                })
              }
            >
              Exportar blueprint
            </Button>
          </div>
          <label className="flex gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              disabled={busy}
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
            />
            Revisei a adaptação em todos os formatos e aceito as limitações
            listadas.
          </label>
          <Button
            disabled={
              busy ||
              !entry ||
              entry.status !== "draft" ||
              !exactStored ||
              !acknowledged ||
              previewJson !== json ||
              !allFit
            }
            onClick={() =>
              void run(async () => {
                if (!entry) return;
                const result = await status.mutateAsync({
                  id: entry.id,
                  status: "approved",
                });
                setEntry({ ...entry, status: "approved" });
                setMessage(
                  `Aprovado para as próximas gerações · trace ${result.traceId}`
                );
                refresh();
              })
            }
          >
            Aprovar versão salva
          </Button>
        </div>
        <div className="space-y-4 overflow-hidden rounded-xl bg-black/20 p-3">
          {parsedDraft?.extraction && (
            <div className="space-y-2 text-xs text-slate-400">
              <p>
                Mapa da composição · título em ciano, apoio em amarelo, mídia
                tracejada
              </p>
              <svg
                viewBox="0 0 100 100"
                role="img"
                aria-label="Áreas proporcionais da composição"
                preserveAspectRatio="none"
                style={{
                  aspectRatio: parsedDraft.formats[0].replace(":", "/"),
                }}
                className="mx-auto w-40 rounded bg-black/30"
              >
                {parsedDraft.extraction.mediaAreas.map((m, i) => (
                  <rect
                    key={i}
                    x={m.box.x * 100}
                    y={m.box.y * 100}
                    width={m.box.width * 100}
                    height={m.box.height * 100}
                    fill="#ffffff08"
                    stroke="#94a3b8"
                    strokeWidth="0.5"
                    strokeDasharray="2 2"
                  />
                ))}
                {parsedDraft.pieces.map(p => (
                  <rect
                    key={p.key}
                    x={p.box.x * 100}
                    y={p.box.y * 100}
                    width={p.box.width * 100}
                    height={p.box.height * 100}
                    fill={p.role === "headline" ? "#22d3ee30" : "#facc1530"}
                    stroke={p.role === "headline" ? "#22d3ee" : "#facc15"}
                    strokeWidth="0.6"
                  />
                ))}
              </svg>
              {parsedDraft.extraction.inferredBodyArea && (
                <p>
                  A área de apoio foi criada para conteúdo novo. Confira sua
                  posição.
                </p>
              )}
              {parsedDraft.extraction.mediaAreas.length > 0 && (
                <p>
                  Áreas de mídia são guias. O catálogo ainda não preenche fotos
                  automaticamente.
                </p>
              )}
            </div>
          )}
          {parsedDraft && parsedDraft.limitations.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-xs text-amber-200">
              {parsedDraft.limitations.map(limit => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          )}
          {previews.length > 0 && (
            <div
              className="flex flex-wrap gap-2"
              aria-label="Prévias por formato"
            >
              {previews.map((p, i) => (
                <Button
                  key={p.aspectRatio}
                  size="sm"
                  variant={i === previewIndex ? "default" : "outline"}
                  onClick={() => setPreviewIndex(i)}
                >
                  {p.aspectRatio} ·{" "}
                  {p.catalogCompilation?.status === "applied"
                    ? "encaixa"
                    : p.catalogCompilation?.status === "adapted"
                      ? "adaptado"
                      : "revisar"}
                </Button>
              ))}
            </div>
          )}
          <div className="flex justify-center">
            {preview ? (
              <CanvasPostStage post={preview} zoom={0.75} isReadOnly />
            ) : (
              <p className="text-sm text-slate-500">
                Confira com outros textos antes de aprovar.
              </p>
            )}
          </div>
        </div>
      </div>
      {message && (
        <p role="status" className="break-words text-sm text-cyan-200">
          {message}
        </p>
      )}
      <div className="space-y-2">
        <h3 className="font-medium">Versões no Supabase</h3>
        {catalog.data?.map(e => (
          <div
            key={e.id}
            className="flex flex-wrap items-center gap-3 rounded border border-white/10 p-3 text-sm"
          >
            <span className="flex-1">
              {e.definition.name} · v{e.version} · {e.status}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => open(e)}
            >
              Revisar / criar versão
            </Button>
            {e.status !== "archived" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await status.mutateAsync({ id: e.id, status: "archived" });
                    if (entry?.id === e.id)
                      setEntry({ ...entry, status: "archived" });
                    refresh();
                  })
                }
              >
                Arquivar
              </Button>
            )}
          </div>
        ))}
        {catalog.data?.length === 0 && (
          <p className="text-sm text-slate-400">
            Nenhuma versão publicada. Comece salvando e aprovando uma
            composição.
          </p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 200))}
          >
            Anteriores
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={catalog.data?.length !== 200}
            onClick={() => setOffset(offset + 200)}
          >
            Próximas
          </Button>
        </div>
      </div>
      <details className="rounded-xl border border-white/10 p-3">
        <summary className="cursor-pointer">
          Rastreamento do catálogo · últimos 100 eventos
        </summary>
        <form
          className="my-3 flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            if (!traceInput || /^[a-f0-9-]{36}$/i.test(traceInput))
              setTraceFilter(traceInput);
          }}
        >
          <input
            className={field}
            aria-label="ID do trace"
            placeholder="Filtrar pelo ID de geração/trace"
            value={traceInput}
            onChange={e => setTraceInput(e.target.value)}
          />
          <Button size="sm">Filtrar</Button>
          <Button type="button" size="sm" variant="outline" onClick={refresh}>
            Atualizar
          </Button>
        </form>
        {events.error && (
          <p role="alert" className="text-sm text-amber-200">
            {events.error.message}
          </p>
        )}
        <p className="my-2 text-xs text-slate-400">
          Inclui candidatos, pontuações, rejeições, escolha e relato de
          compilação do navegador. Relato do navegador não comprova publicação
          ou exportação.
        </p>
        <div className="max-h-96 space-y-2 overflow-auto">
          {events.data?.map(e => (
            <details key={e.id} className="rounded bg-black/20 p-2 text-xs">
              <summary>
                {new Date(e.created_at).toLocaleString("pt-BR")} · {e.stage} ·{" "}
                {e.status}
              </summary>
              <p className="my-2 break-all">Trace: {e.trace_id}</p>
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(e.data, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      </details>
    </section>
  );
}
