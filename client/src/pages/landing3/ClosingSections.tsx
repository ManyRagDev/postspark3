/**
 * ClosingSections — personas, CTA final e footer da /landing3.
 */

import { motion } from "framer-motion";
import { Megaphone, PenTool, Store } from "lucide-react";
import { Link } from "wouter";
import CtaButton from "./CtaButton";

const personas = [
  {
    Icon: Megaphone,
    role: "Social media",
    line: "Você cuida de 6 marcas. O PostSpark cuida do seu prazo.",
    accent: "oklch(0.7 0.22 40)",
  },
  {
    Icon: PenTool,
    role: "Freelancer",
    line: "Entregue design de agência sem pagar uma agência.",
    accent: "oklch(0.75 0.14 200)",
  },
  {
    Icon: Store,
    role: "Empreendedor",
    line: "Seu negócio precisa de post hoje — não de curso de Canva.",
    accent: "oklch(0.65 0.2 350)",
  },
];

export function Personas() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
      <motion.div
        className="mb-12 text-center"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="mx-auto max-w-xl font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
          Feito para quem não tem uma tarde livre por post.
        </h2>
      </motion.div>

      <div className="grid gap-5 sm:grid-cols-3">
        {personas.map((p, i) => (
          <motion.div
            key={p.role}
            className="rounded-3xl border border-white/[0.07] p-6 transition-colors duration-300 hover:border-white/[0.14]"
            style={{ background: "rgba(19,20,28,0.55)" }}
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.5, delay: i * 0.12 }}
            whileHover={{ y: -4 }}
          >
            <span
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{
                background: `color-mix(in srgb, ${p.accent} 14%, transparent)`,
                color: p.accent,
              }}
            >
              <p.Icon size={20} />
            </span>
            <div className="mt-4 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              {p.role}
            </div>
            <p className="mt-2 font-display text-lg font-medium leading-snug text-foreground">
              {p.line}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="relative mx-auto w-full max-w-4xl px-5 py-28 text-center sm:py-36">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.6 }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 mx-auto h-64 max-w-2xl -translate-y-1/2 rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(ellipse, oklch(0.7 0.22 40 / 14%), transparent 70%)",
          }}
        />
        <h2 className="mx-auto max-w-2xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-5xl">
          Sua próxima ideia já pode sair{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(100deg, oklch(0.72 0.22 40), oklch(0.75 0.14 200))",
            }}
          >
            assim
          </span>
          .
        </h2>
        <p className="mx-auto mt-5 max-w-md text-[15px] text-muted-foreground">
          Grátis para começar. Sem cartão. Login com Google em um clique.
        </p>
        <div className="mt-9 flex justify-center">
          <CtaButton source="final" className="!items-center" />
        </div>
        <Link
          href="/pricing"
          className="mt-7 inline-block text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-accent hover:underline"
        >
          Ver planos e preços →
        </Link>
      </motion.div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] px-5 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 text-xs text-muted-foreground sm:flex-row">
        <span>© {new Date().getFullYear()} PostSpark · ManyLabs</span>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <Link href="/pricing" className="transition-colors hover:text-foreground">
            Planos
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacidade
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Termos
          </Link>
          <Link href="/cookies" className="transition-colors hover:text-foreground">
            Cookies
          </Link>
          <Link href="/" className="transition-colors hover:text-foreground">
            Entrar
          </Link>
        </nav>
      </div>
    </footer>
  );
}
