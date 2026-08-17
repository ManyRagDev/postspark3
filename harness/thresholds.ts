/**
 * Critérios de aceitação, declarados ANTES de rodar.
 *
 * Estes números são o contrato entre o plano e o agente executor: uma etapa só
 * fecha quando `pnpm harness` sai com código 0 contra o perfil dela.
 *
 * Origem dos valores: `docs/plano-implementacao.md` (E2, E3, E5) e
 * `docs/decisoes-pendentes.md` (item 10, piso de legibilidade).
 */

export interface Thresholds {
  /** Perfil ao qual estes limiares pertencem. */
  profile: string;
  /**
   * Fração máxima de casos em que o caminho PRODUTIVO cortaria texto
   * (encaixe falha sem palavra irrecuperável). CR-003: o ruler legado
   * (clamp de `useTextAutoFit`) foi substituído pela medida do resolvedor
   * canônico — "truncamento" agora significa "texto quebrado não cabe na
   * caixa mesmo no piso". Invariante: 0.
   */
  maxTruncationRate: number;
  /** Fração mínima que encaixa acima do piso de legibilidade. */
  minFitAboveFloorRate: number;
  /** Contraste mínimo (WCAG AA para texto grande é 3:1; usamos AA normal). */
  minContrastRatio: number;
  /** Fração máxima de pares de blocos sobrepostos. Invariante: 0. */
  maxOverlapRate: number;
  /** Fração máxima de blocos fora do canvas. Invariante: 0. */
  maxOutOfCanvasRate: number;
  /** Fração máxima de blocos que invadem a safe area do rodapé (9:16). */
  maxSafeAreaViolationsRate: number;
  /** Divergência relativa máxima tolerada entre dois medidores. */
  maxMeasurerDivergence: number;
}

/**
 * Piso/teto de legibilidade: promovidos para `shared/typography/constants.ts`
 * pela SPEC-001 (o resolvedor canônico no servidor precisa dos mesmos
 * números). Reexportados aqui para não quebrar os imports existentes do
 * harness.
 */
export { LEGIBILITY_FLOOR_PX, HEADLINE_CEILING_PX } from "../shared/typography/constants";

/**
 * PERFIL `baseline` — mede o estado ATUAL, sem julgar. Nunca falha: existe para
 * produzir o número de referência que a E3 precisa superar.
 */
export const BASELINE: Thresholds = {
  profile: "baseline",
  maxTruncationRate: 1,
  minFitAboveFloorRate: 0,
  minContrastRatio: 0,
  maxOverlapRate: 1,
  maxOutOfCanvasRate: 1,
  maxSafeAreaViolationsRate: 1,
  maxMeasurerDivergence: 1,
};

/**
 * PERFIL `e2` — o portão da prova de encaixe. `maxTruncationRate: 0` significa
 * que NENHUM caso exige corte no caminho produtivo (texto quebrado que não
 * cabe nem no piso); palavras irrecuperáveis (adversariais) contam só no
 * encaixe, cujo piso de 95% existe para tolerá-las (2 itens × 12 famílias × 3
 * proporções ≈ 3% do corpus).
 */
export const E2: Thresholds = {
  profile: "e2",
  maxTruncationRate: 0,
  minFitAboveFloorRate: 0.95,
  minContrastRatio: 0,
  maxOverlapRate: 1,
  maxOutOfCanvasRate: 1,
  maxSafeAreaViolationsRate: 1,
  maxMeasurerDivergence: 0.03,
};

/**
 * PERFIL `e3` — encaixe em produção. Truncamento, sobreposição, fora do
 * canvas e invasão de safe area viram zero.
 */
export const E3: Thresholds = {
  profile: "e3",
  maxTruncationRate: 0,
  minFitAboveFloorRate: 0.95,
  minContrastRatio: 0,
  maxOverlapRate: 0,
  maxOutOfCanvasRate: 0,
  maxSafeAreaViolationsRate: 0,
  maxMeasurerDivergence: 0.03,
};

/**
 * PERFIL `e5` — cor garantida. Acrescenta contraste WCAG AA.
 */
export const E5: Thresholds = {
  profile: "e5",
  maxTruncationRate: 0,
  minFitAboveFloorRate: 0.95,
  minContrastRatio: 4.5,
  maxOverlapRate: 0,
  maxOutOfCanvasRate: 0,
  maxSafeAreaViolationsRate: 0,
  maxMeasurerDivergence: 0.03,
};

export const PROFILES: Record<string, Thresholds> = {
  baseline: BASELINE,
  e2: E2,
  e3: E3,
  e5: E5,
};

export function profileByName(name: string): Thresholds {
  const found = PROFILES[name];
  if (!found) {
    throw new Error(
      `Perfil "${name}" não existe. Disponíveis: ${Object.keys(PROFILES).join(", ")}`,
    );
  }
  return found;
}
