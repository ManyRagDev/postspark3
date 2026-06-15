import { Type } from "lucide-react";
import { useEditorStore } from "@/store/editorStore";
import { PrecisionSlider } from "@/components/ui/PrecisionSlider";
import type { PostVariation } from "@shared/postspark";

type TextElement = NonNullable<PostVariation["textElements"]>[number];

function fieldClassName() {
  return "w-full rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-white/25";
}

export default function ElementContentBlock() {
  const activeVariation = useEditorStore((state) => state.activeVariation);
  const layoutTarget = useEditorStore((state) => state.layoutTarget);
  const updateVariation = useEditorStore((state) => state.updateVariation);

  if (!activeVariation) return null;

  if (layoutTarget.startsWith("section:")) {
    const sectionId = layoutTarget.slice("section:".length);
    const sectionIndex = activeVariation.sections?.findIndex(
      (section, index) => (section.id ?? `section-${index + 1}`) === sectionId,
    ) ?? -1;
    const section = activeVariation.sections?.[sectionIndex];
    if (!section) return null;

    const updateSection = (patch: Partial<typeof section>) => {
      updateVariation({
        sections: activeVariation.sections?.map((item, index) =>
          index === sectionIndex ? { ...item, ...patch } : item
        ),
      });
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
          <Type size={13} />
          Conteúdo do bloco
        </div>
        <input
          className={fieldClassName()}
          value={section.label}
          onChange={(event) => updateSection({ label: event.target.value })}
          aria-label="Título do bloco"
        />
        <textarea
          className={`${fieldClassName()} min-h-20 resize-y`}
          value={section.description ?? ""}
          onChange={(event) => updateSection({ description: event.target.value })}
          aria-label="Descrição do bloco"
        />
        <input
          className={fieldClassName()}
          value={section.icon ?? ""}
          onChange={(event) => updateSection({ icon: event.target.value })}
          placeholder="Ícone Lucide"
          aria-label="Ícone do bloco"
        />
      </div>
    );
  }

  if (!layoutTarget.startsWith("textElement:")) return null;

  const elementId = layoutTarget.slice("textElement:".length);
  const element = activeVariation.textElements?.find((item) => item.id === elementId);
  if (!element) return null;

  const updateTextElement = (patch: Partial<TextElement>) => {
    updateVariation({
      textElements: activeVariation.textElements?.map((item) =>
        item.id === elementId ? { ...item, ...patch } : item
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
        Texto avançado
      </div>
      <textarea
        className={`${fieldClassName()} min-h-20 resize-y`}
        value={element.text}
        onChange={(event) => updateTextElement({ text: event.target.value })}
        aria-label="Conteúdo do texto avançado"
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
        label="Rotação"
        value={element.rotation}
        min={-180}
        max={180}
        step={1}
        unit="°"
        onChange={(rotation) => updateTextElement({ rotation })}
      />
      <div className="grid grid-cols-2 gap-2">
        <PrecisionSlider
          label="Posição X"
          value={element.x}
          min={0}
          max={340}
          step={1}
          unit="px"
          onChange={(x) => updateTextElement({ x })}
        />
        <PrecisionSlider
          label="Posição Y"
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
