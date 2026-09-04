import { ArrowRight, Check, Disc, Edit3, Layers, Palette, ShieldCheck, Sliders, Sparkles } from "lucide-react";
import { useState } from "react";

interface WorkbenchShowcaseProps {
  onAction: () => void;
}

interface TextureItem {
  id: string;
  name: string;
  category: string;
  bgHex: string;
  textureCss: string;
  headline: string;
  subtext: string;
  fontFamily: string;
  accent: string;
}

const TEXTURES: TextureItem[] = [
  {
    id: "papel-fabriano",
    name: "Papel Algodão & Granulação",
    category: "Editorial & Moda",
    bgHex: "#14110F",
    textureCss: "radial-gradient(ellipse at center, rgba(229,169,60,0.06) 0%, rgba(18,13,10,0.95) 100%)",
    headline: "Marcas memoráveis constroem silêncio no feed.",
    subtext: "Grão tátil e tipografia nobre que transmitem o peso de uma publicação impressa.",
    fontFamily: "'Playfair Display', Georgia, serif",
    accent: "#E5A93C",
  },
  {
    id: "linho-cru",
    name: "Linho Puro Cru",
    category: "Orgânico & Artesanal",
    bgHex: "#161311",
    textureCss: "radial-gradient(circle at 80% 20%, rgba(255,92,0,0.08) 0%, rgba(20,16,14,0.96) 80%)",
    headline: "A simplicidade é o ápice da sofisticação.",
    subtext: "A textura têxtil cria uma sensação de matéria prima autêntica e orgânica.",
    fontFamily: "'Cinzel', serif",
    accent: "#FF7A3D",
  },
  {
    id: "marmore-negro",
    name: "Mármore Ônix",
    category: "High-Ticket & Luxo",
    bgHex: "#0B0D13",
    textureCss: "radial-gradient(circle at 20% 80%, rgba(56,189,248,0.08) 0%, rgba(9,11,16,0.97) 80%)",
    headline: "Preço é o que você paga. Valor é o que você ancora.",
    subtext: "Superfície mineral polida com profundidade negra e reflexos minerais discretos.",
    fontFamily: "'Space Grotesk', sans-serif",
    accent: "#38BDF8",
  },
  {
    id: "concreto-bruto",
    name: "Concreto Brutalista",
    category: "Arquitetura & Design",
    bgHex: "#1A1A1E",
    textureCss: "radial-gradient(circle at 50% 50%, rgba(255,214,0,0.06) 0%, rgba(22,22,26,0.98) 90%)",
    headline: "NARRATIVAS DURAS CRIAM MERCADOS SOBERANOS.",
    subtext: "Micro-relevo áspero de cimento cru com presença visual inabalável.",
    fontFamily: "'Anton', sans-serif",
    accent: "#FFD600",
  },
];

