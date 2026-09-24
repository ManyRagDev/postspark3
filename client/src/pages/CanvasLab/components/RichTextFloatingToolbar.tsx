import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CanvasPostPalette, CanvasRichTextChunk } from "./types";
import { isRichTextRangeBold, isRichTextRangeItalic, isRichTextRangeUnderline, type RichTextFormatPatch } from "../lib/richText";

interface Props {
  selection: { start: number; end: number };
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onApplyFormat: (format: RichTextFormatPatch, start: number, end: number, restoreFocus?: boolean) => void;
  onRestoreFocus: () => void;
  palette: CanvasPostPalette;
  baseColor: string;
  richText?: CanvasRichTextChunk[];
  baseBold?: boolean;
  baseItalic?: boolean;
}

export default function RichTextFloatingToolbar({ selection, anchorRef, onApplyFormat, onRestoreFocus, palette, baseColor, richText, baseBold = false, baseItalic = false }: Props) {
  const desktopRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const active = selection.end > selection.start;

  useLayoutEffect(() => {
    if (!active) return;
    const update = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const toolbar = desktopRef.current;
      if (!anchor || !toolbar) return;
      const width = toolbar.offsetWidth;
      const height = toolbar.offsetHeight;
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - width - 8, anchor.left + anchor.width / 2 - width / 2)),
        top: anchor.top >= height + 12 ? anchor.top - height - 8 : Math.min(window.innerHeight - height - 8, anchor.bottom + 8),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, anchorRef, selection.start, selection.end]);

  if (!active) return null;
  const colors = Array.from(new Set(["#FFFFFF", "#000000", palette.accent, palette.background, "#F87171", "#60A5FA", "#FBBF24"].map(color => color.toUpperCase())));
  const mobileColors = colors.slice(0, 5);
  const isBoldActive = isRichTextRangeBold(richText, selection.start, selection.end, baseBold);
  const isItalicActive = isRichTextRangeItalic(richText, selection.start, selection.end, baseItalic);
  const isUnderlineActive = isRichTextRangeUnderline(richText, selection.start, selection.end);
  const apply = (patch: RichTextFormatPatch) => onApplyFormat(patch, selection.start, selection.end);
  let selectedColor = baseColor;
  let offset = 0;
  for (const chunk of richText ?? []) {
    if (selection.start < offset + chunk.text.length) {
      selectedColor = chunk.color || baseColor;
      break;
    }
    offset += chunk.text.length;
  }
  const colorInputValue = /^#[\da-f]{6}$/i.test(selectedColor) ? selectedColor : "#FFFFFF";
  const mobileHost = document.getElementById("canvas-mobile-text-format-slot");
  const buttonClass = "min-h-10 min-w-10 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white active:bg-white/20";
  const pressedClass = "translate-y-px border-orange-400 bg-orange-400 text-black shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]";
  const controls = (
    <>
      <div className="flex shrink-0 items-center gap-1 border-r border-white/10 pr-2" aria-label="Cor do texto">
        {colors.map(color => <button key={color} type="button" onClick={() => apply({ color })} className="h-8 w-8 shrink-0 rounded-full border border-white/30" style={{ backgroundColor: color }} aria-label={`Aplicar cor ${color}`} />)}
      </div>
      <button type="button" onClick={() => apply({ bold: !isBoldActive })} aria-pressed={isBoldActive} aria-label="Negrito" className={`${buttonClass} font-bold ${isBoldActive ? pressedClass : ""}`}>B</button>
      <button type="button" onClick={() => apply({ italic: !isItalicActive })} aria-pressed={isItalicActive} aria-label="Itálico" className={`${buttonClass} italic ${isItalicActive ? pressedClass : ""}`}>I</button>
      <button type="button" onClick={() => apply({ underline: !isUnderlineActive })} aria-pressed={isUnderlineActive} aria-label="Sublinhado" className={`${buttonClass} underline ${isUnderlineActive ? pressedClass : ""}`}>U</button>
      <button type="button" onClick={() => apply({ sizeScale: 1.5 })} aria-label="Aumentar texto selecionado" className={buttonClass}>T+</button>
      <button type="button" onClick={() => apply({ sizeScale: 0.8 })} aria-label="Diminuir texto selecionado" className={buttonClass}>T−</button>
      <button type="button" onClick={() => apply({ color: null, sizeScale: 1, bold: null, italic: null, underline: null })} className={`${buttonClass} text-red-300`}>Limpar</button>
    </>
  );
  const mobileButtonClass = "flex h-10 min-w-0 w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 text-xs text-white active:bg-white/20";
  const mobileControls = (
    <>
      <div className="grid grid-cols-6 gap-1" aria-label="Cores rápidas do texto">
        {mobileColors.map(color => (
          <button key={color} type="button" onClick={() => apply({ color })} className="h-10 min-w-0 rounded-lg border border-white/25" style={{ backgroundColor: color }} aria-label={`Aplicar cor ${color}`} />
        ))}
        <label className="relative flex h-10 min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-white/35" style={{ background: "conic-gradient(#ef4444, #fbbf24, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)" }} title="Mais cores">
          <span className="rounded bg-black/65 px-1 text-[9px] font-bold text-white" aria-hidden="true">Mais</span>
          <input
            type="color"
            value={colorInputValue}
            onInput={event => onApplyFormat({ color: event.currentTarget.value }, selection.start, selection.end, false)}
            onBlur={onRestoreFocus}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Escolher cor personalizada"
          />
        </label>
      </div>
      <div className="grid grid-cols-6 gap-1" aria-label="Estilo do texto selecionado">
        <button type="button" onClick={() => apply({ bold: !isBoldActive })} aria-pressed={isBoldActive} aria-label="Negrito" className={`${mobileButtonClass} font-bold ${isBoldActive ? pressedClass : ""}`}>B</button>
        <button type="button" onClick={() => apply({ italic: !isItalicActive })} aria-pressed={isItalicActive} aria-label="Itálico" className={`${mobileButtonClass} italic ${isItalicActive ? pressedClass : ""}`}>I</button>
        <button type="button" onClick={() => apply({ underline: !isUnderlineActive })} aria-pressed={isUnderlineActive} aria-label="Sublinhado" className={`${mobileButtonClass} underline ${isUnderlineActive ? pressedClass : ""}`}>U</button>
        <button type="button" onClick={() => apply({ sizeScale: 1.5 })} aria-label="Aumentar texto selecionado" className={mobileButtonClass}>T+</button>
        <button type="button" onClick={() => apply({ sizeScale: 0.8 })} aria-label="Diminuir texto selecionado" className={mobileButtonClass}>T−</button>
        <button type="button" onClick={() => apply({ color: null, sizeScale: 1, bold: null, italic: null, underline: null })} aria-label="Limpar formatação" className={`${mobileButtonClass} text-[10px] text-red-300`}>Limpar</button>
      </div>
    </>
  );

  return <>
    {createPortal(
      <div ref={desktopRef} data-text-edit-chrome className="hidden md:flex fixed z-[100] max-w-[calc(100vw-16px)] items-center gap-1.5 overflow-x-auto rounded-xl border border-white/10 bg-[#121215]/95 p-2 shadow-2xl backdrop-blur-xl" style={position} onMouseDown={event => event.preventDefault()}>{controls}</div>,
      document.body
    )}
    {mobileHost && createPortal(
      <div data-text-edit-chrome role="toolbar" aria-label="Formatar texto selecionado" className="grid w-full max-w-full grid-cols-1 gap-1.5 overflow-hidden rounded-2xl border border-white/15 bg-[#121215]/95 p-2 shadow-2xl backdrop-blur-xl" onMouseDown={event => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); }}>{mobileControls}</div>,
      mobileHost
    )}
  </>;
}
