import SparkLogo from "@/components/SparkLogo";
import { ArrowRight, Sparkles } from "lucide-react";

interface FinalCtaSectionProps {
  onOpenAuth: () => void;
}

export default function FinalCtaSection({ onOpenAuth }: FinalCtaSectionProps) {
  return (
    <section className="py-24 px-4 md:px-8 max-w-5xl mx-auto text-center relative overflow-hidden border-t border-white/8">
      <div className="rounded-[3rem] border border-white/15 bg-gradient-to-b from-white/10 via-black/80 to-black p-8 sm:p-16 shadow-[0_40px_100px_rgba(0,0,0,0.9)] relative overflow-hidden">
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[250px] bg-[oklch(0.7_0.22_40)]/20 blur-[120px] pointer-events-none rounded-full" />

        <div className="relative z-10 flex flex-col items-center space-y-6">
          <SparkLogo size={58} />

          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white max-w-2xl leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            Comece a criar posts que constroem autoridade real.
          </h2>

          <p className="text-sm sm:text-base text-white/70 max-w-lg font-light">
            Cole a URL do seu site ou digite uma ideia. O PostSpark faz todo o resto.
          </p>

          <button
            type="button"
            onClick={onOpenAuth}
            className="group flex items-center gap-3 rounded-2xl py-4 px-8 text-base font-bold text-black shadow-2xl transition-all hover:scale-105 hover:brightness-110 active:scale-95 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
              boxShadow: "0 0 36px oklch(0.7 0.22 40 / 40%)",
            }}
          >
            <Sparkles size={18} className="fill-black text-black" />
            <span>Criar meu primeiro post</span>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </section>
  );
}
