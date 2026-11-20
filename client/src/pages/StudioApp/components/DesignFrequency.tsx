import { useState } from "react";
import { trpc } from "@/lib/trpc";
import type { summarizeDesignFrequency } from "../../../../../server/designFrequency";

type Report = ReturnType<typeof summarizeDesignFrequency>;
type Family = Report["cohorts"][number]["families"][number];

const metrics = {
  evaluated: { label: "Avaliada quando elegível", denominator: "eligible" },
  selected: { label: "Escolhida quando avaliada", denominator: "evaluated" },
  retained: { label: "Entregue no slot original quando escolhida", denominator: "selected" },
  delivered: { label: "Entregue ao final, incluindo substituições", denominator: "registered" },
  eligible: { label: "Elegível quando cadastrada", denominator: "registered" },
} as const;

function downloadReport(report: Report) {
  const cells = (row: (string | number)[]) => row.map(value => {
    const text = String(value);
    return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""') + '"';
  }).join(";");
  const rows: (string | number)[][] = [["Grupo", "Família", "Rodadas do grupo", "Cadastrada", "Elegível", "Avaliada", "Escolhida", "Entregue no slot original", "Entregue ao final"]];
  for (const cohort of report.cohorts) for (const f of cohort.families)
    rows.push([cohort.label, f.family, cohort.rounds, f.registered, f.eligible, f.evaluated, f.selected, f.retained, f.delivered]);
  const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map(cells).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "postspark-frequencia-dos-designs.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DesignFrequency() {
  const [rounds, setRounds] = useState(100);
  const [day, setDay] = useState("");
  const [group, setGroup] = useState("");
  const [metric, setMetric] = useState<keyof typeof metrics>("evaluated");
  const [ascending, setAscending] = useState(true);
  const before = day ? new Date(Date.parse(day + "T00:00:00Z") + 86_400_000).toISOString() : undefined;
  const query = trpc.generation.designFrequency.useQuery({ rounds, before }, {
    retry: false, staleTime: 60_000, refetchOnWindowFocus: false,
  });
  const report = query.data;
  const cohort = report?.cohorts.find(c => c.label === group) ?? report?.cohorts[0];
  const denominator = metrics[metric].denominator;
  const sortRows = (a: Family, b: Family) => {
    if (!a[denominator] || !b[denominator]) return Number(!a[denominator]) - Number(!b[denominator]) || a.family.localeCompare(b.family);
    const diff = a[metric] / a[denominator] - b[metric] / b[denominator];
    return (ascending ? diff : -diff) || b[denominator] - a[denominator] || a.family.localeCompare(b.family);
  };
  return <div>
    <label>Últimas rodadas encerradas
      <select value={rounds} onChange={e => setRounds(Number(e.target.value))}>
        {[25, 100, 250, 500].map(n => <option key={n}>{n}</option>)}
      </select>
    </label>
    <label>Pedidos criados até o dia (UTC)
      <input type="date" value={day} onChange={e => setDay(e.target.value)} />
    </label>
    <div className="sd-controls">
      <button disabled={query.isFetching} onClick={() => void query.refetch()}>Atualizar</button>
      {report?.cohorts.length ? <button onClick={() => downloadReport(report)}>Baixar CSV</button> : null}
    </div>
    {query.isLoading && <p role="status">Consultando rodadas encerradas…</p>}
    {query.error && <p role="alert">Não foi possível consultar a frequência dos designs.</p>}
    {report && <p>{report.sampled - report.skipped} de {report.sampled} rodadas com recibos de eleição por família.</p>}
    {cohort && <>
      <label>Grupo de comparação
        <select value={cohort.label} onChange={e => setGroup(e.target.value)}>
          {report!.cohorts.map(c => <option key={c.label}>{c.label}</option>)}
        </select>
      </label>
      <label>Indicador
        <select value={metric} onChange={e => setMetric(e.target.value as keyof typeof metrics)}>
          {(Object.keys(metrics) as (keyof typeof metrics)[]).map(k => <option value={k} key={k}>{metrics[k].label}</option>)}
        </select>
      </label>
      <button onClick={() => setAscending(!ascending)}>{ascending ? "Menor taxa primeiro" : "Maior taxa primeiro"}</button>
      <table className="sd-frequency"><caption>{cohort.rounds} rodadas · cada família conta uma vez por etapa e por pedido</caption>
        <thead><tr><th>Família</th><th>Rodadas</th><th>Taxa</th></tr></thead>
        <tbody>{[...cohort.families].sort(sortRows).map(f => <tr key={f.family}>
          <td>{f.family.replace(/^acervo82-/, "").replace(/^concept-/, "CON-").replace(/^reference-/, "REF-").toUpperCase()}</td>
          <td>{f[metric]} / {f[denominator]}</td><td>{f[denominator] ? (f[metric] / f[denominator]).toLocaleString("pt-BR", { style: "percent", maximumFractionDigits: 1 }) : "—"}</td>
        </tr>)}</tbody>
      </table>
    </>}
  </div>;
}
