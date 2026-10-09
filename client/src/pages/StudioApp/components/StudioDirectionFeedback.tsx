import { trpc } from "@/lib/trpc";
import type { CanvasPostModel } from "@/pages/CanvasLab/components/types";

const languageLabels: Record<string, string> = {
  editorial: "Editorial",
  graphic: "Gráfica",
  typographic: "Tipográfica",
  organic: "Orgânica",
  restrained: "Contida",
};
const hierarchyLabels: Record<string, string> = {
  headline: "Título em destaque",
  content: "Conteúdo em destaque",
  media: "Imagem em destaque",
  comparison: "Comparação em destaque",
  metric: "Dado em destaque",
};
const mediaLabels: Record<string, string> = {
  none: "Sem imagem",
  support: "Imagem de apoio",
  subject: "Imagem como tema principal",
};

export default function StudioDirectionFeedback({
  post,
}: {
  post: CanvasPostModel;
}) {
  const assembly = post.componentAssembly;
  const intent = assembly?.direction.intent;
  const utils = trpc.useUtils();
  const mutation = trpc.designCatalog.preferDeliveredDirection.useMutation({
    onSuccess: () => void utils.designCatalog.getStudioPreferences.invalidate(),
  });

  if (post.completeDesign)
    return (
      <aside
        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-left"
        aria-label="Composição escolhida"
      >
        <p className="text-[11px] font-semibold text-white/85">
          {post.completeDesign.name}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-white/50">
          {post.completeDesign.reason}
        </p>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              runId: post.completeDesign!.runId,
              slot: post.completeDesign!.slot,
            })
          }
          className="mt-2 rounded-lg border border-white/12 px-2.5 py-1.5 text-[10px] font-semibold text-white/75 hover:bg-white/8 disabled:opacity-45"
        >
          {mutation.isPending
            ? "Salvando direção…"
            : "Usar esta direção nas próximas artes"}
        </button>
        {mutation.isError ? (
          <p role="alert" className="mt-1.5 text-[10px] text-rose-200">
            Não foi possível guardar esta direção.
          </p>
        ) : null}
        {mutation.isSuccess ? (
          <p role="status" className="mt-1.5 text-[10px] text-emerald-200">
            Direção guardada para as próximas artes.
          </p>
        ) : null}
      </aside>
    );
  if (!intent) return null;

  const adapted = post.slides.some(
    s =>
      s.composition?.origin.componentAssembly?.resolution &&
      s.composition.origin.componentAssembly.resolution.kind !==
        "layout-adaptation"
  );
  const canSave = Boolean(assembly?.runId && Number.isInteger(assembly?.slot));
  return (
    <aside
      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-left"
      aria-label="Intenção visual desta arte"
    >
      <p className="text-[11px] font-semibold text-white/85">
        {assembly?.direction.label}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-white/50">
        {languageLabels[intent.language] ?? intent.language} ·{" "}
        {hierarchyLabels[intent.hierarchy] ?? intent.hierarchy} ·{" "}
        {mediaLabels[intent.mediaRole] ?? intent.mediaRole}
      </p>
      {adapted && (
        <p className="mt-1 text-[10px] text-amber-200">
          Alguns slides usaram um design alternativo. A preferência guardará
          apenas a intensidade.
        </p>
      )}
      <button
        type="button"
        disabled={!canSave || mutation.isPending}
        onClick={() =>
          assembly &&
          mutation.mutate({ runId: assembly.runId, slot: assembly.slot })
        }
        className="mt-2 rounded-lg border border-white/12 px-2.5 py-1.5 text-[10px] font-semibold text-white/75 hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {mutation.isPending
          ? "Salvando direção…"
          : "Usar esta direção nas próximas artes"}
      </button>
      {mutation.isError ? (
        <p role="alert" className="mt-1.5 text-[10px] text-rose-200">
          Não foi possível guardar esta direção.
        </p>
      ) : null}
      {mutation.isSuccess ? (
        <p role="status" className="mt-1.5 text-[10px] text-emerald-200">
          Direção guardada para as próximas artes.
        </p>
      ) : null}
    </aside>
  );
}
