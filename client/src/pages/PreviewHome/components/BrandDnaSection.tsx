import { ArrowRight, CheckCircle2, Cpu, Palette, Sparkles, Type } from "lucide-react";

interface BrandDnaSectionProps {
  onOpenAuth: () => void;
}

export default function BrandDnaSection({ onOpenAuth }: BrandDnaSectionProps) {
  return (
    <section id="brand-dna" className="py-20 md:py-28 px-4 md:px-8 max-w-7xl mx-auto text-left border-t border-white/8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Texto Explicativo */}
        <div className="lg:col-span-5 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/12 bg-white/5 text-xs font-semibold uppercase tracking-wider text-[oklch(0.78_0.22_48)]">
            <Cpu size={14} />
            Engenharia de Identidade
          </div>

          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            A IA não inventa coisas aleatórias. Ela clona o seu Brand DNA.
          </h2>

          <p className="text-sm md:text-base text-white/70 font-light leading-relaxed">
            Ao analisar a URL do seu site ou os seus posts anteriores, o motor do PostSpark extrai com precisão cirúrgica os 4 pilares visuais que tornam sua marca inconfundível.
          </p>

          <div className="space-y-3 pt-2">
            {[
              { title: "Cores & Harmonização", desc: "Mapeia primárias, secundárias e superfícies com contraste WCAG garantido." },
              { title: "Tipografia & Voz", desc: "Combina fontes display, serifadas e sem serifa que transmitem autoridade." },
              { title: "Tom de Voz & Ângulos de Copy", desc: "Escreve textos com quebra de padrão e ganchos de retenção comprovados." },
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border border-white/8 bg-white/4">
                <CheckCircle2 size={18} className="text-[oklch(0.78_0.22_48)] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">{item.title}</div>
                  <div className="text-xs text-white/60 font-light">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 text-xs md:text-sm font-semibold text-[oklch(0.78_0.22_48)] hover:underline pt-2 cursor-pointer"
          >
            <span>Extrair o Brand DNA da minha marca</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Visual Ilustrativo do Scanner de DNA */}
        <div className="lg:col-span-7">
          <div className="rounded-[2rem] border border-white/15 bg-gradient-to-b from-white/8 to-black/80 p-6 md:p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
            {/* Header do Scanner */}
            <div className="flex items-center justify-between pb-6 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <span className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="text-xs font-mono text-white/40 ml-2">scanner_brand_dna.engine</span>
              </div>
              <span className="text-[10px] font-mono text-[oklch(0.78_0.22_48)] uppercase tracking-wider">Status: 100% Calibrado</span>
            </div>

            {/* Grade de Elementos do DNA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              {/* Card 1: Paleta */}
              <div className="p-4 rounded-2xl border border-white/10 bg-black/40 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                  <Palette size={15} className="text-[oklch(0.78_0.22_48)]" />
                  <span>Paleta Cromática</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  {["#0B0B0E", "#FF4D00", "#FFFFFF", "#1E2238"].map((color, i) => (
                    <div key={i} className="flex-1 h-10 rounded-lg flex items-end p-1.5 text-[9px] font-mono text-white/70" style={{ backgroundColor: color }}>
                      {color}
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 2: Tipografia */}
              <div className="p-4 rounded-2xl border border-white/10 bg-black/40 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                  <Type size={15} className="text-[oklch(0.78_0.22_48)]" />
                  <span>Matriz Tipográfica</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="text-white font-bold" style={{ fontFamily: "Georgia, serif" }}>Playfair Display (Editorial)</div>
                  <div className="text-white/60 font-sans">Plus Jakarta Sans (Corpo / UI)</div>
                  <div className="text-[oklch(0.78_0.22_48)] font-mono text-[10px]">Space Mono (Kickers & Tags)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
