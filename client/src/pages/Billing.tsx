/**
 * Billing — portal de billing do usuário.
 * Mostra plano atual, saldo de Sparks, histórico e opções de top-up.
 * Rota: /billing
 */
import { motion } from "framer-motion";
import { Zap, Crown, ShoppingBag, ArrowLeft, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  PRO: "Pro",
  AGENCY: "Agency",
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
  PRO: 1650,
  AGENCY: 4650,
  FOUNDER: 99999,
  DEV: 99999,
  LITE: 150,
};

export default function Billing() {
  const [, setLocation] = useLocation();
  const { data: profile, isLoading: profileLoading } = trpc.billing.getProfile.useQuery();
  const { data: packages, isLoading: pkgLoading } = trpc.billing.getTopupPackages.useQuery();
  const topupMutation = trpc.billing.createTopupCheckout.useMutation();
  const checkoutMutation = trpc.billing.createCheckout.useMutation();
  const { data: priceIds } = trpc.billing.getPriceIds.useQuery();

  const handleTopup = async (packageId: string) => {
    try {
      const { url } = await topupMutation.mutateAsync({ packageId });
      window.location.href = url;
    } catch {
      toast.error("Não foi possível abrir o checkout. Tente novamente.");
    }
  };

  const handleUpgrade = async () => {
    if (!priceIds?.pro?.monthly) {
      toast.error("Configuração de preço não encontrada.");
      return;
    }
    try {
      const { url } = await checkoutMutation.mutateAsync({ priceId: priceIds.pro.monthly });
      window.location.href = url;
    } catch {
      toast.error("Não foi possível abrir o checkout. Tente novamente.");
    }
  };

  const plan = profile?.plan ?? "FREE";
  const sparks = profile?.sparks ?? 0;
  const maxSparks = PLAN_MONTHLY_SPARKS[plan] ?? 150;
  const sparkPct = Math.min(100, (sparks / maxSparks) * 100);
  const planColor = PLAN_COLORS[plan] ?? PLAN_COLORS.FREE;

  return (
    <div
      className="min-h-screen flex flex-col items-center py-12 px-4"
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

      <div className="w-full max-w-lg flex flex-col gap-5">
        {/* Plano atual */}
        <motion.div
          className="rounded-2xl border p-5"
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
              <Crown className="h-4 w-4" style={{ color: planColor }} />
              <span className="font-semibold text-foreground">Plano atual</span>
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

          {/* Spark balance */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5 text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" style={{ color: planColor }} />
                Sparks disponíveis
              </span>
              <span className="font-bold text-foreground">
                {profileLoading ? "—" : `${sparks.toLocaleString("pt-BR")} ✦`}
              </span>
            </div>
            {/* Progress bar */}
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: "oklch(1 0 0 / 8%)" }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: planColor }}
                initial={{ width: 0 }}
                animate={{ width: `${sparkPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
            {plan !== "FOUNDER" && plan !== "DEV" && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {sparks.toLocaleString("pt-BR")} de {maxSparks.toLocaleString("pt-BR")} ✦ acumulados
              </p>
            )}
          </div>

          {/* Upgrade CTA se FREE */}
          {plan === "FREE" && (
            <button
              onClick={handleUpgrade}
              disabled={checkoutMutation.isPending}
              className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ backgroundColor: "oklch(0.7 0.22 40)", color: "#000" }}
            >
              <Crown className="h-4 w-4" />
              Fazer upgrade para Pro
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {plan === "FREE" && (
            <p className="text-[11px] text-center text-muted-foreground mt-2">
              7 dias grátis · sem cartão necessário
            </p>
          )}
        </motion.div>

        {/* Pacotes de top-up */}
        <motion.div
          className="rounded-2xl border p-5"
          style={{
            backgroundColor: "oklch(0.08 0.02 280)",
            borderColor: "oklch(1 0 0 / 8%)",
          }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="flex items-center gap-2.5 mb-4">
            <ShoppingBag className="h-4 w-4" style={{ color: "oklch(0.7 0.22 40)" }} />
            <span className="font-semibold text-foreground">Comprar Sparks</span>
          </div>

          {pkgLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded-xl animate-pulse"
                  style={{ backgroundColor: "oklch(0.12 0.02 280)" }}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {(packages ?? []).map((pkg, i) => (
                <button
                  key={pkg.id}
                  onClick={() => handleTopup(pkg.id)}
                  disabled={topupMutation.isPending}
                  className="flex items-center justify-between p-3.5 rounded-xl border transition-all hover:border-white/20 hover:bg-white/5 text-left"
                  style={{
                    borderColor: i === 1 ? "oklch(0.7 0.22 40 / 35%)" : "oklch(1 0 0 / 8%)",
                    backgroundColor: i === 1 ? "oklch(0.7 0.22 40 / 4%)" : undefined,
                  }}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{pkg.name}</p>
                    <p className="text-xs text-muted-foreground">
                      +{pkg.sparks.toLocaleString("pt-BR")} ✦
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {i === 1 && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: "oklch(0.7 0.22 40)", color: "#000" }}
                      >
                        Popular
                      </span>
                    )}
                    <p
                      className="text-sm font-bold"
                      style={{ color: "oklch(0.7 0.22 40)" }}
                    >
                      R$ {pkg.price_brl.toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                </button>
              ))}
              <p className="text-[11px] text-center text-muted-foreground mt-1">
                Pagamento único • Sparks não expiram • Acumulam com o saldo atual
              </p>
            </div>
          )}
        </motion.div>

        {/* Link para página de planos */}
        <motion.button
          className="text-sm text-center text-muted-foreground hover:text-foreground transition-colors py-2"
          onClick={() => setLocation("/pricing")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Ver todos os planos →
        </motion.button>
      </div>
    </div>
  );
}
