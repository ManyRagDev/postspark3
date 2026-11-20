/**
 * Pricing - pagina de planos e precos do PostSpark.
 * Rota: /pricing
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Building2, Check, Crown, Sparkles, UserRound, Zap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { enrollStartPilot, openProPortal, readEnrollmentOffers, readProMembership, startProCheckout } from "@/lib/membershipApi";
import { resyncSupabaseSession } from "@/lib/authBridge";
import StudioAuthModal from "@/pages/StudioHome/components/StudioAuthModal";
import { PAID_PLAN_OFFERS, PRO_ANNUAL_DISCOUNT, type MembershipCycle, type PaidStudioPlan } from "@shared/membership";
import { toast } from "sonner";
import { useLocation } from "wouter";
import Footer from "@/components/Footer";

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const PAID_PLANS = ["SOLO", "PRO", "PRO_PLUS", "AGENCY"] as const;
const extraProPlusSparks = PAID_PLAN_OFFERS.PRO_PLUS.sparksPerMonth - PAID_PLAN_OFFERS.PRO.sparksPerMonth;
const PLAN_DETAILS = {
  SOLO: {
    icon: UserRound,
    description: "Edite na prancheta e reaproveite seu trabalho.",
    features: ["CanvasLab para editar texto, fotos, camadas e slides", "Salve, reabra e duplique projetos", "Uma marca reutilizável", "Gere imagens com Sparks"],
  },
  PRO: {
    icon: Crown,
    description: "Use referências e controle o acabamento.",
    features: [
      "Tudo do Solo",
      "Editor Avançado de imagem e texto",
      "Replicar Design e extrair conteúdo ou marca de URLs",
      "Fundo Contínuo, cópia seletiva entre slides e exportação em 4K",
      "Projetos avulsos e várias marcas",
    ],
  },
  PRO_PLUS: {
    icon: Sparkles,
    description: "Produza por mais tempo com as ferramentas do PRO.",
    features: ["Todos os recursos do PRO", `${extraProPlusSparks.toLocaleString("pt-BR")} Sparks a mais por mês que o PRO`],
  },
  AGENCY: {
    icon: Building2,
    description: "Para produzir, revisar e aprovar peças em equipe.",
    features: ["Ferramentas profissionais do PRO", "Projetos compartilhados", "Papéis de edição e revisão", "Fluxo de aprovação"],
  },
} as const;

const comparison = [
  ["Criação de posts, carrosséis e legendas", "Uma peça final", "Incluído", "Incluído", "Incluído", "Incluído"],
  ["Acervo de designs na criação", "Incluído", "Incluído", "Incluído", "Incluído", "Incluído"],
  ["Exportação sem marca d’água", "HD", "HD", "HD e 4K", "HD e 4K", "HD e 4K"],
  ["CanvasLab para edição da peça", "Correção de texto e legenda", "Essencial", "Essencial e avançado", "Essencial e avançado", "Essencial e avançado"],
  ["Projetos salvos e cópias", "Uma peça guardada", "Incluído", "Incluído", "Incluído", "Incluído"],
  ["Marcas reutilizáveis", "Uma identidade básica", "Uma marca", "Várias marcas", "Várias marcas", "Várias marcas"],
  ["Gerar imagens com Sparks", "—", "Incluído", "Incluído", "Incluído", "Incluído"],
  ["Replicar Design e extrair URLs", "—", "—", "Incluído", "Incluído", "Incluído"],
  ["Fundo Contínuo e cópia seletiva entre slides", "—", "—", "Incluído", "Incluído", "Incluído"],
  ["Workspace, papéis e aprovação", "—", "—", "—", "—", "Incluído"],
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
  const [cycle, setCycle] = useState<MembershipCycle>(
    () => new URLSearchParams(window.location.search).get("cycle") === "annual" ? "annual" : "monthly"
  );
  const [, setLocation] = useLocation();
  const [authOpen, setAuthOpen] = useState(false);
  const [selection, setSelection] = useState<PaidStudioPlan | "START">("PRO");
  const [offers, setOffers] = useState<Awaited<ReturnType<typeof readEnrollmentOffers>>>();
  const [busy, setBusy] = useState(false);
  const [member, setMember] = useState<Awaited<ReturnType<typeof readProMembership>>>();
  const [hasIdentity, setHasIdentity] = useState(false);

  useEffect(() => {
    let active = true;
    void readEnrollmentOffers().then(value => { if (active) setOffers(value); }).catch(() => {});
    void supabase?.auth.getSession().then(({ data }) => {
      if (!active || !data.session) return;
      setHasIdentity(true);
      void readProMembership().then(value => { if (active) setMember(value); }).catch(() => {});
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function handleCTA(plan: PaidStudioPlan | "START") {
    setSelection(plan);
    setBusy(true);
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setAuthOpen(true);
        return;
      }
      if (plan === "START") {
        await enrollStartPilot();
        await resyncSupabaseSession(token);
        window.location.assign("/thevoid");
        return;
      }
      const { url } = await (member?.active ? openProPortal() : startProCheckout(cycle, plan));
      window.location.assign(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o checkout.");
    } finally {
      setBusy(false);
    }
  }

  const startAvailable = offers?.start === true;

  return (
    <>
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
        <h1 className="text-4xl font-bold tracking-tight text-foreground mb-3">
          Escolha seu plano
        </h1>
        <p className="text-muted-foreground max-w-xl">
          Crie posts e carrosséis com IA, edite no CanvasLab e exporte sem marca d’água.
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
            type="button"
            aria-pressed={cycle === item}
            onClick={() => setCycle(item)}
            className={`px-5 py-2 text-sm font-medium rounded-full transition-all ${cycle === item ? "bg-thermal-orange text-black" : "bg-transparent text-muted-foreground"}`}
          >
            {item === "monthly" ? "Mensal" : (
              <span className="flex items-center gap-1.5">
                Anual
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${cycle === "annual" ? "bg-black/20 text-black" : "bg-thermal-orange/20 text-thermal-orange"}`}
                >
                  -{PRO_ANNUAL_DISCOUNT}%
                </span>
              </span>
            )}
          </button>
        ))}
      </motion.div>

      <section className="mb-6 flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-soul-base p-5" aria-labelledby="pricing-start">
        <div>
          <h2 id="pricing-start" className="text-lg font-bold">START <span className="ml-2 text-sm font-medium text-muted-foreground">Grátis</span></h2>
          <p className="mt-2 text-sm text-muted-foreground">Crie sua primeira peça. Escolha entre até três propostas, revise o texto e a legenda e baixe em HD sem marca d’água.</p>
        </div>
        {startAvailable ? (
          <button type="button" onClick={() => void handleCTA("START")} disabled={busy || member?.active} className="rounded-xl bg-thermal-orange px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">Criar minha primeira peça</button>
        ) : (
          <span className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">Em breve</span>
        )}
      </section>
      <motion.div
        className="grid w-full max-w-7xl grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {PAID_PLANS.map(plan => {
          const { icon: Icon, description, features } = PLAN_DETAILS[plan];
          const offer = PAID_PLAN_OFFERS[plan];
          const isPro = plan === "PRO";
          const isAnnual = cycle === "annual";
          const isCurrentPlan = (member?.plan ?? "PRO") === plan && member?.active === true;
          const enrollmentOpen = isPro || (isAnnual ? offers?.annualPaid : offers?.paid)?.includes(plan) === true;
          const switchUnavailable = member?.active === true && !isCurrentPlan && enrollmentOpen;
          const priceCents = isAnnual ? offer.annualCents : offer.monthlyCents;
          const buttonLabel = isCurrentPlan ? "Gerenciar assinatura"
            : !enrollmentOpen ? (isAnnual ? "Adesão anual em breve" : "Em breve")
            : switchUnavailable ? "Troca de plano indisponível"
            : `Assinar ${isPro ? "o Pro" : offer.name}`;

          return (
            <motion.article
              key={plan}
              aria-labelledby={`pricing-${plan}`}
              variants={cardVariants}
              className={`relative flex flex-col rounded-2xl border p-6 ${isPro ? "bg-thermal-orange/5 border-thermal-orange/45 shadow-[0_0_40px_rgba(255,165,0,0.12)]" : "bg-soul-base border-border"}`}
            >

              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="p-2 rounded-xl"
                  style={{
                    backgroundColor: isPro ? "oklch(0.7 0.22 40 / 15%)" : "oklch(1 0 0 / 6%)",
                  }}
                >
                  <Icon
                    className="h-4 w-4"
                    style={{
                      color: isPro ? "oklch(0.7 0.22 40)" : "oklch(0.6 0.02 280)",
                    }}
                  />
                </div>
                <h2 id={`pricing-${plan}`} className="font-semibold text-foreground">{offer.name}</h2>
                {isCurrentPlan && (
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground">
                    Atual
                  </span>
                )}
              </div>

              <div className="mb-2">
                <p className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-3xl font-bold text-foreground">{reais.format(priceCents / 100)}</span>
                  <span className="text-sm text-muted-foreground">{isAnnual ? "por ano" : "por mês"}</span>
                </p>
                {isAnnual && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Equivale a {reais.format(priceCents / 1200)} por mês.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-sm mb-2" style={{ color: "oklch(0.7 0.22 40)" }}>
                <Zap className="h-3.5 w-3.5" />
                <span>{offer.sparksPerMonth.toLocaleString("pt-BR")} Sparks por mês</span>
              </div>

              <p className="text-xs text-muted-foreground mb-5">{description}</p>

              <ul className="flex flex-col gap-2 mb-4 flex-1">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "oklch(0.7 0.22 40)" }} />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              {(isPro || !isAnnual || enrollmentOpen) && (
                <p className="mb-4 text-xs text-muted-foreground">
                  {isPro ? "A primeira cota é liberada após o pagamento. O saldo de Sparks acumula."
                    : !enrollmentOpen ? "Preço previsto para o piloto mensal."
                    : isAnnual ? "Oferta piloto anual." : "Oferta piloto mensal."}
                </p>
              )}
              {isAnnual && (
                <p className="mb-4 text-xs text-muted-foreground">Acesso antecipado e participação opcional no PostSpark Labs.</p>
              )}

              <button
                type="button"
                onClick={() => void handleCTA(plan)}
                disabled={(!isCurrentPlan && !enrollmentOpen) || switchUnavailable || busy}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isPro ? "oklch(0.7 0.22 40)" : "oklch(1 0 0 / 8%)",
                  color: isPro ? "#000" : "oklch(0.8 0.01 280)",
                }}
              >
                {buttonLabel}
              </button>

            </motion.article>
          );
        })}
      </motion.div>

      <details className="mt-8 w-full max-w-7xl rounded-2xl border border-border bg-soul-base">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Comparar recursos dos planos</summary>
        <div className="overflow-x-auto border-t border-border px-5" role="region" aria-label="Comparação dos planos" tabIndex={0}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="p-3">Recurso</th>
                {["START", ...PAID_PLANS.map(plan => plan === "AGENCY" &&
                  !offers?.paid.includes(plan) && !offers?.annualPaid?.includes(plan) ? "AGENCY · Em breve" : PAID_PLAN_OFFERS[plan].name)]
                  .map(name => <th key={name} scope="col" className="p-3">{name}</th>)}
              </tr>
            </thead>
            <tbody>
              {comparison.map(([feature, ...plans]) => (
                <tr key={feature} className="border-t border-border">
                  <th scope="row" className="p-3 font-medium">{feature}</th>
                  {plans.map((value, index) => <td key={PAID_PLANS[index - 1] ?? "START"} className="p-3 text-muted-foreground">{value}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

    </div>
      {hasIdentity && !member?.active && (
        <div className="bg-[#0d0b09] pb-8 text-center">
          <button type="button" className="text-sm text-white/65 underline"
            onClick={() => { void openProPortal().then(({ url }) => window.location.assign(url)).catch(error => toast.error(error.message)); }}>
            Gerenciar uma assinatura existente
          </button>
        </div>
      )}
      <StudioAuthModal key={selection} isOpen={authOpen} isMobile={false} onClose={() => setAuthOpen(false)}
        startPilot={selection === "START"} checkoutPlan={selection === "START" ? undefined : selection}
        checkoutCycle={selection === "START" ? undefined : cycle} />
      <Footer />
    </>
  );
}
