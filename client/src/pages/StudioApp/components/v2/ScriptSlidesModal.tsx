import { useMemo, useState } from "react";
import { detectScriptStructure } from "../../lib/scriptDetector";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function ScriptSlidesModal({
  initial,
  initialText,
  onApply,
  onClose,
}: {
  initial: string[];
  initialText?: string;
  onApply: (slides: string[]) => void;
  onClose: () => void;
}) {
  const [slides, setSlides] = useState(
    initial.length >= 2 ? initial : ["", ""]
  );
  const [mode, setMode] = useState<"paste" | "slides">(
    initial.length >= 2 ? "slides" : "paste"
  );
  const serialize = (values: string[]) =>
    values.map((text, index) => `Slide ${index + 1}:\n${text}`).join("\n\n");
  const [blockText, setBlockText] = useState(
    () => initialText ?? (initial.length >= 2 ? serialize(initial) : "")
  );
  const [slidesChanged, setSlidesChanged] = useState(false);
  const detection = useMemo(
    () => detectScriptStructure(blockText),
    [blockText]
  );
  const updateSlides = (
    value: string[] | ((previous: string[]) => string[])
  ) => {
    setSlides(value);
    setSlidesChanged(true);
  };
  const showSlides = () => {
    if (mode === "paste" && detection.isScript) {
      setSlides(detection.slides.map(slide => slide.rawText));
      setSlidesChanged(false);
    }
    setMode("slides");
  };
  const showPaste = () => {
    if (slidesChanged) {
      setBlockText(serialize(slides));
      setSlidesChanged(false);
    }
    setMode("paste");
  };
  const move = (index: number, offset: number) =>
    updateSlides(previous => {
      const next = [...previous];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  const tooLong =
    slides.some(text => text.length > 8000) ||
    slides.map((text, index) => `Slide ${index + 1}:\n${text}`).join("\n\n")
      .length > 24000;
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="z-[110] max-h-[92dvh] w-[92vw] max-w-2xl overflow-y-auto border-violet-300/30 bg-[#181818] p-5 text-white"
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="text-lg font-semibold">
            Já tenho meu conteúdo
          </DialogTitle>
          <button type="button" onClick={onClose} className="min-h-11 px-2">
            Fechar
          </button>
        </div>
        <DialogDescription className="my-3 text-sm text-white/60">
          Cole o roteiro completo ou organize slide por slide, em até 10 slides.
          Confira a divisão antes de usar os textos na criação.
        </DialogDescription>
        <div
          role="group"
          aria-label="Modo de entrada do roteiro"
          className="mb-4 grid grid-cols-2 gap-2"
        >
          <button
            type="button"
            aria-pressed={mode === "paste"}
            onClick={showPaste}
            className={`min-h-11 rounded-lg border px-3 text-sm ${mode === "paste" ? "border-violet-400 bg-violet-600/25" : "border-white/15 text-white/65"}`}
          >
            Colar texto
          </button>
          <button
            type="button"
            aria-pressed={mode === "slides"}
            onClick={showSlides}
            className={`min-h-11 rounded-lg border px-3 text-sm ${mode === "slides" ? "border-violet-400 bg-violet-600/25" : "border-white/15 text-white/65"}`}
          >
            Slide por slide
          </button>
        </div>
        {mode === "paste" ? (
          <div className="space-y-3">
            <label htmlFor="script-block" className="block text-sm">
              Cole o roteiro completo
            </label>
            <textarea
              id="script-block"
              rows={10}
              value={blockText}
              onChange={event => setBlockText(event.target.value)}
              placeholder={
                "slide1:\nTexto do primeiro slide\n\nslide2:\nTexto do segundo slide"
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-base"
            />
            <p className="text-xs leading-relaxed text-white/60">
              Use Slide 1, slide1, Lâmina 1, Tela 1 ou Página 1 no início de
              cada slide. Também pode separar os textos com --- em uma linha só.
            </p>
            <p role="status" className="text-sm text-violet-200">
              {detection.isScript
                ? `${detection.slides.length} slides identificados. Confira e edite a divisão a seguir.`
                : "Inclua pelo menos dois slides com marcadores ou use Slide por slide."}
            </p>
            <button
              type="button"
              disabled={!detection.isScript}
              onClick={showSlides}
              className="min-h-11 w-full rounded-lg bg-violet-600 px-4 disabled:opacity-40"
            >
              Dividir em slides
            </button>
          </div>
        ) : (
          <>
            {slides.map((text, index) => (
              <div
                key={index}
                className="mb-4 rounded-xl border border-white/10 p-3"
              >
                <label className="text-sm" htmlFor={`script-page-${index}`}>
                  Slide {index + 1}
                </label>
                <textarea
                  id={`script-page-${index}`}
                  value={text}
                  rows={4}
                  onChange={e =>
                    updateSlides(
                      slides.map((value, i) =>
                        i === index ? e.target.value : value
                      )
                    )
                  }
                  className="mt-2 w-full rounded-lg bg-white/5 p-3 text-base"
                />
                <div className="flex gap-3 text-xs text-white/70">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="min-h-11 disabled:opacity-30"
                  >
                    Mover acima
                  </button>
                  <button
                    type="button"
                    disabled={index === slides.length - 1}
                    onClick={() => move(index, 1)}
                    className="min-h-11 disabled:opacity-30"
                  >
                    Mover abaixo
                  </button>
                  <button
                    type="button"
                    disabled={slides.length <= 2}
                    onClick={() =>
                      updateSlides(slides.filter((_, i) => i !== index))
                    }
                    className="min-h-11 disabled:opacity-30"
                  >
                    Remover slide
                  </button>
                </div>
              </div>
            ))}
            {tooLong && (
              <p role="alert" className="mb-3 text-sm text-amber-200">
                O limite atual é de 24 mil caracteres no roteiro e 8 mil por
                slide. Seu texto foi mantido para você ajustar.
              </p>
            )}
            <div className="flex flex-wrap justify-between gap-3">
              <button
                type="button"
                disabled={slides.length >= 10}
                onClick={() => updateSlides([...slides, ""])}
                className="min-h-11 rounded-lg border border-white/15 px-3 disabled:opacity-30"
              >
                Adicionar slide
              </button>
              <button
                type="button"
                disabled={
                  slides.length > 10 ||
                  tooLong ||
                  slides.some(text => !text.trim())
                }
                onClick={() => onApply(slides)}
                className="min-h-11 rounded-lg bg-violet-600 px-4 disabled:opacity-40"
              >
                Usar estes {slides.length} slides
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
