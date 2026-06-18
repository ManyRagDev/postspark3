import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Eye, ChevronDown, ChevronUp, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * ConsentModal - Modal de Consentimento LGPD
 *
 * Modal de consentimento explícito para tratamento de dados pessoais.
 * Aparece no primeiro acesso após login/registro e bloqueia uso sem aceitação.
 *
 * Design glassmorphism on-brand com identidade dark studio do PostSpark.
 */

const CONSENT_STORAGE_KEY = "postspark_consent_given";
const CONSENT_VERSION = "1.0";
const AI_IMPROVEMENTS_KEY = "postspark_ai_improvements_consent";

interface ConsentRecord {
  given: boolean;
  version: string;
  timestamp: string;
  aiImprovements: boolean;
}

export function useConsent() {
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored) {
      try {
        setConsent(JSON.parse(stored));
      } catch {
        // Invalid data, treat as no consent
        setConsent(null);
      }
    }
    setLoading(false);
  }, []);

  const giveConsent = (aiImprovements: boolean) => {
    const record: ConsentRecord = {
      given: true,
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      aiImprovements
    };
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    setConsent(record);
  };

  const revokeConsent = () => {
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    setConsent(null);
  };

  return { consent, loading, giveConsent, revokeConsent };
}

interface ConsentModalProps {
  onAccept?: (aiImprovements: boolean) => void;
}

