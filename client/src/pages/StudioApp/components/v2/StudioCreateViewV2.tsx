import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { loadFontByName } from "@/lib/fonts";
import {
  STUDIO,
  MONO,
  URL_REGEX,
  SPECIMEN_FONTS,
  StudioMasthead,
  FormatSelector,
  buildSpecimens,
  SpecimenCard,
  ProductionOverlay,
} from "./shared";

interface StudioCreateViewV2Props {
  onSubmit: (prompt: string, mode: "static" | "carousel") => void;
  isLoading: boolean;
}

export default function StudioCreateViewV2({ onSubmit, isLoading }: StudioCreateViewV2Props) {
  const [prompt, setPrompt] = useState("");
  const [postMode, setPostMode] = useState<"static" | "carousel">("static");
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    SPECIMEN_FONTS.forEach(loadFontByName);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`;
  }, [prompt]);

  const isUrl = URL_REGEX.test(prompt.trim());
  const canSubmit = prompt.trim().length > 0 && !isLoading;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setLastSubmittedPrompt(prompt.trim());
    onSubmit(prompt.trim(), postMode);
  };

  return (
    <div className="flex h-[100svh] flex-col" style={{ background: STUDIO.bg, color: STUDIO.ink }}>
      <style>{`
        .psv2-prompt::placeholder {
          font-family: 'Playfair Display', serif;
          font-style: italic;
          color: ${STUDIO.ink40};
        }
      `}</style>

      <StudioMasthead />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl">
          <section className="px-5 pt-9 md:pt-14">
            <h1
              className="text-[2.5rem] leading-[1.04] tracking-[-0.02em] md:text-6xl"
              style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
            >
              O que vamos
              <br />
              <span
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontStyle: "italic",
                  fontWeight: 500,
                }}
              >
                dirigir
              </span>{" "}
              hoje?
            </h1>
            <p className="mt-4 text-[13px] leading-relaxed" style={{ color: STUDIO.ink60 }}>
              Digite um tema — ou cole o site da sua marca.
            </p>
          </section>

          <section className="mt-8 px-5">
            <div className="border-y" style={{ borderColor: STUDIO.hairline }}>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Conte a ideia…"
                rows={1}
                disabled={isLoading}
                aria-label="Tema ou ideia do post"
                className="psv2-prompt w-full resize-none overflow-hidden bg-transparent py-4 text-[15px] leading-relaxed outline-none"
                style={{ fontFamily: "var(--font-sans)", color: STUDIO.ink, minHeight: 56 }}
              />
              <div className="flex items-center justify-between pb-3">
                <span
                  style={{
                    ...MONO,
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    color: isUrl ? STUDIO.urlSignal : STUDIO.ink40,
                    transition: "color 200ms",
                  }}
                >
                  {isUrl ? "Fonte — Site ↗ a identidade visual será extraída" : "Fonte — Texto livre"}
                </span>
                <span style={{ ...MONO, color: STUDIO.ink25, fontSize: 9 }}>Enter ↵</span>
              </div>
            </div>
          </section>

          <section className="mt-7 px-5">
            <FormatSelector value={postMode} onChange={setPostMode} />
          </section>

          <section className="mt-10 pb-6">
            <div className="flex items-baseline justify-between px-5">
              <span style={{ ...MONO, color: STUDIO.ink40, fontSize: 10 }}>Da prateleira — toque para usar</span>
              <span style={{ ...MONO, color: STUDIO.ink25, fontSize: 9 }}>06</span>
            </div>
            <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {buildSpecimens().map((specimen, index) => (
                <SpecimenCard key={specimen.id} specimen={specimen} index={index} onPick={setPrompt} />
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer
        className="border-t px-5 pb-[calc(env(safe-area-inset-bottom,0px)+14px)] pt-3"
        style={{ borderColor: STUDIO.hairline, background: STUDIO.bg }}
      >
        <div className="mx-auto w-full max-w-3xl">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-md transition-opacity active:scale-[0.99] disabled:opacity-30 md:max-w-xs"
            style={{ background: STUDIO.ink, color: STUDIO.bg }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Criar direções de arte
            </span>
            <ArrowRight size={15} />
          </button>
        </div>
      </footer>

      <AnimatePresence>
        {isLoading && <ProductionOverlay prompt={lastSubmittedPrompt || prompt} />}
      </AnimatePresence>
    </div>
  );
}
