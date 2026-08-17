/**
 * Puxa os títulos reais de `postspark.posts` para `harness/corpus.real.json`.
 *
 * O arquivo é ÂNCORA DE SANIDADE, não o corpus principal — ver o cabeçalho de
 * `corpus.ts` para o porquê (os reais estão amputados em 60 caracteres pela
 * guarda que a arquitetura remove).
 *
 * Grava só `id` e `headline`. Nada de conteúdo de usuário além do título, que é
 * o único campo que o harness mede. O arquivo fica fora do git.
 *
 *   pnpm harness:corpus
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../server/_core/env";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "corpus.real.json");

async function main(): Promise<void> {
  const url = ENV.supabaseUrl;
  const key = ENV.supabaseServiceRoleKey;
  if (!url || !key) {
    throw new Error(
      "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente. " +
        "O harness roda sem âncora real — só reporta que rodou sem ela.",
    );
  }

  const supabase = createClient(url, key, { db: { schema: "postspark" } });
  const { data, error } = await supabase
    .from("posts")
    .select("id, headline")
    .not("headline", "is", null);

  if (error) throw new Error(`Supabase: ${error.message}`);

  const rows = (data ?? [])
    .map((row) => ({ id: String(row.id), headline: String(row.headline).trim() }))
    .filter((row) => row.headline.length > 0);

  writeFileSync(OUT, JSON.stringify(rows, null, 2), "utf8");

  const lengths = rows.map((r) => r.headline.length).sort((a, b) => a - b);
  const p = (q: number) => lengths[Math.floor(lengths.length * q)] ?? 0;
  console.log(`âncora real gravada: ${rows.length} títulos → ${OUT}`);
  console.log(
    `  min ${lengths[0]} · mediana ${p(0.5)} · p90 ${p(0.9)} · max ${lengths[lengths.length - 1]}`,
  );
  console.log(`  acima de 60 caracteres: ${lengths.filter((l) => l > 60).length}`);
}

main().catch((error) => {
  console.error("❌", error instanceof Error ? error.message : error);
  process.exit(1);
});
