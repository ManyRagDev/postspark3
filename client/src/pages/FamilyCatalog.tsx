/**
 * Catálogo das famílias criativas — ferramenta interna de avaliação.
 *
 * Renderiza o MESMO conteúdo nas 12 famílias de `shared/creative/families.ts`,
 * rodando o pipeline determinístico real (`directCreative` → `composeVariation`)
 * que hoje só existe no cliente e não está ligado ao servidor de geração.
 *
 * Serve para responder duas perguntas antes de mexer no motor:
 *  1. O catálogo já é bonito? (se sim, o trabalho é encanamento)
 *  2. Onde deve morar a decisão de design — produto, marca ou variação?
 *     O toggle "paleta" materializa esse eixo: variedade (paleta por família)
 *     vs identidade (paleta única da marca).
 */

import { useMemo, useState } from "react";
import {
  DEFAULT_DESIGN_TOKENS,
  type AspectRatio,
  type ContentSection,
  type DesignTokens,
  type PostVariation,
} from "@shared/postspark";
import { FAMILIES } from "@shared/creative/families";
import { PALETTES } from "@shared/creative/palettes";
import { composeVariation, directCreative } from "@shared/creative";
import PostCardV2 from "@/components/views/WorkbenchV2/PostCardV2";

const ASPECT_RATIOS: AspectRatio[] = ["1:1", "5:6", "9:16"];

const SAMPLE_IMAGE =
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&q=70&auto=format&fit=crop";

const DEFAULT_SECTIONS: ContentSection[] = [
  { id: "s1", icon: "Zap", label: "Diagnóstico", description: "Onde o processo trava hoje", number: 1 },
  { id: "s2", icon: "Target", label: "Correção", description: "O ajuste que muda o resultado", number: 2 },
  { id: "s3", icon: "TrendingUp", label: "Escala", description: "Como manter depois que funciona", number: 3 },
];

/** Rótulos legíveis para os requisitos de conteúdo declarados por cada família. */
function fitRequirements(fit: (typeof FAMILIES)[number]["fit"]): string[] {
  const out: string[] = [];
  if (fit.needsImage) out.push("pede imagem");
  if (fit.needsSections) out.push("pede seções");
  if (fit.needsNumber) out.push("pede número");
  if (fit.maxHeadlineChars && fit.maxHeadlineChars < 200) out.push(`título ≤ ${fit.maxHeadlineChars}`);
  if (fit.minHeadlineChars) out.push(`título ≥ ${fit.minHeadlineChars}`);
  return out;
}

interface CatalogContent {
  headline: string;
  body: string;
  callToAction: string;
  badge: string;
  stickerText: string;
}

const DEFAULT_CONTENT: CatalogContent = {
  headline: "3 erros que travam sua operação",
  body: "A maioria dos times corrige o sintoma e ignora a causa. Comece pelo diagnóstico antes de trocar a ferramenta.",
  callToAction: "Veja o diagnóstico",
  badge: "Operações",
  stickerText: "Prático",
};

