import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import SparkLogo from '@/components/SparkLogo';
import OrganicBackground from '@/components/OrganicBackground';
import PostRenderer from '@/components/PostRenderer';
import { handleGoogleOAuthOnly } from '@/components/auth';
import { analytics } from '@/lib/analytics';
import { createLanding2Snapshot, LANDING2_DEMOS, type Landing2Demo } from './demoContent';

const SPRING_ENTRY = { stiffness: 260, damping: 30 };
const STATUS_STEPS = ['Entendendo objetivo', 'Criando 3 ângulos', 'Aplicando design'];

export default function HeroDemo() {
  const [activeDemoIndex, setActiveDemoIndex] = useState(0);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const activeDemo = LANDING2_DEMOS[activeDemoIndex];

  useEffect(() => {
    const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setIsReducedMotion(mqReduced.matches);
    updateMotion();
    mqReduced.addEventListener('change', updateMotion);
    return () => mqReduced.removeEventListener('change', updateMotion);
  }, []);

  const snapshots = useMemo(
    () => activeDemo.variations.map(createLanding2Snapshot),
    [activeDemo],
  );

  const handleCta = () => {
    analytics.trackEvent('cta_click_hero');
    handleGoogleOAuthOnly().catch(console.error);
  };

  const handleLogin = () => {
    analytics.trackEvent('login_link_click_hero');
    handleGoogleOAuthOnly().catch(console.error);
  };

  const handleDemoChange = (index: number) => {
    analytics.trackEvent('demo_prompt_selected', { demoId: LANDING2_DEMOS[index]?.id });
    setActiveDemoIndex(index);
  };

  return (
    <section className="relative min-h-dvh overflow-hidden border-b border-white/5">
      <OrganicBackground />

      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-4 md:px-10 md:py-5">
        <div className="h-7 w-7 md:h-8 md:w-8">
          <SparkLogo size={32} />
        </div>
        <button onClick={handleLogin} className="text-sm text-[--text-secondary] transition-colors hover:text-white">
          Entrar
        </button>
      </header>

      <div className="container relative z-10 mx-auto px-4 pb-12 pt-24 md:px-8 md:pb-16 md:pt-28">
        <div className="grid min-h-[calc(100dvh-10rem)] items-center gap-8 lg:grid-cols-[0.86fr_1.14fr] xl:gap-12">
          <div className="max-w-xl text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING_ENTRY}
              className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 lg:mx-0"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-thermal-orange shadow-[0_0_18px_oklch(0.7_0.22_40)]" />
              Post pronto a partir de uma ideia comum
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04, ...SPRING_ENTRY }}
              className="font-display text-4xl font-bold leading-[1.05] text-white sm:text-5xl xl:text-6xl"
            >
              Sua ideia entra simples. O post sai pronto para vender.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, ...SPRING_ENTRY }}
              className="mx-auto mt-5 max-w-lg font-sans text-base leading-relaxed text-[--text-secondary] md:text-lg lg:mx-0"
            >
              Escreva do jeito que você falaria no WhatsApp. O PostSpark transforma em
              três direções de post com design, copy e legenda para divulgar, vender,
              anunciar vaga ou lançar promoção.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, ...SPRING_ENTRY }}
              className="mt-7 flex flex-col items-center gap-3 sm:flex-row lg:justify-start"
            >
              <button
                onClick={handleCta}
                className="group relative w-full rounded-xl bg-thermal-orange px-8 py-4 font-display text-base font-semibold text-white shadow-lg transition-all hover:scale-[1.02] hover:bg-[oklch(0.72_0.22_40)] hover:shadow-[oklch(0.7_0.22_40/25%)] active:scale-[0.97] sm:w-auto"
              >
                <span className="relative z-10">Criar meu primeiro post grátis</span>
                <span className="block pt-1 font-sans text-xs font-normal text-white/80">
                  Google · sem cartão · em 30 segundos
                </span>
              </button>
              <span className="text-sm text-white/45">Ideal para negócios, serviços e criadores.</span>
            </motion.div>
          </div>

          <TransformationStage
            demo={activeDemo}
            snapshots={snapshots}
            activeDemoIndex={activeDemoIndex}
            isReducedMotion={isReducedMotion}
            onDemoChange={handleDemoChange}
          />
        </div>
      </div>
    </section>
  );
}

