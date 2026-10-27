import { randomUUID } from "node:crypto";
import {
  readFile,
  mkdir,
  readdir,
  stat,
  unlink,
  appendFile,
  rename,
} from "node:fs/promises";
import { join } from "node:path";
import { ENV } from "../_core/env";
const MAX_FILE = 5 * 1024 * 1024,
  MAX_TOTAL = 500 * 1024 * 1024,
  MAX_AGE = 7 * 24 * 60 * 60 * 1000;
let pending = Promise.resolve();
export const localDiagnosticsEnabled = () => ENV.localDemandEnabled;
export function redactDiagnostics(value: unknown): unknown {
  const secrets = Object.entries(process.env)
    .filter(
      ([key, v]) =>
        /(?:SECRET|TOKEN|PASS(?:WORD)?|API_KEY|SERVICE_ROLE|DATABASE_URL|CREDENTIAL)/i.test(
          key
        ) &&
        v &&
        v.length >= 8
    )
    .map(([, v]) => v!);
  return JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (
        /^(?:authorization|cookie|access_?token|refresh_?token|api_?key|password|secret|smtp_?pass|service_?role_?key|credential)$/i.test(
          key
        )
      )
        return "[redacted]";
      if (item instanceof Error)
        return { message: item.message, stack: item.stack };
      if (typeof item === "string") {
        let result = item.replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]");
        for (const secret of secrets)
          result = result.split(secret).join("[redacted]");
        return result;
      }
      return item;
    })
  );
}
export async function writeLocalDiagnostic(
  runId: string,
  value: unknown,
  directory = join(process.cwd(), ".postspark-local", "diagnostics")
) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId))
    throw new Error("diagnostic_run_id_invalid");
  const recordId = randomUUID();
  const line = JSON.stringify(redactDiagnostics(value)) + "\n";
  const write = async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, `${runId}.jsonl`);
    const existing = await stat(file).catch(() => undefined);
    const size = existing?.size ?? 0;
    const oldestFileTime = existing
      ? Math.min(existing.birthtimeMs || existing.mtimeMs, existing.mtimeMs)
      : Date.now();
    if (size && (size + Buffer.byteLength(line) > MAX_FILE || Date.now() - oldestFileTime > MAX_AGE))
      await rename(
        file,
        join(directory, `${runId}-${Date.now()}-${randomUUID()}.jsonl`)
      );
    // Oversized content is kept as several bounded JSON records rather than an unbounded file.
    const bytes = Buffer.from(line);
    if (bytes.length > MAX_FILE) {
      for (let i = 0; i < bytes.length; i += MAX_FILE / 2)
        await appendFile(
          join(directory, `${runId}-${Date.now()}-${i}.jsonl`),
          JSON.stringify({
            encoding: "base64",
            recordId,
            part: i,
            data: bytes.subarray(i, i + MAX_FILE / 2).toString("base64"),
          }) + "\n",
          { mode: 0o600 }
        );
    } else await appendFile(file, line, { mode: 0o600 });
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter(e => e.isFile() && e.name.endsWith(".jsonl"))
        .map(async e => ({
          file: join(directory, e.name),
          ...(await stat(join(directory, e.name))),
        }))
    );
    const fileTime = (f: {birthtimeMs:number;mtimeMs:number}) => Math.min(f.birthtimeMs || f.mtimeMs, f.mtimeMs);
    files.sort((a, b) => fileTime(a) - fileTime(b));
    let total = files.reduce((sum, f) => sum + f.size, 0);
    for (const f of files)
      if (Date.now() - fileTime(f) > MAX_AGE || total > MAX_TOTAL) {
        await unlink(f.file);
        total -= f.size;
      }
  };
  const result = pending.then(write);
  pending = result.catch(() => {});
  return result;
}
export function compactDiagnosticEvents(events: any[]) {
  return events.map(({ stage, status, detail, at, data }) => ({
    stage,
    status,
    detail,
    at,
    ...(data?.paidEffect !== undefined
      ? { data: { paidEffect: data.paidEffect } }
      : {}),
  }));
}

/** Read-only operator support for diagnostics that no longer live in remote trace rows. */
export async function readLocalDiagnosticRecords(
  runId: string,
  directory = join(process.cwd(), ".postspark-local", "diagnostics")
): Promise<any[]> {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId))
    throw new Error("diagnostic_run_id_invalid");
  const files = await readdir(directory).catch(() => [] as string[]),
    records: any[] = [],
    parts = new Map<string, Array<{ part: number; data: string }>>();
  for (const file of files
    .filter(
      f =>
        f === `${runId}.jsonl` ||
        (f.startsWith(`${runId}-`) && f.endsWith(".jsonl"))
    )
    .sort()) {
    const lines = (await readFile(join(directory, file), "utf8"))
      .split("\n")
      .filter(Boolean);
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (item.encoding === "base64" && typeof item.recordId === "string") {
          const list = parts.get(item.recordId) ?? [];
          list.push(item);
          parts.set(item.recordId, list);
        } else records.push(item);
      } catch {
        /* A partial last write is not a usable diagnostic. */
      }
    }
  }
  for (const chunks of Array.from(parts.values())) {
    try {
      const value = Buffer.concat(
        chunks
          .sort((a, b) => a.part - b.part)
          .map(c => Buffer.from(c.data, "base64"))
      ).toString("utf8");
      records.push(JSON.parse(value));
    } catch {
      /* Retention can remove older chunks; never invent a complete trace. */
    }
  }
  return records;
}
