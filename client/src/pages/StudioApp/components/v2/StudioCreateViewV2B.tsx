import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";
import { loadFontByName } from "@/lib/fonts";
import SparkLogo from "@/components/SparkLogo";
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
  type Specimen,
} from "./shared";

/**
 * StudioCreateViewV2B — iteração regularizada da tela de criação.
 *
 * Decisões de design (aprovadas):
 *  1. **No-scroll absoluto** — toda a informação cabe em 100svh. A densidade é
 *     mitigada com microtipografia mono e hairlines, não com compressão cega:
 *     o headline recupera peso de marca e a folha mantém presença.
 *  2. **A folha tonal** — o campo é o protagonista: superfície sutilmente mais
 *     clara que a página (contraste tonal, não outline), placeholder Playfair
 *     itálica como instrução, sem label redundante acima. No foco, o fundo
 *     clareia e a hairline inferior vira accent.
 *  3. **Direção de gosto** — tocar num espécime traz a ideia E declara a
 *     família como gosto (estado controlado pela página). O header da
 *     prateleira lê o estado: "Deixa com o estúdio" ↔ "Gosto — {família}".
 *  4. **Layout único** — coluna única em todos os tamanhos (mobile e desktop),
 *     com a prateleira sempre abaixo em fita horizontal. O envio é um botão
 *     inline DENTRO da folha (a ação pertence ao protagonista); o verbo
 *     dinâmico vive no micro-label sob o campo. Sem CTA fixo no rodapé.
 *
 * Contrato preservado: onSubmit(prompt, mode) + isLoading.
 */

interface StudioCreateViewV2BProps {
  onSubmit: (prompt: string, mode: "static" | "carousel") => void;
  isLoading: boolean;
  declaredFamilyId: string | null;
  onDeclareFamily: (familyId: string | null) => void;
}