export default function ConsentModal({ onAccept }: ConsentModalProps) {
  const { isAuthenticated } = useAuth();
  const { consent, loading, giveConsent } = useConsent();
  const [aiImprovements, setAiImprovements] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Don't show if not authenticated, already consented, or loading
  if (!isAuthenticated || loading || consent?.given) {
    return null;
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const handleAccept = () => {
    giveConsent(aiImprovements);
    onAccept?.(aiImprovements);
  };

  const sections = [
    {
      id: "data",
      title: "Dados que coletamos",
      content: (
        <div className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          <p>Coletamos os seguintes dados para operar o serviço:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Dados pessoais:</strong> Nome e e-mail (via Google OAuth)</li>
            <li><strong>Conteúdo criado:</strong> Posts, backgrounds, edições</li>
            <li><strong>Dados de uso:</strong> Gerações, preferências, métricas</li>
            <li><strong>Dados de billing:</strong> Plano, transações (via Stripe)</li>
          </ul>
        </div>
      )
    },
    {
      id: "purpose",
      title: "Para que usamos",
      content: (
        <div className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          <p>Seus dados são utilizados para:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Fornecer os serviços contratados (geração de posts)</li>
            <li>Processar pagamentos e gerenciar sua assinatura</li>
            <li>Autenticar sua sessão e manter segurança</li>
            <li>Melhorar nossos modelos de IA (opcional)</li>
          </ul>
        </div>
      )
    },
    {
      id: "sharing",
      title: "Compartilhamento",
      content: (
        <div className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          <p>Compartilhamos dados apenas com:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Supabase:</strong> Autenticação e armazenamento seguro</li>
            <li><strong>Stripe:</strong> Processamento de pagamentos</li>
            <li><strong>Serviços de IA:</strong> OpenAI, Groq, Google (para gerar conteúdo)</li>
          </ul>
          <p className="mt-2">
            <strong>Não vendemos</strong> seus dados para terceiros para fins de publicidade.
          </p>
        </div>
      )
    },
    {
      id: "rights",
      title: "Seus direitos",
      content: (
        <div className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          <p>Você tem direito a:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Acessar seus dados pessoais a qualquer momento</li>
            <li>Corrigir dados incompletos ou incorretos</li>
            <li>Solicitar exclusão de seus dados</li>
            <li>Exportar seus dados em formato portável</li>
            <li>Revogar este consentimento</li>
          </ul>
          <p className="mt-2">
            Acesse <Link href="/privacy-settings" className="underline">Privacidade</Link> para exercer esses direitos.
          </p>
        </div>
      )
    }
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{
          backgroundColor: "oklch(0 0 0 / 70%)",
          backdropFilter: "blur(4px)"
        }}
      >
        {/* Overlay backdrop */}
        <div
          className="absolute inset-0"
          onClick={() => {
            // Cannot dismiss - consent is mandatory
          }}
        />

        {/* Modal */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30
          }}
          className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl"
          style={{
            background: "oklch(0.08 0.05 280)",
            border: "1px solid oklch(1 0 0 / 10%)"
          }}
        >
          {/* Scrollable content */}
          <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 md:p-8">
            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
              <div
                className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full"
                style={{
                  background: "oklch(0.55 0.22 280 / 15%)",
                  border: "1px solid oklch(0.55 0.22 280 / 30%)"
                }}
              >
                <Shield className="w-6 h-6" style={{ color: "oklch(0.55 0.22 280)" }} />
              </div>
              <div className="flex-1">
                <h2
                  className="text-xl md:text-2xl font-bold mb-2"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--text-primary)"
                  }}
                >
                  Privacidade e Uso de Dados
                </h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Para usar o PostSpark, você precisa aceitar nossa Política de Privacidade.
                  Leia abaixo os principais pontos.
                </p>
              </div>
            </div>

            {/* Collapsible sections */}
            <div className="space-y-3">
              {sections.map(section => {
                const isExpanded = expandedSections.has(section.id);
                return (
                  <div
                    key={section.id}
                    className="rounded-xl overflow-hidden transition-all duration-200"
                    style={{
                      background: "oklch(0.1 0.04 280)",
                      border: "1px solid oklch(1 0 0 / 6%)"
                    }}
                  >
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left transition-colors hover:bg-oklch(from-white to-white/0.03)"
                    >
                      <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                        {section.title}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
                      ) : (
                        <ChevronDown className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
                      )}
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-1">
                            {section.content}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* AI Improvements checkbox */}
            <div
              className="mt-6 p-4 rounded-xl"
              style={{
                background: "oklch(0.55 0.22 280 / 5%)",
                border: "1px solid oklch(0.55 0.22 280 / 15%)"
              }}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={aiImprovements}
                    onChange={(e) => setAiImprovements(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      aiImprovements
                        ? "bg-thermal-orange border-thermal-orange"
                        : "border-oklch(from-white to-white/0.2)"
                    }`}
                    style={
                      aiImprovements
                        ? { background: "oklch(0.55 0.22 280)", borderColor: "oklch(0.55 0.22 280)" }
                        : {}
                    }
                  >
                    {aiImprovements && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Permitir uso de dados para melhorias da IA (opcional)
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                    Seus dados podem ser usados (anonimizados) para treinar e melhorar nossos modelos.
                    Você pode desativar isso a qualquer momento nas configurações de privacidade.
                  </p>
                </div>
              </label>
            </div>

            {/* Links to full documents */}
            <div className="mt-6 flex flex-wrap gap-4 text-xs" style={{ color: "var(--text-tertiary)" }}>
              <Link
                href="/privacy"
                target="_blank"
                className="flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <ExternalLink className="w-3 h-3" />
                Política de Privacidade completa
              </Link>
              <Link
                href="/terms"
                target="_blank"
                className="flex items-center gap-1 hover:opacity-80 transition-opacity"
              >
                <ExternalLink className="w-3 h-3" />
                Termos de Uso
              </Link>
            </div>
          </div>

          {/* Footer actions */}
          <div
            className="flex-shrink-0 p-4 md:p-6 border-t flex flex-col sm:flex-row gap-3"
            style={{ borderColor: "oklch(1 0 0 / 6%)", background: "oklch(0.06 0.04 280)" }}
          >
            <Button
              onClick={handleAccept}
              className="flex-1 h-11 text-sm font-medium"
              style={{ background: "oklch(0.55 0.22 280)" }}
            >
              Aceitar e Continuar
            </Button>
            <Button
              variant="outline"
              asChild
              className="flex-1 sm:flex-none h-11 text-sm glass"
            >
              <Link href="/privacy">
                <Eye className="w-4 h-4 mr-2" />
                Ver Detalhes
              </Link>
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
