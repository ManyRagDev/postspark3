import { useAuth } from "@/_core/hooks/useAuth";
import SparkParticles from "@/components/SparkParticles";
import SparkLogo from "@/components/SparkLogo";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { useLocation, Link } from "wouter";

/**
 * /criar-new — Rota experimental para o novo design system do PostSpark.
 *
 * Estrutura pensada como um canvas limpo para iterar sobre a identidade visual
 * revisada. Mantém consistência com tokens existentes:
 *   - Thermal Orange  oklch(0.7 0.22 40)
 *   - Cyber Cyan      oklch(0.75 0.14 200)
 *   - Void Purple     oklch(0.45 0.18 290)
 *   - Fonts: Inter (sans) / Space Grotesk (display)
 *
 * TODO: substituir o conteúdo placeholder pelo novo layout de alta conversão.
 */
export default function CriarNewPage() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    // Usuário autenticado pode seguir para o estúdio
    if (!loading && isAuthenticated) {
      // Não redirecionar automaticamente — a ideia é permitir navegação fluida
      // entre /criar-new e /thevoid. Deixamos o link de CTA conduzir.
    }
  }, [isAuthenticated, loading, setLocation]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const goToStudio = useCallback(() => {
    if (isAuthenticated) {
      setLocation("/thevoid");
    } else {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  return (
    <div className="relative min-h-screen w-full text-foreground overflow-x-hidden selection:bg-[oklch(0.7_0.22_40)] selection:text-black"
      style={{ backgroundColor: "oklch(0.05 0.02 280)" }}
    >
      {/* ============ Ambient Background ============ */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <SparkParticles
          count={isMobile ? 12 : 28}
          performanceMode={isMobile ? "reduced" : "full"}
          variant="default"
        />

        {/* Glow orbs using design tokens */}
        <div
          className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.08]"
          style={{
            backgroundColor: "oklch(0.75 0.14 200)",
            filter: "blur(150px)",
          }}
        />
        <div
          className="absolute top-1/3 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.08]"
          style={{
            backgroundColor: "oklch(0.7 0.22 40)",
            filter: "blur(160px)",
          }}
        />
        <div
          className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full opacity-[0.06]"
          style={{
            backgroundColor: "oklch(0.45 0.18 290)",
            filter: "blur(140px)",
          }}
        />

        {/* Subtle grain overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "url('/backgrounds/textures/grain.png')",
            backgroundSize: "200px 200px",
          }}
        />
      </div>

      {/* ============ Content ============ */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* ---- Nav ---- */}
        <nav className="flex items-center justify-between px-6 md:px-10 py-5">
          <Link href="/" className="flex items-center gap-2 group">
            <SparkLogo size={28} />
            <span className="font-display text-lg font-semibold tracking-tight">
              Post<span className="text-[oklch(0.7_0.22_40)]">Spark</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/criar"
              className="text-sm text-foreground/60 hover:text-foreground transition-colors font-medium px-3 py-1.5"
            >
              Versão atual
            </Link>
            <Button
              onClick={goToStudio}
              className="bg-[oklch(0.7_0.22_40)] hover:bg-[oklch(0.75_0.22_40)] text-black font-semibold px-5 py-2 text-sm"
            >
              {isAuthenticated ? "Abrir estúdio" : "Começar"}
            </Button>
          </div>
        </nav>

        {/* ---- Hero ---- */}
        <section className="flex-1 flex flex-col items-center justify-center px-6 md:px-10 py-16 md:py-24">
          {/* Tagline */}
          <div className="glass-floating rounded-full px-4 py-1.5 mb-8">
            <span className="text-xs font-mono text-foreground/70 tracking-wider uppercase">
              ✦ Novo design system — em construção
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold text-center tracking-tight max-w-4xl leading-[1.1]">
            <span className="block">Crie posts que</span>
            <span className="block mt-1">
              {" "}
              <span className="text-glow-orange text-[oklch(0.7_0.22_40)]">
                conversam
              </span>{" "}
              com sua marca
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg md:text-xl text-foreground/60 text-center max-w-2xl leading-relaxed">
            Uma nova experiência visual para o PostSpark. Este é o canvas para
            a versão revisada do design system — tipografia, cores e layout
            redefinidos a partir dos princípios.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-4 mt-10">
            <Button
              onClick={goToStudio}
              className="bg-[oklch(0.7_0.22_40)] hover:bg-[oklch(0.75_0.22_40)] text-black font-semibold px-8 py-3 text-base rounded-xl glow-orange"
              size="lg"
            >
              {isAuthenticated ? "Ir para o estúdio →" : "Criar meu primeiro post"}
            </Button>
            <Link
              href="/criar"
              className="text-sm text-foreground/50 hover:text-foreground transition-colors flex items-center gap-2"
            >
              <span>Ver versão estável</span>
              <span className="text-xs">→</span>
            </Link>
          </div>
        </section>

        {/* ---- Design Tokens Preview (placeholder) ---- */}
        <section className="px-6 md:px-10 pb-16 md:pb-24">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-center mb-3">
              Tokens do design system
            </h2>
            <p className="text-foreground/50 text-center mb-10 text-sm">
              Paleta e tipografia que guiam cada decisão visual.
            </p>

            {/* Color swatches */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
              {[
                { name: "Thermal Orange", color: "oklch(0.7 0.22 40)", css: "var(--primary)" },
                { name: "Cyber Cyan", color: "oklch(0.75 0.14 200)", css: "var(--accent)" },
                { name: "Void Purple", color: "oklch(0.45 0.18 290)", css: "chart-3" },
                { name: "Ember Red", color: "oklch(0.6 0.24 25)", css: "var(--destructive)" },
                { name: "Plasma Pink", color: "oklch(0.65 0.2 350)", css: "chart-4" },
              ].map((swatch) => (
                <div key={swatch.name} className="group">
                  <div
                    className="w-full aspect-square rounded-2xl mb-3 ring-1 ring-white/8 group-hover:ring-white/20 transition-all"
                    style={{ backgroundColor: swatch.color }}
                  />
                  <p className="text-sm font-medium">{swatch.name}</p>
                  <p className="text-xs text-foreground/40 font-mono">{swatch.color}</p>
                </div>
              ))}
            </div>

            {/* Typography preview */}
            <div className="glass rounded-2xl p-8 md:p-10">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <span className="text-xs font-mono text-[oklch(0.75_0.14_200)] uppercase tracking-wider">
                    Display — Space Grotesk
                  </span>
                  <p className="font-display text-3xl md:text-4xl font-bold mt-3 leading-tight">
                    Tipografia que respira e comanda a atenção.
                  </p>
                </div>
                <div>
                  <span className="text-xs font-mono text-[oklch(0.7_0.22_40)] uppercase tracking-wider">
                    Corpo — Inter
                  </span>
                  <p className="text-base md:text-lg text-foreground/70 mt-3 leading-relaxed">
                    Inter garante legibilidade em qualquer densidade de
                    informação. Pesos variados criam hierarquia sem ruído
                    visual.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Footer ---- */}
        <footer className="px-6 md:px-10 py-8 border-t border-white/[0.06] text-center">
          <p className="text-xs text-foreground/30 font-mono tracking-wider">
            /criar-new — PostSpark © {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  );
}
