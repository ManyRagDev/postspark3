import { ArrowRight, Edit3, Layers, Palette, Sparkles, Sliders, Disc, ShieldCheck } from "lucide-react";

interface WorkbenchShowcaseProps {
  onOpenAuth: () => void;
}

export default function WorkbenchShowcase({ onOpenAuth }: WorkbenchShowcaseProps) {
  const textures = [
    { name: "Linho Fino", tone: "Editorial & Moda", bg: "#1F1D1A" },
    { name: "Couro Envelhecido", tone: "Brutal & Rústico", bg: "#241812" },
    { name: "Concreto Bruto", tone: "Arquitetura & Design", bg: "#2A2B2E" },
    { name: "Mármore Negro", tone: "High-Ticket & Luxo", bg: "#111318" },
    { name: "Metal Oxidado", tone: "Impacto & Industrial", bg: "#261E1A" },
    { name: "Fibra de Carbono", tone: "Tech & Alta Performance", bg: "#14171F" },
  ];

  return (
    <section id="estudio" className="py-20 md:py-28 px-4 md:px-8 max-w-7xl mx-auto text-left border-t border-white/8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Visual do Studio Workbench com o Estúdio de Texturas */}
        <div className="lg:col-span-7 order-2 lg:order-1">
          <div className="rounded-[2rem] border border-white/15 bg-gradient-to-b from-white/10 to-black/95 p-6 md:p-8 backdrop-blur-2xl shadow-2xl space-y-6 relative overflow-hidden">
            
            {/* Header do Editor */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Edit3 size={16} className="text-[#FF5C00]" />
                <span className="text-sm font-bold text-white">Workbench 2D & Estúdio de Texturas</span>
              </div>
              <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                Nativo · Sem Latência
              </span>
            </div>

            {/* Vitrine de Texturas Reais */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-white/80">
                <span className="flex items-center gap-1.5">
                  <Disc size={14} className="text-[#FF5C00]" />
                  Catálogo Tátil de Alta Definição
                </span>
                <span className="text-[10px] font-mono text-white/40">6 Famílias Táteis</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                {textures.map((t, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl border border-white/8 bg-white/4 hover:border-[#FF5C00]/40 transition-all space-y-1"
                    style={{ background: `linear-gradient(135deg, ${t.bg}, #090A0D)` }}
                  >
                    <div className="text-xs font-bold text-white">{t.name}</div>
                    <div className="text-[10px] text-white/50">{t.tone}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Micro-Features do Editor */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-xl border border-white/8 bg-white/3 space-y-1">
                <Palette size={15} className="text-[#FF5C00]" />
                <div className="text-xs font-bold text-white">Contraste WCAG</div>
                <div className="text-[10px] text-white/50">Auditoria Automática</div>
              </div>

              <div className="p-3 rounded-xl border border-white/8 bg-white/3 space-y-1">
                <Sliders size={15} className="text-[#FF5C00]" />
                <div className="text-xs font-bold text-white">Camadas & Grids</div>
                <div className="text-[10px] text-white/50">Arrasto Fluido 60FPS</div>
              </div>

              <div className="p-3 rounded-xl border border-white/8 bg-white/3 space-y-1">
                <ShieldCheck size={15} className="text-[#FF5C00]" />
                <div className="text-xs font-bold text-white">Exportação 4K</div>
                <div className="text-[10px] text-white/50">PNG & WebP Ultra-HD</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-white/8 bg-black/50 text-xs text-white/70 font-mono flex items-center justify-between">
              <span>✦ Rotação polar & Preview HD em tempo real</span>
              <span className="text-[#FF5C00] font-bold">2 a 4s</span>
            </div>
          </div>
        </div>

        {/* Texto Explicativo */}
        <div className="lg:col-span-5 space-y-6 order-1 lg:order-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/12 bg-white/5 text-xs font-semibold uppercase tracking-wider text-[#FF5C00]">
            <Sparkles size={14} />
            Acabamento Tátil Exclusivo
          </div>

          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            A velocidade da IA com a textura de um estúdio de luxo.
          </h2>

          <p className="text-sm md:text-base text-white/70 font-light leading-relaxed">
            Esqueça fundos chapados e artes sem profundidade. O PostSpark veste seus posts com texturas de estúdio reais e oferece um editor nativo no navegador para você calibrar títulos, fontes e proporções antes de exportar em 4K.
          </p>

          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold text-white shadow-xl transition-all hover:scale-105 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #FF5C00, #E04800)",
              boxShadow: "0 0 24px rgba(255, 92, 0, 0.4)",
            }}
          >
            <span>Experimentar o Workbench Grátis</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
