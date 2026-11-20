/**
 * UpgradePrompt - modal que aparece quando o usuario nao tem Sparks suficientes.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Crown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PRO_MEMBERSHIP } from "@shared/membership";

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
  const { data: packages, isPending } = trpc.billing.getTopupPackages.useQuery(undefined, {
    enabled: open && tab === "topup",
  });

  const handleTopup = async (packageId: string) => {
    try {
      const { url } = await topupMutation.mutateAsync({ packageId });
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
                    Consulte as opções da sua conta
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
                  {!packages?.length && (
                    <p className="text-sm text-muted-foreground">
                      {isPending ? "Consultando recargas…" : "Nenhuma recarga avulsa disponível agora."}
                    </p>
                  )}
                  {packages?.map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => handleTopup(pkg.id)}
                      disabled={topupMutation.isPending}
                      className="relative flex items-center justify-between p-3.5 rounded-xl border transition-all hover:border-white/20 hover:bg-white/5 text-left"
                      style={{
                        borderColor: "oklch(1 0 0 / 8%)",
                      }}
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">{pkg.name}</p>
                        <p className="text-xs text-muted-foreground">+{pkg.sparks.toLocaleString("pt-BR")} ✦</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold" style={{ color: "oklch(0.7 0.22 40)" }}>
                          {reais.format(pkg.price_brl)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {tab === "plans" && (
                <div className="flex flex-col gap-2">
                  <a
                    href="/pricing"
                    className="relative flex items-center justify-between p-3.5 rounded-xl border transition-all hover:border-white/20 hover:bg-white/5 text-left"
                    style={{ borderColor: "oklch(1 0 0 / 8%)" }}
                  >
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4" style={{ color: "oklch(0.7 0.22 40)" }} />
                      <div>
                        <p className="text-sm font-semibold text-foreground">PRO</p>
                        <p className="text-xs text-muted-foreground">{PRO_MEMBERSHIP.sparksPerMonth.toLocaleString("pt-BR")} ✦ por mês</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: "oklch(0.7 0.22 40)" }}>
                        {reais.format(PRO_MEMBERSHIP.monthly.amount / 100)}/mês
                      </p>
                    </div>
                  </a>

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
