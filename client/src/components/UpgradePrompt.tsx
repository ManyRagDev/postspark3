/**
 * UpgradePrompt - modal que aparece quando o usuario nao tem Sparks suficientes.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Crown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const PACKAGES = [
  { id: "starter", label: "Starter", sparks: 200, price: "R$ 29,00", popular: false },
  { id: "power", label: "Power", sparks: 700, price: "R$ 79,00", popular: true },
  { id: "mega", label: "Mega", sparks: 1500, price: "R$ 159,00", popular: false },
];

export function useUpgradePrompt() {
  const [open, setOpen] = useState(false);

  return {
    showUpgradePrompt: () => setOpen(true),
    hideUpgradePrompt: () => setOpen(false),
    open,
    setOpen,
  };
}

type UpgradePromptModalProps = {
  open: boolean;
  onClose: () => void;
};

export function UpgradePromptModal({ open, onClose }: UpgradePromptModalProps) {
  const [tab, setTab] = useState<"topup" | "plans">("topup");
  const topupMutation = trpc.billing.createTopupCheckout.useMutation();
  const checkoutMutation = trpc.billing.createCheckout.useMutation();

  const handleTopup = async (packageId: string) => {
    try {
      const { url } = await topupMutation.mutateAsync({ packageId });
      window.location.href = url;
    } catch {
      toast.error("Nao foi possivel abrir o checkout. Tente novamente.");
    }
  };

  const handleUpgrade = async () => {
    try {
      const { url } = await checkoutMutation.mutateAsync({ plan: "PRO", cycle: "monthly" });
      window.location.href = url;
    } catch {
      toast.error("Nao foi possivel abrir o checkout. Tente novamente.");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

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
              onClick={(event) => event.stopPropagation()}
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl" style={{ backgroundColor: "oklch(0.7 0.22 40 / 15%)" }}>
                  <Zap className="h-5 w-5" style={{ color: "oklch(0.7 0.22 40)" }} />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">Sparks esgotados</h2>
                  <p className="text-xs text-muted-foreground">
                    Recarregue para continuar gerando
                  </p>
                </div>
              </div>

              <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ backgroundColor: "oklch(0.12 0.02 280)" }}>
                {(["topup", "plans"] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => setTab(item)}
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg transition-all"
                    style={{
                      backgroundColor: tab === item ? "oklch(0.7 0.22 40)" : "transparent",
                      color: tab === item ? "#000" : "oklch(0.6 0.02 280)",
                    }}
                  >
                    {item === "topup" ? "Comprar Sparks" : "Ver planos"}
                  </button>
                ))}
              </div>

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
                    Pagamento unico · Sparks nao expiram
                  </p>
                </div>
              )}

              {tab === "plans" && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleUpgrade}
                    disabled={checkoutMutation.isPending}
                    className="relative flex items-center justify-between p-3.5 rounded-xl border transition-all hover:border-white/20 hover:bg-white/5 text-left disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ borderColor: "oklch(1 0 0 / 8%)" }}
                  >
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4" style={{ color: "oklch(0.7 0.22 40)" }} />
                      <div>
                        <p className="text-sm font-semibold text-foreground">PRO</p>
                        <p className="text-xs text-muted-foreground">2000 ✦ por mes · melhor custo por geracao</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: "oklch(0.7 0.22 40)" }}>
                        R$ 147/mes
                      </p>
                    </div>
                  </button>

                  <button
                    disabled
                    className="relative flex items-center justify-between p-3.5 rounded-xl border text-left opacity-60 cursor-not-allowed"
                    style={{ borderColor: "oklch(1 0 0 / 8%)" }}
                  >
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4" style={{ color: "#a855f7" }} />
                      <div>
                        <p className="text-sm font-semibold text-foreground">AGENCY</p>
                        <p className="text-xs text-muted-foreground">Times, colaboracao e multi-brand</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground">
                        Em breve
                      </span>
                    </div>
                  </button>

                  <p className="text-[11px] text-center text-muted-foreground mt-1">
                    Trial gratuito de 7 dias · 2000 Sparks no PRO
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
