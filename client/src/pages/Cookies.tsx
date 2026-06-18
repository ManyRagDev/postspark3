import { Helmet } from "react-helmet-async";
import { Cookie, Shield, ExternalLink, Settings, Info, AlertCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";

/**
 * Política de Cookies - PostSpark 3
 *
 * Documento sobre uso de cookies e tecnologias similares.
 * Em conformidade com LGPD, GDPR e ePrivacy Directive.
 *
 * Última atualização: 18 de junho de 2026
 */

export default function Cookies() {
  const effectiveDate = new Date("2026-06-18").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  return (
    <>
      <Helmet>
        <title>Política de Cookies - PostSpark</title>
        <meta name="description" content="Política de Cookies e tecnologias similares do PostSpark" />
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
              <Cookie className="w-8 h-8" style={{ color: "oklch(0.55 0.22 280)" }} />
            </div>
            <h1
              className="text-3xl md:text-4xl font-bold mb-2"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              Política de Cookies
            </h1>
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Vigente desde {effectiveDate}
            </p>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid grid-cols-3 mb-6 w-full glass">
              <TabsTrigger value="overview" className="data-[state=active]:text-thermal-orange">
                <Info className="w-4 h-4 mr-2" />
                Visão Geral
              </TabsTrigger>
              <TabsTrigger value="types" className="data-[state=active]:text-thermal-orange">
                <Cookie className="w-4 h-4 mr-2" />
                Tipos de Cookies
              </TabsTrigger>
              <TabsTrigger value="management" className="data-[state=active]:text-thermal-orange">
                <Settings className="w-4 h-4 mr-2" />
                Gerenciamento
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Visão Geral */}
            <TabsContent value="overview" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  1. O que são Cookies?
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Cookies são pequenos arquivos de texto armazenados no seu dispositivo quando você
                    visita um site. Eles servem para:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Lembrar suas preferências e configurações</li>
                    <li>Autenticar sua sessão e manter login ativo</li>
                    <li>Compreender como você usa o serviço</li>
                    <li>Melhorar a performance e estabilidade</li>
                  </ul>
                  <div className="glass p-4 rounded-lg mt-4 border-l-4" style={{ borderColor: "oklch(0.55 0.22 280)" }}>
                    <p className="text-xs">
                      <strong>Privacidade:</strong> O PostSpark usa cookies apenas de forma
                      necessária e transparente. Não vendemos dados de cookies a terceiros
                      para fins de publicidade comportamental.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  2. Por que Usamos Cookies?
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Utilizamos cookies e tecnologias similares para as seguintes finalidades:
                  </p>
                  <table className="w-full text-xs mt-3">
                    <thead>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                        <th className="text-left py-2">Finalidade</th>
                        <th className="text-left py-2">Descrição</th>
                        <th className="text-left py-2">Necessário?</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Autenticação</td>
                        <td className="py-2">Manter sua sessão ativa</td>
                        <td className="py-2">✓ Essencial</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Segurança</td>
                        <td className="py-2">Prevenir fraudes e abusos</td>
                        <td className="py-2">✓ Essencial</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Preferências</td>
                        <td className="py-2">Lembrar suas configurações</td>
                        <td className="py-2">✓ Essencial</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">Analytics</td>
                        <td className="py-2">Entender uso e melhorar serviço</td>
                        <td className="py-2">Opcional</td>
                      </tr>
                      <tr>
                        <td className="py-2">Performance</td>
                        <td className="py-2">Otimizar carregamento e cache</td>
                        <td className="py-2">✓ Essencial</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  3. Base Legal
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    O uso de cookies fundamenta-se nas seguintes bases legais:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>
                      <strong>Cookies essenciais:</strong> Execução de contrato (art. 7, IV da LGPD)
                      e legítimo interesse (art. 7, IX) para segurança e operação.
                    </li>
                    <li>
                      <strong>Cookies de analytics:</strong> Legítimo interesse (art. 7, IX) para
                      melhoria contínua do serviço, respeitados seus direitos fundamentais.
                    </li>
                  </ul>
                  <div className="glass p-4 rounded-lg mt-2">
                    <p className="text-xs">
                      <strong>Consentimento:</strong> Cookies não essenciais só são instalados
                      após seu consentimento explícito através do banner de cookies.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  4. Cookies de Terceiros
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Alguns serviços integrados ao PostSpark podem instalar seus próprios cookies:
                  </p>
                  <div className="space-y-2">
                    <div className="glass p-3 rounded-lg">
                      <h4 className="font-medium text-xs" style={{ color: "var(--text-primary)" }}>
                        Supabase (Autenticação e Database)
                      </h4>
                      <p className="text-xs mt-1">
                        Cookies de sessão necessários para autenticação. Controlados por
                        Supabase, não armazenamos dados pessoais em cookies do lado do cliente.
                      </p>
                    </div>
                    <div className="glass p-3 rounded-lg">
                      <h4 className="font-medium text-xs" style={{ color: "var(--text-primary)" }}>
                        Stripe (Pagamentos)
                      </h4>
                      <p className="text-xs mt-1">
                        Cookies necessários para processamento seguro de pagamentos e prevenção
                        de fraude. Controlados diretamente pelo Stripe.
                      </p>
                    </div>
                    <div className="glass p-3 rounded-lg">
                      <h4 className="font-medium text-xs" style={{ color: "var(--text-primary)" }}>
                        Google OAuth
                      </h4>
                      <p className="text-xs mt-1">
                        Cookies temporários durante o fluxo de autenticação Google. Removidos
                        após conclusão do login.
                      </p>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </TabsContent>

            {/* Tab 2: Tipos de Cookies */}
            <TabsContent value="types" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  5. Tipos de Cookies Utilizados
                </h2>

                <div className="space-y-6">
                  {/* Essenciais */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-5 h-5" style={{ color: "oklch(0.6 0.25 40)" }} />
                      <h3 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                        5.1 Cookies Essenciais (Necessários)
                      </h3>
                    </div>
                    <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>
                        Cookies estritamente necessários para o funcionamento do serviço.
                        Não podem ser desabilitados sem prejudicar a operação.
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                            <th className="text-left py-2">Nome</th>
                            <th className="text-left py-2">Finalidade</th>
                            <th className="text-left py-2">Duração</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                            <td className="py-2"><code className="text-xs">app_session_id</code></td>
                            <td className="py-2">Sessão autenticada (httpOnly)</td>
                            <td className="py-2">Sessão</td>
                          </tr>
                          <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                            <td className="py-2"><code className="text-xs">sb-*.token</code></td>
                            <td className="py-2">Token Supabase</td>
                            <td className="py-2">Sessão</td>
                          </tr>
                          <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                            <td className="py-2"><code className="text-xs">sb-*.refresh-token</code></td>
                            <td className="py-2">Refresh token Supabase</td>
                            <td className="py-2">30 dias</td>
                          </tr>
                          <tr>
                            <td className="py-2"><code className="text-xs">postspark_consent</code></td>
                            <td className="py-2">Consentimento LGPD</td>
                            <td className="py-2">1 ano</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Analytics */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Info className="w-5 h-5" style={{ color: "oklch(0.55 0.22 280)" }} />
                      <h3 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                        5.2 Cookies de Analytics (Opcionais)
                      </h3>
                    </div>
                    <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>
                        Cookies que nos ajudam a entender como o serviço é usado para melhorá-lo.
                        Somente instalados com consentimento explícito.
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                            <th className="text-left py-2">Nome</th>
                            <th className="text-left py-2">Finalidade</th>
                            <th className="text-left py-2">Duração</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                            <td className="py-2"><code className="text-xs">_ga</code></td>
                            <td className="py-2">ID de sessão anônimo (se implementado)</td>
                            <td className="py-2">2 anos</td>
                          </tr>
                          <tr>
                            <td className="py-2"><code className="text-xs">postspark_analytics_consent</code></td>
                            <td className="py-2">Consentimento analytics</td>
                            <td className="py-2">1 ano</td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="glass p-3 rounded-lg mt-2">
                        <p className="text-xs">
                          <strong>O que não coletamos:</strong> Não utilizamos cookies para
                          publicidade comportamental, cross-site tracking ou perfilamento.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Performance */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Settings className="w-5 h-5" style={{ color: "oklch(0.55 0.22 280)" }} />
                      <h3 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                        5.3 Cookies de Performance
                      </h3>
                    </div>
                    <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>
                        Cookies que ajudam a otimizar o desempenho e experiência de uso.
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>Cache:</strong> Armazenamento local de preferências e estado</li>
                        <li><strong>Session storage:</strong> Dados temporários da sessão atual</li>
                        <li><strong>Local storage:</strong> Dados persistentes não sensíveis</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  6. Tecnologias Similares
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Além de cookies, utilizamos tecnologias similares:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-2">
                    <li>
                      <strong>LocalStorage/SessionStorage:</strong> Para armazenar preferências
                      de tema, estado do editor e configurações da interface.
                    </li>
                    <li>
                      <strong>IndexedDB:</strong> Para cache de assets e otimização de performance.
                    </li>
                    <li>
                      <strong>Web Beacons:</strong> Pixels transparentes para confirmar delivery
                      de e-mails e abertura de comunicações (se implementado).
                    </li>
                    <li>
                      <strong>Fingerprint passivo:</strong> Não utilizamos fingerprint de
                      dispositivo para identificação ou tracking.
                    </li>
                  </ul>
                </div>
              </GlassCard>
            </TabsContent>

            {/* Tab 3: Gerenciamento */}
            <TabsContent value="management" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  7. Como Gerenciar Cookies
                </h2>

                <div className="space-y-6">
                  {/* Banner do PostSpark */}
                  <div>
                    <h3 className="text-lg font-medium mb-3" style={{ color: "var(--text-primary)" }}>
                      7.1 Através do PostSpark
                    </h3>
                    <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>
                        Você pode gerenciar preferências de cookies diretamente no serviço:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Banner de cookies (primeira visita)</li>
                        <li>Área de <Link href="/privacy-settings" className="underline">Privacidade</Link> (usuários autenticados)</li>
                        <li>Revogar consentimento a qualquer momento</li>
                      </ul>
                      <div className="glass p-3 rounded-lg mt-2">
                        <p className="text-xs">
                          <strong>Nota:</strong> Desabilitar cookies essenciais impedirá o uso do
                          serviço. Cookies de analytics podem ser desabilitados sem prejuízo
                          funcional.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Navegador */}
                  <div>
                    <h3 className="text-lg font-medium mb-3" style={{ color: "var(--text-primary)" }}>
                      7.2 Através do Navegador
                    </h3>
                    <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>
                        A maioria dos navegadores permite configurar preferências de cookies:
                      </p>
                      <div className="grid gap-2 text-xs">
                        <div className="glass p-3 rounded-lg">
                          <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                            Chrome/Edge
                          </p>
                          <p>Configurações {"->"} Privacidade e segurança {"->"} Cookies e outros dados de sites</p>
                        </div>
                        <div className="glass p-3 rounded-lg">
                          <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                            Firefox
                          </p>
                          <p>Configurações {">"} Privacidade e segurança {">"} Cookies e dados de sites</p>
                        </div>
                        <div className="glass p-3 rounded-lg">
                          <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                            Safari
                          </p>
                          <p>Preferências {">"} Privacidade {">"} Gerenciar dados de sites</p>
                        </div>
                      </div>
                      <div className="glass p-4 rounded-lg mt-2 border-l-4" style={{ borderColor: "oklch(0.65 0.2 10)" }}>
                        <p className="text-xs">
                          <strong>Aviso:</strong> Bloquear todos os cookies no navegador pode
                          impedir o funcionamento adequado do PostSpark e outros sites.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Dispositivos Móveis */}
                  <div>
                    <h3 className="text-lg font-medium mb-3" style={{ color: "var(--text-primary)" }}>
                      7.3 Dispositivos Móveis
                    </h3>
                    <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <p>
                        Em dispositivos móveis, configure preferências através:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li><strong>iOS (Safari):</strong> Configurações {">"} Safari {">"} Bloquear cookies</li>
                        <li><strong>Android (Chrome):</strong> Menu {">"} Configurações {">"} Configurações do site {">"} Cookies</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  8. Atualizações desta Política
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Esta política pode ser atualizada periodicamente para refletir mudanças
                    em nossa tecnologia, serviços ou requisitos legais.
                  </p>
                  <p className="text-xs">
                    <strong>Notificação:</strong> Mudanças significativas serão comunicadas
                    através de aviso na aplicação ou e-mail.
                  </p>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  9. Contato
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Para dúvidas sobre cookies ou privacidade:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>E-mail:</strong> privacidade@postspark.com</li>
                    <li><strong>Link:</strong> <Link href="/privacy" className="underline">Política de Privacidade completa</Link></li>
                  </ul>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  10. Referências Legais
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Esta política está em conformidade com:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>LGPD - Lei nº 13.709/2018 (Brasil)</li>
                    <li>GDPR - Regulamento (UE) 2016/679 (União Europeia)</li>
                    <li>ePrivacy Directive - Diretiva 2002/58/CE (cookies)</li>
                    <li>Marco Civil da Internet - Lei nº 12.965/2014 (Brasil)</li>
                  </ul>
                </div>
              </GlassCard>
            </TabsContent>
          </Tabs>

          {/* Footer Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mt-8 justify-center">
            <Button variant="outline" asChild className="glass">
              <Link href="/privacy">
                <ExternalLink className="w-4 h-4 mr-2" />
                Política de Privacidade
              </Link>
            </Button>
            <Button variant="outline" asChild className="glass">
              <Link href="/terms">
                <ExternalLink className="w-4 h-4 mr-2" />
                Termos de Uso
              </Link>
            </Button>
            <Button variant="default" asChild style={{ background: "oklch(0.55 0.22 280)" }}>
              <Link href="/privacy-settings">
                <Settings className="w-4 h-4 mr-2" />
                Gerenciar Cookies
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
