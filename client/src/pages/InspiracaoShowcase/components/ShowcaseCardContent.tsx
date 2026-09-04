import type { ShowcaseSlideCard, ShowcaseSlideItem } from "../inspiracaoCardsData";

interface ShowcaseCardContentProps {
  slide: ShowcaseSlideItem;
}

// 1. Editorial de Luxo (editorial-poster)
function EditorialPosterContent({ card }: { card: ShowcaseSlideCard }) {
  return (
    <div className="relative flex flex-col justify-between h-full w-full p-8 select-none overflow-hidden" style={{ background: "#120D0A" }}>
      {/* Background Cinematográfico Editorial */}
      {card.bgImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 ease-out"
            style={{ backgroundImage: `url(${card.bgImage})` }}
          />
          {/* Overlay Escuro com Proteção Gradiente para Leitura Perfeita */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(180deg, rgba(18, 13, 10, 0.6) 0%, rgba(18, 13, 10, 0.35) 30%, rgba(18, 13, 10, 0.94) 80%)",
            }}
          />
        </>
      )}

      {/* Aspas Nobres Douradas */}
      <div
        className="relative z-10 select-none"
        style={{
          fontFamily: "'Playfair Display', serif",
          color: "#E5A93C",
          fontSize: "clamp(54px, 7vh, 72px)",
          lineHeight: 0.6,
          opacity: 0.92,
          textShadow: "0 2px 14px rgba(0,0,0,0.8)",
        }}
      >
        &ldquo;
      </div>

      {/* Headline Itálica Nobre */}
      <div className="relative z-10 my-auto pt-6">
        <h2
          className="italic leading-[1.24] tracking-normal"
          style={{
            fontFamily: "'Playfair Display', serif",
            color: "#F8F4EE",
            fontSize: "clamp(24px, 3vh, 32px)",
            textShadow: "0 3px 18px rgba(0,0,0,0.95)",
          }}
        >
          Marcas de luxo<br />
          não competem por<br />
          preço
        </h2>
        <div className="mt-5 h-[2px] w-10 rounded-full shadow-md" style={{ background: "#E5A93C" }} />
      </div>
    </div>
  );
}

// 2. Minimalismo Brutal (chromatic-block)
function ChromaticBlockContent({ card }: { card: ShowcaseSlideCard }) {
  return (
    <div className="relative flex flex-col justify-between h-full w-full p-8 select-none overflow-hidden" style={{ background: "#D92E1E" }}>
      {/* Background Streetwear com Iluminação Neon Vermelha */}
      {card.bgImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${card.bgImage})` }}
          />
          {/* Overlay Vermelho Duotone com Proteção de Contraste */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(180deg, rgba(217, 46, 30, 0.65) 0%, rgba(184, 36, 21, 0.85) 65%, rgba(15, 6, 5, 0.92) 100%)",
            }}
          />
        </>
      )}

      {/* Topo: Sticker Amarelo ERRO COMUM */}
      <div className="relative z-10 flex justify-end">
        <span
          className="px-2.5 py-1 text-[11px] font-black uppercase text-[#0B0A08] shadow-xl rounded-[2px]"
          style={{
            background: "#FFD600",
            transform: "rotate(-4deg)",
            letterSpacing: "0.14em",
          }}
        >
          ERRO COMUM
        </span>
      </div>

      {/* Headline Monumental */}
      <div className="relative z-10 my-auto">
        <h2
          className="uppercase text-white font-black leading-[1.02] tracking-tight"
          style={{
            fontFamily: "'Anton', sans-serif",
            fontSize: "clamp(32px, 4vh, 42px)",
            textShadow: "0 4px 24px rgba(0,0,0,0.95)",
          }}
        >
          3 SINAIS DE<br />
          MARCA<br />
          AMADORA
        </h2>
      </div>
    </div>
  );
}

// 3. Brutal Split (brutal-split) — Topo Sólido, Base com Imagem Surrealista de Cifrões/Dinheiro
function BrutalSplitContent({ card }: { card: ShowcaseSlideCard }) {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden select-none">
      {/* Metade Superior: Sólido Azul Marinho Austero (Preço Caro) */}
      <div className="h-1/2 p-8 flex flex-col justify-center items-center text-center relative z-10" style={{ background: "#0F172A" }}>
        <h2
          className="text-white font-black uppercase leading-[1.05] tracking-tight m-0"
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(28px, 3.4vh, 36px)",
            textShadow: "0 2px 10px rgba(0,0,0,0.7)",
          }}
        >
          PREÇO<br />
          CARO
        </h2>
      </div>

      {/* Metade Inferior: Imagem 3D com Cifrões Dourados e Notas de Dinheiro Flutuando (Desejo Real) */}
      <div className="h-1/2 relative overflow-hidden flex flex-col justify-center items-center text-center p-8">
        {card.bgImage && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${card.bgImage})` }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(180deg, rgba(225, 29, 72, 0.55) 0%, rgba(159, 18, 57, 0.88) 100%)",
              }}
            />
          </>
        )}
        <h2
          className="relative z-10 text-white font-black uppercase leading-[1.05] tracking-tight m-0"
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(28px, 3.4vh, 36px)",
            textShadow: "0 4px 24px rgba(0,0,0,0.95), 0 0 25px rgba(225, 29, 72, 0.7)",
          }}
        >
          DESEJO<br />
          REAL
        </h2>
      </div>
    </div>
  );
}

