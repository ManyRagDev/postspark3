import { z } from "zod";
import { getDb } from "./db";

export const designFrequencyInput = z.object({
  rounds: z.number().int().min(1).max(500),
  before: z.string().datetime().optional(),
});

const tag = z.string().nullable();
const family = z.string().min(1);
const receiptSchema = z.object({
  catalog: z.number().int().nullable(), format: z.enum(["static", "carousel"]), slides: z.string(),
  media: tag, imageObligation: tag, contentPhoto: z.enum(["yes","no","unknown"]), policy: tag, selector: tag, electionVersion: z.string(), mediaVersion: tag,
  hasSlots: z.literal(true), registered: z.array(family).min(1),
  eligible: z.array(z.object({ id: z.string(), family, memberIds: z.array(z.string()) })),
  evaluated: z.array(z.string()),
  selected: z.array(z.object({ slot: z.number(), candidate: z.string() })).nullable(),
  delivered: z.array(z.object({ slot: z.number(), family })).nullable(),
});

type Counts = { registered: number; eligible: number; evaluated: number; selected: number; retained: number; delivered: number };
type Cohort = { rounds: number; families: Map<string, Counts> };

export function summarizeDesignFrequency(rows: { receipt: unknown }[]) {
  const cohorts = new Map<string, Cohort>();
  let skipped = 0;
  for (const row of rows) {
    const parsed = receiptSchema.safeParse(row.receipt);
    if (!parsed.success) { skipped++; continue; }
    const r = parsed.data;
    const registered = new Set(r.registered);
    const candidates = new Map(r.eligible.map(c => [c.id, c.family]));
    const members = new Map(r.eligible.flatMap(c => c.memberIds.map(id => [id, c.family] as const)));
    const selected = r.selected ?? [];
    const delivered = r.delivered ?? [];
    if (r.eligible.some(c => !registered.has(c.family)) || r.evaluated.some(id => !candidates.has(id)) ||
        selected.some(s => !members.has(s.candidate)) || delivered.some(d => !registered.has(d.family))) {
      skipped++;
      continue;
    }
    const initial = new Map(selected.map(s => [s.slot, members.get(s.candidate)!]));
    const stages = {
      registered, eligible: new Set(candidates.values()), evaluated: new Set(r.evaluated.map(id => candidates.get(id)!)),
      selected: new Set(initial.values()), delivered: new Set(delivered.map(d => d.family)),
      retained: new Set(delivered.filter(d => initial.get(d.slot) === d.family).map(d => d.family)),
    };
    const key = [
      r.format === "static" ? "Post" : `Carrossel de ${r.slides} slides`,
      r.media === "true" ? "IA de imagem ligada" : r.media === "false" ? "IA de imagem desligada" : "IA de imagem não informada",
      r.contentPhoto === "yes" ? "com foto de conteúdo" : r.contentPhoto === "unknown" ? "upload não informado" : "sem foto de conteúdo",
      ({ forbidden: "foto proibida", optional: "foto opcional", required: "foto exigida" } as Record<string,string>)[r.imageObligation ?? ""] ?? "regra de foto não informada",
      `acervo ${r.catalog ?? "sem revisão"}`, `seletor ${r.selector ?? "legado"} (${r.policy ?? "legado"})`,
      `eleição ${r.electionVersion}`, `regra de mídia ${r.mediaVersion ?? "anterior"}`,
    ].join(" · ");
    const cohort = cohorts.get(key) ?? { rounds: 0, families: new Map<string, Counts>() };
    cohorts.set(key, cohort);
    cohort.rounds++;
    for (const name of Array.from(registered)) {
      const count = cohort.families.get(name) ?? { registered: 0, eligible: 0, evaluated: 0, selected: 0, retained: 0, delivered: 0 };
      for (const stage of Object.keys(stages) as (keyof Counts)[]) {
        if (stages[stage].has(name)) count[stage]++;
      }
      cohort.families.set(name, count);
    }
  }
  return { sampled: rows.length, skipped, cohorts: Array.from(cohorts, ([label, c]) => ({
    label, rounds: c.rounds, families: Array.from(c.families, ([family, counts]) => ({ family, ...counts }))
      .sort((a,b) => b.selected - a.selected || b.eligible - a.eligible || a.family.localeCompare(b.family)),
  })) };
}

export async function readDesignFrequency(input: z.infer<typeof designFrequencyInput>) {
  const { data, error } = await getDb().rpc("design_frequency_receipts", {
    p_limit: input.rounds, p_before: input.before ?? null,
  });
  if (error) throw new Error("Não foi possível consultar os recibos de frequência dos designs.");
  return summarizeDesignFrequency(data ?? []);
}
