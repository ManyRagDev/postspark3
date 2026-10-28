import { TEXT_EFFECTS_META, type CanvasPostModel } from "./types";
import { useState } from "react";
import {
  resolveEditorList,
  resolveEditorProperties,
  type EditorCommand,
  type EditorLayer,
} from "../lib/editorController";
import { contrastRatio } from "../lib/contrast";
import { resolveSlideAppearance } from "../lib/slideReplication";
import FontPickerDropdown from "./FontPickerDropdown";
import { CanvasSelectedText } from "./CanvasEditorPanel";

const field =
  "w-full min-h-11 rounded-lg border border-white/15 bg-white/5 px-2 text-sm text-white";
export function CanvasSelectionPanel({
  post,
  layer,
  onCommand,
  onEditOnCanvas,
  onChangeImage,
}: {
  post: CanvasPostModel;
  layer: EditorLayer;
  onCommand: (command: EditorCommand) => void;
  onEditOnCanvas: () => void;
  onChangeImage?: () => void;
}) {
  if (!post.slides.some(slide => slide.id === layer.target.slideId))
    return <p>O objeto não está mais neste slide.</p>;
  const list = resolveEditorList(post, layer.target);
  const { values, supported } = resolveEditorProperties(post, layer.target);
  const composition = post.slides.find(
    slide => slide.id === layer.target.slideId
  )?.composition;
  const has = (key: string) =>
    layer.capabilities.properties && supported.includes(key);
  const set = (patch: Record<string, string | number | boolean | null>) =>
    onCommand({ type: "properties", patch });
  const numeric = (
    key: string,
    name: string,
    min?: number,
    max?: number,
    step = 1
  ) => {
    const value = values[key];
    if (!has(key) || typeof value !== "number") return null;
    return (
      <label key={key} className="block space-y-1 text-xs text-white/70">
        {name}
        <input
          className={field}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={event => {
            if (event.target.value !== "")
              set({ [key]: Number(event.target.value) });
          }}
        />
      </label>
    );
  };
  if (!layer.capabilities.properties && !layer.capabilities.editText)
    return (
      <p className="text-sm text-white/60">
        {layer.unavailableReason ||
          "Este objeto não possui ajustes disponíveis."}
      </p>
    );
  const fill = values.fill;
  const nativeText =
    !composition && (layer.id === "headline" || layer.id === "subtext");
  const appearance = resolveSlideAppearance(
    post,
    post.slides.findIndex(slide => slide.id === layer.target.slideId)
  );
  const background =
    layer.id === "subtext" && appearance.familyId === "brutal-split"
      ? appearance.palette.accent
      : appearance.palette.background;
  const lowContrast =
    nativeText &&
    typeof fill === "string" &&
    contrastRatio(background, fill) < 4.5;

  const advanced = [
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "scaleX",
    "scaleY",
    "cornerRadius",
    "strokeWidth",
    "lineHeight",
    "letterSpacing",
  ].filter(has);
  return (
    <div className="space-y-4">
      {layer.capabilities.editText &&
        (list ? (
          <CanvasListEditor
            key={`${layer.target.slideId}:${list.source}`}
            items={list.items}
            onCommand={onCommand}
            onEditOnCanvas={onEditOnCanvas}
          />
        ) : (
          <CanvasSelectedText
            value={layer.text || ""}
            onChange={value => onCommand({ type: "text", text: value })}
            onEditOnCanvas={onEditOnCanvas}
          />
        ))}
      {(layer.kind === "image" || layer.kind === "background") &&
        onChangeImage && (
          <button type="button" className={field} onClick={onChangeImage}>
            Trocar imagem
          </button>
        )}
      {has("fontFamily") && (
        <label className="block space-y-1 text-xs text-white/70">
          Fonte
          <FontPickerDropdown
            value={String(values.fontFamily || post.fontFamily)}
            userFonts={post.userFonts}
            onChange={fontFamily => set({ fontFamily })}
          />
        </label>
      )}
      {has("fill") &&
        typeof fill === "string" &&
        /^#[0-9a-f]{6}$/i.test(fill) && (
          <label className="block text-xs text-white/70">
            Cor
            <input
              type="color"
              value={fill}
              onChange={event => set({ fill: event.target.value })}
              className="block h-11 w-full bg-transparent"
            />
          </label>
        )}
      {nativeText && (
        <div className="space-y-2">
          {lowContrast && (
            <p role="status" className="text-xs text-amber-200">
              Contraste baixo com o fundo. Ajuste a cor ou use um efeito de
              legibilidade.
            </p>
          )}
          <button
            type="button"
            className={field}
            onClick={() => set({ fill: null })}
          >
            Cor automática
          </button>
        </div>
      )}
      {numeric("fontSize", "Tamanho da fonte", 1)}
      {numeric("fontWeight", "Peso da fonte", 100, 900, 100)}
      {numeric("opacity", "Opacidade (0 a 1)", 0, 1, 0.05)}
      {numeric(
        "overlayOpacity",
        "Intensidade da sobreposição (0 a 1)",
        0,
        1,
        0.05
      )}
      {numeric("sizeScale", "Tamanho relativo", 0.1, 10, 0.05)}
      {has("effect") && (
        <label className="block space-y-1 text-xs text-white/70">
          Efeito de legibilidade
          <select
            className={field}
            value={String(values.effect || "none")}
            onChange={event => set({ effect: event.target.value })}
          >
            {Object.values(TEXT_EFFECTS_META).map(effect => (
              <option key={effect.id} value={effect.id}>
                {effect.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {has("effectColor") && values.effect !== "none" && (
        <label className="block text-xs text-white/70">
          Cor do efeito
          <input
            type="color"
            value={
              typeof values.effectColor === "string" &&
              /^#[0-9a-f]{6}$/i.test(values.effectColor)
                ? values.effectColor
                : "#000000"
            }
            onChange={event => set({ effectColor: event.target.value })}
            className="block h-11 w-full bg-transparent"
          />
        </label>
      )}
      {has("fitMode") && (
        <label className="block space-y-1 text-xs text-white/70">
          Enquadramento da imagem
          <select
            className={field}
            value={String(values.fitMode || "cover")}
            onChange={event => set({ fitMode: event.target.value })}
          >
            <option value="cover">Preencher</option>
            <option value="contain">Imagem inteira</option>
            {!composition && (
              <>
                <option value="original">Original</option>
                <option value="custom">Personalizado</option>
              </>
            )}
          </select>
        </label>
      )}
      {has("splitBgPosition") && (
        <label className="block space-y-1 text-xs text-white/70">
          Posição da imagem
          <select
            className={field}
            value={String(values.splitBgPosition || "bottom")}
            onChange={event => set({ splitBgPosition: event.target.value })}
          >
            <option value="top">Parte superior</option>
            <option value="bottom">Parte inferior</option>
            <option value="full">Fundo inteiro</option>
          </select>
        </label>
      )}
      {has("overlayMode") && (
        <label className="block space-y-1 text-xs text-white/70">
          Estilo da sobreposição
          <select
            className={field}
            value={String(values.overlayMode || "gradient-bottom")}
            onChange={event => set({ overlayMode: event.target.value })}
          >
            <option value="gradient-bottom">Gradiente na base</option>
            <option value="gradient-top">Gradiente no topo</option>
            <option value="solid">Sólido</option>
            <option value="radial">Vinheta</option>
          </select>
        </label>
      )}
      {has("overlayColor") && (
        <label className="block text-xs text-white/70">
          Cor da sobreposição
          <input
            type="color"
            value={
              typeof values.overlayColor === "string" &&
              /^#[0-9a-f]{6}$/i.test(values.overlayColor)
                ? values.overlayColor
                : "#000000"
            }
            onChange={event => set({ overlayColor: event.target.value })}
            className="block h-11 w-full bg-transparent"
          />
        </label>
      )}
      {has("align") && (
        <label className="block space-y-1 text-xs text-white/70">
          Alinhamento do texto
          <select
            className={field}
            value={String(values.align || "left")}
            onChange={event => set({ align: event.target.value })}
          >
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
          </select>
        </label>
      )}
      {advanced.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer text-sm">
            Ajustes avançados
          </summary>
          <div className="grid grid-cols-2 gap-2">
            {advanced.map(key =>
              numeric(
                key,
                (
                  {
                    x: "Posição X",
                    y: "Posição Y",
                    width: "Largura",
                    height: "Altura",
                    rotation: "Giro",
                    scaleX: "Escala horizontal",
                    scaleY: "Escala vertical",
                    cornerRadius: "Arredondamento",
                    strokeWidth: "Espessura do contorno",
                    lineHeight: "Altura da linha",
                    letterSpacing: "Espaçamento das letras",
                  } as Record<string, string>
                )[key],
                key === "width" || key === "height" || key === "lineHeight"
                  ? 1
                  : undefined
              )
            )}
          </div>
        </details>
      )}
      {layer.capabilities.align && (
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["left", "Alinhar à esquerda"],
              ["center", "Centralizar horizontalmente"],
              ["right", "Alinhar à direita"],
            ] as const
          ).map(([alignment, name]) => (
            <button
              key={alignment}
              type="button"
              className="min-h-11 rounded-lg border border-white/15 px-2 text-xs"
              onClick={() => onCommand({ type: "align", alignment })}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CanvasListEditor({
  items,
  onCommand,
  onEditOnCanvas,
}: {
  items: Array<{ id: string; text: string }>;
  onCommand: (command: EditorCommand) => void;
  onEditOnCanvas: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find(item => item.id === selectedId) ?? items[0];
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Itens da lista</h3>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-1">
            <button
              type="button"
              className="min-h-11 min-w-0 flex-1 truncate rounded-lg px-2 text-left text-xs aria-pressed:bg-white/15"
              aria-pressed={selected?.id === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              {item.text || `Item ${index + 1}`}
            </button>
            <button
              type="button"
              className="min-h-11 min-w-11 text-xs disabled:opacity-30"
              aria-label={`Mover item ${index + 1} para cima`}
              disabled={index === 0}
              onClick={() =>
                onCommand({
                  type: "list",
                  action: "move",
                  itemId: item.id,
                  destination: index - 1,
                })
              }
            >
              ↑
            </button>
            <button
              type="button"
              className="min-h-11 min-w-11 text-xs disabled:opacity-30"
              aria-label={`Mover item ${index + 1} para baixo`}
              disabled={index === items.length - 1}
              onClick={() =>
                onCommand({
                  type: "list",
                  action: "move",
                  itemId: item.id,
                  destination: index + 1,
                })
              }
            >
              ↓
            </button>
            <button
              type="button"
              className="min-h-11 min-w-11 text-xs"
              aria-label={`Excluir item ${index + 1}`}
              onClick={() =>
                onCommand({ type: "list", action: "remove", itemId: item.id })
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <CanvasSelectedText
          value={selected.text}
          onChange={text =>
            onCommand({
              type: "list",
              action: "text",
              itemId: selected.id,
              text,
            })
          }
          onEditOnCanvas={onEditOnCanvas}
        />
      )}
      <button
        type="button"
        className="min-h-11 rounded-lg border border-white/15 px-3 text-xs"
        onClick={() =>
          onCommand({ type: "list", action: "add", text: "Novo item" })
        }
      >
        Adicionar item
      </button>
    </section>
  );
}