// 4. Glass Veil (glass-veil) — Câmera de Cinema com Flare Anamórfico sob Vidro Fosco
function GlassVeilContent({ card }: { card: ShowcaseSlideCard }) {
  return (
    <div
      className="relative flex flex-col justify-center items-center h-full w-full p-8 select-none overflow-hidden"
      style={{ background: "#08071A" }}
    >
      {/* Background Câmera de Cinema e Flare Anamórfico */}
      {card.bgImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${card.bgImage})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(circle at 50% 40%, rgba(30, 27, 75, 0.5) 0%, rgba(8, 7, 26, 0.85) 100%)",
            }}
          />
        </>
      )}

      {/* Cápsula de Vidro Central com Backdrop Blur Real */}
      <div className="relative z-10 w-full p-6 sm:p-7 rounded-2xl border border-white/25 bg-white/10 backdrop-blur-md text-center shadow-[0_20px_50px_rgba(0,0,0,0.7)]">
        <span className="text-[10px] font-mono uppercase bg-white/20 text-white px-3.5 py-1 rounded-full inline-block mb-4 tracking-wider font-semibold border border-white/20 shadow-sm">
          ✨ LUXO FOSCO
        </span>
        <h2
          className="font-extrabold text-white leading-tight tracking-tight m-0"
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: "clamp(21px, 2.6vh, 27px)",
            textShadow: "0 2px 14px rgba(0,0,0,0.8)",
          }}
        >
          Presença<br />
          Cinematográfica
        </h2>
      </div>
    </div>
  );
}

// 5. Citação de Autoridade (quote-authority) — Escultura Clássica de Mármore em Meia-Luz
function QuoteAuthorityContent({ card }: { card: ShowcaseSlideCard }) {
  return (
    <div
      className="relative flex flex-col justify-center items-center h-full w-full p-8 select-none text-center overflow-hidden"
      style={{ background: "#0B1120" }}
    >
      {/* Background Busto de Mármore Clássico */}
      {card.bgImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${card.bgImage})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(180deg, rgba(15, 23, 42, 0.72) 0%, rgba(11, 17, 32, 0.88) 60%, rgba(8, 12, 22, 0.96) 100%)",
            }}
          />
        </>
      )}

      {/* Citação Monumental Centrada */}
      <div className="relative z-10 px-3">
        <h2
          className="leading-[1.48] tracking-[0.05em] text-[#F8FAFC] m-0"
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: "clamp(19px, 2.4vh, 25px)",
            fontWeight: 600,
            textShadow: "0 3px 20px rgba(0,0,0,0.95)",
          }}
        >
          PREÇO É O QUE<br />
          SE PAGA. VALOR<br />
          É O QUE SE LEVA.
        </h2>
        <div className="mt-5 mx-auto h-[2px] w-10 rounded-full shadow-lg" style={{ background: "#38BDF8" }} />
      </div>
    </div>
  );
}

// 6. Data Punch (data-punch) — Multidão Noturna em Long Exposure e Linhas de Metrópole
function DataPunchContent({ card }: { card: ShowcaseSlideCard }) {
  return (
    <div className="relative flex flex-col justify-center h-full w-full p-8 select-none overflow-hidden" style={{ background: "#0D1117" }}>
      {/* Background Multidão em Movimento Noturno */}
      {card.bgImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${card.bgImage})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(180deg, rgba(13, 17, 23, 0.75) 0%, rgba(13, 17, 23, 0.88) 60%, rgba(10, 13, 18, 0.98) 100%)",
            }}
          />
        </>
      )}

      {/* Dado Central de Alto Impacto */}
      <div className="relative z-10 text-left w-full">
        <div
          className="font-extrabold leading-[0.88] tracking-[-0.03em]"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            color: "#58A6FF",
            fontSize: "clamp(64px, 8.8vh, 88px)",
            textShadow: "0 4px 28px rgba(0,0,0,0.95), 0 0 30px rgba(88, 166, 255, 0.35)",
          }}
        >
          87%
        </div>
        <div
          className="mt-3.5 font-medium leading-snug text-white/95"
          style={{
            fontSize: "clamp(15px, 1.9vh, 19px)",
            textShadow: "0 2px 14px rgba(0,0,0,0.9)",
          }}
        >
          abandonam marcas<br />
          sem padrão visual
        </div>
      </div>
    </div>
  );
}

export default function ShowcaseCardContent({ slide }: ShowcaseCardContentProps) {
  const { card } = slide;

  switch (card.id) {
    case "editorial-poster":
      return <EditorialPosterContent card={card} />;
    case "chromatic-block":
      return <ChromaticBlockContent card={card} />;
    case "brutal-split":
      return <BrutalSplitContent card={card} />;
    case "glass-veil":
      return <GlassVeilContent card={card} />;
    case "quote-authority":
      return <QuoteAuthorityContent card={card} />;
    case "data-punch":
      return <DataPunchContent card={card} />;
    default:
      return null;
  }
}