export default function FamilyCatalog() {
  const [content, setContent] = useState<CatalogContent>(DEFAULT_CONTENT);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [seed, setSeed] = useState(7);
  /**
   * O eixo da conversa de produto:
   *  • variety  — cada família sorteia sua paleta (seed próprio). Mostra a
   *               diversidade que o motor entrega de verdade.
   *  • isolated — todas com a mesma paleta. Isola a variável e deixa comparar
   *               só geometria e tipografia.
   *  • brand    — paleta única da marca. Mostra o custo da identidade sobre
   *               a variedade.
   */
  const [colorMode, setColorMode] = useState<"variety" | "isolated" | "brand">("variety");
  const brandLocked = colorMode === "brand";
  const [withImage, setWithImage] = useState(true);
  const [paletteOverride, setPaletteOverride] = useState<string>("auto");
  const [brandColors, setBrandColors] = useState({
    background: "#0E1116",
    text: "#F5F5F0",
    primary: "#21F1A8",
  });

  const brandTokens: DesignTokens = useMemo(
    () => ({
      ...DEFAULT_DESIGN_TOKENS,
      colors: { ...DEFAULT_DESIGN_TOKENS.colors, ...brandColors },
    }),
    [brandColors],
  );

  const composed = useMemo(() => {
    return FAMILIES.map((family, index) => {
      // No modo "variedade" cada família recebe seed próprio, como acontece
      // numa geração real (seed derivado do id da variação). Nos outros modos
      // o seed é comum, para que a cor pare de ser uma variável.
      const familySeed = colorMode === "variety" ? seed + index * 1013 : seed;
      // Famílias que declaram `needsSections` só exibem as seções sob um
      // template estruturado — `simple` as descartaria silenciosamente.
      const template = family.fit.needsSections ? "numbered-list" : "simple";
      // Cada família recebe um objeto próprio: `composeVariation` muta
      // `copyAngle` (esconde/restaura sticker e badge por ornamento), então
      // compartilhar a mesma referência contaminaria os outros cards.
      const base: PostVariation = {
        id: `catalog-${family.id}`,
        headline: content.headline,
        body: content.body,
        caption: "",
        hashtags: ["#operacoes", "#processos"],
        callToAction: content.callToAction,
        tone: "profissional",
        platform: "instagram",
        imagePrompt: "",
        // Vazio de propósito: `composeVariation` só deixa a paleta decidir a
        // cor quando não há valor prévio na variação.
        backgroundColor: "",
        textColor: "",
        accentColor: "",
        layout: "minimal",
        aspectRatio,
        template,
        sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
        copyAngle: {
          type: "beneficio",
          label: "Foco no Benefício",
          badge: content.badge,
          stickerText: content.stickerText,
        },
        ...(withImage ? { imageUrl: SAMPLE_IMAGE } : {}),
      } as PostVariation;

      const direction = directCreative(base, null, familySeed, { brandLocked });
      base.creativeDirection = {
        ...direction,
        familyId: family.id,
        axes: family.axes,
        seed: familySeed,
        ...(brandLocked
          ? { paletteId: "brand", paletteInverted: false }
          : paletteOverride !== "auto"
            ? { paletteId: paletteOverride, paletteInverted: false }
            : {}),
      };

      const variation = composeVariation(base, brandTokens);
      return { family, variation };
    });
  }, [content, aspectRatio, seed, colorMode, brandLocked, withImage, paletteOverride, brandTokens]);

  /** Diversidade objetiva do que está na tela — o número que a conversa pede. */
  const diversity = useMemo(() => {
    const fonts = new Set<string>();
    const palettes = new Set<string>();
    const layouts = new Set<string>();
    composed.forEach(({ variation }) => {
      fonts.add(`${variation.headlineFontFamily ?? "—"}/${variation.bodyFontFamily ?? "—"}`);
      palettes.add(variation.creativeDirection?.paletteId ?? "—");
      layouts.add(variation.layout);
    });
    return { fonts: fonts.size, palettes: palettes.size, layouts: layouts.size };
  }, [composed]);

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.10 0.02 280)", color: "oklch(0.9 0.01 280)" }}>
      {/* ── Controles ───────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur"
        style={{ background: "oklch(0.12 0.025 280 / 92%)", borderColor: "oklch(1 0 0 / 8%)" }}
      >
        <div className="mx-auto max-w-[1600px] px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-xl font-semibold">Catálogo das famílias criativas</h1>
            <p className="text-xs" style={{ color: "oklch(0.6 0.03 280)" }}>
              {FAMILIES.length} famílias · mesmo conteúdo · pipeline determinístico real
            </p>
            <p className="text-xs ml-auto tabular-nums" style={{ color: "oklch(0.6 0.03 280)" }}>
              distintos nesta tela — {diversity.fonts} pares tipográficos · {diversity.palettes} paletas ·{" "}
              {diversity.layouts} layouts
            </p>
          </div>

          {/* Conteúdo */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Título">
              <input
                value={content.headline}
                onChange={(e) => setContent((c) => ({ ...c, headline: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: "oklch(0.16 0.02 280)", border: "1px solid oklch(1 0 0 / 10%)" }}
              />
            </Field>
            <Field label="Corpo">
              <input
                value={content.body}
                onChange={(e) => setContent((c) => ({ ...c, body: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: "oklch(0.16 0.02 280)", border: "1px solid oklch(1 0 0 / 10%)" }}
              />
            </Field>
            <Field label="CTA">
              <input
                value={content.callToAction}
                onChange={(e) => setContent((c) => ({ ...c, callToAction: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: "oklch(0.16 0.02 280)", border: "1px solid oklch(1 0 0 / 10%)" }}
              />
            </Field>
            <Field label="Badge / sticker">
              <div className="flex gap-2">
                <input
                  value={content.badge}
                  onChange={(e) => setContent((c) => ({ ...c, badge: e.target.value }))}
                  className="w-1/2 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: "oklch(0.16 0.02 280)", border: "1px solid oklch(1 0 0 / 10%)" }}
                />
                <input
                  value={content.stickerText}
                  onChange={(e) => setContent((c) => ({ ...c, stickerText: e.target.value }))}
                  className="w-1/2 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: "oklch(0.16 0.02 280)", border: "1px solid oklch(1 0 0 / 10%)" }}
                />
              </div>
            </Field>
          </div>

          {/* Eixos */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
            <Segmented
              label="Formato"
              options={ASPECT_RATIOS.map((r) => ({ value: r, label: r }))}
              value={aspectRatio}
              onChange={(v) => setAspectRatio(v as AspectRatio)}
            />

            <Segmented
              label="Cor"
              options={[
                { value: "variety", label: "Variedade" },
                { value: "isolated", label: "Isolar família" },
                { value: "brand", label: "Identidade da marca" },
              ]}
              value={colorMode}
              onChange={(v) => setColorMode(v as typeof colorMode)}
            />

            {brandLocked ? (
              <div className="flex items-center gap-2">
                <span style={{ color: "oklch(0.6 0.03 280)" }}>Marca</span>
                {(["background", "text", "primary"] as const).map((key) => (
                  <input
                    key={key}
                    type="color"
                    title={key}
                    value={brandColors[key]}
                    onChange={(e) => setBrandColors((c) => ({ ...c, [key]: e.target.value }))}
                    className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                ))}
              </div>
            ) : (
              <label className="flex items-center gap-2">
                <span style={{ color: "oklch(0.6 0.03 280)" }}>Paleta</span>
                <select
                  value={paletteOverride}
                  onChange={(e) => setPaletteOverride(e.target.value)}
                  className="rounded-lg px-2 py-1.5 outline-none"
                  style={{ background: "oklch(0.16 0.02 280)", border: "1px solid oklch(1 0 0 / 10%)" }}
                >
                  <option value="auto">automática (seed)</option>
                  {PALETTES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={withImage}
                onChange={(e) => setWithImage(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-emerald-400"
              />
              <span style={{ color: "oklch(0.6 0.03 280)" }}>Com imagem de fundo</span>
            </label>

            <button
              onClick={() => setSeed((s) => s + 1)}
              className="rounded-lg px-3 py-1.5 font-medium transition-colors"
              style={{ background: "oklch(0.22 0.04 280)", border: "1px solid oklch(1 0 0 / 12%)" }}
            >
              Reembaralhar (seed {seed})
            </button>

            <button
              onClick={() => {
                setContent(DEFAULT_CONTENT);
                setSeed(7);
                setColorMode("variety");
                setWithImage(true);
                setPaletteOverride("auto");
              }}
              className="rounded-lg px-3 py-1.5"
              style={{ color: "oklch(0.6 0.03 280)" }}
            >
              Restaurar
            </button>
          </div>
        </div>
      </div>

      {/* ── Grade ───────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="flex flex-wrap gap-8">
          {composed.map(({ family, variation }) => {
            const requirements = fitRequirements(family.fit);
            return (
              <div key={family.id} className="w-[360px]">
                <div style={{ width: 360 }}>
                  <PostCardV2
                    mode="preview"
                    snapshot={variation}
                    aspectRatio={aspectRatio}
                    designTokens={{ ...DEFAULT_DESIGN_TOKENS, ...variation.designTokens } as DesignTokens}
                  />
                </div>

                <div className="mt-3 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{family.label}</span>
                    <code className="text-[10px]" style={{ color: "oklch(0.5 0.03 280)" }}>
                      {family.id}
                    </code>
                  </div>

                  <p className="text-xs leading-snug" style={{ color: "oklch(0.62 0.03 280)" }}>
                    {family.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <Tag>{variation.headlineFontFamily ?? "sem fonte"}</Tag>
                    <Tag>{variation.bodyFontFamily ?? "sem fonte"}</Tag>
                    <Tag>{variation.creativeDirection?.paletteId}</Tag>
                    <Tag>{variation.layout}</Tag>
                  </div>

                  {requirements.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {requirements.map((req) => (
                        <span
                          key={req}
                          className="rounded px-1.5 py-0.5 text-[10px]"
                          style={{ background: "oklch(0.28 0.08 70 / 40%)", color: "oklch(0.82 0.09 80)" }}
                        >
                          {req}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px]" style={{ color: "oklch(0.6 0.03 280)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px]"
      style={{ background: "oklch(0.18 0.02 280)", color: "oklch(0.68 0.03 280)" }}
    >
      {children}
    </span>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: "oklch(0.6 0.03 280)" }}>{label}</span>
      <div className="flex rounded-lg p-0.5" style={{ background: "oklch(0.16 0.02 280)" }}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="rounded-md px-2.5 py-1 transition-colors"
            style={
              value === opt.value
                ? { background: "oklch(0.32 0.06 280)", color: "oklch(0.95 0.01 280)" }
                : { color: "oklch(0.6 0.03 280)" }
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
