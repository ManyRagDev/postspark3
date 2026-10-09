import { reparentArsenalElement } from "../lib/compositionEditing";
import { centerArtSelection, emphasizeArtGroup, rotateArtSelection } from "../lib/artControls";
import VariableContentEditor from "./VariableContentEditor";
import { CanvasPostStage } from "./CanvasPostStage";
import { INITIAL_POST } from "./types";
import {
  restoreArsenalVariant,
  putArsenalComposition,
} from "../lib/arsenalComposition";
import {
  compositionToRecipeV4,
  compositionToPortableRecipe,
  readPortableArsenalRecipe,
} from "@shared/arsenalRecipe";
import { ensureArsenalCompositionFonts } from "../lib/arsenalAssets";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import {
  arsenalAssetSchema,
  type ArsenalComposition,
  type ArsenalElementEffect,
} from "@shared/designArsenal";
import type { DesignContent } from "@shared/arsenalContent";
import {
  editArsenalContent,
  disableArsenalRelation,
  overrideArsenalElement,
  resolveArsenalComposition,
  reorderArsenalLayer,
  updateArsenalAuthorialLayer,
  hideArsenalInstance,
  setArsenalCustomBackground,
  setArsenalElementEffect,
} from "../lib/arsenalComposition";
import { ensureArsenalFont } from "../lib/arsenalAssets";
import manifest from "@shared/arsenalBundledAssets.json";
import { ConfirmDialog } from "./CanvasLabDialogs";

const field =
  "w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-white";
const button =
  "rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10";
const labels: Record<string, string> = {
  headline: "Título",
  body: "Corpo",
  eyebrow: "Barra superior",
  sectionLabel: "Cabeçalho",
  callToAction: "Botão",
  label: "Tarja",
  caption: "Legenda",
};
const issueLabel = (issue: string) =>
  issue.startsWith("missing_media")
    ? "Adicione uma foto para completar a composição."
    : issue.startsWith("cardinality")
      ? "O conteúdo excede a capacidade desta variante. Todos os itens foram mantidos; ajuste o layout."
      : issue.startsWith("overflow")
        ? "Um texto ou uma peça excede a área disponível. Ajuste tamanho ou posição."
        : issue.startsWith("collision")
          ? "Há textos sobrepostos. Revise suas posições."
          : issue.startsWith("contrast")
            ? "Confira o contraste do texto com a superfície."
            : issue;

