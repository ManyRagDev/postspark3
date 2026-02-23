/**
 * SparkBalance — badge sempre visível com o saldo de Sparks do usuário.
 * Posicionado fixo no canto superior direito da tela.
 * Muda de cor conforme o saldo: normal → amarelo → vermelho (<20%).
 */
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

const PLAN_MONTHLY_SPARKS: Record<string, number> = {
  FREE: 150,
  PRO: 1650,    // 150 inicial + 1500 mensal
  AGENCY: 4650, // 150 inicial + 4500 mensal
  FOUNDER: 99999,
  DEV: 99999,
  LITE: 150,
};

function getSparkColor(sparks: number, plan: string) {
  const max = PLAN_MONTHLY_SPARKS[plan] ?? 150;
  const pct = sparks / max;
  if (pct <= 0.1) return "#ef4444"; // vermelho — crítico
  if (pct <= 0.2) return "#f59e0b"; // âmbar — baixo
  return "oklch(0.7 0.22 40)";      // laranja PostSpark — normal
}

export default function SparkBalance() {
  const [, setLocation] = useLocation();
  const { data: profile, isLoading } = trpc.billing.getProfile.useQuery(undefined, {
    refetchInterval: 30_000, // Atualiza a cada 30s
    staleTime: 15_000,
  });

  if (isLoading || !profile) return null;

  const sparks = profile.sparks;
  const plan = profile.plan;
  const color = getSparkColor(sparks, plan);
  const isLow = sparks / (PLAN_MONTHLY_SPARKS[plan] ?? 150) <= 0.2;

  return (
    <AnimatePresence>
      <motion.button
        key="spark-balance"
        initial={{ opacity: 0, y: -8, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.92 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        onClick={() => setLocation("/billing")}
        className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border transition-all hover:scale-105 active:scale-95 cursor-pointer"
        style={{
          backgroundColor: `${color}14`,
          color,
          borderColor: `${color}35`,
          boxShadow: isLow ? `0 0 14px ${color}30` : undefined,
        }}
        title={`${sparks.toLocaleString("pt-BR")} Sparks — clique para gerenciar`}
      >
        {isLow && (
          <motion.span
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="text-sm leading-none"
          >
            ⚡
          </motion.span>
        )}
        <span className="font-bold">{sparks.toLocaleString("pt-BR")}</span>
        <span className="opacity-70">✦</span>
        {plan !== "FREE" && (
          <span
            className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
            style={{ backgroundColor: `${color}20` }}
          >
            {plan}
          </span>
        )}
      </motion.button>
    </AnimatePresence>
  );
}
