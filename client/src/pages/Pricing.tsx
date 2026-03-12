/**
 * Pricing - pagina de planos e precos do PostSpark.
 * Rota: /pricing
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Crown, Building2, Sparkles, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

type BillingCycle = "monthly" | "annual";
type PaidPlan = "PRO" | "AGENCY";

const PLANS = [
  {
    id: "free",
    planCode: null,
    name: "START",
    icon: Zap,
    price: { monthly: "Gratis", annual: "Gratis" },
    sparks: "150 ✦ iniciais",
    trial: false,
    rollover: false,
    equivalence: "3 carrosseis completos ou ate 15 posts simples",
    features: [
      "Geracao de posts",
      "Geracao de legendas",
      "Editor completo",
      "Exportacao HD ilimitada",
      "Creditos de entrada para experimentar",
    ],
    footnote: "Os Sparks gratuitos do START nao acumulam indefinidamente.",
    cta: "Comecar gratis",
    highlighted: false,
    comingSoon: false,
  },
  {
    id: "pro",
    planCode: "PRO" as const,
    name: "PRO",
    icon: Crown,
    price: { monthly: "R$ 147", annual: "R$ 117" },
    sparks: "2000 ✦ por mes",
    trial: true,
    rollover: true,
    equivalence: "Ate 50 carrosseis completos ou ate 200 posts simples",
    features: [
      "Geracao de posts e carrosseis",
      "Geracao de legendas",
      "Chameleon Protocol",
      "Geracao premium",
      "Editor completo",
      "Melhor custo por geracao",
    ],
    footnote: "Sparks de planos pagos acumulam e nao expiram.",
    cta: "Iniciar trial gratis",
    highlighted: true,
    comingSoon: false,
  },
  {
    id: "agency",
    planCode: "AGENCY" as const,
    name: "AGENCY",
    icon: Building2,
    price: { monthly: "Em breve", annual: "Em breve" },
    sparks: "Plano orientado por operacao",
    trial: false,
    rollover: true,
    equivalence: "Teams, colaboracao, multi-brand e operacao em escala",
    features: [
      "Workspace multi-brand",
      "Colaboracao em equipe",
      "Gerenciamento de clientes",
      "Bibliotecas compartilhadas",
      "Geracao em lote",
      "Exportacao em massa",
    ],
    footnote: "O Agency sera liberado quando as features operacionais estiverem prontas.",
    cta: "Em breve",
    highlighted: false,
    comingSoon: true,
  },
] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export default function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [, setLocation] = useLocation();
  const { data: profile } = trpc.billing.getProfile.useQuery();
  const checkoutMutation = trpc.billing.createCheckout.useMutation();
  const trialMutation = trpc.billing.startTrial.useMutation();

  const handleCheckout = async (plan: PaidPlan) => {
    try {
      const { url } = await checkoutMutation.mutateAsync({ plan, cycle });
      window.location.href = url;
    } catch {
      toast.error("Nao foi possivel abrir o checkout. Tente novamente.");
    }
  };

  const handleCTA = async (planId: string) => {
    if (planId === "free") {
      setLocation("/");
      return;
    }

    const plan = PLANS.find((item) => item.id === planId);
    if (!plan || plan.comingSoon || !plan.planCode) return;

    if (plan.planCode === "PRO" && profile?.plan === "FREE" && plan.trial) {
      try {
        const result = await trialMutation.mutateAsync({ plan: "PRO" });
        if (result.success) {
          toast.success("Trial de 7 dias iniciado com 2000 Sparks.");
          setLocation("/");
          return;
        }
      } catch {
        // Se o trial falhar, cai para o checkout pago.
      }
    }

    await handleCheckout(plan.planCode);
  };

  const annualDiscount = 20;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-16 px-4 bg-soul-deep">
      <button
        onClick={() => setLocation("/")}
        className="self-start mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-thermal-orange" />
          <span className="text-sm font-medium text-thermal-orange">
            Simples e transparente
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-3">
          Escolha seu plano
        </h1>
        <p className="text-muted-foreground max-w-xl">
          O PostSpark comunica resultado, nao apenas creditos. Nos planos pagos e nos top-ups,
          seus Sparks acumulam e nao expiram.
        </p>
      </motion.div>

      <motion.div
        className="flex items-center gap-1 p-1 rounded-full mb-10 bg-soul-base"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {(["monthly", "annual"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setCycle(item)}
            className={`px-5 py-2 text-sm font-medium rounded-full transition-all ${cycle === item ? "bg-thermal-orange text-black" : "bg-transparent text-muted-foreground"}`}
          >
            {item === "monthly" ? "Mensal" : (
              <span className="flex items-center gap-1.5">
                Anual
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${cycle === "annual" ? "bg-black/20 text-black" : "bg-thermal-orange/20 text-thermal-orange"}`}
                >
                  -{annualDiscount}%
                </span>
              </span>
            )}
          </button>
        ))}
      </motion.div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isCurrentPlan = profile?.plan === (plan.planCode ?? "FREE");

          return (
            <motion.div
              key={plan.id}
              variants={cardVariants}
              className={`relative flex flex-col rounded-2xl border p-6 ${plan.highlighted ? "bg-thermal-orange/5 border-thermal-orange/45 shadow-[0_0_40px_rgba(255,165,0,0.12)]" : "bg-soul-base border-border"}`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold bg-thermal-orange text-black">
                  Mais popular
                </div>
              )}

              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="p-2 rounded-xl"
                  style={{
                    backgroundColor: plan.highlighted ? "oklch(0.7 0.22 40 / 15%)" : "oklch(1 0 0 / 6%)",
                  }}
                >
                  <Icon
                    className="h-4 w-4"
                    style={{
                      color: plan.highlighted ? "oklch(0.7 0.22 40)" : "oklch(0.6 0.02 280)",
                    }}
                  />
                </div>
                <span className="font-semibold text-foreground">{plan.name}</span>
                {isCurrentPlan && (
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground">
                    Atual
                  </span>
                )}
              </div>

              <div className="mb-1">
                <span className="text-3xl font-bold text-foreground">
                  {plan.price[cycle]}
                </span>
                {plan.planCode === "PRO" && (
                  <span className="text-sm text-muted-foreground ml-1">
                    {cycle === "annual" ? "/mes · cobrado anualmente" : "/mes"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-sm mb-2" style={{ color: "oklch(0.7 0.22 40)" }}>
                <Zap className="h-3.5 w-3.5" />
                <span>{plan.sparks}</span>
              </div>

              <p className="text-xs text-muted-foreground mb-5">{plan.equivalence}</p>

              <ul className="flex flex-col gap-2 mb-4 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "oklch(0.7 0.22 40)" }} />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <p className="text-[11px] text-muted-foreground mb-6">{plan.footnote}</p>

              <button
                onClick={() => handleCTA(plan.id)}
                disabled={plan.comingSoon || isCurrentPlan || checkoutMutation.isPending || trialMutation.isPending}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: plan.highlighted ? "oklch(0.7 0.22 40)" : "oklch(1 0 0 / 8%)",
                  color: plan.highlighted ? "#000" : "oklch(0.8 0.01 280)",
                }}
              >
                {isCurrentPlan ? "Plano atual" : plan.cta}
              </button>

              {plan.planCode === "PRO" && (
                <p className="text-[11px] text-center text-muted-foreground mt-2">
                  7 dias gratis · sem cartao
                </p>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      <motion.div
        className="mt-10 text-center max-w-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <p className="text-sm text-muted-foreground">
          Precisa de mais Sparks sem assinar?{" "}
          <button
            className="underline underline-offset-2 hover:text-foreground transition-colors"
            style={{ color: "oklch(0.7 0.22 40)" }}
            onClick={() => setLocation("/billing")}
          >
            Compre um pacote avulso
          </button>
        </p>
      </motion.div>
    </div>
  );
}
