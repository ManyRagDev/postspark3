import { reparentArsenalElement } from "../lib/compositionEditing";
import { centerArtSelection, emphasizeArtGroup, rotateArtSelection } from "../lib/artControls";
import VariableContentEditor from "./VariableContentEditor";
import { CanvasPostStage } from "./CanvasPostStage";
import { INITIAL_POST } from "./types";
import {
  compositionToPortableRecipe,
  readPortableArsenalRecipe,
} from "@shared/arsenalRecipe";
import {
  ensureArsenalCompositionFonts,
  ensureArsenalFont,
} from "../lib/arsenalAssets";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import {
  arsenalAssetSchema,
  type ArsenalComposition,
  type ArsenalElementEffect,
} from "@shared/designArsenal";
import type { DesignContent } from "@shared/arsenalContent";
import {
  disableArsenalRelation,
  editArsenalContent,
  editArsenalElementText,
  overrideArsenalElement,
  putArsenalComposition,
  resolveArsenalComposition,
  reorderArsenalLayer,
  restoreArsenalVariant,
  updateArsenalAuthorialLayer,
  hideArsenalInstance,
  setArsenalCustomBackground,
  setArsenalElementEffect,
} from "../lib/arsenalComposition";
import manifest from "@shared/arsenalBundledAssets.json";
import { ConfirmDialog } from "./CanvasLabDialogs";

const field =
  "w-full rounded-xl border border-white/12 bg-white/5 p-2.5 text-xs text-white outline-none focus:border-[oklch(0.78_0.22_48)] transition-colors";
const button =
  "rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition-all cursor-pointer";

const labels: Record<string, string> = {
  headline: "Título",
  body: "Corpo",
  eyebrow: "Barra superior",
  sectionLabel: "Cabeçalho",
  callToAction: "Botão",
  label: "Tarja",
  caption: "Legenda",
};

const kindLabels: Record<string, string> = {
  text: "Texto",
  rect: "Forma / Bloco",
  media: "Foto / Mídia",
  image: "Imagem",
};

const issueLabel = (issue: string) =>
  issue.startsWith("missing_media")
    ? "Adicione uma foto na guia Mídia para completar a composição."
    : issue.startsWith("cardinality")
      ? "O conteúdo excede a capacidade desta variante. Todos os itens foram mantidos; ajuste o layout."
      : issue.startsWith("overflow")
        ? "Um texto ou peça excede a área disponível. Ajuste o tamanho ou a posição."
        : issue.startsWith("collision")
          ? "Há elementos sobrepostos. Revise as posições no palco."
          : issue.startsWith("contrast")
            ? "Confira o contraste do texto com o fundo."
            : issue;