export default function WorkbenchShowcase({ onAction }: WorkbenchShowcaseProps) {
  const [activeTextureIndex, setActiveTextureIndex] = useState(0);
  const activeTexture = TEXTURES[activeTextureIndex];

  return (
    <section id="estudio" className="py-24 md:py-32 px-4 md:px-8 max-w-7xl mx-auto text-left relative">
      {/* Luz ambiente de estúdio */}
      <div className="absolute top-1/2 -left-40 w-[550px] h-[550px] bg-[#7c3aed]/[0.05] blur-[170px] pointer-events-none rounded-full" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        {/* Palco Interativo de Texturas (7 Colunas) */}
        <div className="lg:col-span-7 order-2 lg:order-1">
          <div className="rounded-[2.2rem] border border-white/[0.09] bg-[oklch(0.06_0.04_280/70%)] p-6 sm:p-8 backdrop-blur-2xl shadow-[0_30px_90px_rgba(0,0,0,0.85)] space-y-6 relative overflow-hidden">
            
            {/* Header do Workbench */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.07] flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <Edit3 size={16} className="text-[#FF5C00]" />
                <span className="text-xs sm:text-sm font-bold text-white tracking-wide">Workbench 2D & Estúdio de Texturas</span>
              </div>
              <span className="text-[10px] text-[#FF5C00] font-mono uppercase tracking-widest bg-[#FF5C00]/10 px-2.5 py-0.5 rounded-full border border-[#FF5C00]/25">
                ✦ 60 FPS · Konva Nativo
              </span>
            </div>

            {/* O Post com Textura Viva em Tempo Real */}
            <div
              className="relative w-full rounded-2xl overflow-hidden border border-white/[0.12] p-8 min-h-[220px] sm:min-h-[260px] flex flex-col justify-between shadow-2xl transition-all duration-500 select-none"
              style={{
                backgroundColor: activeTexture.bgHex,
                backgroundImage: activeTexture.textureCss,
              }}
            >
              <div className="relative z-10 flex items-center justify-between">
                <span
                  className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.2em] backdrop-blur-md"
                  style={{
                    backgroundColor: `${activeTexture.accent}22`,
                    color: activeTexture.accent,
                    border: `1px solid ${activeTexture.accent}44`,
                  }}
                >
                  {activeTexture.name}
                </span>

                <span className="text-[10px] font-mono text-white/40 tracking-wider">
                  PostSpark HD
                </span>
              </div>

              <div className="relative z-10 space-y-2 my-auto py-4">
                <div className="text-[9px] uppercase tracking-[0.3em] font-medium text-white/50">
                  {activeTexture.category}
                </div>
                <h3
                  className="text-xl sm:text-2xl font-bold leading-tight text-white tracking-tight"
                  style={{
                    fontFamily: activeTexture.fontFamily,
                    textShadow: "0 2px 14px rgba(0,0,0,0.9)",
                  }}
                >
                  {activeTexture.headline}
                </h3>
                <p className="text-xs text-white/70 font-light max-w-md">
                  {activeTexture.subtext}
                </p>
              </div>

              <div className="relative z-10 flex items-center justify-between text-[10px] font-mono text-white/40 pt-2 border-t border-white/[0.06]">
                <span>Superfície: {activeTexture.name}</span>
                <span className="text-[#FF5C00]">Toque nas amostras abaixo para testar</span>
              </div>
            </div>

            {/* Seletor de Texturas Táteis Interativo */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-white/80">
                <span className="flex items-center gap-1.5">
                  <Disc size={14} className="text-[#FF5C00]" />
                  Amostras Táteis Disponíveis
                </span>
                <span className="text-[10px] font-mono text-white/40">Clique para alternar textura</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {TEXTURES.map((t, idx) => {
                  const isSelected = idx === activeTextureIndex;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTextureIndex(idx)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? "border-[#FF5C00] bg-white/[0.08] shadow-[0_0_15px_rgba(255,92,0,0.25)]"
                          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20"
                      }`}
                      style={{ background: t.bgHex }}
                    >
                      <div className="text-[11px] font-bold text-white truncate">{t.name}</div>
                      <div className="text-[9px] text-white/50 truncate mt-0.5">{t.category}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pilares do Editor */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-1">
                <Palette size={14} className="text-[#FF5C00]" />
                <div className="text-xs font-bold text-white">Contraste WCAG</div>
                <div className="text-[10px] text-white/50">Auditoria Automática</div>
              </div>

              <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-1">
                <Sliders size={14} className="text-[#FF5C00]" />
                <div className="text-xs font-bold text-white">Prancheta Livre</div>
                <div className="text-[10px] text-white/50">Snap & Camadas 60FPS</div>
              </div>

              <div className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-1">
                <ShieldCheck size={14} className="text-[#FF5C00]" />
                <div className="text-xs font-bold text-white">Exportação 4K</div>
                <div className="text-[10px] text-white/50">PNG & WebP Ultra-HD</div>
              </div>
            </div>
          </div>
        </div>

        {/* Texto Explicativo (5 Colunas) */}
        <div className="lg:col-span-5 space-y-6 order-1 lg:order-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] font-medium tracking-[0.2em] uppercase text-[#FF5C00]">
            <Sparkles size={13} />
            <span>Acabamento Tátil & Controle</span>
          </div>

          <h2
            className="text-2xl sm:text-4xl md:text-[42px] font-bold tracking-[-0.03em] text-white leading-[1.12]"
            style={{ fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)" }}
          >
            A velocidade da IA com a textura física de um ateliê.
          </h2>

          <p className="text-sm md:text-base text-[rgba(240,235,225,0.72)] font-light leading-relaxed">
            Esqueça fundos chapados e designs sem profundidade. O PostSpark veste seus posts com texturas físicas reais e entrega uma prancheta gráfica fluida no navegador para você calibrar títulos, entalhes e proporções antes de exportar em 4K.
          </p>

          <div className="space-y-3 pt-1">
            {[
              "Texturas ricas em alta definição: papel nobre, linho cru, mármore e concreto.",
              "Editor vetorial nativo com manipulação livre e alinhamento magnético inteligente.",
              "Exportação em resolução máxima pronta para publicação no Instagram e LinkedIn.",
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-3 text-xs md:text-sm text-white/80 font-light">
                <div className="w-5 h-5 rounded-full bg-[#FF5C00]/10 border border-[#FF5C00]/25 flex items-center justify-center shrink-0">
                  <Check size={12} className="text-[#FF5C00]" />
                </div>
                <span>{text}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full text-xs md:text-sm font-bold text-white shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer mt-2"
            style={{
              background: "linear-gradient(135deg, #FF6B2B 0%, #FF5C00 50%, #E04800 100%)",
              boxShadow: "0 0 24px rgba(255, 92, 0, 0.4)",
            }}
          >
            <span>Experimentar o Workbench no Estúdio</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
