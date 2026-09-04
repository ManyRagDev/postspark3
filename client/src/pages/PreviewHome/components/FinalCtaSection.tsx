import SparkLogo from "@/components/SparkLogo";
import { ArrowRight, Sparkles } from "lucide-react";

interface FinalCtaSectionProps {
  onAction: () => void;
}

export default function FinalCtaSection({ onAction }: FinalCtaSectionProps) {
  return (
    <section className="py-24 md:py-32 px-4 md:px-8 max-w-5xl mx-auto text-center relative overflow-hidden">
      <div className="rounded-[3rem] border border-white/[0.09] bg-[oklch(0.06_0.04_280/80%)] p-8 sm:p-16 md:p-20 backdrop-blur-2xl shadow-[0_40px_100px_rgba(0,0,0,0.95)] relative overflow-hidden">
        {/* Glow de fundo focal */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#FF5C00]/[0.12] blur-[140px] pointer-events-none rounded-full" />

        <div className="relative z-10 flex flex-col items-center space-y-6">
          <div className="relative group">
            <div className="absolute inset-0 bg-[#FF5C00]/30 blur-xl rounded-full scale-125" />
            <div className="relative">
              <SparkLogo size={52} />
            </div>
          </div>

          <h2
            className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-[-0.03em] text-white max-w-2xl leading-[1.1]"
            style={{
              fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)",
              textShadow: "0 2px 24px rgba(0,0,0,0.85)",
            }}
          >
            Comece a criar posts que constroem autoridade real.
          </h2>

          <p className="text-sm sm:text-base md:text-[17px] text-[rgba(240,235,225,0.72)] max-w-lg font-light leading-relaxed">
            Cole a URL do seu site ou digite uma ideia crua. O PostSpark cuida de toda a direção de arte, redação e acabamento de estúdio.
          </p>

          <div className="flex flex-col items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onAction}
              className="group flex items-center gap-3 rounded-full py-4 px-8 md:px-10 text-sm md:text-base font-bold text-white shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
              style={{
                background: "linear-gradient(135deg, #FF6B2B 0%, #FF5C00 50%, #E04800 100%)",
                boxShadow: "0 0 35px rgba(255, 92, 0, 0.5)",
              }}
            >
              <Sparkles size={16} className="text-white fill-white" />
              <span>Criar meu primeiro post grátis</span>
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </button>

            <span className="text-[11px] font-mono text-white/45 tracking-wide pt-1">
              Google 1-clique · Sem cartão de crédito · Pronto em 30 segundos
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
