/**
 * Corpus de títulos para o harness.
 *
 * POR QUE SINTÉTICO POR CONSTRUÇÃO (2026-08-10):
 * `postspark.posts` tem 23 registros — mín. 25, mediana 36, p90 46, máx. 51
 * caracteres, e ZERO acima de 60. A ausência de cauda não é amostragem ruim: é
 * estrutural. `applyDeterministicCopyGuards` corta todo título em 60
 * (`shared/validation.ts:69`), então o corpus real foi amputado pela guarda que
 * a arquitetura remove. Provar o encaixe contra ele testaria só a faixa que a
 * guarda antiga já deixava passar.
 *
 * Por isso: varredura sintética sistemática da faixa que o produto vai operar,
 * com os reais como ÂNCORA DE SANIDADE (confirmam que o sintético não é
 * absurdo: maior palavra observada = 12 caracteres, acentuação portuguesa).
 */

export interface CorpusItem {
  id: string;
  text: string;
  chars: number;
  longestWord: number;
  origin: "sintetico" | "real" | "adversarial";
  /** Faixa nominal de comprimento, para agregação no relatório. */
  bucket: string;
}

/**
 * Blocos de construção em português, com acentuação e cedilha — os glifos que
 * mais divergem entre fontes e que faltam em muitas display gratuitas.
 */
const SUBSTANTIVOS = [
  "operação", "estratégia", "conversão", "posicionamento", "faturamento",
  "processo", "método", "diagnóstico", "resultado", "negócio",
];
const ADJETIVOS = ["previsível", "consistente", "escalável", "óbvio", "silencioso", "caro"];
const VERBOS = ["trava", "destrói", "sustenta", "revela", "multiplica", "corrói"];
const CONECTORES = ["que", "sem", "antes de", "por trás de", "apesar de"];

/** PRNG determinístico — mesmo corpus em toda execução. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** Constrói uma frase até chegar perto do comprimento alvo. */
function buildPhrase(target: number, rand: () => number): string {
  const parts: string[] = [`${1 + Math.floor(rand() * 9)}`];
  const pools = [SUBSTANTIVOS, VERBOS, CONECTORES, ADJETIVOS];
  let i = 0;
  while (parts.join(" ").length < target) {
    parts.push(pick(pools[i % pools.length], rand));
    i += 1;
    if (i > 40) break;
  }
  let phrase = parts.join(" ");
  // Corta na última palavra inteira antes do alvo — nunca no meio da palavra,
  // porque palavra picada mede diferente e falsearia a medição.
  if (phrase.length > target) {
    const cut = phrase.slice(0, target);
    const lastSpace = cut.lastIndexOf(" ");
    phrase = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  }
  return phrase.trim();
}

function longestWordOf(text: string): number {
  return text.split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0);
}

function bucketOf(chars: number): string {
  if (chars <= 30) return "20-30";
  if (chars <= 45) return "31-45";
  if (chars <= 60) return "46-60";
  if (chars <= 75) return "61-75";
  return "76-90";
}

/**
 * Varredura de 20 a 90 caracteres, `perLength` amostras por degrau de 5.
 * A faixa vai além dos 60 da guarda de propósito: é exatamente onde o encaixe
 * precisa ser provado, e onde o corpus real não tem nada.
 */
export function syntheticCorpus(perLength = 3, seed = 20260810): CorpusItem[] {
  const rand = mulberry32(seed);
  const items: CorpusItem[] = [];
  for (let target = 20; target <= 90; target += 5) {
    for (let k = 0; k < perLength; k += 1) {
      const text = buildPhrase(target, rand);
      items.push({
        id: `syn-${target}-${k}`,
        text,
        chars: text.length,
        longestWord: longestWordOf(text),
        origin: "sintetico",
        bucket: bucketOf(text.length),
      });
    }
  }
  return items;
}

/**
 * Casos adversariais: quebram a quebra de linha gulosa. Não são realistas em
 * frequência, mas são realistas em possibilidade — e é neles que um encaixe
 * ingênuo falha.
 */
export const ADVERSARIAL: CorpusItem[] = [
  "Responsabilidade socioambiental corporativa",
  "Superdimensionamento de infraestrutura",
  "WWWWWWWWWWWWWWWWWWWWWWWW",
  "Anticonstitucionalissimamente",
  "A B C D E F G H I J K L M N O P Q R S T U V",
  "Otorrinolaringologista credenciado hoje",
].map((text, i) => ({
  id: `adv-${i}`,
  text,
  chars: text.length,
  longestWord: longestWordOf(text),
  origin: "adversarial" as const,
  bucket: bucketOf(text.length),
}));

/**
 * Âncora real. Preenchida por `pnpm harness:corpus` a partir de
 * `postspark.posts`. Fica fora do git (dado de usuário) — o harness roda sem
 * ela, mas reporta que rodou sem âncora.
 */
export async function loadRealAnchor(): Promise<CorpusItem[]> {
  try {
    const mod = await import("./corpus.real.json", { with: { type: "json" } });
    const rows = (mod.default ?? []) as { id: string; headline: string }[];
    return rows.map((row) => ({
      id: `real-${row.id}`,
      text: row.headline,
      chars: row.headline.length,
      longestWord: longestWordOf(row.headline),
      origin: "real" as const,
      bucket: bucketOf(row.headline.length),
    }));
  } catch {
    return [];
  }
}

export interface CorpusBundle {
  items: CorpusItem[];
  hasRealAnchor: boolean;
}

export async function buildCorpus(perLength = 3): Promise<CorpusBundle> {
  const real = await loadRealAnchor();
  return {
    items: [...syntheticCorpus(perLength), ...ADVERSARIAL, ...real],
    hasRealAnchor: real.length > 0,
  };
}
