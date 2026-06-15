import { trpc as trpcHooks } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";

export default function Admin() {
    const profilesQuery = trpcHooks.admin.listProfiles.useQuery();
    const statsQuery = trpcHooks.admin.getStats.useQuery();
    const generationMetricsQuery = trpcHooks.admin.getGenerationMetrics.useQuery({
        windowDays: 7,
    });
    const aiRolloutQuery = trpcHooks.admin.getAiRollout.useQuery();

    const formattedProfiles = useMemo(() => {
        if (!profilesQuery.data) return [];
        return profilesQuery.data.map((p: any) => ({
            ...p,
            dateFormatted: new Date(p.created_at).toLocaleDateString("pt-BR"),
        }));
    }, [profilesQuery.data]);

    const generationMetrics = generationMetricsQuery.data;
    const metricCards = generationMetrics ? [
        { label: "Runs", value: generationMetrics.totalRuns.toLocaleString("pt-BR") },
        { label: "Conclusão", value: `${(generationMetrics.completionRate * 100).toFixed(1)}%` },
        { label: "Aceitação", value: `${(generationMetrics.candidateAcceptanceRate * 100).toFixed(1)}%` },
        { label: "Nota média", value: generationMetrics.averageQualityScore.toFixed(1) },
        { label: "Revisão", value: `${(generationMetrics.revisionRate * 100).toFixed(1)}%` },
        { label: "Fallback", value: `${(generationMetrics.fallbackRate * 100).toFixed(1)}%` },
        { label: "P95", value: `${Math.round(generationMetrics.p95LatencyMs)} ms` },
        { label: "Custo estimado", value: generationMetrics.estimatedCostUsd.toLocaleString("pt-BR", { style: "currency", currency: "USD" }) },
    ] : [];

    return (
        <div className="min-h-screen p-8 pt-24" style={{ backgroundColor: "oklch(0.04 0.06 280)" }}>
            <div className="max-w-6xl mx-auto space-y-8">
                <header className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Painel Admin</h1>
                        <p className="text-muted-foreground mt-2">Gerenciamento de usuários e plataforma PostSpark.</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-md">
                        <span className="text-xs uppercase text-muted-foreground font-semibold block mb-1">Total de Usuários</span>
                        <span className="text-2xl font-mono text-cyan-400">
                            {statsQuery.isLoading ? "..." : statsQuery.data?.totalUsers}
                        </span>
                    </div>
                </header>

                <Card className="border-white/10 bg-white/5 backdrop-blur-lg">
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <CardTitle className="text-xl">Qualidade da IA · últimos 7 dias</CardTitle>
                            <div className="flex flex-wrap gap-1.5">
                                {aiRolloutQuery.data && Object.entries(aiRolloutQuery.data).map(([key, enabled]) => (
                                    <Badge
                                        key={key}
                                        variant="outline"
                                        className={enabled
                                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                                            : "border-slate-500/40 bg-slate-500/10 text-slate-400"}
                                    >
                                        {key}: {enabled ? "on" : "off"}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {generationMetricsQuery.isLoading ? (
                            <div className="h-24 animate-pulse rounded-xl bg-white/5" />
                        ) : generationMetricsQuery.error ? (
                            <p className="text-sm text-red-300">
                                Não foi possível carregar as métricas de geração.
                            </p>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {metricCards.map((metric) => (
                                    <div key={metric.label} className="rounded-xl border border-white/10 bg-black/20 p-4">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            {metric.label}
                                        </span>
                                        <p className="mt-2 text-xl font-mono text-cyan-300">{metric.value}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/5 backdrop-blur-lg overflow-hidden">
                    <CardHeader>
                        <CardTitle className="text-xl">Usuários Cadastrados</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {profilesQuery.isLoading ? (
                            <div className="flex justify-center py-12">
                                <div className="animate-spin text-2xl text-cyan-500">✦</div>
                            </div>
                        ) : (
                            <div className="rounded-md border border-white/10">
                                <Table>
                                    <TableHeader className="bg-white/5">
                                        <TableRow className="border-white/10 hover:bg-transparent">
                                            <TableHead>E-mail</TableHead>
                                            <TableHead>ID</TableHead>
                                            <TableHead>Plano</TableHead>
                                            <TableHead>Saldo Sparks</TableHead>
                                            <TableHead>Data</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {formattedProfiles.map((profile: any) => (
                                            <TableRow key={profile.id} className="border-white/10 hover:bg-white/5 transition-colors">
                                                <TableCell className="font-medium text-cyan-50/90">{profile.email}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground font-mono">
                                                    {profile.id.substring(0, 8)}...
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="outline"
                                                        className={`
                              ${profile.plan === 'DEV' ? 'border-amber-400/50 text-amber-400 bg-amber-400/10' : ''}
                              ${profile.plan === 'FREE' ? 'border-slate-500/50 text-slate-400 bg-slate-500/10' : ''}
                              ${['PRO', 'AGENCY'].includes(profile.plan) ? 'border-cyan-400/50 text-cyan-400 bg-cyan-400/10' : ''}
                            `}
                                                    >
                                                        {profile.plan}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-mono text-cyan-300">
                                                    {profile.sparks} <span className="text-[10px] text-muted-foreground">✨</span>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground text-sm">
                                                    {profile.dateFormatted}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        .glass-card {
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
      `}} />
        </div>
    );
}
