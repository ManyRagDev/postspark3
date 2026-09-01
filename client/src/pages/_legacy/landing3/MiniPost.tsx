/**
 * MiniPost — renderizador art-dirigido dos posts da demo.
 *
 * Escala com o container (unidades cqw), então funciona do leque do hero
 * ao antes/depois da prova. O acento visual vive na CSS var `--acc`, que o
 * Framer Motion anima durante a fase de "edição fake" do palco.
 */

import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import type { DemoPost } from "./demoScenarios";

interface MiniPostProps {
  post: DemoPost;
  /** anima o acento entre a paleta original e editAccent (fase de edição) */
  editing?: boolean;
  className?: string;
}

function HandleRow({ post }: { post: DemoPost }) {
  return (
    <div
      className="flex items-center gap-[3.2cqw]"
      style={{ color: post.palette.text, opacity: 0.82 }}
    >
      <span
        className="rounded-full"
        style={{
          width: "7cqw",
          height: "7cqw",
          background: `linear-gradient(135deg, var(--acc), ${post.palette.surface})`,
          boxShadow: "0 0 0 1.5px color-mix(in srgb, var(--acc) 55%, transparent)",
        }}
      />
      <span style={{ fontSize: "3.6cqw", letterSpacing: "0.04em" }}>
        {post.handle}
      </span>
      <span className="ml-auto" style={{ fontSize: "4cqw", opacity: 0.5 }}>
        •••
      </span>
    </div>
  );
}

function CarouselDots({ post }: { post: DemoPost }) {
  if (!post.carousel) return null;
  return (
    <div className="absolute bottom-[3cqw] left-1/2 flex -translate-x-1/2 gap-[1.8cqw]">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className="rounded-full"
          style={{
            width: "1.9cqw",
            height: "1.9cqw",
            background: i === 0 ? "var(--acc)" : post.palette.text,
            opacity: i === 0 ? 1 : 0.28,
          }}
        />
      ))}
    </div>
  );
}

export default function MiniPost({ post, editing = false, className = "" }: MiniPostProps) {
  const { palette } = post;
  const upper = post.uppercase ? ("uppercase" as const) : ("none" as const);

  const rootStyle = {
    "--acc": palette.accent,
    containerType: "inline-size",
    background: palette.bg,
    color: palette.text,
    aspectRatio: "4 / 5",
  } as CSSProperties;

  return (
    <motion.div
      className={`relative w-full select-none overflow-hidden rounded-[4.5cqw] ${className}`}
      style={rootStyle}
      animate={
        editing
          ? ({ "--acc": [palette.accent, post.editAccent, palette.accent] } as never)
          : ({ "--acc": palette.accent } as never)
      }
      transition={editing ? { duration: 1.7, ease: "easeInOut" } : { duration: 0.4 }}
    >
      {/* mesh de luz da paleta — nenhum asset externo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 85% -10%, color-mix(in srgb, var(--acc) 22%, transparent) 0%, transparent 55%),
            radial-gradient(100% 80% at 0% 110%, ${palette.surface} 0%, transparent 60%)`,
        }}
      />

      {post.layout === "editorial" && (
        <div className="relative flex h-full flex-col p-[6cqw]">
          <HandleRow post={post} />
          <div className="mt-auto">
            <div
              style={{
                fontSize: "3.3cqw",
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "var(--acc)",
              }}
            >
              {post.kicker}
            </div>
            <h3
              className="mt-[3cqw] leading-[1.12]"
              style={{
                fontFamily: post.fontFamily,
                fontSize: "8.6cqw",
                textTransform: upper,
              }}
            >
              {post.headline}
            </h3>
            <div
              className="mt-[4cqw] h-[0.8cqw] w-[16cqw] rounded-full"
              style={{ background: "var(--acc)" }}
            />
            {post.sub && (
              <p className="mt-[3.4cqw]" style={{ fontSize: "3.9cqw", opacity: 0.66 }}>
                {post.sub}
              </p>
            )}
          </div>
          <CarouselDots post={post} />
        </div>
      )}

      {post.layout === "split" && (
        <div className="relative flex h-full flex-col">
          <div className="flex flex-1 flex-col p-[6cqw]">
            <HandleRow post={post} />
            <div
              className="mt-[7cqw]"
              style={{
                fontSize: "3.3cqw",
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              {post.kicker}
            </div>
            <h3
              className="mt-[2.6cqw] leading-[1.04]"
              style={{
                fontFamily: post.fontFamily,
                fontSize: "10.2cqw",
                textTransform: upper,
              }}
            >
              {post.headline}
            </h3>
          </div>
          <motion.div
            className="flex items-center justify-between px-[6cqw]"
            style={{
              height: "16cqw",
              background: "var(--acc)",
              color: palette.bg,
            }}
          >
            <span
              style={{
                fontFamily: post.fontFamily,
                fontSize: "4.2cqw",
                fontWeight: 700,
                textTransform: upper,
                letterSpacing: "0.06em",
              }}
            >
              {post.cta}
            </span>
            <span style={{ fontSize: "5cqw", fontWeight: 700 }}>→</span>
          </motion.div>
          <CarouselDots post={post} />
        </div>
      )}

      {post.layout === "poster" && (
        <div className="relative flex h-full flex-col p-[6cqw]">
          <HandleRow post={post} />
          <div className="my-auto py-[4cqw] text-center">
            <div
              className="mx-auto h-[1cqw] w-[12cqw] rounded-full"
              style={{ background: "var(--acc)" }}
            />
            <div
              className="mt-[4cqw]"
              style={{
                fontSize: "3.2cqw",
                letterSpacing: "0.34em",
                textTransform: "uppercase",
                opacity: 0.55,
              }}
            >
              {post.kicker}
            </div>
            <h3
              className="mx-auto mt-[3cqw] max-w-[86%] leading-[1.06]"
              style={{
                fontFamily: post.fontFamily,
                fontSize: "9.4cqw",
                textTransform: upper,
              }}
            >
              {post.headline}
            </h3>
            {post.sub && (
              <p className="mx-auto mt-[4cqw] max-w-[80%]" style={{ fontSize: "3.8cqw", opacity: 0.62 }}>
                {post.sub}
              </p>
            )}
          </div>
          <div className="flex justify-center">
            <span
              className="rounded-full border px-[4.6cqw] py-[1.8cqw]"
              style={{
                borderColor: "var(--acc)",
                color: "var(--acc)",
                fontSize: "3.4cqw",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Saiba mais
            </span>
          </div>
          <CarouselDots post={post} />
        </div>
      )}
    </motion.div>
  );
}
