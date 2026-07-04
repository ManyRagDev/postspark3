import { motion } from 'framer-motion';
import PostRenderer from '@/components/PostRenderer';
import { createLanding2Snapshot, LANDING2_DEMOS } from './demoContent';

const SPRING_ENTRY = { stiffness: 220, damping: 28 };

const PROOF_CASES = LANDING2_DEMOS.map((demo) => ({
  id: demo.id,
  label: demo.chip,
  beforeText: demo.prompt,
  afterSnapshot: createLanding2Snapshot(demo.variations[0]),
}));

export default function ProofSection() {
  return (
    <section className="relative py-16 md:py-24 border-t border-white/5">
      <div className="container mx-auto px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={SPRING_ENTRY}
          className="mx-auto mb-10 max-w-2xl text-center md:mb-14"
        >
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl lg:text-5xl">
            Ideia simples. Post com cara de marca.
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-sans text-base text-[--text-secondary] md:text-lg">
            A diferença precisa aparecer rápido: entrada comum, saída pronta para publicar.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
          {PROOF_CASES.map((proofCase, index) => (
            <ProofPair key={proofCase.id} proofCase={proofCase} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProofPair({
  proofCase,
  index,
}: {
  proofCase: typeof PROOF_CASES[number];
  index: number;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12%' }}
      transition={{ delay: index * 0.08, ...SPRING_ENTRY }}
      className="grid gap-3 rounded-2xl border border-white/8 bg-[--surface-void] p-3 shadow-xl shadow-black/20 md:p-4"
    >
      <div className="rounded-xl border border-dashed border-white/14 bg-black/20 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="font-display text-[11px] uppercase tracking-[0.2em] text-white/35">Antes</span>
          <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] text-white/50">{proofCase.label}</span>
        </div>
        <p className="font-mono text-sm leading-relaxed text-white/68">
          "{proofCase.beforeText}"
        </p>
      </div>

      <div className="flex items-center gap-3 px-1">
        <span className="h-px flex-1 bg-white/10" />
        <span className="font-display text-[11px] uppercase tracking-[0.2em] text-thermal-orange">vira</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div>
        <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
          <PostRenderer mode="preview" snapshot={proofCase.afterSnapshot} compact />
        </div>
        <div className="mt-3 text-center">
          <span className="font-display text-[11px] uppercase tracking-[0.2em] text-white/38">Depois</span>
        </div>
      </div>
    </motion.article>
  );
}
