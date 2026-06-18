import { Helmet } from "react-helmet-async";
import { Shield, Mail, ExternalLink, AlertCircle, Trash2, Download, Eye, Lock } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";

/**
 * Página de Política de Privacidade - PostSpark 3
 *
 * Documento legal em conformidade com:
 * - Lei Geral de Proteção de Dados (LGPD) - Lei nº 13.709/2018
 * - Regulamento Geral sobre a Proteção de Dados (GDPR) - Regulamento (UE) 2016/679
 * - Marco Civil da Internet - Lei nº 12.965/2014
 *
 * Última atualização: 18 de junho de 2026
 */

export default function Privacy() {
  const effectiveDate = new Date("2026-06-18").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  return (
    <>
      <Helmet>
        <title>Política de Privacidade - PostSpark</title>
        <meta name="description" content="Política de Privacidade do PostSpark conforme LGPD e GDPR" />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <div className="min-h-screen flex items-center justify-center p-4 md:p-8" style={{ backgroundColor: "oklch(0.04 0.06 280)" }}>
        <div className="max-w-4xl w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{
              background: "oklch(0.55 0.22 280 / 10%)",
              border: "1px solid oklch(1 0 0 / 8%)"
            }}>
              <Shield className="w-8 h-8" style={{ color: "oklch(0.55 0.22 280)" }} />
            </div>
            <h1
              className="text-3xl md:text-4xl font-bold mb-2"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              Política de Privacidade
            </h1>
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Vigente desde {effectiveDate}
            </p>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid grid-cols-4 mb-6 w-full glass">
              <TabsTrigger value="overview" className="data-[state=active]:text-thermal-orange">
                <Eye className="w-4 h-4 mr-2" />
                Visão Geral
              </TabsTrigger>
              <TabsTrigger value="collection" className="data-[state=active]:text-thermal-orange">
                <Download className="w-4 h-4 mr-2" />
                Coleta
              </TabsTrigger>
              <TabsTrigger value="usage" className="data-[state=active]:text-thermal-orange">
                <Lock className="w-4 h-4 mr-2" />
                Uso
              </TabsTrigger>
              <TabsTrigger value="rights" className="data-[state=active]:text-thermal-orange">
                <Trash2 className="w-4 h-4 mr-2" />
                Direitos
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Visão Geral */}
            <TabsContent value="overview" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  1. Identificação do Controlador
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    <strong>Responsável pelo tratamento de dados:</strong> ManyLabs Brasil Tecnologia Ltda.
                  </p>
                  <p>
                    <strong>CNPJ:</strong> [A ser preenchido upon constituição formal]
                  </p>
                  <p>
                    <strong>Endereço eletrônico para contato:</strong> privacidade@postspark.com
                  </p>
                  <p>
                    <strong>Endereço físico:</strong> [A ser preenchido upon constituição formal]
                  </p>
                  <div className="glass p-4 rounded-lg mt-4 border-l-4" style={{ borderColor: "oklch(0.55 0.22 280)" }}>
                    <p className="text-xs">
                      <strong>Nota:</strong> Esta política aplica-se a todos os usuários do PostSpark,
                      sejam eles pessoas físicas ou jurídicas, localizados no território brasileiro ou no exterior.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  2. Base Legal e Âmbito de Aplicação
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    O tratamento de dados pessoais realizado pelo PostSpark fundamenta-se nas seguintes bases legais,
                    conforme o <strong>artigo 7º da Lei nº 13.709/2018 (LGPD)</strong>:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>
                      <strong>Consentimento (inciso I):</strong> Quando você consente expressamente com o tratamento
                      de dados específicos, como para uso de dados em melhorias de nossos modelos de IA.
                    </li>
                    <li>
                      <strong>Execução de contrato (inciso IV):</strong> Para fornecer os serviços contratados,
                      incluindo geração de posts, armazenamento e billing.
                    </li>
                    <li>
                      <strong>Legítimo interesse (inciso IX):</strong> Para fins de segurança, prevenção de fraude,
                      melhoria de serviços eanalytics básico, sempre respeitando seus direitos e liberdades fundamentais.
                    </li>
                  </ul>
                  <div className="glass p-4 rounded-lg mt-4 border-l-4" style={{ borderColor: "oklch(0.6 0.2 25)" }}>
                    <p className="text-xs">
                      <strong>Transferências internacionais:</strong> Dados podem ser processados por servidores
                      localizados fora do Brasil, especialmente para serviços de IA (OpenAI, Google, Groq).
                      Essas transferências são realizadas com base em cláusulas contratuais-padrão aprovadas
                      pela ANPD e conformes ao GDPR.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  3. Retenção e Eliminação de Dados
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Os dados pessoais são retidos apenas pelo período necessário para cumprir as finalidades
                    para as quais foram coletados, em observância aos princípios de minimização e duração limitada
                    (artigos 6º e 15º da LGPD):
                  </p>
                  <table className="w-full text-xs mt-3">
                    <thead>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                        <th className="text-left py-2">Tipo de Dado</th>
                        <th className="text-left py-2">Período de Retenção</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Posts e conteúdo gerado</td>
                        <td className="py-2">1 ano após cancelamento</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Dados de navegação/URLs</td>
                        <td className="py-2">30 dias após processamento</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Métricas de geração (sem conteúdo)</td>
                        <td className="py-2">90 dias</td>
                      </tr>
                      <tr>
                        <td className="py-2">Dados de billing/financeiro</td>
                        <td className="py-2">5 anos (obrigação fiscal)</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="glass p-4 rounded-lg mt-4 border-l-4" style={{ borderColor: "oklch(0.65 0.2 10)" }}>
                    <p className="text-xs">
                      <strong>Anonimização:</strong> Ao solicitar exclusão, seus posts podem ser anonimizados
                      (remoção de dados pessoais mas manutenção do conteúdo) para fins estatísticos e de melhoria
                      dos serviços. Você pode optar pela exclusão completa permanente.
                    </p>
                  </div>
                </div>
              </GlassCard>
            </TabsContent>

            {/* Tab 2: Coleta */}
            <TabsContent value="collection" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  4. Dados Coletados
                </h2>

                <div className="space-y-6">
                  {/* Dados Pessoais */}
                  <div>
                    <h3 className="text-lg font-medium mb-3" style={{ color: "var(--text-primary)" }}>
                      4.1 Dados Pessoais Identificáveis
                    </h3>
                    <div className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>Coletamos os seguintes dados pessoais fornecidos diretamente por você:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Nome completo</strong> - Exibido na interface e personalização</li>
                        <li><strong>Endereço de e-mail</strong> - Autenticação, comunicação e billing</li>
                        <li><strong>UUID (Identificador Único)</strong> - Gerado automaticamente pelo Supabase Auth</li>
                        <li><strong>Foto de perfil (opcional)</strong> - Via Google OAuth</li>
                      </ul>
                      <div className="glass p-3 rounded-lg mt-2">
                        <p className="text-xs">
                          <strong>Fonte:</strong> Coleta direta do usuário no momento do cadastro/login.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dados de Conteúdo */}
                  <div>
                    <h3 className="text-lg font-medium mb-3" style={{ color: "var(--text-primary)" }}>
                      4.2 Dados de Conteúdo Criado
                    </h3>
                    <div className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>Armazenamos todo o conteúdo que você cria ou fornece:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Posts gerados</strong> - Texto, layout, cores, legendas, hashtags</li>
                        <li><strong>Background assets</strong> - Imagens geradas ou uploadadas</li>
                        <li><strong>Execution briefs</strong> - Briefings estruturados para geração</li>
                        <li><strong>Variações descartadas</strong> - Temporariamente durante sessão de geração</li>
                        <li><strong>Ajustes manuais</strong> - Edições feitas no Workbench</li>
                      </ul>
                      <div className="glass p-3 rounded-lg mt-2">
                        <p className="text-xs">
                          <strong>Nota:</strong> O conteúdo dos prompts não é armazenado em texto puro
                          por padrão. Utilizamos hash para rastreamento e métricas.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dados de Navegação */}
                  <div>
                    <h3 className="text-lg font-medium mb-3" style={{ color: "var(--text-primary)" }}>
                      4.3 Dados de Navegação e URLs
                    </h3>
                    <div className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>Quando você fornece uma URL para análise:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>URL completa</strong> - Para acessar o site</li>
                        <li><strong>Screenshots</strong> - Capturadas via serviço de screenshot externo</li>
                        <li><strong>Conteúdo textual extraído</strong> - Até 10.000 caracteres da homepage</li>
                        <li><strong>Brand DNA</strong> - Paleta de cores, tipografia, padrões visuais</li>
                        <li><strong>Site Intelligence</strong> - Análise de negócio, público e objetivos</li>
                      </ul>
                      <div className="glass p-3 rounded-lg mt-2 border-l-4" style={{ borderColor: "oklch(0.65 0.2 10)" }}>
                        <p className="text-xs">
                          <strong>Responsabilidade:</strong> Ao fornecer uma URL, você garante que tem
                          autorização para analisar o site e que o conteúdo não viola direitos de terceiros.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dados de Billing */}
                  <div>
                    <h3 className="text-lg font-medium mb-3" style={{ color: "var(--text-primary)" }}>
                      4.4 Dados de Pagamento e Billing
                    </h3>
                    <div className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>Dados financeiros são processados via <strong>Stripe</strong>:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Plano assinado</strong> - FREE, PRO ou AGENCY</li>
                        <li><strong>Status de assinatura</strong> - Ativa, trial, cancelada, past_due</li>
                        <li><strong>Transações</strong> - Pagamentos, reembolsos, top-ups</li>
                        <li><strong>Sparks saldo</strong> - Créditos disponíveis e histórico de débito</li>
                      </ul>
                      <div className="glass p-3 rounded-lg mt-2">
                        <p className="text-xs">
                          <strong>Segurança:</strong> Dados de cartão de crédito não são armazenados
                          em nossos servidores. Todo o processamento é realizado pelo Stripe, PCI-DSS compliant.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dados Técnicos */}
                  <div>
                    <h3 className="text-lg font-medium mb-3" style={{ color: "var(--text-primary)" }}>
                      4.5 Dados Técnicos e de Operação
                    </h3>
                    <div className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>Coletamos automaticamente os seguintes dados técnicos:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Logs de acesso</strong> - IP aproximado, user-agent, timestamp</li>
                        <li><strong>Métricas de geração</strong> - Modelo usado, tokens, latência, custo (sem conteúdo)</li>
                        <li><strong>Eventos de navegação</strong> - Page views, sessões, eventos de clique</li>
                        <li><strong>Erros e crashes</strong> - Para melhoria da estabilidade</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </TabsContent>

            {/* Tab 3: Uso e Compartilhamento */}
            <TabsContent value="usage" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  5. Finalidades do Tratamento
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>Utilizamos seus dados para as seguintes finalidades:</p>
                  <table className="w-full text-xs mt-3">
                    <thead>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                        <th className="text-left py-2">Finalidade</th>
                        <th className="text-left py-2">Base Legal</th>
                        <th className="text-left py-2">Dados Utilizados</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Fornecimento dos serviços contratados</td>
                        <td className="py-2">Execução de contrato</td>
                        <td className="py-2">Todos os dados necessários</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Autenticação e segurança</td>
                        <td className="py-2">Legítimo interesse</td>
                        <td className="py-2">E-mail, UUID, logs</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Processamento de pagamentos</td>
                        <td className="py-2">Execução de contrato</td>
                        <td className="py-2">Dados de billing (via Stripe)</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Geração de conteúdo por IA</td>
                        <td className="py-2">Execução de contrato</td>
                        <td className="py-2">Inputs de geração, Brand DNA</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Melhoria dos modelos de IA</td>
                        <td className="py-2">Consentimento (opcional)</td>
                        <td className="py-2">Conteúdo anonimizado</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Analytics básico</td>
                        <td className="py-2">Legítimo interesse</td>
                        <td className="py-2">Page views, sessões agregadas</td>
                      </tr>
                      <tr>
                        <td className="py-2">Comunicação sobre o serviço</td>
                        <td className="py-2">Legítimo interesse</td>
                        <td className="py-2">E-mail</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  6. Compartilhamento com Terceiros
                </h2>
                <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>Compartilhamos dados apenas nas seguintes hipóteses:</p>

                  <div className="space-y-3">
                    <div className="glass p-4 rounded-lg">
                      <h4 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                        6.1 Provedores de Serviços Essenciais
                      </h4>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li><strong>Supabase</strong> - Autenticação e banco de dados (EU/US)</li>
                        <li><strong>Stripe</strong> - Processamento de pagamentos (US/EU)</li>
                        <li><strong>Serviço de Screenshot</strong> - Captura de sites para análise</li>
                      </ul>
                    </div>

                    <div className="glass p-4 rounded-lg">
                      <h4 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                        6.2 Serviços de Inteligência Artificial
                      </h4>
                      <p className="text-xs mb-2">
                        Seus inputs podem ser processados por:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li><strong>OpenRouter</strong> - Agregador de modelos (OpenAI, Anthropic, etc)</li>
                        <li><strong>Groq</strong> - Modelos de linguagem e visão</li>
                        <li><strong>Google (Gemini)</strong> - Modelos multimodais e embeddings</li>
                        <li><strong>Pollinations</strong> - Geração de imagens (fallback)</li>
                      </ul>
                      <div className="mt-2 p-2 rounded" style={{ background: "oklch(0.65 0.2 10 / 10%)" }}>
                        <p className="text-xs">
                          <strong>Política de IA:</strong> Alguns provedores podem usar inputs para
                          treinamento de seus modelos. Verifique as políticas de OpenAI, Google e Groq
                          para mais detalhes. Isso pode ser desabilitado nas configurações de privacidade.
                        </p>
                      </div>
                    </div>

                    <div className="glass p-4 rounded-lg">
                      <h4 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                        6.3 Obrigações Legais
                      </h4>
                      <p className="text-xs">
                        Podemos compartilhar dados quando compelidos por ordem judicial, requisição
                        administrativa ou para cumprir obrigações legais. Nessas situações, tomamos
                        todas as medidas possíveis para notificar o titular previamente, salvo quando
                        proibido por lei.
                      </p>
                    </div>

                    <div className="glass p-4 rounded-lg">
                      <h4 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                        6.4 Transferência em Caso de Negócio
                      </h4>
                      <p className="text-xs">
                        Em caso de fusão, aquisição ou venda de ativos, seus dados podem ser transferidos
                        para o novo controlador, garantindo o mesmo nível de proteção.
                      </p>
                    </div>
                  </div>

                  <div className="glass p-4 rounded-lg mt-4 border-l-4" style={{ borderColor: "oklch(0.6 0.25 40)" }}>
                    <p className="text-xs">
                      <strong>Não vendemos dados pessoais</strong> a terceiros para fins de marketing
                      ou publicidade. Todas as transferências são estritamente necessárias para
                      operação do serviço ou cumprimento legal.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  7. Cookies e Tecnologias Similares
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Utilizamos cookies e tecnologias similares para:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>Cookies essenciais:</strong> Sessão de autenticação, preferências básicas</li>
                    <li><strong>Cookies de analytics:</strong> Page views, sessões, origem de tráfego</li>
                  </ul>
                  <p className="text-xs mt-2">
                    Consulte nossa <Link href="/cookies" className="underline">Política de Cookies</Link>
                    para mais detalhes. Você pode gerenciar preferências através do banner de cookies
                    ou nas configurações do navegador.
                  </p>
                </div>
              </GlassCard>
            </TabsContent>

            {/* Tab 4: Direitos do Titular */}
            <TabsContent value="rights" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  8. Direitos do Titular
                </h2>
                <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Conforme os <strong>artigos 17 a 22 da LGPD</strong>, você possui os seguintes direitos:
                  </p>

                  <div className="space-y-3">
                    <div className="glass p-4 rounded-lg flex items-start gap-3">
                      <Eye className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.55 0.22 280)" }} />
                      <div>
                        <h4 className="font-medium" style={{ color: "var(--text-primary)" }}>
                          8.1 Direito de Acesso (Art. 18, I)
                        </h4>
                        <p className="text-xs mt-1">
                          Solicitar confirmação de tratamento e acesso aos seus dados pessoais.
                          Disponível em <Link href="/privacy-settings" className="underline">Privacidade {"->"} Exportar Dados</Link>.
                        </p>
                      </div>
                    </div>

                    <div className="glass p-4 rounded-lg flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.6 0.25 40)" }} />
                      <div>
                        <h4 className="font-medium" style={{ color: "var(--text-primary)" }}>
                          8.2 Direito de Correção (Art. 18, II)
                        </h4>
                        <p className="text-xs mt-1">
                          Solicitar correção de dados incompletos, inexatos ou desatualizados.
                          Contacte: privacidade@postspark.com
                        </p>
                      </div>
                    </div>

                    <div className="glass p-4 rounded-lg flex items-start gap-3">
                      <Trash2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.65 0.2 10)" }} />
                      <div>
                        <h4 className="font-medium" style={{ color: "var(--text-primary)" }}>
                          8.3 Direito de Eliminação (Art. 18, III)
                        </h4>
                        <p className="text-xs mt-1">
                          Solicitar exclusão de dados desnecessários, excessivos ou tratados em
                          desconformidade. Disponível em <Link href="/privacy-settings" className="underline">Privacidade {">"} Solicitar Exclusão</Link>.
                        </p>
                        <p className="text-xs mt-2">
                          <strong>Modalidades:</strong> Anonimização de conteúdo (posts mantidos sem identificação)
                          ou exclusão completa permanente.
                        </p>
                      </div>
                    </div>

                    <div className="glass p-4 rounded-lg flex items-start gap-3">
                      <Download className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.55 0.22 280)" }} />
                      <div>
                        <h4 className="font-medium" style={{ color: "var(--text-primary)" }}>
                          8.4 Direito de Portabilidade (Art. 18, V)
                        </h4>
                        <p className="text-xs mt-1">
                          Solicitar transferência de dados a outro fornecedor. Disponível em
                          <Link href="/privacy-settings" className="underline">Privacidade {">"} Exportar Dados</Link>.
                        </p>
                      </div>
                    </div>

                    <div className="glass p-4 rounded-lg flex items-start gap-3">
                      <Lock className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.55 0.22 280)" }} />
                      <div>
                        <h4 className="font-medium" style={{ color: "var(--text-primary)" }}>
                          8.5 Direito de Oposição (Art. 18, VI)
                        </h4>
                        <p className="text-xs mt-1">
                          Opor-se a tratamento realizado com base em legítimo interesse.
                          Revogue consentimentos em <Link href="/privacy-settings" className="underline">Privacidade {">"} Gerenciar Consentimento</Link>.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="glass p-4 rounded-lg mt-4">
                    <h4 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      Como exercer seus direitos:
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Através da área de <Link href="/privacy-settings" className="underline">Privacidade</Link> (usuários autenticados)</li>
                      <li>Por e-mail: <strong>privacidade@postspark.com</strong></li>
                      <li>Por correio: [Endereço físico a ser preenchido upon constituição]</li>
                    </ul>
                    <p className="text-xs mt-2">
                      <strong>Prazo de resposta:</strong> Até 15 dias úteis, prorrogável por igual período
                      mediante justificativa (art. 19 da LGPD).
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  9. Menores de Idade
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    O PostSpark <strong>não se destina a menores de 16 anos</strong> (art. 14, §1º da LGPD).
                  </p>
                  <div className="glass p-4 rounded-lg border-l-4" style={{ borderColor: "oklch(0.65 0.2 10)" }}>
                    <p className="text-xs">
                      <strong>Proibição:</strong> Se tomarmos conhecimento de que coletamos dados de
                      menor sem consentimento parental, tomaremos medidas razoáveis para excluí-los
                      prontamente.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  10. Segurança da Informação
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Implementamos medidas técnicas e organizacionais adequadas para proteger seus dados
                    contra acessos não autorizados, destruição, perda, alteração ou comunicação
                    indevida (art. 46 da LGPD):
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>Criptografia em trânsito:</strong> HTTPS/TLS obrigatório</li>
                    <li><strong>Criptografia em repouso:</strong> Dados criptografados no Supabase</li>
                    <li><strong>Controle de acesso:</strong> Row Level Security (RLS) no Supabase</li>
                    <li><strong>Autenticação forte:</strong> Session tokens via httpOnly cookies</li>
                    <li><strong>Hash de prompts:</strong> Conteúdo não armazenado em texto puro</li>
                    <li><strong>Logs de auditoria:</strong> Acessos a dados registrados</li>
                  </ul>
                  <div className="glass p-4 rounded-lg mt-2">
                    <p className="text-xs">
                      <strong>Notificação de incidentes:</strong> Em caso de vazamento que possa
                      causar risco ou dano relevante, notificaremos os titulares e a ANPD em até
                      2 dias úteis (art. 48 da LGPD).
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  11. Alterações desta Política
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Reservamo-nos o direito de alterar esta política a qualquer momento. Alterações
                    significativas serão comunicadas:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Por e-mail</li>
                    <li>Através de aviso na aplicação</li>
                    <li>Através de destaque nesta página</li>
                  </ul>
                  <p className="text-xs mt-2">
                    O uso continuado do serviço após alterações constitui aceitação da nova política.
                  </p>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  12. Contato e Canais de Atendimento
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>Para exercer direitos, fazer perguntas ou reportar problemas:</p>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4" style={{ color: "oklch(0.55 0.22 280)" }} />
                    <a
                      href="mailto:privacidade@postspark.com"
                      className="underline hover:opacity-80"
                    >
                      privacidade@postspark.com
                    </a>
                  </div>
                  <p className="text-xs mt-2">
                    <strong>Encarregado (DPO):</strong> [A ser designado upon constituição formal]
                  </p>
                  <p className="text-xs">
                    <strong>Foro:</strong> Esta política é regida pelas leis brasileiras.
                    Qualquer disputa será submetida ao foro da comarca de [São Paulo/Brasília],
                    salvo disposição legal em contrário.
                  </p>
                </div>
              </GlassCard>
            </TabsContent>
          </Tabs>

          {/* Footer Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mt-8 justify-center">
            <Button variant="outline" asChild className="glass">
              <Link href="/terms">
                <ExternalLink className="w-4 h-4 mr-2" />
                Termos de Uso
              </Link>
            </Button>
            <Button variant="outline" asChild className="glass">
              <Link href="/cookies">
                <ExternalLink className="w-4 h-4 mr-2" />
                Política de Cookies
              </Link>
            </Button>
            <Button variant="default" asChild style={{ background: "oklch(0.55 0.22 280)" }}>
              <Link href="/privacy-settings">
                <Lock className="w-4 h-4 mr-2" />
                Minha Privacidade
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
