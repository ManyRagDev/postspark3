import { Link } from "wouter";
import { Shield, ScrollText, Cookie, UserCog } from "lucide-react";

/**
 * LegalLinksNav - Navbar discreto com links legais.
 * Usado na área não logada (thevoid2), posicionado no canto superior.
 */
export default function LegalLinksNav() {
  const links = [
    { href: "/privacy", label: "Privacidade", icon: Shield },
    { href: "/terms", label: "Termos de Uso", icon: ScrollText },
    { href: "/cookies", label: "Cookies", icon: Cookie },
    { href: "/privacy-settings", label: "Meus Dados", icon: UserCog },
  ];

  return (
    <nav
      className="fixed top-4 left-4 z-[80] flex items-center gap-2"
      aria-label="Links legais"
    >
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all hover:scale-105 hover:bg-white/10"
            style={{
              background: "oklch(0.12 0.03 280 / 72%)",
              borderColor: "oklch(1 0 0 / 12%)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              color: "oklch(0.7 0.01 280)",
              fontSize: "11px",
              fontWeight: 500,
            }}
          >
            <Icon size={12} />
            <span className="hidden sm:inline">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
