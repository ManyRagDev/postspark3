import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { defaultStudioPreferences, type StudioPreferences } from "@shared/studioPreferences";

const languageOptions: Array<{ value: NonNullable<StudioPreferences["language"]>; label: string }> = [
  { value: "editorial", label: "Editorial" },
  { value: "graphic", label: "Gráfica" },
  { value: "typographic", label: "Tipográfica" },
  { value: "organic", label: "Orgânica" },
  { value: "restrained", label: "Contida" },
];

const intensityOptions: Array<{ value: StudioPreferences["intensity"]; label: string }> = [
  { value: "auto", label: "Automática" },
  { value: "quiet", label: "Discreta" },
  { value: "balanced", label: "Equilibrada" },
  { value: "expressive", label: "Marcante" },
];

export default function StudioArtPreferences() {
  const dirty=useRef(false);
  const preferencesQuery = trpc.designCatalog.getStudioPreferences.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const saveMutation = trpc.designCatalog.saveStudioPreferences.useMutation({
    onSuccess: (preferences) => {
      dirty.current=false;
      setDraft(preferences);
      void utils.designCatalog.getStudioPreferences.invalidate();
    },
  });
  const forgetMutation = trpc.designCatalog.forgetStudioPreferences.useMutation({
    onSuccess: (preferences) => {
      dirty.current=false;
      setDraft(preferences);
      void utils.designCatalog.getStudioPreferences.invalidate();
    },
  });
  const [draft, setDraft] = useState<StudioPreferences>(defaultStudioPreferences);

  useEffect(() => {
    if (preferencesQuery.data && !dirty.current) setDraft(preferencesQuery.data);
  }, [preferencesQuery.data]);

  const busy = preferencesQuery.isLoading || saveMutation.isPending || forgetMutation.isPending;
  const update = (patch: Partial<StudioPreferences>) => {dirty.current=true;setDraft((current) => ({ ...current, ...patch }));};

  return (
    <section aria-labelledby="studio-art-preferences-title" className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="studio-art-preferences-title" className="text-sm font-semibold">Seu jeito de criar</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/55">
            Salve uma preferência para orientar suas próximas artes. Um pedido específico em cada criação continua valendo.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-white/80">
          <input
            type="checkbox"
            checked={draft.enabled}
            disabled={busy || preferencesQuery.isError}
            onChange={(event) => update({ enabled: event.target.checked })}
            className="accent-orange-300"
          />
          Usar minha preferência
        </label>
      </div>

      {preferencesQuery.isLoading ? <p role="status" className="mt-3 text-xs text-white/55">Carregando preferência…</p> : null}
      {preferencesQuery.isError ? <p role="alert" className="mt-3 text-xs text-rose-200">Não foi possível carregar suas preferências. Tente novamente.</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs text-white/65">
          Linguagem visual
          <select
            value={draft.language ?? ""}
            disabled={busy || !draft.enabled || preferencesQuery.isError}
            onChange={(event) => update({ language: (event.target.value || null) as StudioPreferences["language"] })}
            className="rounded-xl border border-white/10 bg-[#11131b] px-3 py-2 text-sm text-white disabled:opacity-45"
          >
            <option value="">Sem preferência</option>
            {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-white/65">
          Intensidade visual
          <select
            value={draft.intensity}
            disabled={busy || !draft.enabled || preferencesQuery.isError}
            onChange={(event) => update({ intensity: event.target.value as StudioPreferences["intensity"] })}
            className="rounded-xl border border-white/10 bg-[#11131b] px-3 py-2 text-sm text-white disabled:opacity-45"
          >
            {intensityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {(saveMutation.isError || forgetMutation.isError) ? <p role="alert" className="mt-3 text-xs text-rose-200">Não foi possível salvar a preferência. Tente novamente.</p> : null}
      {(saveMutation.isSuccess || forgetMutation.isSuccess) ? <p role="status" className="mt-3 text-xs text-emerald-200">Preferência atualizada.</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || preferencesQuery.isError}
          onClick={() => saveMutation.mutate(draft)}
          className="rounded-xl bg-orange-300 px-4 py-2 text-xs font-bold text-black hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saveMutation.isPending ? "Salvando…" : "Salvar preferência"}
        </button>
        <button
          type="button"
          disabled={busy || preferencesQuery.isError}
          onClick={() => forgetMutation.mutate()}
          className="rounded-xl border border-white/12 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {forgetMutation.isPending ? "Removendo…" : "Limpar preferência salva"}
        </button>
      </div>
    </section>
  );
}