function TransformationStage({
  demo,
  snapshots,
  activeDemoIndex,
  isReducedMotion,
  onDemoChange,
}: {
  demo: Landing2Demo;
  snapshots: ReturnType<typeof createLanding2Snapshot>[];
  activeDemoIndex: number;
  isReducedMotion: boolean;
  onDemoChange: (index: number) => void;
}) {
  const [typedPrompt, setTypedPrompt] = useState('');
  const [visibleStepCount, setVisibleStepCount] = useState(0);
  const [showOutcome, setShowOutcome] = useState(false);
  const [showCards, setShowCards] = useState(false);

  useEffect(() => {
    if (isReducedMotion) {
      setTypedPrompt(demo.prompt);
      setVisibleStepCount(STATUS_STEPS.length);
      setShowOutcome(true);
      setShowCards(true);
      return;
    }

    setTypedPrompt('');
    setVisibleStepCount(0);
    setShowOutcome(false);
    setShowCards(false);

    const timers: number[] = [];
    const typeDelay = 28;
    const statusStartDelay = demo.prompt.length * typeDelay + 360;

    Array.from(demo.prompt).forEach((_, index) => {
      timers.push(window.setTimeout(() => {
        setTypedPrompt(demo.prompt.slice(0, index + 1));
      }, index * typeDelay));
    });

    STATUS_STEPS.forEach((_, index) => {
      timers.push(window.setTimeout(() => {
        setVisibleStepCount(index + 1);
      }, statusStartDelay + index * 520));
    });

    timers.push(window.setTimeout(() => setShowOutcome(true), statusStartDelay + STATUS_STEPS.length * 520 + 120));
    timers.push(window.setTimeout(() => setShowCards(true), statusStartDelay + STATUS_STEPS.length * 520 + 420));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [demo, isReducedMotion]);

  const promptFinished = typedPrompt.length === demo.prompt.length;

  return (
    <motion.div
      key={demo.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, ...SPRING_ENTRY }}
      className="relative"
    >
      <div className="absolute -inset-4 rounded-[2rem] bg-[radial-gradient(circle_at_45%_20%,oklch(0.75_0.14_200/0.14),transparent_34%),radial-gradient(circle_at_80%_80%,oklch(0.7_0.22_40/0.16),transparent_30%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[oklch(0.055_0.025_280/0.88)] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl md:p-5 lg:p-6">
        <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="flex min-h-[370px] flex-col justify-between rounded-2xl border border-white/8 bg-black/22 p-4 md:p-5">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-display text-xs uppercase tracking-[0.22em] text-white/35">Ideia crua</span>
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/55">{demo.chip}</span>
              </div>
              <p className="min-h-[7.5rem] font-mono text-base leading-relaxed text-white/85 md:text-lg">
                <span>"{typedPrompt}</span>
                {!isReducedMotion && !promptFinished ? (
                  <span className="ml-0.5 inline-block h-5 w-2 translate-y-1 animate-pulse bg-cyber-cyan" />
                ) : null}
                {promptFinished ? <span>"</span> : null}
              </p>
            </div>

            <div className="mt-6 space-y-3">
              {STATUS_STEPS.map((label, index) => (
                <StatusLine
                  key={label}
                  label={label}
                  active={!isReducedMotion && visibleStepCount === index + 1}
                  visible={visibleStepCount > index}
                />
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: showOutcome ? 1 : 0, y: showOutcome ? 0 : 10 }}
              transition={SPRING_ENTRY}
              className="mt-6 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] p-3"
            >
              <p className="text-sm leading-relaxed text-emerald-100/80">{demo.outcome}</p>
            </motion.div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3 md:p-4">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <span className="font-display text-xs uppercase tracking-[0.22em] text-thermal-orange">3 versões prontas</span>
                <h2 className="mt-1 font-display text-xl font-semibold text-white md:text-2xl">{demo.title}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {LANDING2_DEMOS.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => onDemoChange(index)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                      index === activeDemoIndex
                        ? 'bg-cyber-cyan text-black'
                        : 'bg-white/[0.06] text-white/65 hover:bg-white/[0.1] hover:text-white'
                    }`}
                  >
                    {item.chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-h-[238px] items-end gap-3 md:min-h-[266px] md:gap-4">
              {snapshots.map((snapshot, index) => (
                <motion.div
                  key={`${demo.id}-${index}`}
                  initial={{ opacity: 0, y: 26, scale: 0.94 }}
                  animate={{
                    opacity: showCards ? 1 : 0,
                    y: showCards ? (index === 1 ? -12 : index === 2 ? -4 : 0) : 26,
                    scale: showCards ? 1 : 0.94,
                  }}
                  transition={{ delay: showCards && !isReducedMotion ? 0.12 * index : 0, ...SPRING_ENTRY }}
                  className={`${index === 0 ? 'basis-[36%]' : 'basis-[32%]'} min-w-0`}
                >
                  <div
                    className={`relative aspect-square overflow-hidden rounded-2xl border bg-black shadow-2xl transition-all ${
                      index === 0
                        ? 'border-thermal-orange/35 shadow-[0_22px_80px_rgba(0,0,0,0.58)]'
                        : 'border-white/10 shadow-black/40'
                    }`}
                  >
                    <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-inset ring-white/10" />
                    <PostRenderer mode="preview" snapshot={snapshot} />
                  </div>
                  <div className="mt-3 flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.16em] text-white/38">
                    <span>v{index + 1}</span>
                    <span>{index === 0 ? 'foco' : 'opção'}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatusLine({ label, active, visible }: { label: string; active: boolean; visible: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : -8 }}
      transition={SPRING_ENTRY}
      className="flex items-center gap-3"
    >
      <span className={`h-2 w-2 rounded-full bg-cyber-cyan ${active ? 'animate-pulse shadow-[0_0_16px_oklch(0.75_0.14_200)]' : ''}`} />
      <span className="text-sm text-white/62">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" />
    </motion.div>
  );
}
