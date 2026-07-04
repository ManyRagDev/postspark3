import { motion } from "framer-motion";
import { Chrome, Loader2, Sparkles } from "lucide-react";
import { useLanding3Auth } from "./useLanding3Auth";

interface CtaButtonProps {
  source: string;
  className?: string;
}

export default function CtaButton({ source, className = "" }: CtaButtonProps) {
  const { starting, isAuthenticated, start } = useLanding3Auth();

  return (
    <div className={`flex flex-col items-center gap-2.5 sm:items-start ${className}`}>
      <motion.button
        type="button"
        onClick={() => start(source)}
        disabled={starting}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className="group relative inline-flex items-center gap-3 rounded-2xl px-7 py-4 font-display text-base font-semibold text-primary-foreground disabled:opacity-70"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.72 0.22 40), oklch(0.64 0.23 30))",
          boxShadow:
            "0 0 0 1px oklch(0.7 0.22 40 / 45%), 0 12px 40px -8px oklch(0.7 0.22 40 / 45%)",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ boxShadow: "0 0 60px -6px oklch(0.7 0.22 40 / 70%)" }}
        />
        {starting ? (
          <Loader2 size={19} className="animate-spin" />
        ) : isAuthenticated ? (
          <Sparkles size={19} />
        ) : (
          <Chrome size={19} />
        )}
        {isAuthenticated ? "Abrir meu estúdio" : "Criar meu primeiro post grátis"}
      </motion.button>
      {!isAuthenticated && (
        <span className="text-xs tracking-wide text-muted-foreground">
          Google · sem cartão · em 30 segundos
        </span>
      )}
    </div>
  );
}
