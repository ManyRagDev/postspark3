import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Shield,
  Download,
  Trash2,
  Eye,
  Settings,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useConsent } from "@/components/ConsentModal";
import { useCookieConsent } from "@/components/CookieBanner";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * PrivacySettings - Área de Privacidade do Usuário
 *
 * Central de gestão de dados pessoais e direitos LGPD.
 * Funcionalidades: exportar, excluir, gerenciar consentimento, logs de atividade.
 *
 * Apenas para usuários autenticados.
 */

interface ActivityLog {
  id: string;
  action: string;
  timestamp: Date;
  ip?: string;
  metadata?: Record<string, unknown>;
}

export default function PrivacySettingsPage() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  // Redirect if not authenticated
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "oklch(0.04 0.06 280)" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "oklch(0.55 0.22 280)" }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to home
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
    return null;
  }

  // Queries
  const myDataQuery = trpc.privacy.getMyData.useQuery(undefined, {
    enabled: activeTab === "export"
  });

  // Mutations
  const exportDataMutation = trpc.privacy.exportData.useMutation({
    onSuccess: (data) => {
      // Create download link
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `postspark-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Dados exportados com sucesso!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao exportar dados");
    }
  });

  const requestDeletionMutation = trpc.privacy.requestDeletion.useMutation({
    onSuccess: () => {
      toast.success(
        "Solicitação enviada! Seus dados serão excluídos em 30 dias. " +
        "Você receberá um e-mail de confirmação."
      );
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao solicitar exclusão");
    }
  });

  const updateConsentMutation = trpc.privacy.updateConsent.useMutation({
    onSuccess: () => {
      toast.success("Preferências de privacidade atualizadas!");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar preferências");
    }
  });

  const consent = useConsent();
  const cookieConsent = useCookieConsent();

  const handleExportData = () => {
    exportDataMutation.mutate();
  };

  const handleRequestDeletion = () => {
    const confirmed = window.confirm(
      "Tem certeza que deseja solicitar a exclusão de sua conta e dados?\n\n" +
      "Esta ação:\n" +
      "• É irreversível após 30 dias\n" +
      "• Excluirá todos os seus posts e configurações\n" +
      "• Cancelará sua assinatura ativa\n\n" +
      "Você tem 30 dias para cancelar esta solicitação entrando em contato " +
      "com suporte@postspark.com"
    );
    if (confirmed) {
      requestDeletionMutation.mutate({ mode: "anonymize" });
    }
  };

  const handleToggleAIImprovements = (enabled: boolean) => {
    updateConsentMutation.mutate({ aiImprovements: enabled });
    // Update local consent
    consent.giveConsent(enabled);
  };

  const isLoading =
    myDataQuery.isLoading ||
    exportDataMutation.isPending ||
    requestDeletionMutation.isPending ||
    updateConsentMutation.isPending;

  return (
    <>
      <Helmet>
        <title>Minha Privacidade - PostSpark</title>
        <meta name="description" content="Gerencie seus dados e preferências de privacidade" />
      </Helmet>

      <div className="min-h-screen" style={{ backgroundColor: "oklch(0.04 0.06 280)" }}>
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-full"
                  style={{
                    background: "oklch(0.55 0.22 280 / 15%)",
                    border: "1px solid oklch(0.55 0.22 280 / 30%)"
                  }}
                >
                  <Shield className="w-6 h-6" style={{ color: "oklch(0.55 0.22 280)" }} />
                </div>
                <div>
                  <h1
                    className="text-2xl md:text-3xl font-bold"
                    style={{
                      fontFamily: "var(--font-display)",
                      color: "var(--text-primary)"
                    }}
                  >
                    Minha Privacidade
                  </h1>
                  <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                    Gerencie seus dados pessoais e preferências
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-4 mb-6 w-full glass">
                <TabsTrigger value="overview" className="data-[state=active]:text-thermal-orange">
                  <Eye className="w-4 h-4 mr-2" />
                  Visão Geral
                </TabsTrigger>
                <TabsTrigger value="export" className="data-[state=active]:text-thermal-orange">
                  <Download className="w-4 h-4 mr-2" />
                  Exportar
                </TabsTrigger>
                <TabsTrigger value="delete" className="data-[state=active]:text-thermal-orange">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </TabsTrigger>
                <TabsTrigger value="consent" className="data-[state=active]:text-thermal-orange">
                  <Settings className="w-4 h-4 mr-2" />
                  Consentimento
                </TabsTrigger>
              </TabsList>

              {/* Tab: Visão Geral */}
              <TabsContent value="overview" className="space-y-4">
                <GlassCard elevation="resting" className="p-6">
                  <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                    Resumo dos Seus Dados
                  </h2>

                  <div className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatCard
                        label="Posts Salvos"
                        value={myDataQuery.data?.postsCount ?? "..."}
                        icon={FileText}
                      />
                      <StatCard
                        label="Backgrounds"
                        value={myDataQuery.data?.backgroundsCount ?? "..."}
                        icon={FileText}
                      />
                      <StatCard
                        label="Gerações"
                        value={myDataQuery.data?.generationsCount ?? "..."}
                        icon={FileText}
                      />
                      <StatCard
                        label="Membro desde"
                        value={myDataQuery.data?.memberSince ?? "..."}
                        icon={Clock}
                      />
                    </div>

                    {/* Storage */}
                    <div className="glass p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                          Espaço utilizado
                        </span>
                        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          {myDataQuery.data?.storageUsed ?? "..."}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "oklch(0.1 0.04 280)" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: myDataQuery.data?.storagePercent ? `${Math.min(myDataQuery.data.storagePercent, 100)}%` : "0%",
                            background: "oklch(0.55 0.22 280)"
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard elevation="resting" className="p-6">
                  <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                    Seus Direitos (LGPD)
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <RightCard
                      title="Direito de Acesso"
                      description="Solicitar confirmação de tratamento e acesso aos seus dados"
                      available
                    />
                    <RightCard
                      title="Direito de Correção"
                      description="Solicitar correção de dados incompletos ou incorretos"
                      available
                    />
                    <RightCard
                      title="Direito de Eliminação"
                      description="Solicitar exclusão de dados desnecessários ou tratados em desconformidade"
                      available
                    />
                    <RightCard
                      title="Direito de Portabilidade"
                      description="Solicitar transferência de dados a outro fornecedor"
                      available
                    />
                    <RightCard
                      title="Direito de Oposição"
                      description="Opor-se a tratamento realizado com base em legítimo interesse"
                      available
                    />
                    <RightCard
                      title="Direito de Revogação"
                      description="Revogar consentimento a qualquer momento"
                      available
                    />
                  </div>
                  <p className="text-xs mt-4" style={{ color: "var(--text-tertiary)" }}>
                    Para exercer esses direitos, use as opções de Exportar e Excluir nesta página
                    ou entre em contato: privacidade@postspark.com
                  </p>
                </GlassCard>
              </TabsContent>

              {/* Tab: Exportar */}
              <TabsContent value="export" className="space-y-4">
                <GlassCard elevation="resting" className="p-6">
                  <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                    Exportar Seus Dados
                  </h2>

                  <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <p>
                      Você pode exportar todos os seus dados pessoais em formato JSON,
                      compatível com LGPD e GDPR.
                    </p>

                    <div className="glass p-4 rounded-lg">
                      <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                        O que será incluído:
                      </h3>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li>Dados de cadastro (nome, e-mail, data de criação)</li>
                        <li>Todos os posts salvos (com variações e edições)</li>
                        <li>Backgrounds personalizados</li>
                        <li>Histórico de gerações (sem prompts completos por segurança)</li>
                        <li>Dados de billing (plano, transações)</li>
                        <li>Logs de atividade recentes</li>
                      </ul>
                    </div>

                    <Button
                      onClick={handleExportData}
                      disabled={exportDataMutation.isPending || myDataQuery.isLoading}
                      className="w-full sm:w-auto"
                      style={{ background: "oklch(0.55 0.22 280)" }}
                    >
                      {exportDataMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Preparando...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Baixar Meus Dados
                        </>
                      )}
                    </Button>

                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      O arquivo pode demorar alguns minutos para ser preparado dependendo da
                      quantidade de dados. Você receberá um link de download por e-mail.
                    </p>
                  </div>
                </GlassCard>
              </TabsContent>

              {/* Tab: Excluir */}
              <TabsContent value="delete" className="space-y-4">
                <GlassCard elevation="resting" className="p-6 border-l-4" style={{ borderColor: "oklch(0.65 0.2 10)" }}>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                    <AlertTriangle className="w-5 h-5" style={{ color: "oklch(0.65 0.2 10)" }} />
                    Solicitar Exclusão de Conta
                  </h2>

                  <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <p>
                      Você pode solicitar a exclusão permanente de sua conta e todos os
                      dados associados. Esta ação segue o processo estabelecido pela LGPD:
                    </p>

                    <div className="space-y-3">
                      <StepCard
                        step={1}
                        title="Solicitação"
                        description="Você solicita a exclusão através desta página"
                      />
                      <StepCard
                        step={2}
                        title="Período de Reflexão"
                        description="30 dias para você cancelar a solicitação (envie e-mail para suporte@postspark.com)"
                      />
                      <StepCard
                        step={3}
                        title="Soft Delete"
                        description="Após 30 dias, seus dados são marcados para exclusão"
                      />
                      <StepCard
                        step={4}
                        title="Anonimização"
                        description="Posts são anonimizados (removemos identificação, mantemos conteúdo)"
                      />
                      <StepCard
                        step={5}
                        title="Hard Delete"
                        description="Após período adicional, dados são removidos permanentemente"
                      />
                    </div>

                    <div className="glass p-4 rounded-lg">
                      <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                        O que será excluído:
                      </h3>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li>Perfil de usuário (nome, e-mail, metadados)</li>
                        <li>Todos os posts salvos (ou anonimizados se preferir)</li>
                        <li>Backgrounds personalizados</li>
                        <li>Histórico de gerações e métricas</li>
                        <li>Dados de billing (mantidos por 5 anos por obrigação fiscal)</li>
                      </ul>
                    </div>

                    <div className="glass p-4 rounded-lg border border-oklch(from-red-500 to-red-500/0.2)">
                      <p className="text-xs">
                        <strong>Atenção:</strong> Esta ação é irreversível após o período de
                        reflexão de 30 dias. Baixe seus dados antes de prosseguir.
                      </p>
                    </div>

                    <Button
                      onClick={handleRequestDeletion}
                      disabled={requestDeletionMutation.isPending}
                      variant="destructive"
                      className="w-full sm:w-auto"
                      style={{ background: "oklch(0.65 0.2 10)" }}
                    >
                      {requestDeletionMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Solicitar Exclusão da Minha Conta
                        </>
                      )}
                    </Button>
                  </div>
                </GlassCard>
              </TabsContent>

              {/* Tab: Consentimento */}
              <TabsContent value="consent" className="space-y-4">
                <GlassCard elevation="resting" className="p-6">
                  <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                    Gerenciar Consentimento
                  </h2>

                  <div className="space-y-6">
                    {/* LGPD Consent */}
                    <div className="flex items-start justify-between py-4 border-b" style={{ borderColor: "oklch(1 0 0 / 6%)" }}>
                      <div className="flex-1">
                        <h3 className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                          Consentimento LGPD
                        </h3>
                        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          Consentimento para tratamento de dados pessoais conforme Lei nº 13.709/2018.
                          Necessário para usar o PostSpark.
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                          <CheckCircle2 className="w-3 h-3" style={{ color: "oklch(0.6 0.25 40)" }} />
                          Aceito em {consent.consent?.timestamp
                            ? new Date(consent.consent.timestamp).toLocaleDateString("pt-BR")
                            : "N/A"}
                        </div>
                      </div>
                      <Switch
                        checked={consent.consent?.given ?? false}
                        disabled={true}
                      />
                    </div>

                    {/* AI Improvements */}
                    <div className="flex items-start justify-between py-4 border-b" style={{ borderColor: "oklch(1 0 0 / 6%)" }}>
                      <div className="flex-1">
                        <h3 className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                          Melhorias de IA
                        </h3>
                        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          Permitir uso de dados anonimizados para treinar e melhorar nossos modelos de IA.
                          Opcional e pode ser revogado a qualquer momento.
                        </p>
                        <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
                          Se desabilitado, seus dados não serão usados para treinamento de modelos.
                        </p>
                      </div>
                      <Switch
                        checked={consent.consent?.aiImprovements ?? false}
                        onCheckedChange={handleToggleAIImprovements}
                        disabled={updateConsentMutation.isPending}
                      />
                    </div>

                    {/* Cookies Consent */}
                    <div className="flex items-start justify-between py-4 border-b" style={{ borderColor: "oklch(1 0 0 / 6%)" }}>
                      <div className="flex-1">
                        <h3 className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                          Cookies de Analytics
                        </h3>
                        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          Permitir cookies de analytics para entender como você usa o serviço.
                          Opcional.
                        </p>
                      </div>
                      <Switch
                        checked={cookieConsent.consent?.accepted ?? false}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            cookieConsent.acceptCookies();
                          } else {
                            // Revoke by removing consent
                            localStorage.removeItem("postspark_cookie_consent");
                            // Force refresh to apply changes
                            window.location.reload();
                          }
                        }}
                      />
                    </div>

                    {/* Info */}
                    <div className="glass p-4 rounded-lg">
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        Você pode exercer seus direitos de acesso, correção e exclusão através das
                        abas <strong>Exportar</strong> e <strong>Excluir</strong>, ou entrando
                        em contato com privacidade@postspark.com.
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </>
  );
}

// Helper components
function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div className="glass p-4 rounded-lg text-center">
      <Icon className="w-5 h-5 mx-auto mb-2" style={{ color: "oklch(0.55 0.22 280)" }} />
      <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
    </div>
  );
}

function RightCard({ title, description, available }: { title: string; description: string; available: boolean }) {
  return (
    <div className="glass p-4 rounded-lg">
      <div className="flex items-start gap-3">
        {available ? (
          <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.6 0.25 40)" }} />
        ) : (
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.65 0.2 10)" }} />
        )}
        <div>
          <h3 className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
            {title}
          </h3>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function StepCard({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div
        className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium"
        style={{
          background: "oklch(0.55 0.22 280)",
          color: "oklch(0.98 0.01 280)"
        }}
      >
        {step}
      </div>
      <div>
        <h3 className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          {description}
        </p>
      </div>
    </div>
  );
}
