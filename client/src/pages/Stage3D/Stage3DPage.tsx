import { useState } from "react";
import { Plus, LayoutGrid, RotateCw, Sparkles } from "lucide-react";
import Stage3DNav from "./components/Stage3DNav";
import Stage3DCarousel from "./components/Stage3DCarousel";
import type { Stage3DCardData } from "./components/Stage3DCard";
import StudioAuthModal from "@/pages/StudioHome/components/StudioAuthModal";

// 7 Cards Iniciais Baseados no Universo Visual e Referência
const INITIAL_3D_CARDS: Stage3DCardData[] = [
  {
    id: "card-as",
    usersCount: "1",
    volumeText: "$171",
    avatarBg: "#1C2422",
    avatarEmoji: "🪐",
    title: "ATLAS",
    subtitle: "atlas shrugged",
    description: "Sistemas visuais autônomos para marcas que operam em escala global.",
    bottomStatLabel: "MC",
    bottomStatValue: "$8.50k",
  },
  {
    id: "card-shrug",
    usersCount: "24",
    volumeText: "$8.49k",
    avatarBg: "#2A1810",
    avatarEmoji: "🔥",
    title: "SHRUG",
    subtitle: "ath band",
    description: "Contraste brutalista e tipografia monumental com impacto imediato.",
    bottomStatLabel: "MC",
    bottomStatValue: "$124.5k",
  },
  {
    id: "card-magik",
    usersCount: "1052",
    volumeText: "$520.86k",
    avatarBg: "#1A2538",
    avatarEmoji: "🐟",
    title: "MAGIK",
    subtitle: "Magikarp",
    description: "Rip digital Pokémon packs, hit real Grails. Identidade viva em segundos.",
    bottomStatLabel: "MC",
    bottomStatValue: "$10.38m",
  },
  {
    id: "card-light",
    usersCount: "11818",
    volumeText: "$135.35k",
    avatarBg: "#28292E",
    avatarEmoji: "⚪",
    title: "LIGHT",
    subtitle: "Light",
    description: "Minimalismo puro, respiração generosa e tipografia editorial de luxo.",
    bottomStatLabel: "MC",
    bottomStatValue: "$14.06m",
  },
  {
    id: "card-one",
    usersCount: "4190",
    volumeText: "$98.20k",
    avatarBg: "#1F1A2E",
    avatarEmoji: "⚡",
    title: "CYBER",
    subtitle: "System Grid",
    description: "Scanlines vetoriais, terminal neon e estética de engenharia de ponta.",
    bottomStatLabel: "MC",
    bottomStatValue: "$4.12m",
  },
  {
    id: "card-split",
    usersCount: "820",
    volumeText: "$45.10k",
    avatarBg: "#2D1520",
    avatarEmoji: "⚔️",
    title: "SPLIT",
    subtitle: "Brutal Dual",
    description: "Divisão 50/50 em duas metades com cores opostas e gancho magnético.",
    bottomStatLabel: "MC",
    bottomStatValue: "$1.85m",
  },
  {
    id: "card-glass",
    usersCount: "3400",
    volumeText: "$210.40k",
    avatarBg: "#121A28",
    avatarEmoji: "✨",
    title: "VEIL",
    subtitle: "Glassmorphism",
    description: "Placa flutuante de vidro fosco com iluminação de borda e acabamento premium.",
    bottomStatLabel: "MC",
    bottomStatValue: "$8.90m",
  },
];

export default function Stage3DPage() {
  const [cards] = useState<Stage3DCardData[]>(INITIAL_3D_CARDS);
  const [activeCard, setActiveCard] = useState<Stage3DCardData>(INITIAL_3D_CARDS[2]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <div className="relative h-[100dvh] w-full bg-[#111311] text-white selection:bg-[#FF5C00] selection:text-white flex flex-col justify-between overflow-hidden select-none">
      
      {/* Atmosfera de Pôr do Sol / Gradiente Orgânico de Estúdio (Fiel à Referência) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        {/* Céu Quente Dourado Superior */}
        <div
          className="absolute inset-0 opacity-85"
          style={{
            background:
              "radial-gradient(ellipse 110% 70% at 50% 90%, #A67643 0%, #4D5340 38%, #2D3A34 70%, #151F1C 100%)",
          }}
        />

        {/* Brilho Solar Suave no Centro Inferior */}
        <div className="absolute bottom-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-[#E5A454]/25 blur-[140px] rounded-full" />

        {/* Vinheta Escura nas Bordas para Foco */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40" />
      </div>

      <div className="relative z-10 flex flex-col h-full justify-between">
        {/* 1. Header Navigation */}
        <Stage3DNav
          onCreateClick={() => setIsAuthOpen(true)}
          onExploreClick={() => {}}
        />

        {/* 2. Cockpit Central com Headline e Carrossel 3D */}
        <main className="flex-1 flex flex-col items-center justify-center w-full px-4 text-center relative">
          
          {/* Headline Monumental (Fiel à Referência) */}
          <div className="mb-2 sm:mb-4 z-20">
            <h1
              className="text-3xl sm:text-5xl md:text-6xl font-light tracking-tight text-white/95 leading-tight"
              style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
            >
              Great ideas live here
            </h1>
          </div>

          {/* O Carrossel 3D Cilíndrico com Paralaxe por Scroll */}
          <div className="w-full flex items-center justify-center overflow-visible">
            <Stage3DCarousel
              cards={cards}
              onActiveCardChange={(card) => setActiveCard(card)}
            />
          </div>

          {/* Dica de Interação */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[11px] font-mono text-white/40 flex items-center gap-2 pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5C00] animate-ping" />
            <span>Use o SCROLL do mouse ou arraste para navegar em 3D</span>
          </div>
        </main>

        {/* 3. Rodapé com Botões de Ação Centralizados (Fiel à Referência) */}
        <footer className="relative z-30 pb-7 px-8 flex items-center justify-between w-full max-w-7xl mx-auto">
          {/* Espaço Vazio na Esquerda para Balanço */}
          <div className="w-24 hidden sm:block" />

          {/* Botões de Ação Centralizados em Pílula Escura */}
          <div className="flex items-center gap-3 mx-auto">
            <button
              type="button"
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-black/65 hover:bg-black/85 border border-white/10 hover:border-white/25 text-xs font-semibold text-white backdrop-blur-xl shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Plus size={14} className="text-[#FF5C00]" />
              <span>Create</span>
            </button>

            <button
              type="button"
              onClick={() => {}}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-black/65 hover:bg-black/85 border border-white/10 hover:border-white/25 text-xs font-semibold text-white/80 hover:text-white backdrop-blur-xl shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <LayoutGrid size={14} className="text-white/60" />
              <span>See all ideas</span>
            </button>
          </div>

          {/* Botão de Shuffle / Refresh no Canto Direito */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {}}
              className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 border border-white/10 hover:border-white/25 flex items-center justify-center text-white/70 hover:text-white backdrop-blur-xl transition-all hover:scale-110 active:scale-95 cursor-pointer shadow-lg"
              title="Recarregar ideias"
            >
              <RotateCw size={15} />
            </button>
          </div>
        </footer>
      </div>

      {/* Modal de Autenticação / Início */}
      <StudioAuthModal
        isOpen={isAuthOpen}
        isMobile={false}
        onClose={() => setIsAuthOpen(false)}
        initialPrompt={activeCard.description}
      />
    </div>
  );
}