export default function StudioCreateViewV2B({
  onSubmit,
  isLoading,
  declaredFamilyId,
  onDeclareFamily,
}: StudioCreateViewV2BProps) {
  const [prompt, setPrompt] = useState("");
  const [postMode, setPostMode] = useState<"static" | "carousel">("static");
  const [isFocused, setIsFocused] = useState(false);
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const specimens = buildSpecimens();

  useEffect(() => {
    SPECIMEN_FONTS.forEach(loadFontByName);
  }, []);

  // Autoresize com teto: texto longo rola DENTRO do campo — a página nunca rola.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [prompt]);

  const isEmpty = prompt.trim().length === 0;
  const isUrl = URL_REGEX.test(prompt.trim());
  const canSubmit = !isEmpty && !isLoading;
  const declaredSpecimen = specimens.find((s) => s.id === declaredFamilyId) ?? null;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setLastSubmittedPrompt(prompt.trim());
    onSubmit(prompt.trim(), postMode);
  };

  // Toque no espécime: traz a copy e alterna o gosto (liga/desliga/migra).
  const handleSpecimenPick = (specimen: Specimen) => {
    setPrompt(specimen.prompt);
    onDeclareFamily(declaredFamilyId === specimen.id ? null : specimen.id);
  };

  return (
    <div className="flex h-[100svh] flex-col" style={{ background: STUDIO.bg, color: STUDIO.ink }}>
      <style>{`
        .psv2b-prompt::placeholder {
          font-family: 'Playfair Display', serif;
          font-style: italic;
          color: rgba(242,237,228,0.4);
          font-size: 1.4rem;
          line-height: 1.35;
        }
        @media (min-width: 768px) {
          .psv2b-prompt::placeholder {
            font-size: 1.75rem;
          }
        }
      `}</style>

      <StudioMasthead />

      <main className="min-h-0 flex-1">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-5 pt-5 md:px-8 md:py-7">
          {/* Coluna única: logo + headline + folha + formato + prateleira */}
          <div className="flex min-h-0 flex-col">
            <section>
              {/* Logotipo centralizado — fundo transparente (/favicon.png) */}
              <div className="flex items-center justify-center">
                <SparkLogo size={128} />
              </div>
              <h1
                className="mt-4 text-[1.4rem] leading-tight tracking-[-0.02em] md:text-5xl"
                style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
              >
                O que vamos{" "}
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
              <p
                className="mt-1.5 text-[12px] leading-relaxed md:mt-4 md:text-[13px]"
                style={{ color: STUDIO.ink60 }}
              >
                Digite um tema — ou cole o site da sua marca.
              </p>
            </section>

            {/* A folha: protagonista inconfundível. Contraste tonal + hairline
                inferior accent no foco. Sem label acima — o placeholder é a
                instrução. O envio vive DENTRO da folha: botão inline à
                direita, ghost quando vazio, tinta-papel quando há texto. */}
            <section className="mt-4">
              <div
                className="rounded-sm border transition-all duration-200"
                style={{
                  background: isFocused ? "rgba(242,237,228,0.05)" : "rgba(242,237,228,0.03)",
                  borderColor: isFocused ? "rgba(242,237,228,0.16)" : STUDIO.hairline,
                  boxShadow: isFocused ? `inset 0 -1.5px 0 ${STUDIO.accent}` : "none",
                }}
              >
                <div className="flex items-end gap-1">
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
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
                    className="psv2b-prompt w-full min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-3.5 pl-4 pr-1 outline-none"
                    style={{
                      fontFamily: "var(--font-sans)",
                      color: STUDIO.ink,
                      fontSize: 17,
                      lineHeight: 1.5,
                      minHeight: isEmpty ? 88 : 56,
                      transition: "min-height 220ms ease",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    aria-label={declaredSpecimen ? "Criar com este gosto" : "Criar direções de arte"}
                    className="mb-2.5 mr-2.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95"
                    style={{
                      background: canSubmit ? STUDIO.ink : "rgba(242,237,228,0.06)",
                      color: canSubmit ? STUDIO.bg : STUDIO.ink40,
                      border: canSubmit ? "none" : `1px solid ${STUDIO.hairline}`,
                      boxShadow: canSubmit ? "0 4px 16px rgba(0,0,0,0.4)" : "none",
                    }}
                  >
                    {isLoading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-baseline justify-between">
                <span
                  className="min-w-0"
                  style={{
                    ...MONO,
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    color: isUrl ? STUDIO.urlSignal : STUDIO.ink40,
                    transition: "color 200ms",
                  }}
                >
                  {isUrl
                    ? declaredSpecimen
                      ? "Fonte — Site ↗ a identidade do site prevalece sobre o gosto"
                      : "Fonte — Site ↗ a identidade visual será extraída"
                    : "Fonte — Texto livre"}
                </span>
                {/* Micro-label do verbo — pareado visualmente com o botão da
                    folha logo acima. Substituiu o antigo hint "Enter ↵" para
                    não duplicar o affordance de envio. */}
                <span
                  className="ml-2 shrink-0 text-right"
                  style={{
                    ...MONO,
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    color: declaredSpecimen ? STUDIO.accent : STUDIO.ink40,
                    transition: "color 200ms",
                  }}
                >
                  {declaredSpecimen ? "Criar com este gosto" : "Criar direções de arte"}
                </span>
              </div>
            </section>

            <section className="mt-4">
              <FormatSelector value={postMode} onChange={setPostMode} />
            </section>
          </div>

          {/* Prateleira — fita horizontal em todos os tamanhos, absorve o
              espaço restante sem nunca estourar a página. */}
          <section className="mt-4 flex min-h-0 flex-1 flex-col pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
            <div className="flex items-baseline justify-between">
              <span style={{ ...MONO, color: STUDIO.ink40, fontSize: 10 }}>
                Referências — toque para trazer ideia e gosto
              </span>
              <span style={{ ...MONO, color: STUDIO.ink25, fontSize: 9 }}>06</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span
                className="inline-block h-1 w-1 rounded-full"
                style={{ background: declaredSpecimen ? STUDIO.accent : STUDIO.ink40 }}
                aria-hidden
              />
              <span
                style={{
                  ...MONO,
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  color: declaredSpecimen ? STUDIO.accent : STUDIO.ink40,
                }}
              >
                {declaredSpecimen ? `Gosto — ${declaredSpecimen.familyLabel}` : "Deixa com o estúdio"}
              </span>
            </div>
            <div className="mt-2.5 flex min-h-0 snap-x snap-mandatory gap-2.5 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {specimens.map((specimen, index) => (
                <SpecimenCard
                  key={specimen.id}
                  specimen={specimen}
                  index={index}
                  onPick={() => handleSpecimenPick(specimen)}
                  withDisclaimer
                  selected={declaredFamilyId === specimen.id}
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      <AnimatePresence>
        {isLoading && <ProductionOverlay prompt={lastSubmittedPrompt || prompt} />}
      </AnimatePresence>
    </div>
  );
}
