/** Read-only: pnpm generation:trace --id UUID [--id UUID] [--watch] [--output /tmp/report.html]
 * Offline: --from snapshot.json (a {request,operations,events?} or an array). */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  inspectGenerationDecisionTrace,
  renderDecisionTraceHtml,
  summarizeDecisionVariability,
  type DecisionTraceSource,
} from "../server/generationDecisionTrace";

function options(args: string[]) {
  const ids: string[] = [];
  let from: string | undefined,
    output = "/tmp/postspark-decision-trace.html",
    watch = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--watch") {
      watch = true;
      continue;
    }
    if (
      !["--id", "--from", "--output"].includes(flag) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error("invalid_arguments");
    const value = args[++i];
    if (flag === "--id") ids.push(z.string().uuid().parse(value));
    if (flag === "--from") from = value;
    if (flag === "--output") output = value;
  }
  if (
    (!ids.length && !from) ||
    (ids.length && from) ||
    !output.endsWith(".html")
  )
    throw new Error("invalid_arguments");
  return { ids: [...new Set(ids)], from, output, watch };
}

export async function traceGenerationDecisions(cliArgs: string[]) {
  const args = options(cliArgs);
  let stopped = false;
  if (args.watch)
    process.once("SIGINT", () => {
      stopped = true;
    });
  if (args.watch)
    process.once("SIGTERM", () => {
      stopped = true;
    });
  // No database/environment module is loaded for offline snapshots.
  const db = args.from ? null : (await import("../server/db")).getDb();
  let previous = "";
  do {
    const sources: DecisionTraceSource[] = args.from
      ? await readFile(args.from, "utf8").then(text => {
          const decoded = JSON.parse(text);
          return Array.isArray(decoded) ? decoded : [decoded];
        })
      : await Promise.all(
          args.ids.map(async id => {
            const requestResult = await db!
              .from("generation_v5_requests")
              .select(
                "id,status,owner_id,input,prepared,proposals,generation_config,catalog_revision,created_at,updated_at"
              )
              .eq("id", id)
              .single();
            if (requestResult.error || !requestResult.data)
              throw new Error("request_read_failed");
            const request = requestResult.data;
            const [operations, trace] = await Promise.all([
              db!
                .from("generation_v5_operations")
                .select("operation_key,state,result,expectation")
                .eq("request_id", id),
              db!
                .from("generation_runs")
                .select("events")
                .eq("id", id)
                .eq("user_uuid", request.owner_id)
                .maybeSingle(),
            ]);
            if (operations.error || trace.error)
              throw new Error("trace_read_failed");
            const { readLocalDiagnosticRecords } = await import(
              "../server/ai/localDiagnostics"
            );
            const records = await readLocalDiagnosticRecords(id);
            const localEvents = records
              .filter(
                record =>
                  record.id === id && record.userUuid === request.owner_id
              )
              .flatMap(record => record.events ?? []);
            return {
              request,
              operations: operations.data ?? [],
              events: [...(trace.data?.events ?? []), ...localEvents],
            };
          })
        );
    const runs = sources.map(source => inspectGenerationDecisionTrace(source));
    const report = {
      schemaVersion: 1,
      runs,
      variability: summarizeDecisionVariability(runs),
    };
    const serialized = JSON.stringify(report, null, 2) + "\n";
    if (serialized !== previous) {
      await mkdir(dirname(args.output), { recursive: true });
      await writeFile(
        args.output,
        renderDecisionTraceHtml(runs, args.watch ? 3 : undefined),
        { mode: 0o600 }
      );
      const jsonFile = args.output.slice(0, -5) + ".json";
      await writeFile(jsonFile, serialized, { mode: 0o600 });
      console.log(
        JSON.stringify({
          html: args.output,
          json: jsonFile,
          runs: runs.map(run => ({
            requestId: run.requestId,
            status: run.requestStatus,
            candidates: run.candidates.length,
            assessments: run.assessments.length,
            reviewsCaptured: run.generatedPosts.reduce(
              (count, post) => count + post.reviews.length,
              0
            ),
            selectionCaptured: run.coverage.liveSelectionCaptured,
            electionVerified: run.coverage.electionVerified,
            alerts: run.issues.length,
          })),
        })
      );
      previous = serialized;
    }
    if (args.watch && !stopped)
      await new Promise(resolve => setTimeout(resolve, 3000));
  } while (args.watch && !stopped);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  void traceGenerationDecisions(process.argv.slice(2)).catch(() => {
    console.error(
      "Falha na leitura do trace. Use --id UUID [--id UUID] [--watch] [--output /tmp/report.html] ou --from snapshot.json. Confira acesso ao banco e os arquivos locais."
    );
    process.exitCode = 1;
  });
