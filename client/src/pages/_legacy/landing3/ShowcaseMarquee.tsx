/**
 * ShowcaseMarquee — vitrine Midnight em dois trilhos opostos.
 * Reusa as 12 fixtures curadas de showcaseCards; marquee em CSS puro
 * (mais barato que Framer Motion para loop infinito).
 */

import { motion } from "framer-motion";
import { showcaseCards, type ShowcaseCard } from "@/lib/showcaseCards";

function optimizedUrl(url: string) {
  if (!url.includes("images.unsplash.com")) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("auto", "format");
    parsed.searchParams.set("fit", "crop");
    parsed.searchParams.set("w", "360");
    parsed.searchParams.set("q", "65");
    parsed.searchParams.set("fm", "webp");
    return parsed.toString();
  } catch {
    return url;
  }
}

function Tile({ card }: { card: ShowcaseCard }) {
  return (
    <div
      className="relative w-40 shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] sm:w-44"
      style={{ aspectRatio: "4 / 5", background: card.palette.background }}
    >
      {card.backgroundImageUrl && (
        <img
          src={optimizedUrl(card.backgroundImageUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to top, ${card.palette.background}F2 15%, ${card.palette.background}66 55%, transparent 100%)`,
        }}
      />
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <div
          className="text-[8px] uppercase tracking-[0.26em]"
          style={{ color: card.palette.accent }}
        >
          {card.category}
        </div>
        <div
          className="mt-1.5 text-[12px] leading-snug"
          style={{
            color: card.palette.text,
            fontFamily: card.fontFamily,
            textTransform: card.titleCase === "upper" ? "uppercase" : "none",
          }}
        >
          {card.headline}
        </div>
        <div
          className="mt-2 h-0.5 w-8 rounded-full"
          style={{ background: card.palette.accent }}
        />
      </div>
    </div>
  );
}

function Row({ cards, reverse, duration }: { cards: ShowcaseCard[]; reverse?: boolean; duration: number }) {
  const doubled = [...cards, ...cards];
  return (
    <div
      className="ls3-marquee-mask overflow-hidden"
      style={{
        maskImage:
          "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
      }}
    >
      <div
        className="ls3-marquee-row flex w-max gap-4 py-1"
        style={{
          animation: `ls3-marquee ${duration}s linear infinite${reverse ? " reverse" : ""}`,
        }}
      >
        {doubled.map((card, i) => (
          <Tile key={`${card.id}-${i}`} card={card} />
        ))}
      </div>
    </div>
  );
}

export default function ShowcaseMarquee() {
  const rowA = showcaseCards.slice(0, 6);
  const rowB = showcaseCards.slice(6);

  return (
    <section className="relative w-full py-24 sm:py-28">
      <motion.div
        className="mb-12 px-5 text-center"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-[11px] uppercase tracking-[0.34em] text-primary">
          Vitrine Midnight
        </div>
        <h2 className="mx-auto mt-4 max-w-lg font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
          Feito no PostSpark — em todos os nichos.
        </h2>
      </motion.div>

      <div className="flex flex-col gap-4">
        <Row cards={rowA} duration={46} />
        <Row cards={rowB} reverse duration={58} />
      </div>

      <style>{`
        @keyframes ls3-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .ls3-marquee-mask:hover .ls3-marquee-row {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .ls3-marquee-row { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
