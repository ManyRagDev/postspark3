import { MousePointer2, Type } from "lucide-react";
import { PrecisionSlider } from "@/components/ui/PrecisionSlider";
import { useEditorStore } from "@/store/editorStore";
import type { ContentSection, PostVariation } from "@shared/postspark";

type TextElement = NonNullable<PostVariation["textElements"]>[number];

function fieldClassName() {
  return "w-full rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-white/25";
}

function parseSectionNumber(value: string, fallback: number) {
  return Number.parseInt(value, 10) || fallback;
}

export default function ElementContentBlock() {
  const activeVariation = useEditorStore((state) => state.activeVariation);
  const layoutTarget = useEditorStore((state) => state.layoutTarget);
  const setLayoutTarget = useEditorStore((state) => state.setLayoutTarget);
  const updateVariation = useEditorStore((state) => state.updateVariation);

  if (!activeVariation) return null;

  const updateSectionAtIndex = (
    sectionIndex: number,
    patch: Partial<ContentSection>,
  ) => {
    updateVariation({
      sections: activeVariation.sections?.map((item, index) =>
        index === sectionIndex ? { ...item, ...patch } : item,
      ),
    });
  };

  if (layoutTarget.startsWith("section:")) {
    const sectionId = layoutTarget.slice("section:".length);
    const sectionIndex =
      activeVariation.sections?.findIndex(
        (section, index) => (section.id ?? `section-${index + 1}`) === sectionId,
      ) ?? -1;
    const section = activeVariation.sections?.[sectionIndex];
    if (!section) return null;

    const updateSection = (patch: Partial<ContentSection>) =>
      updateSectionAtIndex(sectionIndex, patch);

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
          <Type size={13} />
          Conteudo do bloco
        </div>
        <input
          className={fieldClassName()}
          value={section.label}
          onChange={(event) => updateSection({ label: event.target.value })}
          aria-label="Titulo do bloco"
        />
        <textarea
          className={`${fieldClassName()} min-h-20 resize-y`}
          value={section.description ?? ""}
          onChange={(event) => updateSection({ description: event.target.value })}
          aria-label="Descricao do bloco"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            className={fieldClassName()}
            value={section.number ?? sectionIndex + 1}
            onChange={(event) =>
              updateSection({
                number: parseSectionNumber(event.target.value, sectionIndex + 1),
              })
            }
            aria-label="Numero do bloco"
          />
          <input
            className={fieldClassName()}
            value={section.icon ?? ""}
            onChange={(event) => updateSection({ icon: event.target.value })}
            placeholder="Icone"
            aria-label="Icone do bloco"
          />
        </div>
      </div>
    );
  }

  if (!layoutTarget.startsWith("textElement:")) {
    if (!activeVariation.sections?.length) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
          <Type size={13} />
          Itens do post
        </div>
        <div className="space-y-3">
          {activeVariation.sections.map((section, index) => {
            const sectionId = section.id ?? `section-${index + 1}`;
            return (
              <div
                key={sectionId}
                className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Item {section.number ?? index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLayoutTarget(`section:${sectionId}`)}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-white/[0.08]"
                  >
                    <MousePointer2 size={11} />
                    Focar
                  </button>
                </div>
                <input
                  className={fieldClassName()}
                  value={section.label}
                  onChange={(event) =>
                    updateSectionAtIndex(index, { label: event.target.value })
                  }
                  aria-label={`Titulo do item ${index + 1}`}
                />
                <textarea
                  className={`${fieldClassName()} min-h-16 resize-y`}
                  value={section.description ?? ""}
                  onChange={(event) =>
                    updateSectionAtIndex(index, {
                      description: event.target.value,
                    })
                  }
                  aria-label={`Descricao do item ${index + 1}`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    className={fieldClassName()}
                    value={section.number ?? index + 1}
                    onChange={(event) =>
                      updateSectionAtIndex(index, {
                        number: parseSectionNumber(event.target.value, index + 1),
                      })
                    }
                    aria-label={`Numero do item ${index + 1}`}
                  />
                  <input
                    className={fieldClassName()}
                    value={section.icon ?? ""}
                    onChange={(event) =>
                      updateSectionAtIndex(index, { icon: event.target.value })
                    }
                    placeholder="Icone"
                    aria-label={`Icone do item ${index + 1}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const elementId = layoutTarget.slice("textElement:".length);
  const element = activeVariation.textElements?.find((item) => item.id === elementId);
  if (!element) return null;

  const updateTextElement = (patch: Partial<TextElement>) => {
    updateVariation({
      textElements: activeVariation.textElements?.map((item) =>
        item.id === elementId ? { ...item, ...patch } : item,
      ),
    });
  };

  const updateStyle = (patch: Partial<TextElement["styles"]>) => {
    updateTextElement({ styles: { ...element.styles, ...patch } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
        <Type size={13} />
        Texto avancado
      </div>
      <textarea
        className={`${fieldClassName()} min-h-20 resize-y`}
        value={element.text}
        onChange={(event) => updateTextElement({ text: event.target.value })}
        aria-label="Conteudo do texto avancado"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[10px] text-[var(--text-tertiary)]">
          Fonte
          <input
            className={fieldClassName()}
            value={element.styles.fontFamily}
            onChange={(event) => updateStyle({ fontFamily: event.target.value })}
          />
        </label>
        <label className="space-y-1 text-[10px] text-[var(--text-tertiary)]">
          Cor
          <input
            type="color"
            className="h-9 w-full rounded-lg border border-white/10 bg-black/25 p-1"
            value={element.styles.color}
            onChange={(event) => updateStyle({ color: event.target.value })}
          />
        </label>
      </div>
      <PrecisionSlider
        label="Tamanho da fonte"
        value={Number.parseFloat(element.styles.fontSize) || 16}
        min={8}
        max={96}
        step={1}
        unit="px"
        onChange={(value) => updateStyle({ fontSize: `${value}px` })}
      />
      <PrecisionSlider
        label="Rotacao"
        value={element.rotation}
        min={-180}
        max={180}
        step={1}
        unit="deg"
        onChange={(rotation) => updateTextElement({ rotation })}
      />
      <div className="grid grid-cols-2 gap-2">
        <PrecisionSlider
          label="Posicao X"
          value={element.x}
          min={0}
          max={340}
          step={1}
          unit="px"
          onChange={(x) => updateTextElement({ x })}
        />
        <PrecisionSlider
          label="Posicao Y"
          value={element.y}
          min={0}
          max={620}
          step={1}
          unit="px"
          onChange={(y) => updateTextElement({ y })}
        />
      </div>
      <PrecisionSlider
        label="Largura"
        value={element.width === "auto" ? 120 : element.width}
        min={24}
        max={340}
        step={1}
        unit="px"
        onChange={(width) => updateTextElement({ width })}
      />
    </div>
  );
}
