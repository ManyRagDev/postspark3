/**
 * Pricing — página de planos e preços do PostSpark.
 * Rota: /pricing
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Crown, Building2, Sparkles, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

type BillingCycle = "monthly" | "annual";

const PLANS = [
  {
    id: "free",
    name: "Free",
    icon: Zap,
    price: { monthly: "Gratuito", annual: "Gratuito" },
    priceKey: null,
    sparks: "150 ✦",
    refill: "Sem recarga",
    rollover: false,
    trial: false,
    features: [
      "150 Sparks para começar",
      "Gerador de posts (texto)",
      "3 variações por geração",
      "Export básico",
    ],
    cta: "Começar grátis",
    highlighted: false,
    soon: false,
  },
  {
    id: "pro",
    name: "Pro",
    icon: Crown,
    price: { monthly: "R$ 147", annual: "R$ 117" },
    priceKey: "pro" as const,
    sparks: "+1.500 ✦/mês",
    refill: "+1.500 ✦ por mês",
    rollover: true,
    trial: true,
    features: [
      "Tudo do Free",
      "+1.500 Sparks por mês (acumulam)",
      "Geração de imagem IA",
      "ChameleonProtocol",
      "Carrossel completo",
      "Trial grátis de 7 dias",
    ],
    cta: "Iniciar trial grátis",
    highlighted: true,
    soon: false,
  },
  {
    id: "agency",
    name: "Agency",
    icon: Building2,
    price: { monthly: "R$ 297", annual: "R$ 237" },
    priceKey: "agency" as const,
    sparks: "+4.500 ✦/mês",
    refill: "+4.500 ✦ por mês",
    rollover: true,
    trial: true,
    features: [
      "Tudo do Pro",
      "+4.500 Sparks por mês (acumulam)",
      "Múltiplos perfis de marca",
      "God Mode",
      "Prioridade máxima na fila de IA",
      "Trial grátis de 7 dias",
    ],
    cta: "Em breve",
    highlighted: false,
    soon: true,
  },
];

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
  const { data: priceIds } = trpc.billing.getPriceIds.useQuery();
  const { data: profile } = trpc.billing.getProfile.useQuery();
  const checkoutMutation = trpc.billing.createCheckout.useMutation();
  const trialMutation = trpc.billing.startTrial.useMutation();

  const handleCTA = async (planId: string) => {
    if (planId === "free") {
      setLocation("/");
      return;
    }
    if (planId === "agency") return; // soon

    const plan = PLANS.find((p) => p.id === planId);
    if (!plan || !plan.priceKey || !priceIds) return;

    const priceId =
      cycle === "annual"
        ? priceIds[plan.priceKey]?.annual
        : priceIds[plan.priceKey]?.monthly;

    if (!priceId) {
      toast.error("Configuração de preço não encontrada.");
      return;
    }

    // Se ainda está no Free e o plano tem trial, oferecer trial primeiro
    if (profile?.plan === "FREE" && plan.trial) {
      try {
        const result = await trialMutation.mutateAsync({ plan: planId === "pro" ? "PRO" : "AGENCY" });
        if (result.success) {
          toast.success("Trial de 7 dias iniciado! Aproveite o PostSpark Pro.");
          setLocation("/");
          return;
        }
        if (result.reason === "already_used_email" || result.reason === "already_used_ip") {
          // Trial já usado — vai direto para checkout
        }
      } catch {
        // Trial falhou — vai para checkout
      }
    }

    try {
      const { url } = await checkoutMutation.mutateAsync({ priceId });
      window.location.href = url;
    } catch {
      toast.error("Não foi possível abrir o checkout. Tente novamente.");
    }
  };

  const annualDiscount = 20; // %

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start py-16 px-4"
      style={{ backgroundColor: "oklch(0.04 0.06 280)" }}
    >
      {/* Back */}
      <button
        onClick={() => setLocation("/")}
        className="self-start mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      {/* Header */}
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="h-5 w-5" style={{ color: "oklch(0.7 0.22 40)" }} />
          <span className="text-sm font-medium" style={{ color: "oklch(0.7 0.22 40)" }}>
            Simples e transparente
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-3">
          Escolha seu plano
        </h1>
        <p className="text-muted-foreground max-w-md">
          Sparks não expiram e acumulam mês a mês. Pague pelo que usar.
        </p>
      </motion.div>

      {/* Billing cycle toggle */}
      <motion.div
        className="flex items-center gap-1 p-1 rounded-full mb-10"
        style={{ backgroundColor: "oklch(0.1 0.02 280)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {(["monthly", "annual"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCycle(c)}
            className="px-5 py-2 text-sm font-medium rounded-full transition-all"
            style={{
              backgroundColor: cycle === c ? "oklch(0.7 0.22 40)" : "transparent",
              color: cycle === c ? "#000" : "oklch(0.6 0.02 280)",
            }}
          >
            {c === "monthly" ? "Mensal" : (
              <span className="flex items-center gap-1.5">
                Anual
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: cycle === "annual" ? "#00000020" : "oklch(0.7 0.22 40 / 20%)",
                    color: cycle === "annual" ? "#000" : "oklch(0.7 0.22 40)",
                  }}
                >
                  -{annualDiscount}%
                </span>
              </span>
            )}
          </button>
        ))}
      </motion.div>

      {/* Cards */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-4xl"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isCurrentPlan = profile?.plan === plan.id.toUpperCase();

          return (
            <motion.div
              key={plan.id}
              variants={cardVariants}
              className="relative flex flex-col rounded-2xl border p-6"
              style={{
                backgroundColor: plan.highlighted
                  ? "oklch(0.7 0.22 40 / 6%)"
                  : "oklch(0.08 0.02 280)",
                borderColor: plan.highlighted
                  ? "oklch(0.7 0.22 40 / 45%)"
                  : "oklch(1 0 0 / 8%)",
                boxShadow: plan.highlighted
                  ? "0 0 40px oklch(0.7 0.22 40 / 12%)"
                  : undefined,
              }}
            >
              {plan.highlighted && (
                <div
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold"
                  style={{ backgroundColor: "oklch(0.7 0.22 40)", color: "#000" }}
                >
                  Mais popular
                </div>
              )}

              {/* Plan header */}
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="p-2 rounded-xl"
                  style={{
                    backgroundColor: plan.highlighted
                      ? "oklch(0.7 0.22 40 / 15%)"
                      : "oklch(1 0 0 / 6%)",
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

              {/* Price */}
              <div className="mb-1">
                <span className="text-3xl font-bold text-foreground">
                  {plan.price[cycle]}
                </span>
                {plan.id !== "free" && (
                  <span className="text-sm text-muted-foreground ml-1">
                    {cycle === "annual" ? "/mês · cobrado anualmente" : "/mês"}
                  </span>
                )}
              </div>

              {/* Sparks */}
              <div
                className="flex items-center gap-1.5 text-sm mb-5"
                style={{ color: "oklch(0.7 0.22 40)" }}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>{plan.sparks}</span>
                {plan.rollover && (
                  <span className="text-xs text-muted-foreground ml-1">(acumulam)</span>
                )}
              </div>

              {/* Features */}
              <ul className="flex flex-col gap-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check
                      className="h-3.5 w-3.5 mt-0.5 shrink-0"
                      style={{ color: "oklch(0.7 0.22 40)" }}
                    />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => handleCTA(plan.id)}
                disabled={
                  plan.soon ||
                  isCurrentPlan ||
                  checkoutMutation.isPending ||
                  trialMutation.isPending
                }
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: plan.highlighted ? "oklch(0.7 0.22 40)" : "oklch(1 0 0 / 8%)",
                  color: plan.highlighted ? "#000" : "oklch(0.8 0.01 280)",
                }}
              >
                {isCurrentPlan
                  ? "Plano atual"
                  : plan.soon
                  ? "Em breve"
                  : plan.trial && profile?.plan === "FREE"
                  ? "Iniciar trial grátis"
                  : plan.cta}
              </button>

              {plan.trial && !plan.soon && (
                <p className="text-[11px] text-center text-muted-foreground mt-2">
                  7 dias grátis · sem cartão
                </p>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {/* Topup info */}
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