export default function ArsenalCompositionInspector({
  composition: c,
  section = "design",
  selectedId,
  onSelect,
  onChange,
}: {
  composition: ArsenalComposition;
  section?: "content" | "style" | "design" | "media";
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (c: ArsenalComposition) => void;
}) {
  const latest = useRef({c, onChange});
  latest.current = {c, onChange};
  const fontRequest = useRef(0);
  useEffect(() => () => { fontRequest.current++; }, []);
  const [draft, setDraft] = useState<DesignContent>(c.content);
  const [restore, setRestore] = useState<ArsenalComposition | null>(null);
  useEffect(() => setDraft(c.content), [c.userContentHash]);
  const selected =
    c.elements.find(e => e.id === selectedId) ??
    c.groups.find(e => e.id === selectedId);
  const media =
    c.elements.find(e => e.id === selectedId && e.kind === "media") ??
    c.elements.find(e => e.kind === "media");
  const availableFonts = [
    ...c.assets,
    ...Object.values(manifest)
      .filter(a => !c.assets.some(existing => existing.id === a.id))
      .map(a => arsenalAssetSchema.parse({id: a.id, kind: "bundled", sha256: a.sha256, mimeType: a.mimeType, bytes: a.bytes, family: a.family, sourceFamily: a.sourceFamily, weight: a.weight, license: a.license})),
  ];
  const applyContent = () => onChange(editArsenalContent(c, draft));
  const upload = (file: File) => {
    if (!media) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Use uma imagem PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Use uma foto de até 8 MB.");
      return;
    }
    // Same FileReader/data URL upload already used by CanvasSidebar. Existing save pipeline handles storage/payload.
    const reader = new FileReader();
    reader.onerror = () => toast.error("Não foi possível ler a foto.");
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => toast.error("A imagem não pôde ser aberta.");
      image.onload = () =>
        onChange(
          c.version === 3 && c.authorialLayers.some(l => l.id === media.id)
            ? updateArsenalAuthorialLayer(c, media.id, {url: String(reader.result), focalX: 0.5, focalY: 0.5})
            : resolveArsenalComposition({
            ...c,
            media: {
              ...c.media,
              [media.id]: {
                kind: "user",
                url: String(reader.result),
                focalX: 0.5,
                focalY: 0.5,
              },
            },
          })
        );
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const patch = (values: Record<string, string | number | boolean | null>) => {
    if (selected) onChange(overrideArsenalElement(c, selected.id, values));
  };
  return (
    <div
      className="h-full w-full overflow-y-auto p-4 text-slate-200 space-y-4"
      data-arsenal-inspector
    >
      <p className="text-sm font-semibold">
        {
          {
            content: "Textos e legenda",
            style: "Aparência da composição",
            design: "Camadas e organização",
            media: "Fundo e fotos",
          }[section]
        }
      </p>
      <p className="text-xs text-slate-400">
        Duplo clique no texto para editar. Use Estilo para cores e tipografia;
        Design para posição e ordem das camadas.
      </p>
      {c.layoutOrigin === "manual-projection" && (
        <p className="text-xs text-amber-300">
          Formato projetado uniformemente. Não há variante revisada para este
          formato.
        </p>
      )}
      {c.issues.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-amber-400/30 p-3 text-xs text-amber-200 space-y-2"
        >
          {Array.from(new Set(c.issues.map(issueLabel))).map(s => (
            <p key={s}>{s}</p>
          ))}
        </div>
      )}
      {section === "content" && (
        <details open>
          <summary className="cursor-pointer text-sm font-semibold">
            Conteúdo vinculado
          </summary>
          <div className="space-y-3 mt-3">
            {draft.schemaVersion === 3 ? (
              <>
                <VariableContentEditor value={draft} onChange={setDraft} />
                <button className={button} onClick={applyContent}>
                  Aplicar conteúdo
                </button>
              </>
            ) : (
              <>
                {Object.entries(labels).map(([key, label]) => (
                  <label key={key} className="block text-xs">
                    {label}
                    <textarea
                      aria-label={label}
                      className={field}
                      rows={key === "caption" ? 3 : 2}
                      value={
                        (draft as unknown as Record<string, string>)[key] ?? ""
                      }
                      onChange={e =>
                        setDraft({ ...draft, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <p className="text-xs">
                  Lista (edição preserva todos os itens)
                </p>
                {draft.items.map((item, index) => (
                  <div key={item.id} className="flex gap-2">
                    <textarea
                      aria-label={`Item ${index + 1}`}
                      className={field}
                      value={item.text}
                      onChange={e =>
                        setDraft({
                          ...draft,
                          items: draft.items.map(i =>
                            i.id === item.id
                              ? { ...i, text: e.target.value }
                              : i
                          ),
                        })
                      }
                    />
                    <button
                      aria-label={`Excluir item ${index + 1}`}
                      className={button}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          items: draft.items.filter(i => i.id !== item.id),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    className={button}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        items: [
                          ...draft.items,
                          { id: crypto.randomUUID(), text: "" },
                        ],
                      })
                    }
                  >
                    Adicionar item
                  </button>
                  <button className={button} onClick={applyContent}>
                    Aplicar conteúdo
                  </button>
                </div>
              </>
            )}
          </div>
        </details>
      )}
      {section === "media" && media && (
        <details open>
          <summary className="cursor-pointer text-sm font-semibold">
            Foto e enquadramento
          </summary>
          <div className="space-y-3 mt-3">
            <input
              aria-label="Foto da composição"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="w-full text-xs"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = "";
              }}
            />
            {c.media[media.id] &&
              (["focalX", "focalY"] as const).map(axis => (
                <label className="block text-xs" key={axis}>
                  Ponto focal {axis === "focalX" ? "horizontal" : "vertical"}
                  <input
                    aria-label={`Ponto focal ${axis}`}
                    className="w-full"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={c.media[media.id][axis]}
                    onChange={e =>
                      onChange(
                        c.version === 3 && c.authorialLayers.some(l => l.id === media.id)
                          ? updateArsenalAuthorialLayer(c, media.id, {[axis]: Number(e.target.value)})
                          : resolveArsenalComposition({
                          ...c,
                          media: {
                            ...c.media,
                            [media.id]: {
                              ...c.media[media.id],
                              [axis]: Number(e.target.value),
                            },
                          },
                        })
                      )
                    }
                  />
                </label>
              ))}
          </div>
        </details>
      )}
      {section === "style" && (
        <label className="block text-xs">
          Cor do fundo da prancheta
          <input
            aria-label="Cor do fundo da prancheta"
            type="color"
            value={c.artboard.background}
            onChange={e =>
              onChange(setArsenalCustomBackground(c, { fill: e.target.value }))
            }
          />
        </label>
      )}
      {section === "media" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            O fundo fica atrás das peças. Painéis opacos, como a janela,
            continuam cobrindo a foto na região que ocupam. Imagens sobrepostas
            podem ser ordenadas em Design.
          </p>
          {c.version === 3 && c.customBackground?.imageUrl && (
            <>
              <img
                className="h-24 w-full object-cover rounded"
                src={c.customBackground.imageUrl}
                alt="Fundo da composição"
              />
              <button
                className={button}
                onClick={() =>
                  onChange(
                    setArsenalCustomBackground(c, { imageUrl: undefined })
                  )
                }
              >
                Remover fundo
              </button>
              {(["focalX", "focalY", "overlayOpacity"] as const).map(key => (
                <label key={key} className="block text-xs">
                  {
                    {
                      focalX: "Enquadramento horizontal",
                      focalY: "Enquadramento vertical",
                      overlayOpacity: "Intensidade do filtro",
                    }[key]
                  }
                  <input
                    aria-label={key}
                    className="w-full"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={
                      c.customBackground?.[key] ??
                      (key === "overlayOpacity" ? 0.55 : 0.5)
                    }
                    onChange={e =>
                      onChange(
                        setArsenalCustomBackground(c, {
                          [key]: Number(e.target.value),
                        })
                      )
                    }
                  />
                </label>
              ))}
              <label className="block text-xs">
                Cor do filtro{" "}
                <input
                  aria-label="Cor do filtro"
                  type="color"
                  value={c.customBackground.overlayColor ?? "#000000"}
                  onChange={e =>
                    onChange(
                      setArsenalCustomBackground(c, {
                        overlayColor: e.target.value,
                      })
                    )
                  }
                />
              </label>
              <label className="block text-xs">
                Tipo de filtro
                <select
                  aria-label="Tipo de filtro"
                  className={field}
                  value={c.customBackground.overlayMode ?? "solid"}
                  onChange={e =>
                    onChange(
                      setArsenalCustomBackground(c, {
                        overlayMode: e.target.value as "solid",
                      })
                    )
                  }
                >
                  <option value="solid">Uniforme</option>
                  <option value="gradient-bottom">Gradiente inferior</option>
                  <option value="gradient-top">Gradiente superior</option>
                  <option value="radial">Vinheta</option>
                </select>
              </label>
            </>
          )}
        </div>
      )}
      {["design", "style"].includes(section) && (
        <details open>
          <summary className="cursor-pointer text-sm font-semibold">
            Selecionar camada
          </summary>
          <select
            aria-label="Selecionar peça ou grupo"
            className={field + " mt-3"}
            value={selectedId ?? ""}
            onChange={e => onSelect(e.target.value)}
          >
            <option value="">Selecionar…</option>
            {c.groups.map(g => (
              <option key={g.id} value={g.id}>
                Grupo: {g.label}
              </option>
            ))}
            {c.elements.map(e => (
              <option key={e.id} value={e.id}>
                {e.kind}: {e.text.slice(0, 32) || e.id}
              </option>
            ))}
          </select>
          {selected && section === "design" && (
            <div className="space-y-3 mt-3">
              <p className="text-xs text-slate-400">
                A ordem vale dentro do grupo. Para colocar uma foto entre o
                painel e seus textos, escolha o grupo do painel.
              </p>
              {"kind" in selected && c.version === 3 && c.authorialLayers.some(l => l.id === selected.id) && (
                <label className="block text-xs">
                  Grupo da camada
                  <select
                    aria-label="Grupo da camada"
                    className={field}
                    value={selected.parentId ?? ""}
                    onChange={e =>
                      onChange(
                        reparentArsenalElement(
                          c,
                          selected.id,
                          e.target.value || null
                        )
                      )
                    }
                  >
                    <option value="">Prancheta</option>
                    {c.groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["front", "Trazer à frente"],
                    ["forward", "Avançar camada"],
                    ["backward", "Recuar camada"],
                    ["back", "Enviar ao fundo"],
                  ] as const
                ).map(([direction, label]) => (
                  <button
                    key={direction}
                    className={button}
                    onClick={() =>
                      onChange(reorderArsenalLayer(c, selected.id, direction))
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              {"kind" in selected && (
                <button
                  className={button + " text-rose-300"}
                  onClick={() => {
                    onChange(hideArsenalInstance(c, selected.id));
                    onSelect("");
                  }}
                >
                  Remover elemento
                </button>
              )}
            </div>
          )}
          {selected && (
            <div className="mt-3 space-y-3">
              {section === "design" && (
                <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      "x",
                      "y",
                      ...("kind" in selected
                        ? (["width", "height"] as const)
                        : []),
                      "rotation",
                      ...("kind" in selected ? [] : ["scale"]),
                    ] as const
                  ).map(key => (
                    <label key={key} className="text-xs">
                      {key}
                      <input
                        aria-label={`Peça ${key}`}
                        key={
                          selected.id +
                          key +
                          String(
                            (selected as unknown as Record<string, number>)[key]
                          )
                        }
                        className={field}
                        type="number"
                        step="any"
                        defaultValue={
                          (selected as unknown as Record<string, number>)[key]
                        }
                        onBlur={e => {
                          const v = Number(e.target.value);
                          if (
                            Number.isFinite(v) &&
                            (!["width", "height", "scale"].includes(key) ||
                              v > 0)
                          )
                            patch({ [key]: v });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2" aria-label="Ajustes rápidos de arte">
                  <button className={button} aria-label="Centralizar horizontalmente" onClick={() => onChange(centerArtSelection(c, selected.id, "horizontal"))}>Centralizar ↔</button>
                  <button className={button} aria-label="Centralizar verticalmente" onClick={() => onChange(centerArtSelection(c, selected.id, "vertical"))}>Centralizar ↕</button>
                  <button className={button} aria-label="Girar 3 graus para a esquerda" onClick={() => onChange(rotateArtSelection(c, selected.id, -3))}>Girar −3°</button>
                  <button className={button} aria-label="Girar 3 graus para a direita" onClick={() => onChange(rotateArtSelection(c, selected.id, 3))}>Girar +3°</button>
                  {! ("kind" in selected) && <>
                    <button className={button} aria-label="Aumentar ênfase do grupo em 10%" onClick={() => onChange(emphasizeArtGroup(c, selected.id, "increase"))}>Ênfase +10%</button>
                    <button className={button} aria-label="Reduzir ênfase do grupo em 10%" onClick={() => onChange(emphasizeArtGroup(c, selected.id, "decrease"))}>Ênfase −10%</button>
                  </>}
                </div>
                </div>
              )}
              {section === "style" && "kind" in selected && (
                <>
                  <label className="block text-xs">
                    Cor
                    <input
                      aria-label="Cor da peça"
                      className="block w-full"
                      type="color"
                      value={selected.fill}
                      onChange={e => patch({ fill: e.target.value })}
                    />
                  </label>
                  <label className="block text-xs">
                    Opacidade
                    <input
                      aria-label="Opacidade da peça"
                      className="w-full"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={selected.opacity}
                      onChange={e => patch({ opacity: Number(e.target.value) })}
                    />
                  </label>
                  {selected.kind === "text" && (
                    <>
                      <label className="block text-xs">
                        Fonte
                        <select
                          aria-label="Fonte da peça"
                          className={field}
                          value={selected.fontAssetId ?? "system"}
                          onChange={async e => {
                            const request = ++fontRequest.current;
                            const targetId = selected.id;
                            const asset = availableFonts.find(
                              a => a.id === e.target.value
                            );
                            try {
                              if (asset) {
                                await ensureArsenalFont(asset);
                                if (request !== fontRequest.current) return;
                                const current = latest.current.c;
                                latest.current.onChange(
                                  overrideArsenalElement(
                                    {
                                      ...current,
                                      assets: current.assets.some(
                                        a => a.id === asset.id
                                      )
                                        ? current.assets
                                        : [...current.assets, asset],
                                    },
                                    targetId,
                                    {
                                      fontAssetId: asset.id,
                                      fontFamily: asset.family!,
                                      fontWeight: asset.weight!,
                                    }
                                  )
                                );
                              } else
                                patch({
                                  fontAssetId: null,
                                  fontFamily: "Arial",
                                  fontWeight: 400,
                                });
                            } catch (error) {
                              toast.error(String((error as Error).message));
                            }
                          }}
                        >
                          <option value="system">Arial · sistema</option>
                          {availableFonts.map(a => (
                            <option key={a.id} value={a.id}>
                              {(
                                manifest as Record<
                                  string,
                                  { sourceFamily: string }
                                >
                              )[a.id]?.sourceFamily ?? a.family}{" "}
                              {a.weight}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs">
                        Alinhamento
                        <select
                          aria-label="Alinhamento da peça"
                          className={field}
                          value={selected.align}
                          onChange={e => patch({ align: e.target.value })}
                        >
                          <option value="left">Esquerda</option>
                          <option value="center">Centro</option>
                          <option value="right">Direita</option>
                        </select>
                      </label>
                      <label className="block text-xs">
                        Efeito
                        <select
                          aria-label="Efeito da peça"
                          className={field}
                          value={
                            c.version === 3
                              ? (c.effects[selected.id]?.effect ?? "none")
                              : "none"
                          }
                          onChange={e =>
                            onChange(
                              setArsenalElementEffect(c, selected.id, {
                                effect: e.target
                                  .value as ArsenalElementEffect["effect"],
                              })
                            )
                          }
                        >
                          <option value="none">Sem efeito</option>
                          <option value="shadow">Sombra</option>
                          <option value="outline">Contorno</option>
                          <option value="box-card">Caixa</option>
                          <option value="box-pill">Pílula</option>
                        </select>
                      </label>
                      <label className="block text-xs">
                        Cor do efeito
                        <input
                          aria-label="Cor do efeito"
                          type="color"
                          value={
                            c.version === 3
                              ? (c.effects[selected.id]?.color ?? "#000000")
                              : "#000000"
                          }
                          onChange={e =>
                            onChange(
                              setArsenalElementEffect(c, selected.id, {
                                effect:
                                  c.version === 3
                                    ? (c.effects[selected.id]?.effect ??
                                      "shadow")
                                    : "shadow",
                                color: e.target.value,
                              })
                            )
                          }
                        />
                      </label>
                      <label className="block text-xs">
                        Tamanho
                        <input
                          aria-label="Tamanho da fonte"
                          key={selected.id + selected.fontSize}
                          className={field}
                          type="number"
                          min={1}
                          defaultValue={selected.fontSize}
                          onBlur={e => {
                            const v = Number(e.target.value);
                            if (v > 0) patch({ fontSize: v });
                          }}
                        />
                      </label>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </details>
      )}
      {section === "design" && (
        <>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              Relações vinculadas
            </summary>
            <p className="my-2 text-xs text-slate-400">
              Alterar uma propriedade manualmente libera somente essa
              propriedade. Desligar congela o resultado atual.
            </p>
            {c.relations.map(r => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 py-1 text-xs"
              >
                <span>
                  {r.id} · {r.kind}
                </span>
                <button
                  className={button}
                  disabled={!r.enabled}
                  onClick={() => onChange(disableArsenalRelation(c, r.id))}
                >
                  {r.enabled ? "Desligar" : "Livre"}
                </button>
              </div>
            ))}
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">
              Arquivo portátil {c.version === 3 ? "V5" : "V4"}
            </summary>
            <p className="my-2 text-xs text-slate-400">
              O arquivo inclui texto, relações, ajustes e sua foto. Guarde-o
              como um post privado.
            </p>
            <button
              className={button}
              onClick={() => {
                const recipe = compositionToPortableRecipe(c);
                const isV5 = recipe.version === 5;
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(recipe, null, 2)], {
                    type: "application/json",
                  })
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = `postspark-composicao-${isV5 ? "v5" : "v4"}.json`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Exportar JSON {c.version === 3 ? "V5" : "V4"}
            </button>
            <input
              aria-label={`Reabrir JSON ${c.version === 3 ? "V5" : "V4"}`}
              type="file"
              accept="application/json,.json"
              className="my-2 w-full text-xs"
              onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  if (file.size > 5000000)
                    throw new Error("Arquivo excede 5 MB.");
                  const recipe = readPortableArsenalRecipe(
                    JSON.parse(await file.text())
                  );
                  if (
                    (recipe.version === 5 &&
                      recipe.representation === "composition-v3") ||
                    (recipe.version === 4 &&
                      recipe.representation === "composition-v2")
                  ) {
                    await ensureArsenalCompositionFonts(recipe.composition);
                    onChange(recipe.composition);
                  } else {
                    throw new Error(
                      "Este painel abre composições V4 e V5. Receitas V1–V3 seguem pelo Admin2."
                    );
                  }
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
            />
          </details>
          <button
            className={button}
            onClick={async () => {
              try {
                await ensureArsenalCompositionFonts(c);
                setRestore(restoreArsenalVariant(c));
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            Restaurar variante {c.base.aspectRatio}…
          </button>
          <ConfirmDialog
            open={Boolean(restore)}
            title={`Restaurar a variante ${c.base.aspectRatio}?`}
            description="Confira a prévia. Posições, dimensões e relações manuais serão substituídas. Texto, foto, cor e fonte serão mantidos."
            confirmLabel="Restaurar"
            onCancel={() => setRestore(null)}
            onConfirm={() => {
              if (restore) onChange(restore);
              setRestore(null);
            }}
          >
            {restore && (
              <div className="my-3 flex justify-center">
                <CanvasPostStage
                  post={putArsenalComposition(
                    {
                      ...structuredClone(INITIAL_POST),
                      aspectRatio: restore.effectiveAspectRatio,
                    },
                    restore
                  )}
                  zoom={0.45}
                  isReadOnly
                />
              </div>
            )}
            {restore?.issues.length ? (
              <p className="mb-3 text-xs text-amber-300">
                A prévia requer ajustes:{" "}
                {Array.from(new Set(restore.issues.map(issueLabel))).join(" ")}
              </p>
            ) : null}
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}
