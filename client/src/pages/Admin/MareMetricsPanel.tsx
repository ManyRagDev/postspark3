import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const names: Record<string, string> = {
  edit: "Edição por comando",
  narration: "Narração",
  render: "Exportação de slide",
  firstCut: "Primeiro corte",
  review: "Revisão editorial",
};

export function MareMetricsPanel() {
  const query = trpc.admin.getMareMetrics.useQuery(undefined, { retry: false });
  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader>
        <CardTitle>Maré Studio · últimos 7 dias</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {query.isLoading ? (
          "Carregando…"
        ) : query.error ? (
          "Métricas indisponíveis."
        ) : !query.data?.operations.length ? (
          "Nenhuma operação no período."
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Operação",
                  "Entregas",
                  "Em andamento",
                  "Falhas",
                  "Sparks cobrados",
                  "Custo conhecido (US$)",
                  "Trabalhos com custo",
                  "P95 de execução",
                ].map(label => (
                  <th className="p-2" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.operations.map(row => (
                <tr key={row.operation} className="border-t border-white/10">
                  {[
                    names[row.operation] ?? row.operation,
                    row.delivered,
                    row.pending,
                    row.failed,
                    row.charged_sparks,
                    row.provider_cost_usd == null
                      ? "—"
                      : Number(row.provider_cost_usd).toLocaleString("pt-BR", {
                          maximumFractionDigits: 6,
                        }),
                    row.measured_jobs + " / " + row.jobs,
                    row.p95_seconds == null ? "—" : row.p95_seconds + " s",
                  ].map((cell, i) => (
                    <td className="p-2" key={i}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {query.data?.storage && (
          <p className="mt-4 text-xs text-muted-foreground">
            Mídia armazenada ·{" "}
            {(Number(query.data.storage.asset_bytes) / 1048576).toLocaleString(
              "pt-BR",
              { maximumFractionDigits: 1 }
            )}{" "}
            MiB. Tráfego pelo proxy em 7 dias ·{" "}
            {(
              Number(query.data.storage.proxied_bytes) / 1048576
            ).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{" "}
            MiB. Acessos por URL assinada · {query.data.storage.signed_reads}.
            Os bytes desses acessos são medidos no Storage.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
