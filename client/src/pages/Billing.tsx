/**
 * Billing - portal de billing do usuario.
 * Mostra plano atual, saldo de Sparks, planos de assinatura e opcoes de top-up.
 * Rota: /billing
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Crown, ShoppingBag, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import Footer from "@/components/Footer";
import { PAID_PLAN_OFFERS } from "@shared/membership";

const PLAN_LABELS: Record<string, string> = {
  FREE: "Sem plano",
  START: "START",
  SOLO: "Solo",
  PRO_PLUS: "PRO+",
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
  FREE: 1,
  START: 40,
  SOLO: PAID_PLAN_OFFERS.SOLO.sparksPerMonth,
  PRO: PAID_PLAN_OFFERS.PRO.sparksPerMonth,
  PRO_PLUS: PAID_PLAN_OFFERS.PRO_PLUS.sparksPerMonth,
  AGENCY: PAID_PLAN_OFFERS.AGENCY.sparksPerMonth,
  FOUNDER: 99999,
  DEV: 99999,
  LITE: 150,
};

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function Billing() {
  const [, setLocation] = useLocation();
  const { data: profile, isLoading: profileLoading, isFetching: profileRefreshing, refetch:refreshProfile } = trpc.billing.getProfile.useQuery();
  const { data: packages, isLoading: pkgLoading } = trpc.billing.getTopupPackages.useQuery();
  const paidPlan = Boolean(profile?.plan && Object.hasOwn(PAID_PLAN_OFFERS, profile.plan));
  const usage = trpc.billing.usage.useQuery(undefined, { enabled: paidPlan, retry: false });
  const annual = trpc.billing.annualFeatures.useQuery(undefined, { enabled: paidPlan, retry: false });
  const lab = trpc.billing.setIrisExperiment.useMutation();
  const [savingExperiment, setSavingExperiment] = useState(false);
  const billingQueries = trpc.useUtils().billing;
  const [previousPages, setPreviousPages] = useState<string[]>([]);
  const statement = trpc.billing.statement.useQuery({ before: previousPages.at(-1) }, { retry: false });
  const topupMutation = trpc.billing.createTopupCheckout.useMutation();

  const handleTopup = async (packageId: string) => {
    try {
      const { url } = await topupMutation.mutateAsync({ packageId });
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
    <>
    <div className="min-h-screen flex flex-col items-center py-12 px-4 bg-soul-deep pb-24">
      <button
        onClick={() => setLocation("/")}
        className="self-start mb-8 flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="w-full max-w-5xl flex flex-col items-center gap-10">
        <button disabled={profileRefreshing} onClick={()=>{ void refreshProfile(); setPreviousPages([]); void billingQueries.statement.invalidate(); }} className="min-h-11 px-2 text-sm text-muted-foreground">{profileRefreshing?'Atualizando saldo…':'Atualizar saldo'}</button>
        {annual.data?.annual && (
          <section className="w-full rounded-2xl border border-white/10 p-5">
            <h2 className="font-semibold">Benefícios do anual</h2>
            <p className="mt-1 text-sm text-muted-foreground">Acesso antecipado aos lançamentos elegíveis do seu plano.</p>
            {annual.data.labsAvailable && (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={annual.data.optedIn} disabled={savingExperiment} onChange={async event => {
                  setSavingExperiment(true);
                  try {
                    await lab.mutateAsync({ enabled: event.target.checked });
                    await annual.refetch();
                  } catch { toast.error("Não foi possível salvar a preferência."); }
                  finally { setSavingExperiment(false); }
                }} />
                Testar Centro nítido no PostSpark Labs
              </label>
            )}
          </section>
        )}
        {profile?.plan === "AGENCY" && <a className="text-sm underline" href="/agency">Projetos de equipe</a>}
        <a className="text-sm text-muted-foreground underline" href="/start/peca">Abrir minha peça START</a>
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
                {plan === "START"
                  ? "Cota de uma rodada de propostas."
                  : `Cota de referência do ciclo: ${maxSparks.toLocaleString("pt-BR")} ✦`}
              </p>
            )}
            {usage.data && (
              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                <p>Rodadas com propostas entregues neste ciclo: {usage.data.completedRounds.toLocaleString("pt-BR")}</p>
                <p>Próxima cota prevista para {new Date(usage.data.nextRefill).toLocaleDateString("pt-BR")} com a assinatura em dia.</p>
                {sparkPct <= 20 && <p className="text-amber-200">Seu saldo está perto do fim. Você pode continuar editando e exportando suas peças.</p>}
              </div>
            )}
          </div>
        </motion.div>

        <section aria-labelledby="spark-statement" className="w-full max-w-lg rounded-2xl border border-border px-4 py-5 sm:px-6">
          <h2 id="spark-statement" className="text-lg font-semibold">Extrato de Sparks</h2>
          <p className="mt-1 text-sm text-muted-foreground">Créditos e débitos registrados desde a ativação do extrato.</p>
          {statement.isLoading ? <p role="status" className="mt-4">Carregando movimentações…</p>
            : statement.isError ? <button className="min-h-11 underline" onClick={() => void statement.refetch()}>Extrato indisponível. Tentar novamente</button>
            : statement.data?.entries.length ? <ul className="mt-3 divide-y divide-border">
              {statement.data.entries.map(entry => <li key={entry.cursor} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div><strong>{entry.delta > 0 ? "Crédito" : "Débito"}</strong><br /><time className="text-muted-foreground" dateTime={entry.occurred_at}>{new Date(entry.occurred_at).toLocaleString("pt-BR")}</time></div>
                <div className="text-right"><strong>{entry.delta.toLocaleString("pt-BR", { signDisplay: "always" })} ✦</strong><br /><span className="text-muted-foreground">Saldo {entry.balance.toLocaleString("pt-BR")} ✦</span></div>
              </li>)}
            </ul> : <p className="mt-4">Nenhuma movimentação registrada.</p>}
          <div className="flex flex-wrap justify-between gap-2">
            {previousPages.length > 0 && <button className="min-h-11 underline" onClick={() => setPreviousPages(pages => pages.slice(0, -1))}>Mais recentes</button>}
            {statement.data?.next && <button className="min-h-11 underline" onClick={() => setPreviousPages(pages => [...pages, statement.data.next!])}>Mais antigas</button>}
          </div>
        </section>

        <a href="/pricing" className="rounded-xl border border-white/15 px-4 py-3 text-sm">
          Ver planos e gerenciar assinatura
        </a>

        {/* --- Topup / Pacotes Avulsos --- */}
        {profile?.plan !== "START" && <motion.div
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
        </motion.div>}

      </div>
    </div>
    <Footer />
    </>
  );
}
