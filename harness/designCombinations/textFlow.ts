/** Portuguese/English typography heuristics; all measurements come from the renderer. */
const CONNECTORS = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'com', 'por', 'para', 'e', 'ou', 'the', 'a', 'an', 'of', 'in', 'on', 'to', 'for', 'with', 'and', 'or']);
const wordKey = (word: string) => word.toLocaleLowerCase('pt-BR').replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');

export function lineBreakWarnings(lines: string[]) {
  if (lines.length < 2) return [];
  return lines.flatMap((line, index) => {
    const words = line.trim().split(/\s+/);
    return words.length === 1 && CONNECTORS.has(wordKey(words[0]))
      ? [{ code: 'isolated-connector' as const, line: index, text: line }]
      : [];
  });
}

export function balancedLines(text: string, measure: (text: string) => number, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/);
  if (!text.trim() || text.length > 600) throw new Error('Título vazio ou maior que o escopo de 600 caracteres deste ensaio.');
  if (words.some(word => measure(word) > maxWidth)) throw new Error('Uma palavra excede a largura útil; requer decisão manual.');
  const memo = new Map<number, { cost: number; lines: string[] }>();
  function solve(start: number): { cost: number; lines: string[] } {
    if (start === words.length) return { cost: 0, lines: [] };
    const cached = memo.get(start); if (cached) return cached;
    let best = { cost: Infinity, lines: [] as string[] };
    for (let end = start + 1; end <= words.length; end++) {
      const line = words.slice(start, end).join(' '), width = measure(line);
      if (width > maxWidth) break;
      const rest = solve(end), connector = CONNECTORS.has(wordKey(words[end - 1]));
      // Prefer a compact, balanced block; strongly penalize connectors alone.
      const isolated = end - start === 1 && connector && words.length > 1;
      const dangling = connector && end < words.length;
      const cost = 1 + .65 * (1 - width / maxWidth) ** 2 + (isolated ? 8 : 0) + (dangling ? .25 : 0) + rest.cost;
      if (cost < best.cost) best = { cost, lines: [line, ...rest.lines] };
    }
    memo.set(start, best); return best;
  }
  return solve(0).lines;
}