export default function ArsenalCompositionInspector({
  composition: c,
  section = "design",
  selectedId,
  onSelect,
  onChange,
  hideMediaSlotUpload = false,
}: {
  composition: ArsenalComposition;
  section?: "content" | "style" | "design" | "media";
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (c: ArsenalComposition) => void;
  hideMediaSlotUpload?: boolean;
}) {
  const latest = useRef({ c, onChange });
  latest.current = { c, onChange };
  const fontRequest = useRef(0);
  useEffect(
    () => () => {
      fontRequest.current++;
    },
    []
  );
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
      .map(a =>
        arsenalAssetSchema.parse({
          id: a.id,
          kind: "bundled",
          sha256: a.sha256,
          mimeType: a.mimeType,
          bytes: a.bytes,
          family: a.family,
          sourceFamily: a.sourceFamily,
          weight: a.weight,
          license: a.license,
        })
      ),
  ];

  const handleDraftChange = (nextDraft: DesignContent) => {
    setDraft(nextDraft);
    onChange(editArsenalContent(c, nextDraft));
  };

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
    const reader = new FileReader();
    reader.onerror = () => toast.error("Não foi possível ler a foto.");
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => toast.error("A imagem não pôde ser aberta.");
      image.onload = () =>
        onChange(
          c.version === 3 && c.authorialLayers.some(l => l.id === media.id)
            ? updateArsenalAuthorialLayer(c, media.id, {
                url: String(reader.result),
                focalX: 0.5,
                focalY: 0.5,
              })
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

  // Quando usado na aba Mídia com MediaSlotPanel ativo, renderiza apenas ajustes de filtro de fundo personalizado (se houver)
  if (section === "media" && hideMediaSlotUpload) {
    if (!(c.version === 3 && c.customBackground?.imageUrl)) {
      return null;
    }
  }

  const textElements = c.elements.filter(e => e.kind === "text");
  const styleableElements = c.elements.filter(
    e => e.kind === "text" || e.kind === "rect"
  );

  return (
    <div className="w-full text-slate-200 space-y-4" data-arsenal-inspector>
      {c.issues.length > 0 && section !== "media" && (
        <div
          role="status"
          className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1.5"
        >
          {Array.from(new Set(c.issues.map(issueLabel))).map(s => (
            <p key={s}>{s}</p>
          ))}
        </div>
      )}

      {/* ─── SEÇÃO 1: TEXTO (CONTENT) ─── */}
      {section === "content" && (
        <div className="space-y-4">
          {/* Edição rápida de cada texto visível no slide */}
          {textElements.length > 0 && (
            <div className="space-y-2.5">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold block">
                Textos do Slide ({textElements.length})
              </label>
              <div className="space-y-2">
                {textElements.map((e, idx) => {
                  const isSel = selectedId === e.id;
                  return (
                    <div
                      key={e.id}
                      onClick={() => {
                        if (!isSel) onSelect(e.id);
                      }}
                      className={`rounded-xl border p-2.5 space-y-1.5 transition-all ${
                        isSel
                          ? "border-[oklch(0.78_0.22_48)]/60 bg-[oklch(0.78_0.22_48)]/10 shadow-sm"
                          : "border-white/10 bg-white/4 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-white/50">
                        <span className="font-semibold uppercase tracking-wider text-white/70">
                          Texto #{idx + 1}
                        </span>
                        <span className="font-mono">
                          {e.fontFamily} · {Math.round(e.fontSize)}px
                        </span>
                      </div>
                      <textarea
                        aria-label={`Texto da peça ${idx + 1}`}
                        className={field + " resize-none"}
                        rows={e.text.length > 60 ? 3 : 2}
                        value={e.text}
                        onFocus={() => {
                          if (!isSel) onSelect(e.id);
                        }}
                        onChange={ev => {
                          onChange(
                            editArsenalElementText(c, e.id, ev.target.value)
                          );
                        }}
                        placeholder="Digite o texto..."
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Estrutura de blocos do template (recolhida quando já há textos diretos, mas sempre acessível no DOM) */}
          <details className="rounded-xl border border-white/10 bg-white/3 p-3 group">
            <summary className="cursor-pointer text-xs font-semibold text-white/80 hover:text-white flex items-center justify-between select-none">
              <span>Conteúdo vinculado (Blocos & Listas)</span>
              <span className="text-[10px] text-white/40 group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>
            <div className="space-y-3 mt-3 pt-3 border-t border-white/10">
              {draft.schemaVersion === 3 ? (
                <VariableContentEditor
                  value={draft}
                  onChange={handleDraftChange}
                />
              ) : (
                <>
                  {Object.entries(labels).map(([key, label]) => (
                    <label key={key} className="block text-xs text-white/70">
                      {label}
                      <textarea
                        aria-label={label}
                        className={field + " mt-1"}
                        rows={key === "caption" ? 3 : 2}
                        value={
                          (draft as unknown as Record<string, string>)[key] ??
                          ""
                        }
                        onChange={e =>
                          handleDraftChange({
                            ...draft,
                            [key]: e.target.value,
                          } as DesignContent)
                        }
                      />
                    </label>
                  ))}
                  {draft.items.length > 0 && (
                    <p className="text-xs text-white/60">Itens da lista</p>
                  )}
                  {draft.items.map((item, index) => (
                    <div key={item.id} className="flex gap-2">
                      <textarea
                        aria-label={`Item ${index + 1}`}
                        className={field}
                        rows={2}
                        value={item.text}
                        onChange={e =>
                          handleDraftChange({
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
                          handleDraftChange({
                            ...draft,
                            items: draft.items.filter(i => i.id !== item.id),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    className={button + " w-full"}
                    onClick={() =>
                      handleDraftChange({
                        ...draft,
                        items: [
                          ...draft.items,
                          { id: crypto.randomUUID(), text: "" },
                        ],
                      })
                    }
                  >
                    + Adicionar item
                  </button>
                </>
              )}
            </div>
          </details>
        </div>
      )}

      {/* ─── SEÇÃO 2: ESTILO (CORES, TIPOGRAFIA E EFEITOS) ─── */}
      {section === "style" && (
        <div className="space-y-4">
          {/* Cor do fundo da prancheta */}
          <div className="p-3 rounded-xl border border-white/10 bg-white/4 space-y-2">
            <label className="flex items-center justify-between text-xs font-medium text-white/80 cursor-pointer">
              <span>Cor do fundo da prancheta</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-white/50 uppercase">
                  {c.artboard.background}
                </span>
                <input
                  aria-label="Cor do fundo da prancheta"
                  type="color"
                  value={c.artboard.background}
                  onChange={e =>
                    onChange(
                      setArsenalCustomBackground(c, { fill: e.target.value })
                    )
                  }
                  className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border border-white/20"
                />
              </div>
            </label>
          </div>

          {/* Seletor rápido de elemento para estilizar */}
          {styleableElements.length > 0 && (
            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold block">
                Escolha uma peça para estilizar
              </label>
              <div className="flex flex-wrap gap-1.5">
                {styleableElements.map((el, idx) => {
                  const isSel = selectedId === el.id;
                  const labelText =
                    el.kind === "text"
                      ? el.text.slice(0, 22) || `Texto #${idx + 1}`
                      : `Bloco / Forma #${idx + 1}`;
                  return (
                    <button
                      key={el.id}
                      type="button"
                      onClick={() => onSelect(el.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs border transition-all cursor-pointer truncate max-w-full ${
                        isSel
                          ? "bg-[oklch(0.78_0.22_48)]/20 border-[oklch(0.78_0.22_48)] text-white font-semibold shadow-sm"
                          : "bg-white/4 border-white/10 text-white/60 hover:text-white hover:bg-white/8"
                      }`}
                    >
                      {labelText}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Controles de estilo da peça selecionada */}
          {selected && "kind" in selected && selected.kind === "text" && (
            <div className="rounded-xl border border-white/12 bg-white/4 p-3.5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-semibold text-white truncate pr-2">
                  Estilo: {selected.text.slice(0, 28) || "Texto selecionado"}
                </span>
                <button
                  type="button"
                  onClick={() => onSelect("")}
                  className="text-[11px] text-white/40 hover:text-white shrink-0"
                >
                  ✕
                </button>
              </div>

              <label className="block text-xs font-medium text-white/80">
                Fonte da peça
                <select
                  aria-label="Fonte da peça"
                  className={field + " mt-1"}
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
                      } else {
                        patch({
                          fontAssetId: null,
                          fontFamily: "Arial",
                          fontWeight: 400,
                        });
                      }
                    } catch (error) {
                      toast.error(String((error as Error).message));
                    }
                  }}
                >
                  <option value="system">Arial · sistema</option>
                  {availableFonts.map(a => (
                    <option key={a.id} value={a.id}>
                      {(
                        manifest as Record<string, { sourceFamily: string }>
                      )[a.id]?.sourceFamily ?? a.family}{" "}
                      {a.weight}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="block text-xs font-medium text-white/80">
                  Cor do texto
                  <input
                    aria-label="Cor do texto"
                    className="block w-full h-9 mt-1 rounded-lg border border-white/15 cursor-pointer bg-transparent"
                    type="color"
                    value={selected.fill || "#ffffff"}
                    onChange={e => patch({ fill: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-white/80">
                  Tamanho (px)
                  <input
                    aria-label="Tamanho da fonte"
                    className={field + " mt-1"}
                    type="number"
                    min={8}
                    max={200}
                    value={Math.round(selected.fontSize)}
                    onChange={e => {
                      const v = Number(e.target.value);
                      if (v > 0) patch({ fontSize: v });
                    }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="block text-xs font-medium text-white/80">
                  Alinhamento
                  <select
                    aria-label="Alinhamento da peça"
                    className={field + " mt-1"}
                    value={selected.align ?? "left"}
                    onChange={e => patch({ align: e.target.value })}
                  >
                    <option value="left">Esquerda</option>
                    <option value="center">Centro</option>
                    <option value="right">Direita</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-white/80">
                  Opacidade ({Math.round((selected.opacity ?? 1) * 100)}%)
                  <input
                    aria-label="Opacidade da peça"
                    className="w-full mt-3 accent-[oklch(0.78_0.22_48)] cursor-pointer"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selected.opacity ?? 1}
                    onChange={e => patch({ opacity: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="block text-xs font-medium text-white/80">
                  Efeito de Legibilidade
                  <select
                    aria-label="Efeito da peça"
                    className={field + " mt-1"}
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
                {c.version === 3 &&
                  c.effects[selected.id]?.effect &&
                  c.effects[selected.id]?.effect !== "none" && (
                    <label className="block text-xs font-medium text-white/80">
                      Cor do Efeito
                      <input
                        aria-label="Cor do efeito"
                        className="block w-full h-9 mt-1 rounded-lg border border-white/15 cursor-pointer bg-transparent"
                        type="color"
                        value={c.effects[selected.id]?.color ?? "#000000"}
                        onChange={e =>
                          onChange(
                            setArsenalElementEffect(c, selected.id, {
                              effect:
                                c.effects[selected.id]?.effect ?? "shadow",
                              color: e.target.value,
                            })
                          )
                        }
                      />
                    </label>
                  )}
              </div>
            </div>
          )}

          {selected && "kind" in selected && selected.kind === "rect" && (
            <div className="rounded-xl border border-white/12 bg-white/4 p-3.5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-semibold text-white">
                  Estilo do Bloco / Forma
                </span>
                <button
                  type="button"
                  onClick={() => onSelect("")}
                  className="text-[11px] text-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block text-xs font-medium text-white/80">
                  Cor de Preenchimento
                  <input
                    aria-label="Cor de preenchimento"
                    className="block w-full h-9 mt-1 rounded-lg border border-white/15 cursor-pointer bg-transparent"
                    type="color"
                    value={selected.fill || "#000000"}
                    onChange={e => patch({ fill: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-white/80">
                  Cantos Arredondados
                  <input
                    aria-label="Cantos arredondados"
                    className={field + " mt-1"}
                    type="number"
                    min={0}
                    value={selected.cornerRadius ?? 0}
                    onChange={e =>
                      patch({ cornerRadius: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-white/80">
                Opacidade ({Math.round((selected.opacity ?? 1) * 100)}%)
                <input
                  aria-label="Opacidade da peça"
                  className="w-full mt-2 accent-[oklch(0.78_0.22_48)] cursor-pointer"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selected.opacity ?? 1}
                  onChange={e => patch({ opacity: Number(e.target.value) })}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* ─── SEÇÃO 3: MÍDIA ─── */}
      {section === "media" && media && !hideMediaSlotUpload && (
        <div className="rounded-xl border border-white/10 bg-white/4 p-3.5 space-y-3">
          <div className="text-xs font-semibold text-white">
            Foto e enquadramento
          </div>
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
              <label className="block text-xs text-white/70" key={axis}>
                Ponto focal {axis === "focalX" ? "horizontal" : "vertical"}
                <input
                  aria-label={`Ponto focal ${axis}`}
                  className="w-full mt-1 accent-[oklch(0.78_0.22_48)]"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={c.media[media.id][axis]}
                  onChange={e =>
                    onChange(
                      c.version === 3 &&
                        c.authorialLayers.some(l => l.id === media.id)
                        ? updateArsenalAuthorialLayer(c, media.id, {
                            [axis]: Number(e.target.value),
                          })
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
      )}

      {section === "media" &&
        c.version === 3 &&
        c.customBackground?.imageUrl && (
          <div className="rounded-xl border border-white/10 bg-white/4 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">
                Filtro e Enquadramento do Fundo
              </span>
              <button
                className="text-xs text-rose-300 hover:underline cursor-pointer"
                onClick={() =>
                  onChange(
                    setArsenalCustomBackground(c, { imageUrl: undefined })
                  )
                }
              >
                Remover fundo
              </button>
            </div>
            {(["focalX", "focalY", "overlayOpacity"] as const).map(key => (
              <label key={key} className="block text-xs text-white/70">
                {
                  {
                    focalX: "Enquadramento horizontal",
                    focalY: "Enquadramento vertical",
                    overlayOpacity: "Intensidade do filtro",
                  }[key]
                }
                <input
                  aria-label={key}
                  className="w-full mt-1 accent-[oklch(0.78_0.22_48)]"
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
            <div className="grid grid-cols-2 gap-2.5 items-center">
              <label className="block text-xs text-white/70">
                Cor do filtro
                <input
                  aria-label="Cor do filtro"
                  type="color"
                  className="block w-full h-8 mt-1 rounded-lg border border-white/15 bg-transparent cursor-pointer"
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
              <label className="block text-xs text-white/70">
                Tipo de filtro
                <select
                  aria-label="Tipo de filtro"
                  className={field + " mt-1"}
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
            </div>
          </div>
        )}

      {/* ─── SEÇÃO 4: DESIGN (CAMADAS, ORDEM E ALINHAMENTO) ─── */}
      {section === "design" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-white/50 font-semibold block">
              Selecionar camada ou grupo
            </label>
            <select
              aria-label="Selecionar peça ou grupo"
              className={field}
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
                  {kindLabels[e.kind] ?? e.kind}:{" "}
                  {e.text.slice(0, 32) || e.id}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="rounded-xl border border-white/12 bg-white/4 p-3.5 space-y-3.5">
              {/* Alinhamento rápido e giro */}
              <div className="space-y-2">
                <span className="text-[11px] uppercase tracking-wider text-white/50 font-semibold block">
                  Alinhamento e Giro Rápido
                </span>
                <div
                  className="grid grid-cols-2 gap-2"
                  aria-label="Ajustes rápidos de arte"
                >
                  <button
                    className={button}
                    aria-label="Centralizar horizontalmente"
                    onClick={() =>
                      onChange(
                        centerArtSelection(c, selected.id, "horizontal")
                      )
                    }
                  >
                    Centralizar ↔
                  </button>
                  <button
                    className={button}
                    aria-label="Centralizar verticalmente"
                    onClick={() =>
                      onChange(centerArtSelection(c, selected.id, "vertical"))
                    }
                  >
                    Centralizar ↕
                  </button>
                  <button
                    className={button}
                    aria-label="Girar 3 graus para a esquerda"
                    onClick={() =>
                      onChange(rotateArtSelection(c, selected.id, -3))
                    }
                  >
                    Girar −3°
                  </button>
                  <button
                    className={button}
                    aria-label="Girar 3 graus para a direita"
                    onClick={() =>
                      onChange(rotateArtSelection(c, selected.id, 3))
                    }
                  >
                    Girar +3°
                  </button>
                  {!("kind" in selected) && (
                    <>
                      <button
                        className={button}
                        aria-label="Aumentar ênfase do grupo em 10%"
                        onClick={() =>
                          onChange(
                            emphasizeArtGroup(c, selected.id, "increase")
                          )
                        }
                      >
                        Ênfase +10%
                      </button>
                      <button
                        className={button}
                        aria-label="Reduzir ênfase do grupo em 10%"
                        onClick={() =>
                          onChange(
                            emphasizeArtGroup(c, selected.id, "decrease")
                          )
                        }
                      >
                        Ênfase −10%
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Ordem de empilhamento */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <span className="text-[11px] uppercase tracking-wider text-white/50 font-semibold block">
                  Ordem da Camada
                </span>
                {"kind" in selected &&
                  c.version === 3 &&
                  c.authorialLayers.some(l => l.id === selected.id) && (
                    <label className="block text-xs text-white/70">
                      Grupo da camada
                      <select
                        aria-label="Grupo da camada"
                        className={field + " mt-1"}
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
              </div>

              {/* Coordenadas numéricas recolhidas para uso avançado */}
              <details className="pt-2 border-t border-white/10">
                <summary className="cursor-pointer text-xs text-white/60 hover:text-white select-none">
                  Posição e dimensões exatas (px)
                </summary>
                <div className="grid grid-cols-2 gap-2 mt-2.5">
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
                  ).map(key => {
                    const coordLabels: Record<string, string> = {
                      x: "Posição X",
                      y: "Posição Y",
                      width: "Largura",
                      height: "Altura",
                      rotation: "Giro (°)",
                      scale: "Escala",
                    };
                    return (
                      <label key={key} className="text-xs text-white/70">
                        {coordLabels[key] ?? key}
                        <input
                          aria-label={`Peça ${key}`}
                          key={
                            selected.id +
                            key +
                            String(
                              (selected as unknown as Record<string, number>)[
                                key
                              ]
                            )
                          }
                          className={field + " mt-1"}
                          type="number"
                          step="any"
                          defaultValue={Math.round(
                            (selected as unknown as Record<string, number>)[key]
                          )}
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
                    );
                  })}
                </div>
              </details>

              {"kind" in selected && (
                <div className="pt-2 border-t border-white/10">
                  <button
                    className={
                      button +
                      " w-full border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                    }
                    onClick={() => {
                      onChange(hideArsenalInstance(c, selected.id));
                      onSelect("");
                    }}
                  >
                    Remover elemento
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Restauração de layout e opções avançadas (recolhidas por padrão) */}
          <div className="pt-2 border-t border-white/10 space-y-2.5">
            <button
              className={button + " w-full"}
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

            <details className="rounded-xl border border-white/10 bg-white/3 p-3 group">
              <summary className="cursor-pointer text-xs font-semibold text-white/70 hover:text-white flex items-center justify-between select-none">
                <span>Opções avançadas (Relações & JSON)</span>
                <span className="text-[10px] text-white/40 group-open:rotate-180 transition-transform">
                  ▼
                </span>
              </summary>
              <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
                {c.relations.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-white/70">
                      Relações vinculadas
                    </div>
                    {c.relations.map(r => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-2 py-1 text-xs text-white/70"
                      >
                        <span>
                          {r.id} · {r.kind}
                        </span>
                        <button
                          className={button}
                          disabled={!r.enabled}
                          onClick={() =>
                            onChange(disableArsenalRelation(c, r.id))
                          }
                        >
                          {r.enabled ? "Desligar" : "Livre"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="text-[11px] font-semibold text-white/70">
                    Arquivo portátil {c.version === 3 ? "V5" : "V4"}
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      className={button + " w-full"}
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
                    <label className={button + " block text-center"}>
                      Importar JSON {c.version === 3 ? "V5" : "V4"}
                      <input
                        aria-label={`Reabrir JSON ${c.version === 3 ? "V5" : "V4"}`}
                        type="file"
                        accept="application/json,.json"
                        className="sr-only"
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
                              await ensureArsenalCompositionFonts(
                                recipe.composition
                              );
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
                    </label>
                  </div>
                </div>
              </div>
            </details>
          </div>

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
        </div>
      )}
    </div>
  );
}
