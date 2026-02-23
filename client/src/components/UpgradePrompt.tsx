/**
 * UpgradePrompt — modal que aparece quando o usuário tenta gerar algo
 * mas não tem Sparks suficientes (erro PAYMENT_REQUIRED do tRPC).
 *
 * Uso:
 *   const { showUpgradePrompt, UpgradePromptModal } = useUpgradePrompt();
 *   // no catch do mutation:
 *   if (err?.data?.httpStatus === 402) showUpgradePrompt();
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Crown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const PACKAGES = [
  { id: "starter", label: "Starter", sparks: 200, price: "R$ 19,90", popular: false },
  { id: "power",   label: "Power",   sparks: 600, price: "R$ 49,90", popular: true },
  { id: "mega",    label: "Mega",    sparks: 1500, price: "R$ 109,90", popular: false },
];

export function useUpgradePrompt() {
  const [open, setOpen] = useState(false);

  const showUpgradePrompt = () => setOpen(true);
  const hideUpgradePrompt = () => setOpen(false);

  return { showUpgradePrompt, hideUpgradePrompt, open, setOpen };
}

type UpgradePromptModalProps = {
  open: boolean;
  onClose: () => void;
};

export function UpgradePromptModal({ open, onClose }: UpgradePromptModalProps) {
  const [tab, setTab] = useState<"topup" | "plans">("topup");
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

  const handleUpgrade = async (priceId: string) => {
    try {
      const { url } = await checkoutMutation.mutateAsync({ priceId });
      window.location.href = url;
    } catch {
      toast.error("Não foi possível abrir o checkout. Tente novamente.");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-md rounded-2xl border p-6 shadow-2xl"
              style={{
                backgroundColor: "oklch(0.08 0.025 280)",
                borderColor: "oklch(1 0 0 / 10%)",
              }}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="p-2.5 rounded-xl"
                  style={{ backgroundColor: "oklch(0.7 0.22 40 / 15%)" }}
                >
                  <Zap className="h-5 w-5" style={{ color: "oklch(0.7 0.22 40)" }} />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">Sparks esgotados</h2>
                  <p className="text-xs text-muted-foreground">
                    Recarregue para continuar gerando
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ backgroundColor: "oklch(0.12 0.02 280)" }}>
                {(["topup", "plans"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg transition-all"
                    style={{
                      backgroundColor: tab === t ? "oklch(0.7 0.22 40)" : "transparent",
                      color: tab === t ? "#000" : "oklch(0.6 0.02 280)",
                    }}
                  >
                    {t === "topup" ? "Comprar Sparks" : "Ver Planos"}
                  </button>
                ))}
              </div>

              {/* Top-up packages */}
              {tab === "topup" && (
                <div className="flex flex-col gap-2">
                  {PACKAGES.map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => handleTopup(pkg.id)}
                      disabled={topupMutation.isPending}
                      className="relative flex items-center justify-between p-3.5 rounded-xl border transition-all hover:border-white/20 hover:bg-white/5 text-left"
                      style={{
                        borderColor: pkg.popular ? "oklch(0.7 0.22 40 / 40%)" : "oklch(1 0 0 / 8%)",
                        backgroundColor: pkg.popular ? "oklch(0.7 0.22 40 / 5%)" : undefined,
                      }}
                    >
                      {pkg.popular && (
                        <span
                          className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ backgroundColor: "oklch(0.7 0.22 40)", color: "#000" }}
                        >
                          Popular
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-foreground">{pkg.label} Pack</p>
                        <p className="text-xs text-muted-foreground">+{pkg.sparks.toLocaleString("pt-BR")} ✦</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold" style={{ color: "oklch(0.7 0.22 40)" }}>
                          {pkg.price}
                        </p>
                      </div>
                    </button>
                  ))}
                  <p className="text-[11px] text-center text-muted-foreground mt-1">
                    Pagamento único • Sparks não expiram
                  </p>
                </div>
              )}

              {/* Plans */}
              {tab === "plans" && (
                <div className="flex flex-col gap-2">
                  {[
                    {
                      key: "pro_monthly",
                      label: "Pro",
                      sparks: "+1.500 ✦/mês",
                      price: "R$ 147/mês",
                      priceId: priceIds?.pro?.monthly ?? "",
                    },
                    {
                      key: "agency_monthly",
                      label: "Agency",
                      sparks: "+4.500 ✦/mês",
                      price: "R$ 297/mês",
                      priceId: priceIds?.agency?.monthly ?? "",
                      soon: true,
                    },
                  ].map((plan) => (
                    <button
                      key={plan.key}
                      onClick={() => !plan.soon && plan.priceId && handleUpgrade(plan.priceId)}
                      disabled={checkoutMutation.isPending || plan.soon || !plan.priceId}
                      className="relative flex items-center justify-between p-3.5 rounded-xl border transition-all hover:border-white/20 hover:bg-white/5 text-left disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ borderColor: "oklch(1 0 0 / 8%)" }}
                    >
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4" style={{ color: "oklch(0.7 0.22 40)" }} />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{plan.label}</p>
                          <p className="text-xs text-muted-foreground">{plan.sparks} com rollover</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {plan.soon ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground">
                            Em breve
                          </span>
                        ) : (
                          <p className="text-sm font-bold" style={{ color: "oklch(0.7 0.22 40)" }}>
                            {plan.price}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                  <p className="text-[11px] text-center text-muted-foreground mt-1">
                    Trial gratuito de 7 dias • Sem cartão para começar
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
