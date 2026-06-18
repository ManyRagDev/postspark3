import { Link } from "wouter";
import SparkLogo from "./SparkLogo";

/**
 * Footer Component - PostSpark 3
 *
 * Rodapé minimalista com links legais e branding.
 * Integrado em páginas públicas (landing, pricing, billing).
 */

interface FooterProps {
  className?: string;
  showNewsletter?: boolean;
}

export default function Footer({ className = "", showNewsletter = false }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={`w-full border-t ${className}`}
      style={{
        borderColor: "oklch(1 0 0 / 6%)",
        background: "oklch(0.03 0.05 280)"
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <SparkLogo size={24} />
              <span
                className="text-lg font-semibold"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--text-primary)"
                }}
              >
                PostSpark
              </span>
            </div>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Geração de posts para redes sociais com inteligência artificial.
            </p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              © {currentYear} ManyLabs Brasil Tecnologia Ltda.
            </p>
          </div>

          {/* Produto */}
          <div>
            <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
              Produto
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/pricing"
                  className="transition-colors hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Preços
                </Link>
              </li>
              <li>
                <Link
                  href="/"
                  className="transition-colors hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Como funciona
                </Link>
              </li>
              <li>
                <a
                  href="https://docs.postspark.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Documentação
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
              Legal
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/privacy"
                  className="transition-colors hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Privacidade
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="transition-colors hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Termos de Uso
                </Link>
              </li>
              <li>
                <Link
                  href="/cookies"
                  className="transition-colors hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Cookies
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy-settings"
                  className="transition-colors hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Meus Dados
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row justify-between items-center gap-4 text-xs" style={{ borderColor: "oklch(1 0 0 / 4%)" }}>
          <div style={{ color: "var(--text-tertiary)" }}>
            Feito com ☀️ no Brasil
          </div>
          <div className="flex gap-4" style={{ color: "var(--text-tertiary)" }}>
            <a
              href="mailto:contato@postspark.com"
              className="transition-colors hover:opacity-80"
            >
              Contato
            </a>
            <a
              href="https://twitter.com/postspark"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:opacity-80"
            >
              Twitter
            </a>
            <a
              href="https://github.com/postspark"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:opacity-80"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
