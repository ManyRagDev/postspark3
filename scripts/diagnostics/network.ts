import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
  stat,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import {
  diagnosticCategory,
  diagnosticId,
} from "../../shared/networkDiagnostics";

const root = join(process.cwd(), ".postspark-local"),
  control = join(root, "network-capture.json"),
  directory = join(root, "diagnostics");
const args = process.argv.slice(2).filter(value => value !== "--"),
  command = args.shift();
function option(name: string, otherwise: string) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : otherwise;
}
async function save(value: unknown) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temp = control + ".tmp";
  await writeFile(temp, JSON.stringify(value) + "\n", { mode: 0o600 });
  await rename(temp, control);
}
export function buildNetworkReport(
  events: any[],
  capture: any,
  now = Date.now()
) {
  const rows = new Map<string, any>(),
    starts = new Set<string>(),
    ends = new Set<string>(),
    api = new Map<string, any>(),
    browser = new Map<string, any>();
  const coverage = new Map<string, number[]>();
  const browserEndpoints=new Map<string,any>();
  const browserFetchIds=new Set<string>();
  let browserFetches = 0,
    browserResources = 0,
    browserKnownBytes = 0,
    browserUnknownBytes = 0;
  const seals = new Map<string, number>();
  const endTime = Math.min(capture.until, now),
    begin = capture.start;
  const byMinute: Record<string, number> = {};
  let diagnosticBatches = 0,
    diagnosticDeclaredBytes = 0,
    collectorWarnings = 0;
  const sorted = events
    .slice()
    .sort(
      (a, b) =>
        String(a.at).localeCompare(String(b.at)) ||
        (a.event === "supabase.start"
          ? -1
          : b.event === "supabase.start"
            ? 1
            : 0)
    );
  for (const e of sorted) {
    if (e.captureId !== capture.id) continue;
    if (e.event === "collector.warning") collectorWarnings++;
    if (e.event === "collector.seal") {
      seals.set(`${e.role}:${e.pid}`, e.writeFailures ?? 1);
      continue;
    }
    const at = Date.parse(e.at);
    if (!Number.isFinite(at) || at < begin || at > endTime) continue;
    if (e.event === "diagnostic.browser_batch") {
      diagnosticBatches++;
      diagnosticDeclaredBytes += e.declaredBodyBytes ?? 0;
    }
    if (
      ["collector.start", "collector.pulse", "collector.stop"].includes(e.event)
    ) {
      const key = `${e.role}:${e.pid}`;
      const a = coverage.get(key) ?? [];
      a.push(at);
      coverage.set(key, a);
    }
    if (e.event === "supabase.start") {
      if (starts.has(e.requestId)) continue;
      starts.add(e.requestId);
      const key = e.endpoint;
      const r = rows.get(key) ?? {
        endpoint: key,
        category: diagnosticCategory(key),
        calls: 0,
        completed: 0,
        errors: 0,
        requestBodyBytes: 0,
        responseBodyBytes: 0,
        unknownByteCalls: 0,
        durations: [],
        origins: {},
      };
      r.calls++;
      const source = `${e.role}/${e.context?.route ?? e.context?.source ?? "unknown"}/${e.context?.browser ?? "unknown"}/${e.context?.visibility ?? "unknown"}`;
      r.origins[source] = (r.origins[source] ?? 0) + 1;
      rows.set(key, r);
      const minute = new Date(at).toISOString().slice(0, 16);
      byMinute[minute] = (byMinute[minute] ?? 0) + 1;
    }
    if (e.event === "supabase.end") {
      if (ends.has(e.requestId)) continue;
      ends.add(e.requestId);
      const r = rows.get(e.endpoint);
      if (!r) continue;
      if (e.complete) r.completed++;
      if (!e.complete || e.status >= 400) r.errors++;
      r.requestBodyBytes += e.requestBodyBytes ?? 0;
      r.responseBodyBytes += e.responseBodyBytes ?? 0;
      if (e.responseBodyBytes === null || e.requestBodyBytes === null)
        r.unknownByteCalls++;
      if (Number.isFinite(e.durationMs)) r.durations.push(e.durationMs);
    }
    if (e.event === "api.start") {
      const key = `${e.route}/${e.browser}/${e.tabId ?? "unidentified"}/${e.visibility}`;
      const r = api.get(key) ?? {
        route: e.route,
        browser: e.browser,
        tabId: e.tabId,
        visibility: e.visibility,
        calls: 0,
        operations: 0,
      };
      r.calls++;
      r.operations += e.route.startsWith("/api/trpc/")
        ? e.route.slice("/api/trpc/".length).split(",").length
        : 1;
      api.set(key, r);
    }
    if (e.event === "browser.presence") {
      const key = e.pageInstanceId ?? e.tabId;
      const r = browser.get(key) ?? {
        tabId: e.tabId,
        pageInstanceId: e.pageInstanceId,
        firstAt: e.at,
        lastAt: e.at,
        pulses: 0,
        visiblePulses: 0,
        hiddenPulses: 0,
        maxGapSeconds: 0,
      };
      r.maxGapSeconds = Math.max(
        r.maxGapSeconds,
        (at - Date.parse(r.lastAt)) / 1000
      );
      r.lastAt = e.at;
      r.pulses++;
      if (e.visibility === "visible") r.visiblePulses++;
      else r.hiddenPulses++;
      browser.set(key, r);
    }
    const duplicateFetch=e.event==="browser.fetch"&&e.requestId&&browserFetchIds.has(e.requestId);
    if(e.event==="browser.fetch"&&e.requestId)browserFetchIds.add(e.requestId);
    if (e.event === "browser.fetch" && e.destination === "supabase"&&!duplicateFetch)browserFetches++;
    if ((e.event==="browser.fetch"||e.event==="browser.resource")&&e.destination==="supabase"&&!duplicateFetch){
      const key=e.event+":"+e.endpoint;
      const r=browserEndpoints.get(key)??{kind:e.event,endpoint:e.endpoint??"/unknown",entries:0,knownResponseBodyBytes:0,unknownByteEntries:0};
      r.entries++;
      if(e.event==="browser.resource"){if(typeof e.responseBodyBytes==="number")r.knownResponseBodyBytes+=e.responseBodyBytes;else r.unknownByteEntries++;}
      browserEndpoints.set(key,r);
    }
    if (e.event === "browser.resource" && e.destination === "supabase") {
      browserResources++;
      if (e.responseBodyBytes === null) browserUnknownBytes++;
      else browserKnownBytes += e.responseBodyBytes;
    }
  }
  const endpoints = [...rows.values()]
    .map(r => {
      r.durations.sort((a: number, b: number) => a - b);
      const durations = r.durations;
      delete r.durations;
      return {
        ...r,
        p95Ms: durations.length
          ? durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)]
          : null,
      };
    })
    .sort((a, b) => b.calls - a.calls);
  const coverageRows = [...coverage].map(([process, times]) => {
    times.sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 1; i < times.length; i++)
      maxGap = Math.max(maxGap, times[i] - times[i - 1]);
    return {
      process,
      firstAt: new Date(times[0]).toISOString(),
      lastAt: new Date(times.at(-1)!).toISOString(),
      maxGapSeconds: Math.round(maxGap / 1000),
      tailGapSeconds: Math.round((endTime - times.at(-1)!) / 1000),
      startGapSeconds: Math.round((times[0] - begin) / 1000),
    };
  });
  const backendCovered = coverageRows.some(
    r =>
      r.process.startsWith("backend:") &&
      r.startGapSeconds <= 20 &&
      r.tailGapSeconds <= 20 &&
      r.maxGapSeconds <= 20
  );
  const browserRows = [...browser.values()].map(r => ({
    ...r,
    tailGapSeconds: Math.round((endTime - Date.parse(r.lastAt)) / 1000),
    startGapSeconds: Math.round((Date.parse(r.firstAt) - begin) / 1000),
  }));
  const browserCovered = browserRows.some(
    r =>
      r.startGapSeconds <= 20 &&
      r.tailGapSeconds <= 20 &&
      r.maxGapSeconds <= 20 &&
      r.pulses >= 2
  );
  const completedWindow = now >= capture.until;
  const journalComplete =
    !completedWindow || coverageRows.every(r => seals.get(r.process) === 0);
  return {
    capture,
    generatedAt: new Date(now).toISOString(),
    window: {
      from: new Date(begin).toISOString(),
      to: new Date(endTime).toISOString(),
      seconds: Math.max(0, Math.round((endTime - begin) / 1000)),
      completed: completedWindow,
    },
    backend: {
      calls: starts.size,
      unfinishedCalls: [...starts].filter(id => !ends.has(id)).length,
      requestBodyBytes: endpoints.reduce((n, r) => n + r.requestBodyBytes, 0),
      responseBodyBytes: endpoints.reduce((n, r) => n + r.responseBodyBytes, 0),
      endpoints,
      byMinute,
      coverage: coverageRows,
      continuousCoverage: backendCovered,
    },
    browser: {
      directSupabaseFetches: browserFetches,
      endpoints:Array.from(browserEndpoints.values()),
      resourceEntries: browserResources,
      knownResponseBodyBytes: browserKnownBytes,
      unknownByteEntries: browserUnknownBytes,
      tabs: browserRows,
      continuousCoverage: browserCovered,
    },
    api: [...api.values()],
    diagnosticOverhead: {
      localBrowserBatches: diagnosticBatches,
      localBrowserDeclaredBodyBytes: diagnosticDeclaredBytes,
      extraSupabaseRequests: 0,
    },
    collectorWarnings,
    verdict: !completedWindow
      ? "PARTIAL_WINDOW"
      : collectorWarnings
        ? "INCOMPLETE_INSTRUMENTATION"
        : !journalComplete
          ? "INCOMPLETE_LOG_DATA"
          : !backendCovered
            ? "INCOMPLETE_BACKEND_COVERAGE"
            : capture.scenario !== "backend-idle" && !browserCovered
              ? "INCOMPLETE_BROWSER_COVERAGE"
              : starts.size || browserFetches || browserResources
                ? "ACTIVITY_OBSERVED"
                : "NO_SUPABASE_HTTP_OBSERVED",
    limitations: [
      "Os bytes são corpos HTTP observados no handler do Undici antes da descompressão. Cabeçalhos, TLS/TCP e critérios de faturamento não estão incluídos: isto não mede Egress faturado.",
      "Resource Timing pode ocultar tamanhos cross-origin ou representar recursos do cache. Tamanho sem transferência confirmada fica desconhecido, não zero. Tentativas de fetch do navegador não incluem necessariamente preflights e redirecionamentos internos; não somar seus totais aos do backend como estimativa de faturamento.",
      "Somente a origem Supabase configurada em processos/páginas instrumentados é coberta. Outros clientes, transportes HTTP nativos, WebSocket/Realtime, aplicativos, ferramentas e logs internos da plataforma ficam fora da medição.",
      "O cenário é uma declaração do operador. Presença/visibilidade prova disponibilidade da página, não ausência de interação ou de geração. tabId usa sessionStorage e pode ser copiado ao abrir outra aba; pageInstanceId muda a cada carregamento. Nenhum dos dois, isoladamente, prova quantas abas estavam abertas.",
      "A medição é exclusiva do desenvolvimento local, não descreve o deploy de produção e não extrapola a amostra para o mês. Requisições já em andamento antes do início da captura não são reconstruídas.",
    ],
  };
}
async function main() {
  if (command === "start") {
    const minutes = Number(option("--minutes", "30")),
      scenario = option("--scenario", "observed");
    if (
      !Number.isFinite(minutes) ||
      minutes < 0.1 ||
      minutes > 120 ||
      ![
        "observed",
        "backend-idle",
        "studio-visible",
        "studio-hidden",
        "generation-active",
      ].includes(scenario)
    )
      throw Error(
        "Use --minutes entre 0.1 e 120; --scenario observed|backend-idle|studio-visible|studio-hidden|generation-active"
      );
    try {
      const old = JSON.parse(await readFile(control, "utf8"));
      if (old.until > Date.now())
        throw Error("Já existe captura ativa: " + old.id);
    } catch (e: any) {
      if (e.message?.startsWith("Já existe")) throw e;
    }
    const capture = {
      id: randomUUID(),
      scenario,
      start: Date.now(),
      until: Date.now() + minutes * 60_000,
    };
    await save(capture);
    await mkdir(join(root, "network-reports"), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(
      join(root, "network-reports", capture.id + ".capture.json"),
      JSON.stringify(capture),
      { mode: 0o600 }
    );
    console.log(
      JSON.stringify(
        {
          capture,
          reportCommand: "pnpm diagnose:report -- " + capture.id,
          notice:
            "Coleta local limitada. O relatório verifica cobertura; não mede Egress faturado.",
        },
        null,
        2
      )
    );
    return;
  }
  if (args[0] && !diagnosticId(args[0]))
    throw Error("Identificador de captura inválido");
  const capture = JSON.parse(
    await readFile(
      args[0]
        ? join(root, "network-reports", args[0] + ".capture.json")
        : control,
      "utf8"
    )
  );
  if (command === "stop") {
    capture.until = Date.now();
    await save(capture);
    await writeFile(
      join(root, "network-reports", capture.id + ".capture.json"),
      JSON.stringify(capture),
      { mode: 0o600 }
    );
    console.log("Captura encerrada: " + capture.id);
    return;
  }
  if (command !== "report") throw Error("Use start, stop ou report");
  const events: any[] = [];
  let invalidLines = 0,
    readErrors = 0,
    logBytes = 0;
  const files = (await readdir(directory)).filter(
    name =>
      name.startsWith("network-" + capture.id + "-") && name.endsWith(".jsonl")
  );
  for (const file of files) {
    try {
      logBytes += (await stat(join(directory, file))).size;
      for await (const line of createInterface({
        input: createReadStream(join(directory, file)),
        crlfDelay: Infinity,
      })) {
        try {
          events.push(JSON.parse(line));
        } catch {
          invalidLines++;
        }
      }
    } catch {
      readErrors++;
    }
  }
  events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const report = {
    ...buildNetworkReport(events, capture),
    input: {
      files: files.length,
      invalidLines,
      readErrors,
      localLogBytes: logBytes,
      rawFiles:files.map(name=>join(directory,name)),
    },
  };
  if (invalidLines || readErrors) report.verdict = "INCOMPLETE_LOG_DATA";
  const out = join(root, "network-reports", capture.id);
  await writeFile(out + ".json", JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  const conclusions: Record<string, string> = {
    PARTIAL_WINDOW: "A coleta ainda está em andamento.",
    INCOMPLETE_BACKEND_COVERAGE:
      "Falta cobertura contínua do backend; não concluir ociosidade.",
    INCOMPLETE_BROWSER_COVERAGE:
      "O backend foi observado, mas falta cobertura contínua da página.",
    INCOMPLETE_LOG_DATA: "Os arquivos não comprovam uma gravação completa.",
    INCOMPLETE_INSTRUMENTATION:
      "O coletor encontrou um formato não suportado; a medição é inconclusiva.",
    ACTIVITY_OBSERVED: "Houve atividade no escopo observado.",
    NO_SUPABASE_HTTP_OBSERVED:
      "Nenhuma chamada HTTP ao Supabase foi observada no escopo coberto.",
  };
  const local = (value: string) =>
    new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const lines = [
    "# Medição local de atividade do PostSpark",
    "",
    `Janela: ${report.window.from} a ${report.window.to} (${report.window.seconds}s).`,
    `Horário de Brasília: ${local(report.window.from)} a ${local(report.window.to)}.`,
    `Cenário declarado: ${capture.scenario}. Resultado: ${report.verdict}.`,
    conclusions[report.verdict] ?? report.verdict,
    "",
    `Backend → Supabase: ${report.backend.calls} chamadas; ${report.backend.responseBodyBytes} bytes de corpo contados na recepção; ${report.backend.unfinishedCalls} chamadas sem conclusão.`,
    `Navegador → Supabase: ${report.browser.continuousCoverage ? report.browser.directSupabaseFetches + " tentativas de fetch observadas separadamente" : "sem cobertura contínua; não concluir ausência de chamadas"}.`,
    "",
    "| Endpoint | Chamadas | Erros | Corpo recebido (bytes) | Bytes desconhecidos (chamadas) | p95 (ms) |",
    "|---|---:|---:|---:|---:|---:|",
    ...report.backend.endpoints.map(
      r =>
        `| ${r.endpoint} | ${r.calls} | ${r.errors} | ${r.responseBodyBytes} | ${r.unknownByteCalls} | ${r.p95Ms ?? "—"} |`
    ),
    "",
    "## Cobertura",
    "",
    `Backend contínuo: ${report.backend.continuousCoverage}. Navegador contínuo: ${report.browser.continuousCoverage}. Janela completa: ${report.window.completed}.`,
    "",
    "Os detalhes por processo, aba, navegador, visibilidade, rota causadora e minuto estão no JSON.",
    `Custo do próprio diagnóstico: ${report.diagnosticOverhead.localBrowserBatches} envios locais de metadados do navegador; ${report.input.localLogBytes} bytes de arquivos locais; nenhuma consulta adicional ao Supabase.`,
    "p95: 95% das chamadas registradas ficaram até essa duração de transporte HTTP; não é o tempo completo da geração.",
    "",
    "## Limites",
    "",
    ...report.limitations.map(x => "- " + x),
    "",
  ];
  await writeFile(out + ".md", lines.join("\n"), { mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        json: out + ".json",
        markdown: out + ".md",
        verdict: report.verdict,
        backendCalls: report.backend.calls,
        backendResponseBodyBytes: report.backend.responseBodyBytes,
        browserDirectCalls: report.browser.directSupabaseFetches,
        coverage: report.backend.continuousCoverage,
      },
      null,
      2
    )
  );
}
if (process.argv[1]?.endsWith("/scripts/diagnostics/network.ts"))
  main().catch(e => {
    console.error(e.message);
    process.exitCode = 1;
  });
