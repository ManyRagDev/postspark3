import { ArrowRight, Edit3, Image as ImageIcon, Sliders, Sparkles, Type } from "lucide-react";

interface WorkbenchShowcaseProps {
  onOpenAuth: () => void;
}

export default function WorkbenchShowcase({ onOpenAuth }: WorkbenchShowcaseProps) {
  return (
    <section id="estudio" className="py-20 md:py-28 px-4 md:px-8 max-w-7xl mx-auto text-left border-t border-white/8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Visual do Studio Workbench */}
        <div className="lg:col-span-7 order-2 lg:order-1">
          <div className="rounded-[2rem] border border-white/15 bg-gradient-to-b from-white/10 to-black/90 p-6 md:p-8 backdrop-blur-2xl shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Edit3 size={16} className="text-[oklch(0.78_0.22_48)]" />
                <span className="text-sm font-bold text-white">Workbench Studio</span>
              </div>
              <span className="text-xs text-white/40 font-mono">Editor Pro</span>
            </div>

            {/* Simulação das Ferramentas */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Type, label: "Trocar Tipografia", sub: "Fontes Curatoriais" },
                { icon: ImageIcon, label: "Regenerar Imagem", sub: "IA com Alta Resolução" },
                { icon: Sliders, label: "Ajustar Camadas", sub: "Posições & Grids" },
              ].map((tool, i) => {
                const Icon = tool.icon;
                return (
                  <div key={i} className="p-3.5 rounded-xl border border-white/8 bg-white/4 space-y-1">
                    <Icon size={16} className="text-[oklch(0.78_0.22_48)]" />
                    <div className="text-xs font-bold text-white pt-1">{tool.label}</div>
                    <div className="text-[10px] text-white/50">{tool.sub}</div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 rounded-xl border border-white/8 bg-black/50 text-xs text-white/70 font-mono">
              ⚡ Exportação nativa em PNG 4K Ultra-HD pronta para publicação.
            </div>
          </div>
        </div>

        {/* Texto */}
        <div className="lg:col-span-5 space-y-6 order-1 lg:order-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/12 bg-white/5 text-xs font-semibold uppercase tracking-wider text-[oklch(0.78_0.22_48)]">
            <Sparkles size={14} />
            Controle Fino
          </div>

          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            A velocidade da IA com o controle de um estúdio profissional.
          </h2>

          <p className="text-sm md:text-base text-white/70 font-light leading-relaxed">
            Depois de gerar seus posts, você tem liberdade total para editar textos, alterar proporções, trocar paletas e reordenar slides em tempo real antes de exportar.
          </p>

          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold text-black shadow-xl transition-all hover:scale-105 cursor-pointer"
            style={{
              background: "linear-gradient(135deg, oklch(0.78 0.22 48), oklch(0.65 0.2 28))",
            }}
          >
            <span>Experimentar o Workbench</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
