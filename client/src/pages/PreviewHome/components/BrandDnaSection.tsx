import { ArrowRight, Check, Compass, Layers, Palette, Sparkles, Type } from "lucide-react";

interface BrandDnaSectionProps {
  onAction: () => void;
}

export default function BrandDnaSection({ onAction }: BrandDnaSectionProps) {
  return (
    <section id="brand-dna" className="py-24 md:py-32 px-4 md:px-8 max-w-7xl mx-auto text-left relative">
      {/* Luz ambiente sutil */}
      <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] bg-[#FF5C00]/[0.05] blur-[160px] pointer-events-none rounded-full" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        {/* Texto Explicativo (5 Colunas) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] font-medium tracking-[0.2em] uppercase text-[#FF5C00]">
            <Compass size={13} />
            <span>Engenharia de Identidade</span>
          </div>

          <h2
            className="text-2xl sm:text-4xl md:text-[42px] font-bold tracking-[-0.03em] text-white leading-[1.12]"
            style={{ fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)" }}
          >
            A IA não inventa coisas aleatórias. Ela assimila o seu Brand DNA.
          </h2>

          <p className="text-sm md:text-base text-[rgba(240,235,225,0.72)] font-light leading-relaxed">
            Ao analisar a URL do seu site ou as suas referências visuais, o motor do PostSpark extrai com rigor de agência os pilares estéticos que tornam a sua marca inconfundível.
          </p>

          <div className="space-y-3.5 pt-2">
            {[
              {
                title: "Cromatismo & Superfícies",
                desc: "Mapeia primárias, secundárias e contrastes com proporção WCAG calibrada para leitura imediata.",
              },
              {
                title: "Matriz Tipográfica Soberana",
                desc: "Combina fontes display de impacto com famílias limpas de suporte sem amadorismo.",
              },
              {
                title: "Tom de Voz & Ângulos Editoriais",
                desc: "Escreve copies com ganchos de alta retenção, longe dos clichês robóticos de IA genérica.",
              },
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3.5 p-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <div className="w-6 h-6 rounded-full bg-[#FF5C00]/10 border border-[#FF5C00]/25 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={13} className="text-[#FF5C00]" />
                </div>
                <div>
                  <div className="text-xs md:text-sm font-semibold text-white tracking-wide">{item.title}</div>
                  <div className="text-xs text-white/60 font-light mt-0.5 leading-relaxed">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-2 text-xs md:text-sm font-bold text-[#FF5C00] hover:text-[#FF7A3D] transition-colors pt-3 cursor-pointer group"
          >
            <span>Extrair o Brand DNA da minha marca por URL</span>
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Visual Ilustrativo do Atelier de DNA (7 Colunas) */}
        <div className="lg:col-span-7">
          <div className="rounded-[2.2rem] border border-white/[0.09] bg-[oklch(0.06_0.04_280/70%)] p-6 sm:p-8 md:p-10 backdrop-blur-2xl shadow-[0_30px_90px_rgba(0,0,0,0.85)] relative overflow-hidden space-y-6">
            
            {/* Topo do Atelier: Status da URL analisada */}
            <div className="flex items-center justify-between pb-5 border-b border-white/[0.07] flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#00E59B] animate-pulse shadow-[0_0_8px_#00E59B]" />
                <span className="text-xs font-mono text-white/80 tracking-wide">
                  https://aurora-alfaiataria.com.br
                </span>
              </div>
              <span className="text-[10px] font-mono text-[#FF5C00] uppercase tracking-[0.2em] bg-[#FF5C00]/10 px-2.5 py-1 rounded-full border border-[#FF5C00]/25">
                ✦ Brand DNA Mapeado
              </span>
            </div>

            {/* Amostras Táteis de Material & Cor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-white/80">
                <div className="flex items-center gap-1.5">
                  <Palette size={14} className="text-[#FF5C00]" />
                  <span>Assinatura Cromática Extraída</span>
                </div>
                <span className="text-[10px] font-mono text-white/40">Contraste AAA Garantido</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { name: "Preto Ébano", hex: "#120D0A", role: "Fundo Soberano", textColor: "text-white" },
                  { name: "Ouro Nobre", hex: "#E5A93C", role: "Acento de Prestígio", textColor: "text-black" },
                  { name: "Marfim Puro", hex: "#F8F4EE", role: "Tipografia de Leitura", textColor: "text-black" },
                  { name: "Mogno Fundo", hex: "#221914", role: "Superfície de Apoio", textColor: "text-white" },
                ].map((swatch, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-2xl border border-white/[0.08] flex flex-col justify-between h-24 shadow-md transition-transform hover:scale-[1.02]"
                    style={{ backgroundColor: swatch.hex }}
                  >
                    <span className={`text-[9px] font-mono uppercase tracking-wider font-semibold opacity-70 ${swatch.textColor}`}>
                      {swatch.hex}
                    </span>
                    <div>
                      <div className={`text-xs font-bold ${swatch.textColor}`}>{swatch.name}</div>
                      <div className={`text-[9px] opacity-60 font-light ${swatch.textColor}`}>{swatch.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Matriz Tipográfica Real em Ação */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="p-4 sm:p-5 rounded-2xl border border-white/[0.07] bg-black/40 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/75">
                  <Type size={14} className="text-[#FF5C00]" />
                  <span>Tipografia Display (Headlines)</span>
                </div>
                <div className="text-2xl sm:text-3xl text-white font-bold tracking-normal italic pt-1" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                  Playfair Display
                </div>
                <p className="text-[11px] text-white/50 font-light">
                  Entalhe editorial clássico para ancorar autoridade e prestígio no topo do feed.
                </p>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl border border-white/[0.07] bg-black/40 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/75">
                  <Layers size={14} className="text-[#FF5C00]" />
                  <span>Família de Leitura (Corpo & UI)</span>
                </div>
                <div className="text-xl sm:text-2xl text-white font-semibold tracking-tight pt-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Plus Jakarta Sans
                </div>
                <p className="text-[11px] text-white/50 font-light">
                  Geometria limpa e neutra que garante escaneabilidade sem competir com a manchete.
                </p>
              </div>
            </div>

            {/* Micro-nota de Garantia de Estilo */}
            <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-between text-xs text-white/70">
              <span className="flex items-center gap-2">
                <Sparkles size={13} className="text-[#FF5C00]" />
                <span>Zero risco de descaracterização: sua marca sempre reconhecível.</span>
              </span>
              <span className="text-[#FF5C00] font-mono text-[10px] hidden sm:inline">100% Nativo</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
