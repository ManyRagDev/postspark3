import { trpc } from "@/lib/trpc";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Filter,
  Search,
  Calendar,
  Zap,
  Coins,
  Sparkles,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type StatusFilter = "all" | "completed" | "failed";
type TimeFilter = "all" | "today" | "week" | "month";

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={16} className="text-green-500" />;
    case "failed":
      return <XCircle size={16} className="text-red-500" />;
    default:
      return <Loader2 size={16} className="text-yellow-500 animate-spin" />;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "completed":
      return "Concluído";
    case "failed":
      return "Falhou";
    default:
      return "Em andamento";
  }
}

function getPlatformLabel(platform: string) {
  const labels: Record<string, string> = {
    instagram: "Instagram",
    twitter: "Twitter/X",
    linkedin: "LinkedIn",
    facebook: "Facebook",
  };
  return labels[platform] || platform;
}

function getPostModeLabel(postMode: string) {
  const labels: Record<string, string> = {
    static: "Estático",
    carousel: "Carrossel",
    story: "Story",
    ad: "Anúncio",
  };
  return labels[postMode] || postMode;
}

function truncateText(text: string, maxLength: number = 80): string {
  if (!text) return "-";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Agora";
  if (diffMins < 60) return `${diffMins}m atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: date.getFullYear() !== now.getFullYear() ? "2-digit" : undefined,
  });
}

function filterByTime(generations: any[], timeFilter: TimeFilter): any[] {
  if (timeFilter === "all") return generations;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const monthAgo = new Date(today.getTime() - 30 * 86400000);

  return generations.filter((gen) => {
    const genDate = new Date(gen.createdAt);
    switch (timeFilter) {
      case "today":
        return genDate >= today;
      case "week":
        return genDate >= weekAgo;
      case "month":
        return genDate >= monthAgo;
      default:
        return true;
    }
  });
}

export default function History() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: generations, isLoading, refetch } = trpc.post.listGenerations.useQuery(
    { limit: 100 },
    {
      refetchOnWindowFocus: false,
    },
  );

  const filteredGenerations = generations
    ? filterByTime(generations, timeFilter)
        .filter((gen) => {
          // Status filter
          if (statusFilter !== "all" && gen.status !== statusFilter) {
            return false;
          }

          // Search filter
          if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            const inputContent = gen.input_content?.toLowerCase() || "";
            const platform = gen.platform?.toLowerCase() || "";
            return inputContent.includes(query) || platform.includes(query);
          }

          return true;
        })
    : [];

  const completedCount = generations?.filter((g) => g.status === "completed").length || 0;
  const failedCount = generations?.filter((g) => g.status === "failed").length || 0;

  const handleRestore = async (generation: any) => {
    if (!generation.output_snapshot) {
      toast.error("Esta geração não possui dados para restaurar.");
      return;
    }

    try {
      // Parse output_snapshot to get variations
      const outputData =
        typeof generation.output_snapshot === "string"
          ? JSON.parse(generation.output_snapshot)
          : generation.output_snapshot;

      const variations = outputData?.variations || outputData;

      if (!variations || !Array.isArray(variations) || variations.length === 0) {
        toast.error("Nenhuma variação encontrada nesta geração.");
        return;
      }

      // Store in sessionStorage for restoration in Home/TheVoid
      sessionStorage.setItem("restoredGeneration", JSON.stringify(variations));
      sessionStorage.setItem("restoredGenerationMeta", JSON.stringify({
        id: generation.id,
        platform: generation.platform,
        postMode: generation.post_mode,
        createdAt: generation.createdAt,
      }));

      toast.success("Geração restaurada! Você pode editar as variações.");
      setLocation("/thevoid");
    } catch (error) {
      console.error("[History] Failed to restore generation:", error);
      toast.error("Falha ao restaurar geração.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Clock size={24} className="text-primary" />
              <div>
                <h1 className="text-xl font-semibold">Histórico de Gerações</h1>
                <p className="text-sm text-muted-foreground">
                  {generations?.length || 0} gerações no total
                </p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
              disabled={isLoading}
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por conteúdo ou plataforma..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background">
            <Filter size={16} className="text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="all">Todos os status</option>
              <option value="completed">Concluídos ({completedCount})</option>
              <option value="failed">Falharam ({failedCount})</option>
            </select>
          </div>

          {/* Time Filter */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background">
            <Calendar size={16} className="text-muted-foreground" />
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="all">Todo o período</option>
              <option value="today">Hoje</option>
              <option value="week">Últimos 7 dias</option>
              <option value="month">Últimos 30 dias</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-muted-foreground" />
          </div>
        ) : filteredGenerations.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex p-4 rounded-full bg-muted mb-4">
              {searchQuery || statusFilter !== "all" || timeFilter !== "all" ? (
                <Search size={32} className="text-muted-foreground" />
              ) : (
                <Clock size={32} className="text-muted-foreground" />
              )}
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery || statusFilter !== "all" || timeFilter !== "all"
                ? "Nenhuma geração encontrada"
                : "Nenhuma geração ainda"}
            </h3>
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== "all" || timeFilter !== "all"
                ? "Tente ajustar os filtros ou a busca"
                : "Suas gerações aparecerão aqui"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGenerations.map((generation) => {
              const outputData =
                typeof generation.output_snapshot === "string"
                  ? JSON.parse(generation.output_snapshot)
                  : generation.output_snapshot;
              const variationCount = outputData?.variations?.length || 0;

              return (
                <div
                  key={generation.id}
                  className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Status & Timestamp */}
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-1.5 text-sm">
                          {getStatusIcon(generation.status)}
                          <span className="text-muted-foreground">
                            {getStatusLabel(generation.status)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(generation.createdAt)}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {getPlatformLabel(generation.platform)}
                        </span>
                      </div>

                      {/* Input Preview */}
                      <div className="mb-2">
                        <p className="text-sm line-clamp-2">
                          {truncateText(generation.input_content, 120)}
                        </p>
                      </div>

                      {/* Metadata */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText size={12} />
                          {getPostModeLabel(generation.post_mode)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap size={12} />
                          {generation.latency_ms != null
                            ? `${Math.round(generation.latency_ms / 1000)}s`
                            : "-"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Coins size={12} />
                          {generation.total_tokens || 0} tokens
                        </span>
                        {generation.status === "completed" && variationCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Sparkles size={12} />
                            {variationCount} variaç{variationCount === 1 ? "ão" : "ões"}
                          </span>
                        )}
                        {generation.estimated_cost_usd != null && generation.estimated_cost_usd > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="text-green-600">
                              ${(generation.estimated_cost_usd * 100).toFixed(2)}¢
                            </span>
                          </span>
                        )}
                      </div>

                      {/* Error message if failed */}
                      {generation.status === "failed" && generation.error_message && (
                        <div className="mt-2 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                          <span className="line-clamp-1">
                            {generation.error_message}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {generation.status === "completed" && generation.output_snapshot && (
                      <button
                        onClick={() => handleRestore(generation)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium shrink-0"
                      >
                        <RefreshCw size={14} />
                        Recuperar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
