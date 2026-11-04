import { mkdir, readdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  getGenerationTrace,
  runWithGenerationTrace,
  type GenerationTrace,
} from "../../ai/generationTrace";
import { paidOperationScope, type MatrixBudget } from "./budget";

export async function writeJson(file: string, value: unknown) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, file);
}
export interface LocalOperation {
  operationKey: string;
  state: "started" | "completed" | "uncertain" | "blocked";
  result?: unknown;
  expectation?: unknown;
  trace?: GenerationTrace;
  error?: string;
  campaignInterruption?: import("./budget").CampaignStop;
}
export async function localJournal(
  directory: string,
  unitId: string,
  budget: MatrixBudget
) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const rows = new Map<string, LocalOperation>();
  for (const file of (await readdir(directory)).filter(f =>
    f.endsWith(".json")
  )) {
    const row = JSON.parse(
      await readFile(join(directory, file), "utf8")
    ) as LocalOperation;
    rows.set(row.operationKey, row);
  }
  const path = (key: string) =>
    join(directory, `${createHash("sha256").update(key).digest("hex")}.json`);
  const execute = async <T>(
    operationKey: string,
    work: () => Promise<T>
  ): Promise<T> => {
    const existing = rows.get(operationKey),
      parent = getGenerationTrace();
    if (existing?.state === "completed") {
      if (existing.trace && parent) {
        parent.calls.push(...existing.trace.calls);
        parent.events.push(...existing.trace.events);
      }
      return existing.result as T;
    }
    if (existing && existing.state !== "blocked")
      throw new Error(`comparison_uncertain_operation:${operationKey}`);
    if (!parent) throw new Error("comparison_trace_required");
    const trace: GenerationTrace = { ...parent, calls: [], events: [] };
    const row: LocalOperation = {
      operationKey,
      state: "started",
      expectation: existing?.expectation,
    };
    rows.set(operationKey, row);
    await writeJson(path(operationKey), row);
    const scope = `${unitId}:${operationKey}`;
    const count = () =>
      budget.calls.filter(call => call.operation === scope).length;
    const before = count();
    try {
      const result = await paidOperationScope.run(scope, () =>
        runWithGenerationTrace(trace, work)
      );
      Object.assign(row, { state: "completed", result, trace });
      await writeJson(path(operationKey), row);
      return result;
    } catch (error) {
      Object.assign(row, {
        state: count() === before ? "blocked" : "uncertain",
        trace,
        campaignInterruption: budget.interruption,
        error: error instanceof Error ? error.message : String(error),
      });
      await writeJson(path(operationKey), row);
      throw error;
    } finally {
      parent.calls.push(...trace.calls);
      parent.events.push(...trace.events);
    }
  };
  return {
    rows,
    execute,
    expectation: async (key: string, expectation: unknown) => {
      const row = rows.get(key) ?? {
        operationKey: key,
        state: "blocked" as const,
      };
      row.expectation = expectation;
      rows.set(key, row);
      await writeJson(path(key), row);
    },
  };
}
