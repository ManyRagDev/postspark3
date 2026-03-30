/**
 * Billing - portal de billing do usuario.
 * Mostra plano atual, saldo de Sparks, planos de assinatura e opcoes de top-up.
 * Rota: /billing
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Crown, ShoppingBag, ArrowLeft, Building2, Check, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

const PLAN_LABELS: Record<string, string> = {
  FREE: "START",
  PRO: "PRO",
  AGENCY: "AGENCY",
  FOUNDER: "Founder",
  DEV: "Dev",
  LITE: "Lite",
};

const PLAN_COLORS: Record<string, string> = {
  FREE: "oklch(0.6 0.02 280)",
  PRO: "oklch(0.7 0.22 40)",
  AGENCY: "#a855f7",
  FOUNDER: "#f59e0b",
  DEV: "#22d3ee",
  LITE: "oklch(0.6 0.02 280)",
};

const PLAN_MONTHLY_SPARKS: Record<string, number> = {
  FREE: 150,
  PRO: 2000,
  AGENCY: 4500,
  FOUNDER: 99999,
  DEV: 99999,
  LITE: 150,
};

type BillingCycle = "monthly" | "annual";
type PaidPlan = "PRO" | "AGENCY";

const PLANS = [
  {
    id: "free",
    planCode: null,
    name: "START",
    icon: Zap,
    price: { monthly: "Grátis", annual: "Grátis" },
    sparks: "150 ✦ iniciais",
    trial: false,
    rollover: false,
    equivalence: "3 carrosséis completos ou até 15 posts simples",
    features: [
      "Geração de posts",
      "Geração de legendas",
      "Editor completo",
      "Exportação HD ilimitada",
      "Créditos de entrada para experimentar",
    ],
    footnote: "Os Sparks gratuitos do START não acumulam indefinidamente.",
    cta: "Começar grátis",
    highlighted: false,
    comingSoon: false,
  },
  {
    id: "pro",
    planCode: "PRO" as const,
    name: "PRO",
    icon: Crown,
    price: { monthly: "R$ 147", annual: "R$ 117" },
    sparks: "2000 ✦ por mês",
    trial: true,
    rollover: true,
    equivalence: "Até 50 carrosséis completos ou até 200 posts simples",
    features: [
      "Geração de posts e carrosséis",
      "Geração de legendas",
      "Chameleon Protocol",
      "Geração premium",
      "Editor completo",
      "Melhor custo por geração",
    ],
    footnote: "Sparks de planos pagos acumulam e não expiram.",
    cta: "Iniciar trial grátis",
    highlighted: true,
    comingSoon: false,
  },
  {
    id: "agency",
    planCode: "AGENCY" as const,
    name: "AGENCY",
    icon: Building2,
    price: { monthly: "Em breve", annual: "Em breve" },
    sparks: "Plano orientado por operação",
    trial: false,
    rollover: true,
    equivalence: "Teams, colaboração, multi-brand e operação em escala",
    features: [
      "Workspace multi-brand",
      "Colaboração em equipe",
      "Gerenciamento de clientes",
      "Bibliotecas compartilhadas",
      "Geração em lote",
      "Exportação em massa",
    ],
    footnote: "O Agency será liberado quando as features operacionais estiverem prontas.",
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

export default function Billing() {
  const [, setLocation] = useLocation();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const { data: profile, isLoading: profileLoading } = trpc.billing.getProfile.useQuery();
  const { data: packages, isLoading: pkgLoading } = trpc.billing.getTopupPackages.useQuery();
  const topupMutation = trpc.billing.createTopupCheckout.useMutation();
  const checkoutMutation = trpc.billing.createCheckout.useMutation();
  const trialMutation = trpc.billing.startTrial.useMutation();

  const handleTopup = async (packageId: string) => {
    try {
      const { url } = await topupMutation.mutateAsync({ packageId });
      window.location.href = url;
    } catch {
      toast.error("Não foi possível abrir o checkout. Tente novamente.");
    }
  };

  const handleCheckout = async (plan: PaidPlan) => {
    try {
      const { url } = await checkoutMutation.mutateAsync({ plan, cycle });
      window.location.href = url;
    } catch {
      toast.error("Não foi possível abrir o checkout. Tente novamente.");
    }
  };

  const handleCTA = async (planId: string) => {
    if (planId === "free") {
      setLocation("/");
      return;
    }

    const planItem = PLANS.find((item) => item.id === planId);
    if (!planItem || planItem.comingSoon || !planItem.planCode) return;

    if (planItem.planCode === "PRO" && profile?.plan === "FREE" && planItem.trial) {
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

    await handleCheckout(planItem.planCode);
  };

  const plan = profile?.plan ?? "FREE";
  const sparks = profile?.sparks ?? 0;
  const maxSparks = PLAN_MONTHLY_SPARKS[plan] ?? 150;
  const sparkPct = Math.min(100, (sparks / maxSparks) * 100);
  const planColor = PLAN_COLORS[plan] ?? PLAN_COLORS.FREE;
  const annualDiscount = 20;

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 bg-soul-deep pb-24">
      <button
        onClick={() => setLocation("/")}
        className="self-start mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="w-full max-w-5xl flex flex-col items-center gap-10">
        {/* --- Card de Plano Atual --- */}
        <motion.div
          className="rounded-2xl border p-6 w-full max-w-lg"
          style={{
            backgroundColor: "oklch(0.08 0.02 280)",
            borderColor: "oklch(1 0 0 / 8%)",
          }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Crown className="h-5 w-5" style={{ color: planColor }} />
              <span className="font-semibold text-foreground text-lg">Seu plano atual</span>
            </div>
            <span
              className="text-sm font-bold px-3 py-1 rounded-full"
              style={{
                backgroundColor: `${planColor}18`,
                color: planColor,
                border: `1px solid ${planColor}30`,
              }}
            >
              {PLAN_LABELS[plan] ?? plan}
            </span>
          </div>

          <div className="mb-2">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-4 w-4" style={{ color: planColor }} />
                Sparks disponíveis
              </span>
              <span className="font-bold text-foreground text-lg">
                {profileLoading ? "—" : `${sparks.toLocaleString("pt-BR")} ✦`}
              </span>
            </div>

            <div className="h-2 rounded-full overflow-hidden bg-white/5">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: planColor }}
                initial={{ width: 0 }}
                animate={{ width: `${sparkPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>

            {plan !== "FOUNDER" && plan !== "DEV" && (
              <p className="text-xs text-muted-foreground mt-2">
                {sparks.toLocaleString("pt-BR")} de {maxSparks.toLocaleString("pt-BR")} ✦ de referência mensal
              </p>
            )}
          </div>
        </motion.div>

        {/* --- Seletor Mensal / Anual --- */}
        <div className="w-full flex flex-col items-center mt-4">
          <div className="flex items-center gap-2 justify-center mb-6">
            <Sparkles className="h-5 w-5 text-thermal-orange" />
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Planos de Assinatura
            </h2>
          </div>

          <motion.div
            className="flex items-center gap-1 p-1 rounded-full mb-8 bg-soul-base border border-border"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {(["monthly", "annual"] as const).map((item) => (
              <button
                key={item}
                onClick={() => setCycle(item)}
                className={`px-5 py-2 text-sm font-medium rounded-full transition-all ${cycle === item ? "bg-thermal-orange text-black" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
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

          {/* --- Grid de Planos --- */}
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {PLANS.map((planItem) => {
              const Icon = planItem.icon;
              const isCurrentPlan = profile?.plan === (planItem.planCode ?? "FREE");

              return (
                <motion.div
                  key={planItem.id}
                  variants={cardVariants}
                  className={`relative flex flex-col rounded-2xl border p-6 ${planItem.highlighted ? "bg-thermal-orange/5 border-thermal-orange/45 shadow-[0_0_40px_rgba(255,165,0,0.12)]" : "bg-soul-base border-border"}`}
                >
                  {planItem.highlighted && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold bg-thermal-orange text-black">
                      Mais popular
                    </div>
                  )}

                  <div className="flex items-center gap-2.5 mb-4">
                    <div
                      className="p-2 rounded-xl"
                      style={{
                        backgroundColor: planItem.highlighted ? "oklch(0.7 0.22 40 / 15%)" : "oklch(1 0 0 / 6%)",
                      }}
                    >
                      <Icon
                        className="h-4 w-4"
                        style={{
                          color: planItem.highlighted ? "oklch(0.7 0.22 40)" : "oklch(0.6 0.02 280)",
                        }}
                      />
                    </div>
                    <span className="font-semibold text-foreground">{planItem.name}</span>
                    {isCurrentPlan && (
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground border border-white/5">
                        Atual
                      </span>
                    )}
                  </div>

                  <div className="mb-1">
                    <span className="text-3xl font-bold text-foreground">
                      {planItem.price[cycle]}
                    </span>
                    {planItem.planCode === "PRO" && (
                      <span className="text-sm text-muted-foreground ml-1">
                        {cycle === "annual" ? "/mês" : "/mês"}
                      </span>
                    )}
                  </div>
                  {planItem.planCode === "PRO" && cycle === "annual" && (
                    <p className="text-[11px] text-muted-foreground mb-1 mt-0">Cobrado anualmente</p>
                  )}

                  <div className="flex items-center gap-1.5 text-sm mb-2 mt-2" style={{ color: "oklch(0.7 0.22 40)" }}>
                    <Zap className="h-3.5 w-3.5" />
                    <span>{planItem.sparks}</span>
                  </div>

                  <p className="text-xs text-muted-foreground mb-5 min-h-[32px]">{planItem.equivalence}</p>

                  <ul className="flex flex-col gap-2 mb-4 flex-1">
                    {planItem.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "oklch(0.7 0.22 40)" }} />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="text-[11px] text-muted-foreground mb-6 min-h-[32px]">{planItem.footnote}</p>

                  <button
                    onClick={() => handleCTA(planItem.id)}
                    disabled={planItem.comingSoon || isCurrentPlan || checkoutMutation.isPending || trialMutation.isPending}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: planItem.highlighted ? "oklch(0.7 0.22 40)" : "oklch(1 0 0 / 8%)",
                      color: planItem.highlighted ? "#000" : "oklch(0.8 0.01 280)",
                    }}
                  >
                    {isCurrentPlan ? "Plano atual" : planItem.cta}
                  </button>

                  {planItem.planCode === "PRO" && (
                    <p className="text-[11px] text-center text-muted-foreground mt-2">
                      7 dias grátis · sem cartão
                    </p>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* --- Topup / Pacotes Avulsos --- */}
        <motion.div
          className="w-full max-w-lg mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-center gap-3 mb-6 px-1">
            <div className="h-px bg-border flex-1" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Alternativa pontual
            </span>
            <div className="h-px bg-border flex-1" />
          </div>

          <div className="rounded-2xl border p-5 bg-soul-base border-border">
            <div className="flex items-center gap-2.5 mb-5 opacity-80">
              <ShoppingBag className="h-5 w-5 text-foreground" />
              <div>
                <span className="font-semibold text-foreground block text-sm">Comprar Sparks avulsos</span>
                <span className="text-xs text-muted-foreground">Pacotes de uso único que acumulam com seu saldo.</span>
              </div>
            </div>

            {pkgLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-14 rounded-xl animate-pulse bg-soul-base/50" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(packages ?? []).map((pkg, index) => (
                  <button
                    key={pkg.id}
                    onClick={() => handleTopup(pkg.id)}
                    disabled={topupMutation.isPending}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all hover:border-white/20 hover:bg-white/5 text-left ${index === 1 ? "border-foreground/20 bg-foreground/5" : "border-border"}`}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{pkg.name}</p>
                      <p className="text-xs text-muted-foreground">
                        +{pkg.sparks.toLocaleString("pt-BR")} ✦
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {index === 1 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-foreground/10 text-foreground">
                          Ideal
                        </span>
                      )}
                      <p className="text-sm font-semibold text-foreground">
                        R$ {pkg.price_brl.toFixed(2).replace(".", ",")}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
