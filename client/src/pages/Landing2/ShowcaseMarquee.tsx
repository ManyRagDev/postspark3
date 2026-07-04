import { useMemo } from 'react';
import { motion } from 'framer-motion';
import PostRenderer from '@/components/PostRenderer';
import { createLanding2Snapshot, LANDING2_DEMOS } from './demoContent';
import type { PostVisualSnapshot } from '@shared/postspark';

const SPRING_ENTRY = { stiffness: 260, damping: 30 };

export default function ShowcaseMarquee() {
  const snapshots = useMemo(
    () => LANDING2_DEMOS.flatMap((demo) => demo.variations.map(createLanding2Snapshot)),
    [],
  );

  return (
    <section className="relative overflow-hidden border-t border-white/5 py-16 md:py-20">
      <div className="container mx-auto px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={SPRING_ENTRY}
          className="mx-auto mb-10 max-w-2xl text-center"
        >
          <h2 className="font-display text-2xl font-bold text-white md:text-3xl">
            Várias saídas para vários tipos de post
          </h2>
          <p className="mt-2 font-sans text-sm text-[--text-secondary] md:text-base">
            Promoção, serviço, agenda, prova social e campanha do cliente no mesmo fluxo.
          </p>
        </motion.div>

        <MarqueeRow snapshots={snapshots} direction="left" duration={44} />
        <MarqueeRow snapshots={[...snapshots].reverse()} direction="right" duration={58} />
      </div>
    </section>
  );
}

function MarqueeRow({
  snapshots,
  direction,
  duration,
}: {
  snapshots: PostVisualSnapshot[];
  direction: 'left' | 'right';
  duration: number;
}) {
  if (snapshots.length === 0) return null;

  const doubled = [...snapshots, ...snapshots];

  return (
    <div className="group relative w-full overflow-hidden py-3">
      <div
        className="flex w-max gap-4 group-hover:[animation-play-state:paused]"
        style={{
          animation: `${direction === 'left' ? 'marqueeLeft' : 'marqueeRight'} ${duration}s linear infinite`,
        }}
      >
        {doubled.map((snapshot, i) => (
          <div key={`${snapshot.id}-${i}`} className="aspect-square w-40 flex-shrink-0 md:w-52">
            <div className="relative h-full w-full overflow-hidden rounded-lg border border-white/8 shadow-lg">
              <PostRenderer mode="preview" snapshot={snapshot} compact />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
