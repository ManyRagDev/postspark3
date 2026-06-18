import { Helmet } from "react-helmet-async";
import { FileText, AlertTriangle, Scale, Sparkles, ExternalLink, Shield } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";

/**
 * Termos de Uso - PostSpark 3
 *
 * Contrato de licença e uso do software PostSpark.
 * Em conformidade com o Código Civil Brasileiro e CDC.
 *
 * Última atualização: 18 de junho de 2026
 */

export default function Terms() {
  const effectiveDate = new Date("2026-06-18").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  return (
    <>
      <Helmet>
        <title>Termos de Uso - PostSpark</title>
        <meta name="description" content="Termos de Uso e Condições de Serviço do PostSpark" />
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
              <FileText className="w-8 h-8" style={{ color: "oklch(0.55 0.22 280)" }} />
            </div>
            <h1
              className="text-3xl md:text-4xl font-bold mb-2"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              Termos de Uso
            </h1>
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Vigente desde {effectiveDate}
            </p>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="contract" className="w-full">
            <TabsList className="grid grid-cols-4 mb-6 w-full glass">
              <TabsTrigger value="contract" className="data-[state=active]:text-thermal-orange">
                <FileText className="w-4 h-4 mr-2" />
                Contrato
              </TabsTrigger>
              <TabsTrigger value="responsibilities" className="data-[state=active]:text-thermal-orange">
                <Shield className="w-4 h-4 mr-2" />
                Responsabilidades
              </TabsTrigger>
              <TabsTrigger value="limitations" className="data-[state=active]:text-thermal-orange">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Limitações
              </TabsTrigger>
              <TabsTrigger value="general" className="data-[state=active]:text-thermal-orange">
                <Scale className="w-4 h-4 mr-2" />
                Geral
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Objeto do Contrato */}
            <TabsContent value="contract" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  1. Objeto do Contrato
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    O presente instrumento tem por objeto estabelecer os termos e condições de uso
                    do <strong>PostSpark</strong>, plataforma SaaS de geração de posts para redes
                    sociais mediante inteligência artificial, fornecida por <strong>ManyLabs Brasil
                    Tecnologia Ltda.</strong>, doravante denominada simplesmente <strong>FORNECEDORA</strong>.
                  </p>
                  <p>
                    Ao aceitar estes termos, você, doravante denominado <strong>USUÁRIO</strong>,
                    declara ter lido, entendido e concordado com todas as condições aqui estabelecidas.
                  </p>
                  <div className="glass p-4 rounded-lg border-l-4" style={{ borderColor: "oklch(0.55 0.22 280)" }}>
                    <p className="text-xs">
                      <strong>Aceitação:</strong> O uso do PostSpark implica aceitação automática
                      destes termos. Caso não concorde, não utilize o serviço e cancele sua conta.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  2. Descrição do Serviço
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    O PostSpark é um serviço de geração assistida por IA que permite:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Geração de posts para redes sociais (Instagram, LinkedIn, etc.)</li>
                    <li>Análise visual de sites para extração de identidade de marca</li>
                    <li>Geração de imagens e backgrounds com IA</li>
                    <li>Criação de carrosséis estruturados</li>
                    <li>Edição, salvamento e exportação de conteúdo</li>
                  </ul>
                  <p className="text-xs mt-2">
                    <strong>Disponibilidade:</strong> O serviço é oferecido "no estado em que se encontra"
                    e pode estar sujeito a interrupções para manutenção ou atualizações.
                  </p>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  3. Planos e Pagamento
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>O serviço é oferecido em três planos:</p>
                  <table className="w-full text-xs mt-3">
                    <thead>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                        <th className="text-left py-2">Plano</th>
                        <th className="text-left py-2">Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">FREE</td>
                        <td className="py-2">Gerações limitadas por mês, sem custo</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                        <td className="py-2">PRO</td>
                        <td className="py-2">Assinatura mensal/anual com Sparks ilimitados</td>
                      </tr>
                      <tr>
                        <td className="py-2">AGENCY</td>
                        <td className="py-2">Para equipes, com recursos avançados</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="glass p-4 rounded-lg mt-3">
                    <p className="text-xs">
                      <strong>Sparks:</strong> Unidade de consumo do serviço. Cada geração, imagem ou
                      análise consome uma quantidade específica de Sparks. Consulte a página de
                      <Link href="/pricing" className="underline"> Preços</Link> para detalhes.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  4. Cadastro e Autenticação
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Para acessar o serviço, o USUÁRIO deve:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Ter idade mínima de 16 anos (conforme LGPD)</li>
                    <li>Fornecer informações verdadeiras e atualizadas</li>
                    <li>Manter a segurança de suas credenciais</li>
                    <li>Notificar imediatamente qualquer uso não autorizado</li>
                  </ul>
                  <p className="text-xs mt-2">
                    <strong>Autenticação:</strong> O PostSpark utiliza Google OAuth via Supabase Auth.
                    Ao se autenticar, o USUÁRIO autoriza a coleta de informações básicas de perfil
                    (nome, e-mail) para fins de identificação.
                  </p>
                </div>
              </GlassCard>
            </TabsContent>

            {/* Tab 2: Responsabilidades */}
            <TabsContent value="responsibilities" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  5. Responsabilidades do USUÁRIO
                </h2>
                <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      5.1 Uso Permitido
                    </h3>
                    <p>O USUÁRIO compromete-se a utilizar o PostSpark para:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                      <li>Criar conteúdo para suas próprias redes sociais ou clientes</li>
                      <li>Gerar conteúdo original ou baseado em materiais que possui direito de uso</li>
                      <li>Respeitar a propriedade intelectual de terceiros</li>
                      <li>Compartilhar URLs de sites que tem autorização para analisar</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      5.2 Uso Proibido
                    </h3>
                    <p>É estritamente proibido:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                      <li>Gerar conteúdo que viole direitos autorais de terceiros</li>
                      <li>Utilizar o serviço para fraude, engano ou desinformação</li>
                      <li>Criar conteúdo ofensivo, discriminatório ou ilegal</li>
                      <li>Reverter ou tentar engajar engenharia reversa da IA</li>
                      <li>Automatizar abusivamente o serviço para depletar Sparks</li>
                      <li>Vender ou revender acesso ao serviço sem autorização</li>
                    </ul>
                  </div>

                  <div className="glass p-4 rounded-lg border-l-4" style={{ borderColor: "oklch(0.65 0.2 10)" }}>
                    <p className="text-xs">
                      <strong>Responsabilidade pelo conteúdo:</strong> O USUÁRIO é inteiramente
                      responsável por todo o conteúdo gerado através do PostSpark. A FORNECEDORA
                      não se responsabiliza por violações de direitos cometidas pelo USUÁRIO.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  6. Conteúdo Gerado por IA
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.55 0.22 280)" }} />
                    <div>
                      <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                        6.1 Natureza do Conteúdo Gerado
                      </h3>
                      <p className="text-xs">
                        O conteúdo gerado pelo PostSpark é produzido por modelos de IA que podem
                        apresentar imprecisões, alucinações ou informações desatualizadas. O USUÁRIO
                        deve sempre revisar e validar o conteúdo antes de publicar.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.6 0.25 40)" }} />
                    <div>
                      <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                        6.2 Propriedade Intelectual
                      </h3>
                      <p className="text-xs">
                        O USUÁRIO mantém propriedade sobre todo o conteúdo gerado através de sua
                        conta, incluindo posts, imagens e ajustes manuais. A FORNECEDORA não
                        reclama direitos autorais sobre o conteúdo criado pelo USUÁRIO.
                      </p>
                    </div>
                  </div>

                  <div className="glass p-4 rounded-lg mt-2">
                    <p className="text-xs">
                      <strong>Exceção:</strong> Modelos de treinamento e templates do sistema
                      permanecem propriedade da FORNECEDORA. O USUÁRIO adquire licença de uso
                      sobre o resultado, não sobre os modelos subjacentes.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  7. Conduta e Sanções
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Em caso de violação destes termos, a FORNECEDORA reserva-se o direito de:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Alertar o USUÁRIO sobre a infração</li>
                    <li>Suspender temporariamente o acesso</li>
                    <li>Cancelar a conta e rescindir o contrato</li>
                    <li>Cobrar multas por danos causados à plataforma</li>
                    <li>Adotar medidas legais cabíveis</li>
                  </ul>
                </div>
              </GlassCard>
            </TabsContent>

            {/* Tab 3: Limitações */}
            <TabsContent value="limitations" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  8. Limitação de Responsabilidade
                </h2>
                <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <div className="glass p-4 rounded-lg border-l-4" style={{ borderColor: "oklch(0.65 0.2 10)" }}>
                    <p className="text-xs">
                      <strong>Aviso importante:</strong> O PostSpark é uma ferramenta de auxílio
                      criativo. A IA pode cometer erros. O USUÁRIO é responsável por revisar todo
                      conteúdo antes de publicar.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      8.1 Sem Garantias
                    </h3>
                    <p>
                      O serviço é fornecido "NO ESTADO EM QUE SE ENCONTRA" e "CONFORME DISPONIBILIDADE",
                      sem garantias de qualquer espécie, expressas ou implícitas, incluindo mas não
                      limitado a:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                      <li>Precisão ou correção do conteúdo gerado</li>
                      <li>Disponibilidade ininterrupta do serviço</li>
                      <li>Adequação a um propósito específico</li>
                      <li>Inexistência de vírus ou outros componentes maliciosos</li>
                      <li>Compatibilidade com todas as plataformas de redes sociais</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      8.2 Limitação de Danos
                    </h3>
                    <p>
                      Em nenhuma hipótese a FORNECEDORA será responsável por:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                      <li>Danos diretos, indiretos, incidentais ou consequenciais</li>
                      <li>Perda de dados ou informações</li>
                      <li>Perda de oportunidades de negócio</li>
                      <li>Reclamações de terceiros baseadas no conteúdo do USUÁRIO</li>
                      <li>Conteúdo gerado que viole direitos de terceiros</li>
                    </ul>
                  </div>

                  <div className="glass p-4 rounded-lg mt-2">
                    <p className="text-xs">
                      <strong>Teto de responsabilidade:</strong> A responsabilidade máxima da
                      FORNECEDORA limita-se ao valor pago pelo USUÁRIO nos últimos 12 meses,
                      conforme Art. 944 do Código Civil Brasileiro.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  9. Disponibilidade do Serviço
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    A FORNECEDORA envida esforços razoáveis para manter o serviço disponível 24/7,
                    mas não garante:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Disponibilidade ininterrupta ou livre de erros</li>
                    <li>Tempos de resposta específicos</li>
                    <li>Correção de defeitos dentro de determinado prazo</li>
                  </ul>
                  <p className="text-xs mt-2">
                    <strong>Manutenção:</strong> O serviço pode ser interrompido temporariamente
                    para manutenção programada, com aviso prévio quando possível.
                  </p>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  10. Suspenção e Rescisão
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      10.1 Pelo USUÁRIO
                </h3>
                    <p>
                      O USUÁRIO pode cancelar sua conta a qualquer momento:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                      <li>Através da área de billing (cancelamento de assinatura)</li>
                      <li>Através da área de privacidade (solicitação de exclusão)</li>
                      <li>Por e-mail: suporte@postspark.com</li>
                    </ul>
                    <p className="text-xs mt-2">
                      <strong>Reembolso:</strong> Em caso de cancelamento, não há reembolso
                      proporcional. O serviço permanece disponível até o fim do período já pago.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      10.2 Pela FORNECEDORA
                    </h3>
                    <p>
                      A FORNECEDORA pode suspender ou rescindir o contrato:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                      <li>Em caso de violação destes termos</li>
                      <li>Por inatividade por 24 meses consecutivos</li>
                      <li>Se houver suspeita de fraude ou abuso</li>
                      <li>Se obrigado por ordem judicial ou administrativa</li>
                    </ul>
                  </div>
                </div>
              </GlassCard>
            </TabsContent>

            {/* Tab 4: Disposições Gerais */}
            <TabsContent value="general" className="space-y-4">
              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  11. Propriedade Intelectual
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      11.1 Direitos da FORNECEDORA
                    </h3>
                    <p>
                      Todo o conteúdo do PostSpark é protegido por direitos autorais e outras
                      leis de propriedade intelectual. Isso inclui:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                      <li>Nome, marca, logotipo e identidade visual</li>
                      <li>Software, algoritmos e modelos de IA</li>
                      <li>Design da interface e experiência do usuário</li>
                      <li>Documentação e textos</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      11.2 Direitos do USUÁRIO
                    </h3>
                    <p>
                      O USUÁRIO adquire licença limitada, não exclusiva, intransferível e
                      revogável para usar o PostSpark para fins pessoais ou comerciais lícitos.
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
                      <li><strong>Tem permissão:</strong> Baixar, usar e publicar conteúdo gerado</li>
                      <li><strong>Não tem permissão:</strong> Copiar, modificar ou revender o sistema</li>
                    </ul>
                  </div>

                  <div className="glass p-4 rounded-lg mt-2">
                    <p className="text-xs">
                      <strong>Conteúdo gerado:</strong> O USUÁRIO mantém propriedade plena sobre
                      posts, imagens e ajustes criados através de sua conta, podendo usar comercialmente
                      sem restrições.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  12. Modificações do Serviço
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    A FORNECEDORA reserva-se o direito de modificar:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Funcionalidades e recursos do serviço</li>
                    <li>Preços e planos (mediante aviso prévio de 30 dias)</li>
                    <li>Modelos de IA e parâmetros de geração</li>
                    <li>Estes termos (mediante aviso prévio de 30 dias)</li>
                  </ul>
                  <p className="text-xs mt-2">
                    <strong>Continuidade:</strong> Mudanças significativas serão comunicadas
                    por e-mail ou aviso na aplicação. Uso continuado após mudanças constitui aceitação.
                  </p>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  13. Confidentialidade
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    O USUÁRIO concorda em:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Manter confidenciais suas credenciais de acesso</li>
                    <li>Não compartilhar conta com terceiros</li>
                    <li>Notificar imediatamente qualquer violação de segurança</li>
                    <li>Reconhecer que a FORNECEDORA pode processar dados para operar o serviço</li>
                  </ul>
                  <p className="text-xs mt-2">
                    Consulte a <Link href="/privacy" className="underline">Política de Privacidade</Link>
                    para detalhes sobre tratamento de dados.
                  </p>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  14. Disposições Gerais
                </h2>
                <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      14.1 Lei Aplicável e Foro
                    </h3>
                    <p>
                      Estes termos são regidos pelas leis da <strong>República Federativa do Brasil</strong>.
                      Qualquer disputa será submetida ao foro da comarca de <strong>[São Paulo/Brasília]</strong>,
                      salvo disposição legal em contrário.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      14.2 Renúncia
                    </h3>
                    <p>
                      A falha da FORNECEDORA em exercer qualquer direito ou disposição destes termos
                      não constitui renúncia a tal direito ou disposição.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      14.3 Severabilidade
                    </h3>
                    <p>
                      Se qualquer disposição destes termos for considerada inválida ou inexequível,
                      as disposições restantes permanecem em pleno vigor e efeito.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                      14.4 Acordo Integral
                    </h3>
                    <p>
                      Estes termos constituem o acordo integral entre as partes sobre o assunto
                      aqui tratado, substituindo todos os acordos ou entendimentos anteriores.
                    </p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard elevation="resting" className="p-6">
                <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                  15. Contato
                </h2>
                <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <p>
                    Para dúvidas, suporte ou comunicações sobre estes termos:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>E-mail:</strong> suporte@postspark.com</li>
                    <li><strong>Legal:</strong> legal@postspark.com</li>
                    <li><strong>Endereço:</strong> [A ser preenchido upon constituição formal]</li>
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
              <Link href="/cookies">
                <ExternalLink className="w-4 h-4 mr-2" />
                Política de Cookies
              </Link>
            </Button>
            <Button variant="default" asChild style={{ background: "oklch(0.55 0.22 280)" }}>
              <Link href="/pricing">
                <FileText className="w-4 h-4 mr-2" />
                Ver Planos
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
