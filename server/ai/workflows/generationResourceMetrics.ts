import { NetworkCaptureCollector } from "../../_core/networkDiagnostics";
import { getGenerationTrace } from "../generationTrace";

type Counter = { calls: number; failed: number; sentBodyBytes: number; receivedBodyBytes: number; unknownByteCalls: number };
/** Per-attempt aggregates only. No body, briefing, hostname, token or object key. */
export function startGenerationResourceMetrics(requestId: string, supabaseUrl: string) {
  const started = performance.now(), cpu = process.cpuUsage(), rssStart = process.memoryUsage().rss;
  const transfers: Record<string, Counter> = {};
  let databaseOrigin = "";
  try { databaseOrigin = new URL(supabaseUrl).origin; } catch { /* No configured transport. */ }
  const collector = new NetworkCaptureCollector(event => {
    if (event.event !== "supabase.end") return;
    const category = String(event.category);
    const counter = transfers[category] ??= {calls:0, failed:0, sentBodyBytes:0, receivedBodyBytes:0, unknownByteCalls:0};
    counter.calls++;
    if (!event.complete || Number(event.status) >= 400) counter.failed++;
    if (typeof event.requestBodyBytes === "number" && typeof event.responseBodyBytes === "number") {
      counter.sentBodyBytes += event.requestBodyBytes;
      counter.receivedBodyBytes += event.responseBodyBytes;
    } else counter.unknownByteCalls++;
  }, null, "generation-worker", {
    accept: () => getGenerationTrace()?.id === requestId,
    category: (origin, path) => {
      if (new URL(origin).origin === databaseOrigin)
        return path.startsWith("/storage/") ? "storage" : path.startsWith("/auth/") ? "authentication" : "database_api";
      return /(?:^|\.)(?:openrouter\.ai|googleapis\.com|openai\.com)$/.test(new URL(origin).hostname) ? "provider" : "external_asset_or_source";
    },
  });
  collector.start();
  return () => {
    collector.stop();
    const used = process.cpuUsage(cpu);
    return { version:1, requestId, durationMs:Math.round(performance.now()-started),
      processCpuMs:Math.round((used.user+used.system)/1000), rssStartBytes:rssStart, rssEndBytes:process.memoryUsage().rss,
      processResourcesSharedWithConcurrentWork:true, memoryIsEndpointSampleNotPeak:true,
      bodyBytesExcludeHeadersTlsAndPostgresSession:true, tracePersistenceExcluded:true, transfers };
  };
}
