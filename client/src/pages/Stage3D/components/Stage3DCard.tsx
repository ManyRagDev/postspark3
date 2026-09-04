import { Globe, Users, Copy } from "lucide-react";

export interface Stage3DCardData {
  id: string;
  badgeLeft?: string;
  usersCount?: string;
  volumeText?: string;
  avatarUrl?: string;
  avatarEmoji?: string;
  avatarBg?: string;
  title: string;
  subtitle: string;
  description: string;
  bottomStatLabel?: string;
  bottomStatValue?: string;
  accentColor?: string;
}

interface Stage3DCardProps {
  card: Stage3DCardData;
  isCenter: boolean;
  onClick?: () => void;
}

export default function Stage3DCard({ card, isCenter, onClick }: Stage3DCardProps) {
  return (
    <div
      onClick={onClick}
      className="relative w-[360px] h-[400px] sm:w-[410px] sm:h-[450px] md:w-[430px] md:h-[465px] rounded-[36px] p-7 sm:p-8 flex flex-col justify-between select-none cursor-pointer transition-all duration-300 border overflow-hidden"
      style={{
        backgroundColor: "#181716",
        borderColor: "rgba(255, 255, 255, 0.08)",
        boxShadow: isCenter
          ? "0 35px 90px -20px rgba(0, 0, 0, 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.14), inset 0 -1px 0 rgba(0, 0, 0, 0.4)"
          : "0 20px 60px -15px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Gradiente Interno de Iluminação de Superfície */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-black/30 pointer-events-none" />

      {/* Top Bar do Card: Ícones e Métricas */}
      <div className="relative z-10 flex items-center justify-between text-xs text-white/50 font-mono">
        <div className="flex items-center gap-2">
          <Globe size={15} className="text-white/40" />
          <span className="text-white/40 font-sans text-sm font-light">✕</span>
        </div>

        <div className="flex items-center gap-3 text-[11px] sm:text-xs">
          {card.usersCount && (
            <span className="flex items-center gap-1.5 text-white/60">
              <Users size={13} className="text-white/40" />
              <span>{card.usersCount}</span>
            </span>
          )}
          {card.volumeText && (
            <span className="text-white/40">
              Vol <strong className="text-white/90 font-medium">{card.volumeText}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Centro: Avatar / Arte + Título + Pitch */}
      <div className="relative z-10 flex flex-col items-center text-center my-auto space-y-3.5">
        {/* Avatar Circular com Sombra de Profundidade */}
        <div
          className="w-20 h-20 sm:w-22 sm:h-22 rounded-full flex items-center justify-center text-3xl sm:text-4xl shadow-2xl border border-white/10 overflow-hidden relative shrink-0"
          style={{ backgroundColor: card.avatarBg || "#26262B" }}
        >
          {card.avatarUrl ? (
            <img src={card.avatarUrl} alt={card.title} className="w-full h-full object-cover" />
          ) : (
            <span>{card.avatarEmoji || "✨"}</span>
          )}
        </div>

        {/* Título & Subtítulo */}
        <div className="space-y-0.5">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans uppercase">
            {card.title}
          </h2>
          <div className="flex items-center justify-center gap-1.5 text-xs text-white/40 font-mono">
            <span>{card.subtitle}</span>
            <Copy size={11} className="text-white/30 hover:text-white/70 transition-colors" />
          </div>
        </div>

        {/* Descrição / Pitch */}
        <p className="text-xs sm:text-sm text-white/65 font-light leading-relaxed max-w-[300px]">
          {card.description}
        </p>
      </div>

      {/* Rodapé do Card: Estatística Inferior Direita */}
      <div className="relative z-10 flex items-center justify-end text-xs font-mono text-white/40">
        <div className="flex items-center gap-1.5">
          <span>{card.bottomStatLabel || "MC"}</span>
          <span className="text-white/95 font-bold font-sans text-sm sm:text-base">
            {card.bottomStatValue || "$10.38m"}
          </span>
        </div>
      </div>
    </div>
  );
}
