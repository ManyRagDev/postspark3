import { useState } from "react";
import type { RecreationRecipe } from "@shared/designRecreation";
import { Button } from "@/components/ui/button";
import { matrixInputs, type MatrixInputs } from "./matrixCompiler";
import { prepareMatrixMedia } from "./matrixMedia";

const field =
  "mt-1 w-full rounded border border-white/15 bg-slate-950 p-2 text-sm text-white";

/** Mounted by recipe ID: each saved derivative starts with its own content and framing. */
export default function MatrixPanel({
  recipe,
  disabled,
  onApply,
}: {
  recipe: RecreationRecipe;
  disabled: boolean;
  onApply: (inputs: MatrixInputs) => Promise<void>;
}) {
  const [input, setInput] = useState(() => matrixInputs(recipe));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const locked = disabled || working;
  const matrix = recipe.matrix!;
  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível preparar a adaptação."
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="space-y-4 rounded-xl border border-cyan-300/30 p-4">
      <h3 className="font-semibold">Experimentar conteúdo da matriz</h3>
      <p className="text-sm text-slate-400">
        Troque os campos e a foto. Aplicar cria outra receita, atualiza a prévia
        e salva neste navegador, sem chamada de IA. O original fica preservado.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {matrix.fields.map(f => (
          <label key={f.id} className="block text-sm">
            {f.label}
            {f.kind === "list" ? (
              <textarea
                className={field}
                rows={f.layerIds.length}
                disabled={locked}
                value={input.fields[f.id]}
                onChange={e => {
                  setDirty(true);
                  setInput(v => ({
                    ...v,
                    fields: { ...v.fields, [f.id]: e.target.value },
                  }));
                }}
              />
            ) : (
              <input
                className={field}
                disabled={locked}
                maxLength={1200}
                value={input.fields[f.id]}
                onChange={e => {
                  setDirty(true);
                  setInput(v => ({
                    ...v,
                    fields: { ...v.fields, [f.id]: e.target.value },
                  }));
                }}
              />
            )}
            <span className="text-xs text-slate-500">
              {f.kind === "list"
                ? `Um item por linha, até ${f.layerIds.length}.`
                : "Uma linha."}{" "}
              Redução máxima de fonte: {Math.round((1 - f.minScale) * 100)}%.
            </span>
          </label>
        ))}
      </div>
      {input.media.map(slot => (
        <div
          key={slot.id}
          className="space-y-3 rounded border border-white/10 p-3"
        >
          <label className="block text-sm">
            {slot.label} · PNG, JPEG ou WebP até 12 MB
            <input
              className={field}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={locked}
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  void run(async () => {
                    const asset = await prepareMatrixMedia(file);
                    setInput(v => ({
                      ...v,
                      media: v.media.map(m =>
                        m.id === slot.id
                          ? { ...m, asset, positionX: 0.5, positionY: 0.5 }
                          : m
                      ),
                    }));
                    setDirty(true);
                  });
              }}
            />
          </label>
          {slot.asset && (
            <>
              <img
                src={slot.asset.dataUrl}
                alt={`Foto selecionada para ${slot.label}`}
                className="h-24 w-32 rounded object-cover"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {(["positionX", "positionY"] as const).map(axis => (
                  <label key={axis} className="text-xs text-slate-300">
                    {axis === "positionX"
                      ? "Enquadramento horizontal"
                      : "Enquadramento vertical"}{" "}
                    · {Math.round(slot[axis] * 100)}%
                    <input
                      className="mt-2 w-full"
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={locked}
                      value={slot[axis]}
                      onChange={e => {
                        const value = Number(e.target.value);
                        setDirty(true);
                        setInput(v => ({
                          ...v,
                          media: v.media.map(m =>
                            m.id === slot.id ? { ...m, [axis]: value } : m
                          ),
                        }));
                      }}
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                A foto preenche a área sem distorção; o excesso é recortado.
                Clique em Aplicar para conferir o enquadramento na composição.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={locked}
                onClick={() => {
                  setDirty(true);
                  setInput(v => ({
                    ...v,
                    media: v.media.map(m =>
                      m.id === slot.id ? { ...m, asset: null } : m
                    ),
                  }));
                }}
              >
                Remover foto
              </Button>
            </>
          )}
        </div>
      ))}
      <details className="rounded border border-white/10 p-3">
        <summary className="cursor-pointer text-sm">
          Ajustar grupos vinculados
        </summary>
        <p className="my-2 text-xs text-slate-400">
          Move e gira superfície, texto, sombra e mídia juntos. Valores em
          pixels da referência. Confira as sobreposições após alterar.
        </p>
        {matrix.groups.map(g => (
          <fieldset key={g.id} className="my-3" disabled={locked}>
            <legend className="text-sm">{g.label}</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["x", "y", "rotationDeg"] as const).map(axis => (
                <label key={axis} className="text-xs">
                  {axis === "rotationDeg" ? "Rotação (°)" : axis.toUpperCase()}
                  <input
                    type="number"
                    className={field}
                    value={input.transforms[g.id][axis]}
                    min={axis === "rotationDeg" ? -180 : -8000}
                    max={axis === "rotationDeg" ? 180 : 8000}
                    step={1}
                    onChange={e => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value)) return;
                      setDirty(true);
                      setInput(v => ({
                        ...v,
                        transforms: {
                          ...v.transforms,
                          [g.id]: { ...v.transforms[g.id], [axis]: value },
                        },
                      }));
                    }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </details>
      {dirty && (
        <p className="text-xs text-amber-200">
          Alterações ainda não aplicadas à prévia.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-200">
          {error}
        </p>
      )}
      {matrix.lastCompilation && (
        <p className="text-xs text-slate-400">
          Última adaptação: {matrix.lastCompilation.changedFields.length} campos
          alterados, {matrix.lastCompilation.resizedFields.length} com redução
          de fonte e {matrix.lastCompilation.filledMedia.length} fotos
          aplicadas.
        </p>
      )}
      <Button disabled={locked} onClick={() => void run(() => onApply(input))}>
        {working ? "Preparando…" : "Aplicar conteúdo e salvar adaptação"}
      </Button>
      <p className="text-xs text-slate-500">
        Depois, baixe a receita JSON para guardar também a foto e o
        enquadramento. Esta matriz permanece no laboratório.
      </p>
    </section>
  );
}
