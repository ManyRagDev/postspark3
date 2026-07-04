# BLUEPRINT FINAL — Motor de Variabilidade Criativa

**Data:** 2026-07-03 (rev. 2 — pós-confronto de hipóteses)
**Status:** Handoff implementável (nenhum código foi escrito; este documento é a especificação).
**Documentos base:** `INSIGHT_INICIAL.md`, `AUDITORIA_FINAL.md`, `CORRECAO_PLANO_LLM.md`, `DOCUMENTO_MESTRE.md` (§26, §27), código real de `shared/postspark.ts`, `client/src/lib/variationSnapshot.ts`, `client/src/components/views/HoloDeck.tsx`, `client/src/components/views/WorkbenchV2/PostCardV2.tsx`, `server/routers.ts`.

---

## GUIA DE EXECUÇÃO (leia antes de escrever qualquer código)

Este documento é autossuficiente: implemente a partir dele, sem depender de conversas anteriores. Em conflito entre este documento e os docs antigos de `novos estilos/`, **este documento vence** (ele consolida `CORRECAO_PLANO_LLM.md` e endereça `AUDITORIA_FINAL.md`).

**Ordem de leitura obrigatória antes da Fase 0:**
1. `DOCUMENTO_MESTRE.md` §26 (precedência de cores) e §27 (snapshot canônico e invariantes) — são as leis do projeto.
2. `shared/postspark.ts` (contrato inteiro) e `client/src/lib/variationSnapshot.ts` (a fronteira canônica).
3. Este documento, do início ao fim.

**Comandos do projeto:** pnpm v10 (`pnpm install`, `pnpm dev`); testes = **vitest** (`pnpm test` roda `vitest run`); typecheck obrigatório a cada fase: `npx tsc --noEmit`. TypeScript é strict.

**Proibições absolutas (violação = refazer):**
- NÃO alterar `createPostVisualSnapshot`, `buildVariationSnapshot`, `projectSnapshotForSlide` nem qualquer arquivo de renderer (`PostRenderer`, `ThemeRenderer`, `PostCardV2`) — com DUAS exceções documentadas em §9.5: (a) a condição de render da accentBar e (b) o hook de carregamento de fontes de `textElements`. Nada além delas.
- NÃO subir `snapshotVersion` (permanece 3). Campos novos são opcionais/aditivos.
- NÃO colocar hex codes, CSS ou nomes de preset no prompt/schema do LLM além do especificado em §7.1.
- NÃO usar `Math.random()` em nenhum ponto do motor — toda aleatoriedade vem do PRNG seedado (§2/§6.1).
- NÃO importar de `client/` dentro de `server/` — código compartilhado vive em `shared/creative/`.
- NÃO deletar `textElements`/`imageElements` cujo id não comece com `cd-`.

**Definição de pronto por fase:** `npx tsc --noEmit` limpo + `pnpm test` verde (incluindo os testes pré-existentes `client/src/lib/variationSnapshot.test.ts` e `shared/postsparkSchemas.test.ts`, que NUNCA podem regredir) + critérios de aceite da fase (§10). Uma fase = um commit/PR; não misturar fases.

**Quando o documento estiver ambíguo:** escolha a interpretação que (a) não toca no renderer, (b) mantém determinismo por seed, (c) é coberta por um teste novo. Registre a decisão em comentário no código e na seção de PR.

---

## 0. Princípios invioláveis (contrato de arquitetura)

1. `createPostVisualSnapshot()` continua sendo a **única fronteira canônica**. O motor roda **antes** dela e devolve `PostVariation` comum. Nenhum normalizador paralelo.
2. O LLM **nunca** escolhe hex, CSS ou nomes de preset. Ele emite apenas *intenção criativa* em vocabulário controlado (3 enums, ~15 tokens).
3. Todo mapeamento intenção → visual é **determinístico e puro**: mesma entrada + mesma seed = snapshot estruturado **deep-equal** (o render/export pode variar por fonte, browser e antialiasing — o contrato de reprodutibilidade é sobre os DADOS, não sobre os pixels).
4. Aleatoriedade é **seedada e persistida** (`creativeDirection.seed`). Reabrir um post salvo reproduz o visual exato.
5. O motor **nunca apaga** elementos do usuário. Elementos gerados pelo motor têm ids prefixados `cd-`; recompor remove apenas `cd-*` e reinsere.
6. Troca de família/paleta no HoloDeck é **client-side, instantânea e grátis** (0 sparks), conforme `CORRECAO_PLANO_LLM.md`.
7. `snapshotVersion` atual é **3**. Este blueprint não exige v4. Campos novos são **aditivos e opcionais**. A v4 é especificada na seção 12 apenas como evolução futura.
8. Brand extraction (Chameleon/SiteIntelligence) tem **precedência sobre paleta** do motor; a **família de composição** ainda se aplica.
9. **A assinatura constante do produto não está nos templates — está no scaffold** (badge + sticker + accentBar + card sempre presentes). Toda família declara uma **política de ornamentos** e um **cardMode**; variabilidade percebida exige poder apagar a moldura, não só recolorir o miolo.
10. Repertório é percebido **entre gerações**, não só dentro de uma: o Diretor recebe as famílias usadas recentemente pelo usuário (soft-exclusion) e a UI nomeia cada variação pela família ("personalidade"), com re-sorteio grátis ("Surpreenda-me").

---

## 0.1 Confronto de hipóteses (rev. 2, 2026-07-03)

| Hipótese | Veredito no código | Consequência no plano |
|---|---|---|
| H1 — problema não é falta de template | **Confirmada.** Schema obriga `copyAngle.badge/stickerText` (`routers.ts:1027`); `PostCardV2` renderiza badge/sticker/accentBar em ~100% dos posts. A "mesma cara" é o scaffold, não o template. | Política de ornamentos por família (§2 `FamilyOutput.ornaments`, regra 8 do compose). Badge/sticker ocultáveis HOJE via string vazia (guards `PostCardV2.tsx:972/:1017`); accentBar exige exceção de 1 linha no renderer (§9.5). |
| H2 — referências = direção de arte, não tema | **Confirmada.** Eixos/famílias já refletem isso. Fraqueza: efeitos noise/grid/glitch do CSS legado só existem no caminho `ThemeConfig` do `ThemeRenderer`, não no caminho `designTokens`. | Eixo `textured` aterrissado em assets de galeria determinísticos (§4.11); textura por token = v4. |
| H3 — verdade única no snapshot | **Confirmada e respeitada.** Motor roda antes de `createPostVisualSnapshot`. | Nenhuma mudança. |
| H4 — LLM não é designer de CSS | **Confirmada e implementada** (intent 3 enums → motor). | Nenhuma mudança; remoção dos campos de cor do schema LLM segue na Fase 6. |
| H5 — percebida pelo usuário, controlável pelo sistema | **Parcial no plano anterior.** Matriz garantia diversidade DENTRO da geração; nada entre gerações. `recentPosts` (20) já é carregado no `post.generate` (`routers.ts:639/1437`). | Rotação de repertório: `recentFamilyIds` como soft-exclusion no Diretor (§6, §7.2). |
| H6 — o produto é repertório | **Parcial.** HoloDeck mostrava `layout · backgroundColor` na lista — linguagem de sistema. Card-dentro-do-canvas é o 2º maior driver de "mesma cara". | Família vira "personalidade" nomeada na UI + botão "Surpreenda-me" (re-seed grátis) (§8); `cardMode: "full-bleed"` via tokens puros (§2, regra 9). |

---

## 1. Arquitetura (visão executável)

```
post.generate (LLM: conteúdo + creativeIntent {mood, energy, formality})
      │
      ▼
directCreative(variation, intent, seed, opts)      [server, determinístico]
      │  → CreativeDirection { familyId, paletteId, seed, axes, source }
      ▼
composeCreativeDirection(variation, direction)     [shared, determinístico]
      │  → PostVariation enriquecida (designTokens, layout, layoutSettings,
      │    textElements cd-*, template, bgOverlay, imageSettings, fontes)
      ▼
createPostVisualSnapshot()                         [fronteira canônica, INTOCADA]
      ▼
HoloDeck ── seletores de família/paleta → re-compose client-side (0ms)
      ▼
Workbench ── edita o snapshot como qualquer outro; edição manual de cor
             limpa creativeDirection.paletteId (metadata não mente)
```

**Local do código: `shared/creative/`** — importável de server e client sem o import cruzado `server → client/src/lib` que o `CORRECAO_PLANO_LLM.md` propunha.

```
shared/creative/
  types.ts          — contratos (CreativeDirection, CreativeFamily, PaletteDef, enums)
  seed.ts           — PRNG mulberry32 + hashString
  color.ts          — lighten/darken/mix/contrastRatio/isDark (implementações reais)
  palettes.ts       — 10 duplas → PaletteDef → DesignTokens (5 cores derivadas)
  families.ts       — 12 famílias declarativas
  directCreative.ts — Diretor de Arte (intent → direção) + classificador fallback
  compose.ts        — montador (composeCreativeDirection, injectContent, validador)
  index.ts          — barrel export
```

O adaptador Groq (`server/ai/styleContentAdapter.ts`) e a rota `post.adaptContentForRecipe` seguem exatamente a especificação já auditada em `CORRECAO_PLANO_LLM.md` (com a correção `taskRoute: "microcopy"`), trocando `CompositionRecipe` por `CreativeFamily`.

---

## 2. Spec TypeScript — `shared/creative/types.ts`

> **Nota de organização (anti-ciclo, ver §7.3):** `CreativeDirection`, `CreativeAxes` e os enums de eixo abaixo são declarados fisicamente em `shared/postspark.ts` e re-exportados por este arquivo. Os demais tipos (intent, família, contexto) vivem aqui. O bloco abaixo mostra o conjunto completo para leitura; as interfaces persistidas aparecem aqui apenas como referência documental, não como local físico de implementação.

```typescript
import type {
  AdvancedLayoutSettings, BgOverlaySettings, DesignTokens, ImageSettings,
  PostTemplate, PostVariation, TextElement, ImageElement,
} from "../postspark";

// ── Intenção (o ÚNICO vocabulário que o LLM conhece) ────────────────────────
export type CreativeMood =
  | "urgente" | "sereno" | "premium" | "tech" | "divertido" | "editorial" | "cru";
export type CreativeEnergy = "baixa" | "media" | "alta";
export type CreativeFormality = "formal" | "neutro" | "casual";

export interface CreativeIntent {
  mood: CreativeMood;
  energy: CreativeEnergy;
  formality: CreativeFormality;
}

// ── Eixos visuais (saída do Diretor; valores fechados) ──────────────────────
export type CompositionAxis = "poster" | "split" | "grid" | "freeform" | "centered-minimal";
export type TypographyAxis  = "display-brutal" | "editorial-serif" | "mono-tech" | "clean-sans";
export type MediaAxis       = "flat" | "photo-overlay" | "photo-duotone" | "textured";
export type DepthAxis       = "flat" | "hard-shadow" | "layered" | "glass";
export type DensityAxis     = "airy" | "balanced" | "packed";

export interface CreativeAxes {
  composition: CompositionAxis;
  typography: TypographyAxis;
  media: MediaAxis;
  depth: DepthAxis;
  density: DensityAxis;
}

// ── Direção resolvida (persistida no PostVariation) ─────────────────────────
export interface CreativeDirection {
  version: 1;
  familyId: string;
  paletteId: string;
  /** true = fundo/texto invertidos em relação à dupla base */
  paletteInverted: boolean;
  seed: number;                 // uint32, determinístico por (generationRunId, index)
  axes: CreativeAxes;
  source: "llm-intent" | "classifier" | "user";
  /** Textos de badge/sticker ocultados pela família (restauráveis ao trocar de família) */
  hiddenOrnaments?: { badge?: string; stickerText?: string };
}

// ── Paleta ───────────────────────────────────────────────────────────────────
export interface PaletteDef {
  id: string;
  label: string;
  /** Dupla base da pasta "novos estilos/Estilos" */
  colorA: string;               // ex.: "#21F1A8"
  colorB: string;               // ex.: "#171717"
  temperature: "warm" | "cool" | "neutral";
  vibe: Array<CreativeMood>;    // moods com afinidade
  /** Permite inversão fundo/texto quando ambos os sentidos passam WCAG */
  invertible: boolean;
}

// ── Família ──────────────────────────────────────────────────────────────────
export interface ComposeContext {
  variation: PostVariation;     // conteúdo já gerado (read-only)
  tokens: DesignTokens;         // paleta já resolvida (5 cores derivadas)
  rand: () => number;           // PRNG seedado [0,1)
  aspectRatio: "1:1" | "5:6" | "9:16";
  /** Documento de referência do motor (§6.1-A). NUNCA usar % cru em TextElement/ImageElement. */
  doc: { width: number; height: number };            // ex.: { 360, 360 } em 1:1
  pxX: (pct: number) => number;                      // pct/100 * doc.width, arredondado
  pxY: (pct: number) => number;                      // pct/100 * doc.height, arredondado
}

/** Saída declarativa da família — apenas campos do contrato atual. */
export interface FamilyOutput {
  layout?: PostVariation["layout"];
  template?: PostTemplate;
  layoutSettings?: Partial<AdvancedLayoutSettings>;
  /** Elementos APPEND-ONLY; ids DEVEM começar com "cd-" */
  textElements?: TextElement[];
  imageElements?: ImageElement[];
  imageSettings?: Partial<ImageSettings>;
  bgOverlay?: Partial<BgOverlaySettings>;
  splitImagePosition?: "top" | "bottom";
  headlineFontFamily?: string;
  bodyFontFamily?: string;
  headlineFontSize?: number;    // multiplicador
  bodyFontSize?: number;
  headlineColor?: string;
  bodyColor?: string;
  /** Patch estrutural sobre designTokens.structure/typography (nunca colors) */
  structure?: Partial<DesignTokens["structure"]>;
  typography?: Partial<Pick<DesignTokens["typography"], "textTransform" | "textAlign">>;
  /**
   * Política de ornamentos — mata a "assinatura constante" do scaffold (H1).
   * Default: tudo "keep" (comportamento atual).
   */
  ornaments?: {
    badge?: "keep" | "hide";      // hide = copyAngle.badge → "" (só render; label preservado)
    sticker?: "keep" | "hide";    // hide = copyAngle.stickerText → ""
    accentBar?: "keep" | "hide";  // hide = layoutSettings.accentBar.width → 0 (exige §9.5)
  };
  /**
   * full-bleed: designTokens.colors.card = colors.background + border/boxShadow "none"
   * → o card desaparece visualmente, o post vira cartaz. Puro token, zero renderer.
   * Default: "card" (comportamento atual).
   */
  cardMode?: "card" | "full-bleed";
}

export interface CreativeFamily {
  id: string;
  label: string;
  description: string;
  axes: CreativeAxes;
  /** Moods que tornam a família elegível */
  moods: CreativeMood[];
  /** Regras de fit de conteúdo */
  fit: {
    maxHeadlineChars?: number;
    minHeadlineChars?: number;
    needsSections?: boolean;    // exige template estruturado / 3 seções
    needsNumber?: boolean;      // exige dígito no headline/body (Data Punch)
    needsImage?: boolean;       // exige bgValue com foto para efeito pleno
  };
  /** Estratégia para carrossel */
  carousel: "uniform" | "title-emphasis";
  compose: (ctx: ComposeContext) => FamilyOutput;
}
```

### Assinaturas públicas

```typescript
// seed.ts
export function hashString(s: string): number;            // FNV-1a → uint32
export function mulberry32(seed: number): () => number;   // PRNG determinístico

// color.ts — implementações REAIS (corrige bug #3 da AUDITORIA_FINAL)
export function lighten(hex: string, pct: number): string;   // HSL, aceita #RGB/#RRGGBB
export function darken(hex: string, pct: number): string;
export function mix(hexA: string, hexB: string, t: number): string;
export function contrastRatio(hexA: string, hexB: string): number; // WCAG
export function isDark(hex: string): boolean;

// palettes.ts
export const PALETTES: PaletteDef[];                       // 10 entradas
export function paletteToDesignTokens(p: PaletteDef, inverted: boolean): DesignTokens;

// families.ts
export const FAMILIES: CreativeFamily[];                   // 12 entradas

// directCreative.ts
export interface DirectOptions {
  excludeFamilyIds?: string[];      // exclusão dura: garante 3 variações distintas na MESMA geração
  recentFamilyIds?: string[];       // exclusão suave: famílias dos últimos posts salvos do usuário
                                    // (penaliza no sorteio; se só restarem recentes, usa mesmo assim)
  brandLocked?: boolean;            // brand extraction presente → não escolhe paleta
}
export function directCreative(
  variation: PostVariation,
  intent: CreativeIntent | undefined, // undefined → classificador fallback
  seed: number,
  opts?: DirectOptions,
): CreativeDirection;

// compose.ts
export function composeCreativeDirection(
  variation: PostVariation,
  direction: CreativeDirection,
  opts?: { keepBrandTokens?: boolean }, // true quando brandLocked
): PostVariation;                        // NUNCA muta a entrada
export function stripCreativeElements(v: PostVariation): PostVariation; // remove cd-*
export function validateComposition(v: PostVariation): { ok: boolean; fixes: string[] };
```

### Regras internas de `composeCreativeDirection` (obrigatórias)

1. `stripCreativeElements` primeiro → idempotência (recompor não acumula lixo).
2. Paleta: escreve **simultaneamente** `backgroundColor/textColor/accentColor` top-level **e** `designTokens` completo. Motivo: `synchronizeDesignTokenColors` em `variationSnapshot.ts:96` sobrescreve `designTokens.colors.{background,text,primary}` com os top-level — os dois níveis precisam nascer coerentes (invariante do DOCUMENTO_MESTRE §26).
3. `keepBrandTokens: true` → mantém cores/tokens existentes (Chameleon), aplica apenas a parte composicional da família (`layout`, `layoutSettings`, `textElements`, tipografia estrutural).
4. `textElements`/`imageElements` da família: **append** após os existentes; cores dos elementos `cd-*` só podem vir de `tokens.colors`.
5. Merge de `layoutSettings`: bloco a bloco (`headline`, `body`, ...), como `normalizeLayoutSettings` faz — nunca substituir o objeto inteiro.
6. Pós-montagem, `validateComposition` roda sempre: (a) contraste headline ≥ 3:1 e body ≥ 4.5:1 contra o fundo efetivo (usando `bgOverlay` quando houver foto — mitiga lacuna #10); (b) bounds: `freePosition` (percentual) dentro de 0–100 com folga de largura, e `x/y/width` de todo `cd-*` (pixels, §6.1-A) dentro de `0..doc.width/height` com folga; (c) fix automático = snap para a cor da paleta com maior contraste (mesma estratégia do `brandVisualGuardian`).
7. Escreve `variation.creativeDirection = direction` (metadata persistida).
8. **Ornamentos:** `ornaments.badge/sticker: "hide"` zera `copyAngle.badge`/`copyAngle.stickerText` — os guards `if (!copyAngle?.badge)` e `Boolean(copyAngle?.stickerText)` em `PostCardV2.tsx:972/:1017` já ocultam string vazia, zero mudança de renderer. `copyAngle.label` e `type` são SEMPRE preservados (a UI do HoloDeck os usa). Para que a troca posterior para uma família com `badge: "keep"` possa restaurar os textos, o compose grava os valores originais em `creativeDirection.hiddenOrnaments?: { badge?: string; stickerText?: string }` no momento do hide, e `stripCreativeElements` os restaura antes de recompor (campo incluído no schema §7.3).
9. **cardMode `full-bleed`:** `tokens.colors.card = tokens.colors.background` + `structure.border/boxShadow = "none"`. Implementado inteiramente em tokens — o `ThemeRenderer` (caminho designTokens) pinta card e canvas da mesma cor e o card some visualmente.
10. **Carrossel (ARMADILHA — leia com atenção):** `textElements` na raiz do snapshot renderizam em TODOS os slides (a projeção `projectSnapshotForSlide` só sobrescreve quando `slides[].editorState.variation.textElements` existe). Portanto: família `carousel: "uniform"` → `cd-*` na raiz, normal. Família `carousel: "title-emphasis"` → os `cd-*` de destaque vão em `slides[0].editorState.variation.textElements` (apenas slide 1); a raiz recebe só a parte uniforme da receita (tokens, layout, tipografia, ornamentos). `postMode === "carousel"` é detectável em `variation.postMode`/`variation.slides`.
11. **`creativeIntent` é transiente:** existe apenas na saída bruta do LLM. NÃO adicionar ao tipo `PostVariation` nem aos schemas Zod persistíveis; o compose deleta a chave do objeto final (`delete (result as any).creativeIntent`). O que persiste é `creativeDirection` (a decisão), nunca a intenção bruta.
12. **Aspect ratio no compose:** `ComposeContext.aspectRatio = variation.aspectRatio ?? "1:1"`. Posições `freePosition` são percentuais e sobrevivem à troca de formato — a troca de ratio no HoloDeck NÃO dispara recompose (comportamento atual de re-snapshot é suficiente).

---

## 3. Catálogo de paletas — `shared/creative/palettes.ts`

As 10 duplas da pasta `Estilos`, com derivação determinística das 5 cores:

| id | colorA | colorB | temperature | vibe |
|---|---|---|---|---|
| `tiffany-dark` | `#21F1A8` | `#171717` | cool | tech, cru |
| `true-pink` | `#FD1843` | `#FFF9FA` | warm | divertido, urgente |
| `violet-lime` | `#3C1A47` | `#B6FF00` | cool | tech, divertido |
| `cyprus-sand` | `#004741` | `#F0EDE4` | neutral | premium, editorial |
| `lime-canopy` | `#E4FD97` | `#2D3E2C` | neutral | sereno |
| `milky-mantis` | `#FFFDF1` | `#59C749` | warm | sereno, divertido |
| `turmeric-malt` | `#FFBE0B` | `#2A2312` | warm | urgente, divertido |
| `silver-moss` | `#141414` | `#28EE34` | cool | tech, cru |
| `volcano-night` | `#FF4103` | `#001621` | warm | urgente, cru |
| `skin-bridal` | `#FFC6A8` | `#741A2F` | warm | premium, editorial |

**Derivação (`paletteToDesignTokens`):**

```
dark  = a cor com isDark() true (ou a de menor luminância)
light = a outra
inverted=false → background=dark,  text=light
inverted=true  → background=light, text=dark   (só se p.invertible e contraste ≥ 4.5)
primary   = a cor mais saturada da dupla
secondary = mix(primary, background, 0.35)
card      = isDark(background) ? lighten(background, 6) : darken(background, 4)
```

Contraste da dupla é validado em teste (AA para body 4.5:1; onde falhar para body — ex. `lime-canopy` — a paleta é marcada `bodyNeedsBoost: true` e o compose escurece/clareia `bodyColor` até passar). Tipografia default do token: `fontFamily: "Space Grotesk"`, sobrescrita pelo eixo tipográfico da família. `structure` default: `borderRadius: "16px"`, `boxShadow: "none"`, `border: "none"` — famílias patcham via `FamilyOutput.structure`.

A inversão seedada (`rand() < 0.35 && p.invertible`) transforma 10 duplas em ~17 variantes efetivas sem novo asset.

---

## 4. As 12 famílias — `shared/creative/families.ts`

Formato de cada entrada: **intenção · eixos · receita determinística (campos exatos) · fit/conteúdo · carrossel · limitações → v4**.

> **Convenção de coordenadas (§6.1-A):** todos os `{x, y}` e `width` de `textElements`/`imageElements` abaixo estão em **percentual de projeto** e DEVEM ser convertidos com `ctx.pxX/pxY` na montagem (o contrato real é pixels). `freePosition` de `layoutSettings` é percentual nativo e fica como está. `fontSize` está no espaço de referência 360 — usar os valores recalibrados de §6.1-A, não os nominais estimados nas receitas.

### 4.1 `editorial-poster` — Editorial Poster
- **Intenção:** capa de revista; hierarquia de poster cinematográfico.
- **Eixos:** poster · editorial-serif · photo-overlay · flat · balanced.
- **Receita:** `layout: "left-aligned"`; `headlineFontSize: 1.8`; `headlineFontFamily: "Playfair Display"`; `bodyFontFamily: "Inter"`; `layoutSettings.headline = { position: "bottom-left", freePosition: { x: 8, y: 62 + rand()*6 }, width: 84 }`; `layoutSettings.badge = { position: "top-left" }`; `accentBar = { width: 12, freePosition: { x: 8, y: 56 } }`; 1 `textElement` `cd-kicker` (microtexto uppercase, `fontSize: "11px"`, `letterSpacing` via fontFamily mono, cor `secondary`, `y: 8`); se houver foto: `bgOverlay { color: darken(bg, 20), opacity: 0.45 }`.
- **Fit:** headline ≤ 70 chars.
- **Carrossel:** `title-emphasis` (slide 1 recebe kicker; demais uniformes).
- **Limitações → v4:** sem kerning/leading fino por elemento; grid tipográfico real.

### 4.2 `chromatic-block` — Chromatic Block
- **Intenção:** dupla cromática crua da pasta Estilos; a cor É o design.
- **Eixos:** centered-minimal · display-brutal · flat · flat · balanced.
- **Receita:** `layout: "centered"`; `bgValue` sólido (compose não injeta foto); `headlineFontFamily: "Anton"`; `headlineFontSize: 1.6 + rand()*0.4`; `typography.textTransform: "uppercase"`; `structure.borderRadius: "0px"`; `layoutSettings.padding: 32`; sticker do `copyAngle` reposicionado com rotação implícita via `textElement` `cd-sticker-rot` (`rotation: -6 + rand()*12`).
- **Fit:** headline ≤ 45 chars (senão adaptador Groq encurta).
- **Carrossel:** `uniform`.
- **Limitações:** nenhuma relevante — caso perfeito do contrato atual.

### 4.3 `brutal-split` — Brutal Split
- **Intenção:** declaração agressiva, neobrutalismo.
- **Eixos:** split · display-brutal · flat · hard-shadow · packed.
- **Receita:** `layout: "split"`; `splitImagePosition: rand() < 0.5 ? "top" : "bottom"`; `structure = { border: "3px solid " + (isDark(bg) ? "#ffffff" : "#000000"), boxShadow: "6px 6px 0px " + darken(primary, 30), borderRadius: "0px" }`; `headlineFontFamily: "Archivo Black"`; `typography.textTransform: "uppercase"`; `layoutSettings.headline.backgroundColor: primary` + `borderRadius: 0` (efeito etiqueta).
- **Fit:** headline ≤ 40 chars.
- **Carrossel:** `uniform`.
- **Limitações → v4:** sombra dura é do card, não por elemento; sombras por bloco.

### 4.4 `glitch-signal` — Glitch Signal
- **Intenção:** tech/futuro, ruído digital.
- **Eixos:** freeform · mono-tech · flat · layered · balanced.
- **Receita:** fundo `darken(background, 8)`; headline principal via bloco normal; 2 `textElements` `cd-glitch-1/2` = cópias do headline com `x/y` deslocados `±(0.8 + rand()*1.2)%`, cores `primary` e `secondary`, `opacity: "0.65"`, `fontFamily: "Space Mono"`, render antes do bloco principal (ordem do array = ordem de pintura); 1 `cd-scanline-tag` (ex.: `"//" + copyAngle.badge`, fontSize 12px, cor secondary, `y: 90`).
- **Fit:** headline ≤ 30 chars (glitch legível exige texto curto); mood ∈ {tech, cru}.
- **Carrossel:** `title-emphasis` (glitch só no slide 1 — performance, lacuna #6).
- **Limitações → v4:** estático, sem `mix-blend-mode` por texto; blend/filter por elemento.

### 4.5 `glass-veil` — Glass Veil
- **Intenção:** premium etéreo sobre foto.
- **Eixos:** centered-minimal · clean-sans · photo-overlay · glass · airy.
- **Receita:** exige foto (`fit.needsImage`); `bgOverlay { color: lighten(bg, 12), opacity: 0.25 }`; `imageSettings { blur: 2, brightness: 1.05 }`; card translúcido: `layoutSettings.card = { position: "center", width: 78 }`, `structure = { border: "1px solid " + primary + "40", borderRadius: "24px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }`; `layoutSettings.headline.backgroundColor: background + "cc"` (véu no bloco de texto).
- **Fit:** mood ∈ {premium, sereno}; sem foto → Diretor não elege.
- **Carrossel:** `uniform`.
- **Limitações → v4:** sem `backdrop-filter` persistido por elemento (blur é global via `imageSettings`); glass real na v4.

### 4.6 `kinetic-type` — Kinetic Type
- **Intenção:** energia; headline longa vira coreografia.
- **Eixos:** freeform · display-brutal · flat · layered · packed.
- **Receita:** headline fatiada em 2–3 segmentos por palavra (função pura `splitHeadline`, spec em §6.1). **Regra de montagem:** o ÚLTIMO segmento permanece no campo `headline` nativo (preserva editabilidade inline e coerência da caption); os segmentos anteriores viram `textElements` `cd-kin-0`, `cd-kin-1` com `rotation: -4 + rand()*8`, `fontSize` alternando `"48px"/"34px"`, cores alternando `text`/`primary`, `y` empilhado `18 + n*16`; `layoutSettings.headline.freePosition` posiciona o segmento nativo como continuação da pilha (`y: 18 + (n_total-1)*16`). Nunca ocultar a headline nativa (nem via cor transparente, nem movendo para fora do canvas).
- **Fit:** headline > 45 chars; energy = alta.
- **Carrossel:** `title-emphasis`.
- **Limitações → v4:** quebra por palavra, risco de overflow (mitigado por `validateComposition` bounds); warp/curva na v4.

### 4.7 `data-punch` — Data Punch
- **Intenção:** autoridade numérica; a estatística é o herói. (Cobre a lacuna "receitas de dados" da auditoria.)
- **Eixos:** poster · clean-sans · flat · flat · airy.
- **Receita:** extrai primeiro número de headline/body (`/\d+([.,]\d+)?%?/`); `textElement` `cd-stat` com o número, `fontSize: "96px"`, `fontWeight: "800"`, cor `primary`, `x: 8, y: 22`, `width: 84`; headline nativa reduzida (`headlineFontSize: 0.8`) reposicionada `y: 58`; accentBar sob o número.
- **Fit:** `needsNumber: true` — sem dígito, família inelegível.
- **Carrossel:** `title-emphasis` (número no slide 1).
- **Limitações → v4:** 1 estatística; mini bar-chart com `imageElements` fica para iteração 2 (já é possível no contrato, não é bloqueio de schema).

### 4.8 `versus` — Versus / Mito×Verdade
- **Intenção:** contraste binário; casa com `copyAngleType: "mito_vs_verdade"` e objeção.
- **Eixos:** grid · display-brutal · flat · flat · balanced. (Display: os labels MITO/VERDADE são tipografia-manifesto em uppercase; isso também garante célula `grid:display`, distinta de `mosaic-grid` em `grid:clean` — ver `cellOf` em §6.1.)
- **Receita:** `template: "feature-grid"` com exatamente 2 `sections` (labels "MITO"/"VERDADE" ou derivados do conteúdo via `injectContent`; se `sections` originais ≥ 2, usa as 2 primeiras); `sectionLayouts` com `backgroundColor` opostos: seção 1 `darken(primary, 25)`, seção 2 `primary`; `typography.textTransform: "uppercase"` nos labels.
- **Fit:** `needsSections` (ou copyAngle mito_vs_verdade/objecao → adaptador Groq gera as 2 seções).
- **Carrossel:** `uniform`.
- **Limitações → v4:** split vertical fixo; diagonal exige clip-path (v4).

### 4.9 `quote-authority` — Quote Authority
- **Intenção:** citação com peso institucional.
- **Eixos:** centered-minimal · editorial-serif · flat · flat · airy.
- **Receita:** 2 `textElements` `cd-quote-open/close` (aspas tipográficas gigantes `"` e `"`, `fontSize: "120px"`, cor `primary`, `opacity: "0.35"`, posições `{x:6,y:6}` e `{x:82,y:70}`); headline nativa mantida (sem itálico — o contrato não tem fontStyle no bloco nativo, e NÃO se duplica a headline em textElement), com `headlineFontFamily: "Lora"` e `headlineFontSize: 1.3`; 1 `textElement` `cd-attribution` com o texto de `copyAngle.badge` original (fonte `fontSize: "13px"`, uppercase via texto já transformado, `y: 86`) — por isso esta família tem `badge: "hide"` no §4.13: o badge nativo some e renasce como assinatura tipográfica.
- **Fit:** copyAngle ∈ {autoridade, storytelling}; headline ≤ 90 chars.
- **Carrossel:** `uniform`.
- **Limitações → v4:** sem foto do autor recortada (cutout/segmentação).

### 4.10 `minimal-air` — Minimal Air
- **Intenção:** silêncio premium; 80% whitespace.
- **Eixos:** centered-minimal · clean-sans · flat · flat · airy.
- **Receita:** `layoutSettings.padding: 48`; `headlineFontSize: 0.9`; `layout: "centered"`; accentBar como único ornamento (`width: 8`); `bodyFontSize: 0.85`; `ornaments: { sticker: "hide" }` (ver §4.13 — hide via `copyAngle.stickerText = ""`, restaurável por `hiddenOrnaments`).
- **Fit:** headline ≤ 50 chars e body ≤ 90 chars (senão adaptador Groq).
- **Carrossel:** `uniform`.
- **Limitações:** depende de copy curta; nenhuma dívida de contrato.

### 4.11 `mosaic-grid` — Mosaic Grid
- **Intenção:** conteúdo denso em blocos assimétricos.
- **Eixos:** grid · clean-sans · textured · flat · packed.
- **Receita:** `template: "feature-grid"` com 3 `sections` (exige `injectContent`/adaptador); `sectionLayouts` com `backgroundColor` alternando `card`/`mix(card, primary, 0.25)`/`card` e `borderRadius` alternando `"0px"/"16px"`; padrão de pontos playful via `designTokens.decorations: "playful"`.
- **Fit:** `needsSections: true` (3 itens).
- **Carrossel:** `uniform`.
- **Limitações → v4:** grid de 3 fixo; grids N assimétricos.

### 4.12 `duotone-wash` — Duotone Wash
- **Intenção:** foto banhada na cor da marca.
- **Eixos:** poster · display-brutal · photo-duotone · flat · balanced.
- **Receita:** exige foto; `imageSettings { saturation: 0.1, contrast: 1.15, blendMode: "multiply" }`; `bgOverlay { color: primary, opacity: 0.55, position: {x:50,y:40} }`; headline branca/escura por contraste calculado contra `mix(primary, "#000000", 0.55)`.
- **Fit:** `needsImage: true`.
- **Carrossel:** `uniform`.
- **Limitações → v4:** aproximação — duotone real exige `BlendMode` `color`/`hue` (extensão v4 do tipo em `shared/postspark.ts:332`).

### 4.13 Política de ornamentos e cardMode por família (H1/H6)

O scaffold (badge + sticker + accentBar + card) é a assinatura mais repetitiva do produto. Distribuição obrigatória — pelo menos metade do catálogo sem a moldura completa:

| Família | badge | sticker | accentBar | cardMode |
|---|---|---|---|---|
| `editorial-poster` | keep | hide | keep | full-bleed |
| `chromatic-block` | hide | keep (rotacionado) | hide | full-bleed |
| `brutal-split` | keep (etiqueta) | keep | hide | card |
| `glitch-signal` | hide (vira `cd-scanline-tag`) | hide | hide | full-bleed |
| `glass-veil` | keep | hide | hide | card (translúcido) |
| `kinetic-type` | hide | keep | hide | full-bleed |
| `data-punch` | keep | hide | keep | full-bleed |
| `versus` | keep | hide | hide | card |
| `quote-authority` | hide (vira `cd-attribution`) | hide | hide | full-bleed |
| `minimal-air` | keep | hide | keep (único ornamento) | full-bleed |
| `mosaic-grid` | keep | keep | hide | card |
| `duotone-wash` | hide | keep | keep | full-bleed |

Teste da Fase 1 garante a distribuição: ≥ 6 famílias `full-bleed`, ≥ 6 com sticker oculto, ≥ 5 com badge oculto — nenhum ornamento presente em 100% do catálogo.

### 4.14 Eixo textura — aterrissagem (H2)

Os efeitos noise/grid/glitch de `theme-effects.css` só existem no caminho legado `ThemeConfig` do `ThemeRenderer`; o caminho `designTokens` não os renderiza. Aterrissagem determinística hoje: **assets de textura na galeria** (`client/public/backgrounds/textures/` — grain, papel, ruído sutil; 3-4 PNGs leves) usados via `bgValue: { type: "gallery", url }` pelas famílias com eixo `textured`, com `bgOverlay` na cor da paleta por cima. Textura como propriedade de token (`decorations` estendido) fica para a v4.

---

## 5. Matriz de dissimilaridade (anti-repetição, lacuna #3)

Eixo X = estrutura (estruturado ↔ livre). Eixo Y = voz tipográfica (display-bold ↔ editorial/body).

|  | **Grid/Template** | **Poster/Blocos** | **Centrado mínimo** | **Freeform** |
|---|---|---|---|---|
| **Display-bold** | `versus` | `duotone-wash`, `brutal-split` | `chromatic-block` | `kinetic-type`, `glitch-signal` |
| **Clean-sans** | `mosaic-grid` | `data-punch` | `minimal-air`, `glass-veil` | — |
| **Editorial-serif** | — | `editorial-poster` | `quote-authority` | — |

Colisões residuais e resolução obrigatória:
- `minimal-air` × `glass-veil`: diferem por eixo mídia (flat × photo) — o Diretor **nunca** elege ambas na mesma geração (regra em `directCreative`: máximo 1 família por célula da matriz por conjunto de 3 variações).
- `duotone-wash` × `brutal-split`: diferem por mídia (foto × flat) — mesma regra de célula se aplica.
- Regra global: as 3 variações de uma geração devem ocupar **3 células distintas** da matriz. Implementação: `excludeFamilyIds` acumula apenas os ids; `cellTaken` (spec em §6.1) deriva as células ocupadas a partir desses ids via `cellOf`.

---

## 6. Diretor de Arte — `directCreative.ts`

```typescript
export function directCreative(variation, intent, seed, opts = {}) {
  const rand = mulberry32(seed);

  // 1. Intenção: LLM (source: "llm-intent") ou classificador fallback
  const resolvedIntent = isValidIntent(intent)
    ? intent
    : classifyIntentFromContent(variation);   // keywords PT-BR, portado do
                                              // CORRECAO_PLANO_LLM.md §Componente 1

  // 2. Famílias elegíveis: mood compatível + fit de conteúdo + célula livre
  const eligible = FAMILIES.filter(f =>
    f.moods.includes(resolvedIntent.mood) &&
    fitsContent(f.fit, variation) &&
    !opts.excludeFamilyIds?.includes(f.id) &&
    !cellTaken(f, opts.excludeFamilyIds),
  );
  // Rotação de repertório (H5): famílias recentes do usuário são preteridas,
  // não proibidas — se todas as elegíveis são recentes, o filtro é ignorado.
  const fresh = eligible.filter(f => !opts.recentFamilyIds?.includes(f.id));
  const pool = fresh.length ? fresh : eligible;
  // Fallback em cascata: relaxa mood → relaxa célula → chromatic-block (sempre cabe)
  const family = pickSeeded(pool.length ? pool : fallbackChain(variation), rand);

  // 3. Paleta: brandLocked → id sintético "brand"; senão vibe-match + seed
  const palette = opts.brandLocked
    ? { id: "brand", inverted: false }
    : pickPalette(resolvedIntent, variation, rand);   // vibe ∩ mood, senão temperature

  return {
    version: 1,
    familyId: family.id,
    paletteId: palette.id,
    paletteInverted: palette.inverted,
    seed,
    axes: family.axes,
    source: isValidIntent(intent) ? "llm-intent" : "classifier",
  };
}
```

Seed canônica no server: `hashString(`${generationTrace.id}:${i}`)`. No client (troca manual), a seed existente é **preservada** — só `familyId`/`paletteId` mudam e `source: "user"`.

### 6.1 Especificações auxiliares de determinismo (obrigatórias — não improvisar)

**A. Espaço de coordenadas de `TextElement`/`ImageElement` (ERRATA CRÍTICA).**
No código real, `TextElement.x/y/width` e `ImageElement.x/y/width` são **PIXELS**, não percentuais: `AdvancedTextNode.tsx` renderiza `translate(${x}px, ${y}px)` e `width: ${width}px`. Além disso o espaço de documento em runtime é o tamanho renderizado do canvas (`CanvasInteractionProvider.tsx:266` usa `documentSize(canvas.clientWidth, canvas.clientHeight)`), não uma constante.

Convenções obrigatórias do motor:
- **Documento de referência:** `REF_DOC = { "1:1": {w:360,h:360}, "5:6": {w:360,h:432}, "9:16": {w:360,h:640} }` — 360 é o espaço usado pelos testes do kernel geométrico (`elementGeometryAdapters.test.ts:36`) e compatível com a largura de render dos previews (~320-360px).
- **Toda coordenada percentual escrita nas receitas do §4 é notação de projeto**, convertida na montagem via `ctx.pxX(pct)`/`ctx.pxY(pct)`. Exemplo: `cd-quote-open` em `{x:6, y:6}` vira `{ x: pxX(6) = 22, y: pxY(6) = 22 }` em 1:1. NUNCA gravar percentual cru em `TextElement`/`ImageElement`. (`LayoutPosition.freePosition` é a exceção: esse campo É percentual por contrato e permanece como está.)
- **`fontSize` das receitas está no espaço de referência 360.** Recalibrar na Fase 2 se necessário: os valores do §4 (96px, 120px, 48px...) foram estimados para canvas ~1080 e em 360 devem ser divididos por 3 como ponto de partida (ex.: `cd-stat` 96px → **32px**; `cd-quote-open` 120px → **40px**; `cd-kin` 48/34px → **16/12px**; microtextos 11-13px → **mantidos**, são legibilidade mínima).
- **Checkpoint obrigatório na Fase 2:** renderizar 1 família com `cd-*` no Workbench e no HoloDeck e confirmar visualmente que as posições caem onde o §4 descreve. Se o card renderizar em largura ≠ 360 e os elementos deslocarem, registrar a largura real de render e ajustar `REF_DOC` para ela (uma constante, um commit) — o motor não muda, só a constante.

**`pickSeeded<T>(arr: T[], rand): T`** — `arr[Math.floor(rand() * arr.length)]`. A ordem de `arr` deve ser estável: sempre a ordem de declaração dos catálogos (`FAMILIES`/`PALETTES`), nunca ordem de `Object.keys` ou de filtros instáveis.

**`cellOf(family): string`** — célula da matriz §5, computável a partir dos eixos:
```typescript
const structureGroup =
  family.axes.composition === "grid" ? "grid" :
  family.axes.composition === "poster" || family.axes.composition === "split" ? "poster" :
  family.axes.composition === "centered-minimal" ? "centered" : "freeform";
const voiceGroup =
  family.axes.typography === "display-brutal" || family.axes.typography === "mono-tech" ? "display" :
  family.axes.typography === "editorial-serif" ? "serif" : "clean";
return `${structureGroup}:${voiceGroup}`;
```
`cellTaken(f, excludeIds)` = alguma família em `excludeIds` tem o mesmo `cellOf`. O teste `cells-distinct-in-set` usa exatamente esta função.

**`pickPalette(intent, variation, rand)`** —
```
candidatas = PALETTES.filter(p => p.vibe.includes(intent.mood))
se vazio → candidatas = PALETTES.filter(p => p.temperature === TEMP_BY_MOOD[intent.mood])
se vazio → candidatas = PALETTES (todas)
palette  = pickSeeded(candidatas, rand)
inverted = palette.invertible && rand() < 0.35
           && contrastRatio(par invertido) >= 4.5   // senão inverted = false
```
`TEMP_BY_MOOD`: urgente→warm, divertido→warm, premium→neutral, editorial→neutral, sereno→neutral, tech→cool, cru→cool.

**`classifyIntentFromContent(variation): CreativeIntent`** (fallback quando o LLM não entrega intent válido) — keywords PT-BR sobre `headline + body + hashtags` em lowercase; primeira regra que casar vence, avaliadas NESTA ordem:

| Ordem | Keywords (contains) | mood |
|---|---|---|
| 1 | urgente, última, não perca, hoje, agora, corre, imperdível, promoção | `urgente` |
| 2 | ia, inteligência artificial, tech, startup, app, software, digital, crypto, futuro, inovação | `tech` |
| 3 | luxo, premium, exclusivo, sofisticado, elite, alta performance | `premium` |
| 4 | saúde, bem-estar, equilíbrio, meditação, yoga, calma, natureza, orgânico | `sereno` |
| 5 | game, meme, festa, diversão, criativo, arte, música, cultura | `divertido` |
| 6 | pare, chega, basta, nunca, verdade, mito, ninguém fala | `cru` |
| 7 | (default) | `editorial` |

`energy`: headline ≤ 30 chars OU mood ∈ {urgente, cru} → `alta`; body > 200 chars → `baixa`; senão `media`. `formality`: copyAngle.type ∈ {autoridade, objecao} → `formal`; mood ∈ {divertido} → `casual`; senão `neutro`.

**`splitHeadline(headline, rand): string[]`** — divide por palavras em 2 segmentos se ≤ 6 palavras, senão 3; pontos de corte nos limites de palavra mais próximos de 1/2 (ou 1/3 e 2/3); determinístico (rand só decide 2 vs 3 quando a contagem permite ambos: `count >= 5 && rand() < 0.5 ? 3 : 2`). Nunca corta palavra ao meio.

**`fitsContent(fit, variation): boolean`** — todas as condições declaradas devem passar: `maxHeadlineChars`/`minHeadlineChars` contra `headline.length`; `needsSections` → `(variation.sections?.length ?? 0) >= 2` OU `template` estruturado; `needsNumber` → regex `/\d/` em headline+body; `needsImage` → `variation.imageUrl || variation.bgValue?.url`.

---

## 7. Integração server — diffs em `server/routers.ts`

### 7.1 Schema de geração (LLM emite intenção)

Nos dois schemas de variação (carrossel ~linha 1016 e estático ~linha 1146, ao lado de `copyAngle`), adicionar:

```typescript
creativeIntent: {
  type: "object",
  properties: {
    mood: { type: "string", enum: ["urgente", "sereno", "premium", "tech", "divertido", "editorial", "cru"] },
    energy: { type: "string", enum: ["baixa", "media", "alta"] },
    formality: { type: "string", enum: ["formal", "neutro", "casual"] },
  },
  required: ["mood", "energy", "formality"],
  additionalProperties: false,
},
```

E `"creativeIntent"` nos arrays `required` (~linhas 1031-1047 e 1169-1178). Instrução de prompt (1 linha, junto ao bloco `copyAngle` ~linha 791):

> `- creativeIntent: classifique a intenção visual do post com mood, energy e formality. Não descreva cores nem layout aqui.`

**Remoções compensatórias (mesma PR, reduz ~500 tokens):** seções "LAYOUT INTELIGENTE" (~802-806) e "PSICOLOGIA E CLONAGEM DE CORES" (~808-810) do prompt. `backgroundColor/textColor/accentColor/layout` **permanecem** no schema nesta fase (o pipeline de revisão/avaliação os referencia); o motor os sobrescreve. Removê-los do schema é otimização da Fase 6.

### 7.2 Aplicação no `variations.map` (~linha 1566)

```typescript
import { directCreative, composeCreativeDirection, hashString } from "@shared/creative";

const brandLocked = Boolean(chameleonDesignTokens);
const usedFamilyIds: string[] = [];

// Rotação de repertório (H5): recentPosts já foi aguardado na linha ~1437 para
// originalidade semântica — reaproveitar, sem nova query.
// Shape verificado: getUserPosts retorna PostRecord[] (server/db.ts:19); o snapshot
// completo do post salvo fica na coluna `variation_snapshot` (JsonValue, db.ts:45).
const recentFamilyIds = Array.from(new Set(
  recentPosts
    .map((p) => (p.variation_snapshot as any)?.creativeDirection?.familyId)
    .filter(Boolean),
)).slice(0, 6) as string[];  // janela: ~2 gerações recentes

const generatedVariations = variations.map((v: any, i: number) => {
  const chameleonPost = chameleonPosts[i];
  const normalizedSlides = isCarousel ? normalizeCarouselSlides(v) : undefined;

  // ── Motor de Variabilidade Criativa ──
  const seed = hashString(`${generationTrace.id}:${i}`);
  const direction = directCreative(v as PostVariation, v.creativeIntent, seed, {
    excludeFamilyIds: usedFamilyIds,
    recentFamilyIds,
    brandLocked,
  });
  usedFamilyIds.push(direction.familyId);

  const base = {
    id: `var-${Date.now()}-${i}`,
    ...v,
    caption: v.caption || "",
    platform: input.platform,
    hashtags: v.hashtags || [],
    postMode: input.postMode,
    slides: normalizedSlides,
    ...(chameleonDesignTokens ? { designTokens: chameleonDesignTokens } : {}),
    ...(chameleonPost ? { copyAngle: { /* inalterado */ } } : {}),
    generationMeta: { /* inalterado */ },
  };

  return composeCreativeDirection(base, direction, { keepBrandTokens: brandLocked });
});
```

Pontos de atenção verificados no código real:
- `validateVariationSet`/`assertVariationSet` (~1603-1618) rodam **depois** do compose — a regra "3 células distintas" satisfaz automaticamente a exigência de layouts distintos (~linha 1363).
- `creativeDirection` entra em `finalOutput` do trace → o `GenerationAuditPanel` já o exibe de graça.
- Rota nova `post.adaptContentForRecipe` (renomear para `post.adaptContentForFamily`): implementação idêntica ao `CORRECAO_PLANO_LLM.md` §Componente 2/rota tRPC, com `CreativeFamily.fit` decidindo `needsStructuralAdaptation`.

### 7.3 Persistência — `shared/postsparkSchemas.ts`

Junto de `copyAngleSchema` (~linha 64):

```typescript
export const creativeDirectionSchema = z.object({
  version: z.literal(1),
  familyId: z.string(),
  paletteId: z.string(),
  paletteInverted: z.boolean(),
  seed: z.number().int().nonnegative(),
  axes: z.object({
    composition: z.enum(["poster", "split", "grid", "freeform", "centered-minimal"]),
    typography: z.enum(["display-brutal", "editorial-serif", "mono-tech", "clean-sans"]),
    media: z.enum(["flat", "photo-overlay", "photo-duotone", "textured"]),
    depth: z.enum(["flat", "hard-shadow", "layered", "glass"]),
    density: z.enum(["airy", "balanced", "packed"]),
  }),
  source: z.enum(["llm-intent", "classifier", "user"]),
  /** Espelho dos ornamentos ocultados pela família (regra 8 do compose) — permite restaurar ao trocar de família */
  hiddenOrnaments: z.object({
    badge: z.string().optional(),
    stickerText: z.string().optional(),
  }).optional(),
});
```

E no schema da variação (~linha 312, junto de `generationMeta`): `creativeDirection: creativeDirectionSchema.optional()`. Campo aditivo/opcional → **não** exige bump de `snapshotVersion` (v3 mantida), mas exige os testes de round-trip da seção 10.

**Onde os tipos moram (SEM ciclo de imports):** os tipos **persistidos** — `CreativeDirection`, `CreativeAxes` e os 5 enums de eixo — são declarados em **`shared/postspark.ts`** (junto do resto do contrato, como `CopyAngle`). `shared/creative/types.ts` importa esses tipos de `../postspark` e os **re-exporta**, declarando localmente apenas os tipos transientes do motor (`CreativeIntent`, `CreativeFamily`, `ComposeContext`, `FamilyOutput`, `PaletteDef`). Resultado: dependência em direção única `creative → postspark`, nunca o inverso. NÃO usar a alternativa de `postspark.ts` importar de `creative/types.ts` — criaria ciclo (mesmo que type-only e tecnicamente apagado pelo compilador, é frágil e proibido neste projeto).

---

## 8. Integração HoloDeck — `client/src/components/views/HoloDeck.tsx`

Infra já existe: `localVariations` + `updateActiveVariation` (linhas 341-348) + sidebar desktop. Adição = nova seção na sidebar (antes de "Mais presets") + acesso mobile via `StyleSelector`.

```typescript
const handleFamilyChange = (familyId: string) => {
  const current = activeVariation.creativeDirection;
  const direction: CreativeDirection = {
    ...(current ?? directCreative(activeVariation, undefined, hashString(activeVariation.id))),
    familyId,
    source: "user",
  };
  const stripped = stripCreativeElements(activeVariation);
  const recomposed = composeCreativeDirection(stripped, direction);
  updateActiveVariation(recomposed);                    // já re-snapshota (linha 344)

  const family = FAMILIES.find(f => f.id === familyId)!;
  if (!fitsContent(family.fit, activeVariation)) {
    // Adaptação de conteúdo: best-effort e assíncrona. O preview já trocou de família
    // com o conteúdo atual; se o adaptador falhar ou demorar, o usuário fica com a
    // versão sem adaptação (nunca bloquear, nunca reverter a família por erro aqui).
    void adaptContentMutation.mutateAsync({ variation: stripped, familyId })
      .then(adapted => updateActiveVariation(adapted))
      .catch(() => { /* fallback silencioso: preview permanece sem adaptação */ });
  }
};

const handlePaletteChange = (paletteId: string, inverted: boolean) => {
  /* mesma mecânica, trocando apenas paletteId/paletteInverted */
};
```

UI: duas linhas de chips — famílias elegíveis primeiro (fit ok), inelegíveis com badge "adapta conteúdo"; paletas como swatches de dupla cromática. Preview de swatch = 2 círculos (`colorA`/`colorB`), reutilizando o padrão visual de `ExtractedThemeCard`.

**Repertório nomeado (H6).** A família é a "personalidade" da variação, e a UI fala essa língua:
- Lista de variações na sidebar (linha ~976): substituir `{v.layout} · {v.backgroundColor}` por `{FAMILIES.find(f => f.id === v.creativeDirection?.familyId)?.label ?? v.layout}` — o usuário lê "Editorial Poster", "Brutal Split", "Glass Veil", não "split · #171717".
- Badge de família sobre o card ativo (junto ao `copyAngle.label` já exibido).

**"Surpreenda-me" (H6).** Botão na sidebar (e na `ActionBar` mobile) que re-sorteia a direção da variação ativa sem tocar no conteúdo:

```typescript
const handleSurprise = () => {
  const current = activeVariation.creativeDirection;
  const newSeed = hashString(`${activeVariation.id}:${Date.now()}`);
  const direction = directCreative(activeVariation, undefined, newSeed, {
    excludeFamilyIds: current ? [current.familyId] : [],   // nunca repete a atual
  });
  updateActiveVariation(
    composeCreativeDirection(stripCreativeElements(activeVariation), { ...direction, source: "user" }),
  );
};
```

Client-side, 0 sparks, instantâneo — é a materialização de "mesmo conteúdo, personalidades diferentes". A seed nova é persistida na direção, então salvar depois do surprise continua reprodutível.

Interação com `customTokens`/`applyDesignTokensToSnapshot` existente (linha 357-367): escolher um tema legado/extraído **limpa** `paletteId` da direção (`paletteId: "custom"`); escolher uma paleta do motor limpa `customTokens`. Uma única fonte vence por vez — sem precedência paralela.

---

## 9. Workbench — decisões fechadas

1. **Nenhuma mudança estrutural.** O snapshot chega montado; `PostCardV2` já renderiza tudo que as famílias produzem (verificado: `textElements` linha 667+, `imageElements` 697+, templates 356+, blend 638+, split 1401+).
2. **`DesignBlock`/`ChameleonPanel` permanece** (resolve a inconsistência #2 da auditoria): micro vence macro. Ao editar cor manualmente, o editorStore seta `creativeDirection.paletteId = "custom"` — a metadata nunca mente sobre o que está na tela.
3. Badge informativo no header do Workbench: "Direção: {family.label}" (read-only, 1 componente pequeno).
4. Elementos `cd-*` são editáveis como qualquer `textElement` — depois de editado manualmente, o id perde o prefixo (`cd-` → `usr-`) para que uma recomposição futura não o destrua.
5. **Exceções de renderer — exatamente DUAS, e nada além delas:**
   - **(a) accentBar.** Badge e sticker são ocultáveis por dados (string vazia), mas a `AccentBar` tem largura hardcoded (`width="3rem"`, `PostCardV2.tsx:1131` e equivalentes nos demais layouts). Mudança autorizada de 1 condição, repetida nos pontos de render da accentBar: `{layoutSettings.accentBar.width !== 0 && (<Draggable ...><AccentBar .../></Draggable>)}`. Não viola a invariante "renderers não resolvem design" (§27 do DOCUMENTO_MESTRE): o renderer não decide nada — apenas respeita um campo que já existe no snapshot. Default do contrato continua 15 (`DEFAULT_LAYOUT_SETTINGS`); posts antigos não mudam. Teste dedicado na Fase 4.
   - **(b) Fontes de `textElements`.** `PostCardV2.tsx:512-514` carrega fontes de designTokens/headline/body, mas não as de `textElements[].styles.fontFamily`. Adicionar 1 hook de carregamento (`useTextElementFonts`) ao lado dos `useDynamicFont` existentes — side-effect puro, zero mudança de markup, estilo ou lógica de design. Detalhe na Fase 2 (§10).

---

## 10. Plano de fases, testes e critérios de aceite

### Fase 0 — Fundações (S)
- **Arquivos:** `shared/creative/{seed,color}.ts` (+ testes); correção documental: `RESUMO_EXECUTIVO.md` (v2→v3), `server/theme.test.ts` fica para Fase 3.
- **Testes:** `shared/creative/color.test.ts` — `lighten/darken` nunca retornam o input inalterado para pct>0; aceitam `#RGB` e `#RRGGBB`; `contrastRatio("#000","#fff") ≈ 21`. `seed.test.ts` — `mulberry32(42)` gera sequência fixa registrada no teste; `hashString` estável.
- **Aceite:** `npx tsc --noEmit` limpo; `pnpm test shared/creative` verde.

### Fase 1 — Catálogo (M)
- **Arquivos:** `shared/creative/{types,palettes,families,index}.ts`; 3-4 assets de textura em `client/public/backgrounds/textures/` (§4.14).
- **Testes:** `palettes.test.ts` — 10 paletas; todas com contraste headline ≥ 3:1; body ≥ 4.5:1 ou `bodyNeedsBoost`; `paletteToDesignTokens` determinístico e com 5 cores distintas (card ≠ background). `families.test.ts` — 12 famílias; ids únicos; matriz: nenhuma célula com 2 famílias de mesma mídia; todo `compose()` retorna apenas ids `cd-*`; distribuição de ornamentos/cardMode conforme §4.13.
- **Aceite:** catálogo importável de `server/` e `client/` sem ciclo de import (verificar com `npx tsc --noEmit`).

### Fase 2 — Montagem determinística (M)
- **Arquivos:** `shared/creative/{compose,directCreative}.ts`; ajuste em `shared/postspark.ts` (`creativeDirection?` + tipos persistidos, §7.3) e `shared/postsparkSchemas.ts` (schema §7.3); `client/src/hooks/useTextElementFonts.ts` + 1 linha de hook em `PostCardV2.tsx` (exceção §9.5-b).
- **Testes:** `compose.test.ts` — (a) mesma seed ⇒ output deep-equal; (b) `textElements` do usuário preservados e `cd-*` regenerados (idempotência); (c) toda família × toda paleta × 3 ratios atravessa `createPostVisualSnapshot` sem exceção e com `designTokens.colors` coerente com top-level; (d) `validateComposition` corrige contraste insuficiente; (e) round-trip Zod `compose → schema.parse → deep-equal`. `directCreative.test.ts` — intent válido ⇒ família do mood; intent ausente ⇒ classifier; `excludeFamilyIds` respeitado; `brandLocked` não escolhe paleta; fallback em cascata nunca lança.
- **Ajuste confirmado (não é mais só risco):** carregamento de Google Fonts. O catálogo usa exatamente 7 fontes: **Anton, Archivo Black, Playfair Display, Lora, Space Mono, Space Grotesk, Inter**. Estado verificado do código: `PostCardV2.tsx:512-514` já chama `useDynamicFont` para `designTokens.typography.fontFamily`, `headlineFontFamily` e `bodyFontFamily` — **mas nada carrega as fontes usadas dentro de `textElements[].styles.fontFamily`**. Correção obrigatória (é a 2ª exceção de renderer, ver §9.5): adicionar em `PostCardV2` um load das famílias únicas dos elementos (ex.: hook `useTextElementFonts(variation.textElements)` que itera e chama o mesmo mecanismo do `useDynamicFont`). Side-effect de carregamento apenas — zero mudança de markup/estilo. NUNCA carregar fonte dentro do compose (é código puro/isomórfico).
- **Aceite:** snapshot de qualquer família renderiza no `PostRenderer` atual sem alterar markup/renderização visual; permitido apenas o hook de fontes de `textElements` documentado em §9.5-b. `variationSnapshot.test.ts` existente continua verde.

### Fase 3 — Integração geração + HoloDeck (L)
- **Arquivos:** `server/routers.ts` (§7.1, §7.2 incl. `recentFamilyIds`, rota `post.adaptContentForFamily`); `server/ai/styleContentAdapter.ts`; `client/src/components/views/HoloDeck.tsx` (§8: seletores, repertório nomeado na lista de variações, botão "Surpreenda-me"); `server/theme.test.ts` (atualizar contagem/asserts).
- **Testes:** integração de geração (mock LLM) — 3 variações com `creativeDirection` de células distintas; intent inválido do LLM ⇒ `source: "classifier"`; brand extraction ⇒ `paletteId: "brand"` e tokens Chameleon intactos; posts recentes com família X ⇒ nova geração evita X quando há alternativa. Teste de rota `adaptContentForFamily` com mock Groq. Snapshot handoff: HoloDeck → `loadSnapshot` → save → restore reproduz `creativeDirection` e visual. "Surpreenda-me" nunca repete a família atual e persiste a nova seed.
- **Aceite:** geração real produz 3 variações visualmente distintas **com scaffolds distintos** (não só cores: pelo menos 1 full-bleed no conjunto quando elegível); troca de família/paleta e "Surpreenda-me" instantâneos e sem sparks; reabrir post salvo reproduz o **snapshot estruturado deep-equal** (mesma direção, mesmos elementos, mesmas posições — teste programático, não comparação de pixels); lista de variações exibe o nome da família.

### Fase 4 — Workbench (S)
- **Arquivos:** `client/src/store/editorStore.ts` (regra `paletteId: "custom"` + rename `cd-`→`usr-` em edição), badge de direção no `WorkbenchV2`; `PostCardV2.tsx` — ajuste documentado da accentBar (§9.5-a: render condicionado a `accentBar.width !== 0`). A outra exceção de renderer é o hook de fontes de `textElements` na Fase 2 (§9.5-b).
- **Testes:** editar cor manual ⇒ `paletteId === "custom"`; editar `cd-*` ⇒ vira `usr-*` e sobrevive à recomposição; `accentBar.width: 0` ⇒ accentBar ausente do DOM; snapshot legado sem o campo ⇒ accentBar renderiza como hoje (default 15).
- **Aceite:** export PNG fiel para as 12 famílias (validação manual guiada + teste da Fase 5).

### Fase 5 — Regressão visual + docs (M)
- **Arquivos:** `tests/visual/creative-families.spec.ts` (Playwright screenshot diff, seed fixa); `DOCUMENTO_MESTRE.md` nova seção "Motor de Variabilidade Criativa" (fluxo, invariantes 0.1-0.10, precedência com Chameleon).
- **Escopo em dois estágios:** (1) **smoke primeiro** — 12 famílias × 1 paleta (`tiffany-dark`) × 2 ratios (1:1, 9:16) = 24 baselines; entra no CI já nesta fase. (2) **cobertura completa** — expandir para 3 paletas representativas (72 baselines) como item da Fase 6, depois que o catálogo estabilizar (evita re-baselining em massa a cada ajuste fino de receita).
- **Aceite:** smoke de 24 no CI com baseline commitada; DOCUMENTO_MESTRE atualizado na mesma PR (invariante §27.7).

### Fase 6 — Otimizações e evolução (backlog ordenado)
1. Expandir regressão visual do smoke (24) para cobertura completa (12 famílias × 3 paletas × 2 ratios = 72 baselines), após estabilização do catálogo.
2. Remover `backgroundColor/textColor/accentColor/layout` do schema LLM (−500 tokens) após confirmar que avaliação/revisão não os exigem.
3. Variação por slide de carrossel além de `title-emphasis` (lacuna #9 completa).
4. Analytics de adoção por família/paleta (base para recomendação, lacuna #4).
5. Snapshot v4 (seção 12).

---

## 11. Plano de testes — índice por arquivo

| Arquivo de teste | Casos nomeados |
|---|---|
| `shared/creative/color.test.ts` | `lighten-changes-hex`, `darken-changes-hex`, `short-hex-supported`, `contrast-black-white-21`, `mix-midpoint` |
| `shared/creative/seed.test.ts` | `mulberry32-fixed-sequence`, `hashstring-stable`, `hashstring-distinct` |
| `shared/creative/palettes.test.ts` | `ten-palettes`, `headline-contrast-aa-large`, `body-contrast-or-boost-flag`, `card-differs-from-bg`, `tokens-deterministic`, `inversion-only-when-safe` |
| `shared/creative/families.test.ts` | `twelve-families`, `unique-ids`, `matrix-cells-media-distinct`, `cd-prefix-enforced`, `fit-rules-declared`, `ornament-distribution` (≥6 full-bleed, ≥6 sticker hide, ≥5 badge hide, nenhum ornamento em 100%) |
| `shared/creative/compose.test.ts` | `same-seed-same-output`, `user-elements-preserved`, `recompose-idempotent`, `all-combos-pass-snapshot`, `tokens-toplevel-coherent`, `contrast-autofix`, `zod-roundtrip`, `brand-locked-keeps-tokens`, `bounds-clamped`, `ornaments-hidden-and-restored` (hide → hiddenOrnaments preenchido → strip restaura → família keep re-exibe texto original), `full-bleed-card-equals-bg`, `carousel-title-emphasis-cd-only-in-slide1` (regra 10: raiz sem cd-* de destaque; `slides[0].editorState.variation.textElements` os contém; slides 2+ não), `creative-intent-stripped` (regra 11: chave ausente do output), `coords-are-pixels-in-refdoc` (§6.1-A: nenhum `cd-*` com x/y/width fora de `0..doc.width/height`; nenhum valor "percentual cru" ≤ 100 quando a intenção era pixel — sanity: elementos posicionados no quadrante inferior têm y > 100 em REF_DOC 360) |
| `shared/creative/directCreative.test.ts` | `mood-selects-family`, `fallback-classifier`, `exclusion-respected`, `cells-distinct-in-set`, `brandlocked-no-palette`, `cascade-never-throws`, `needs-number-gates-datapunch`, `needs-image-gates-glassveil`, `recent-families-soft-excluded`, `recent-ignored-when-pool-empty` |
| `client/src/lib/variationSnapshot.test.ts` (estender) | `snapshot-preserves-creativedirection`, `slide-projection-keeps-cd-elements` |
| `server/generation.integration.test.ts` (novo, mock LLM) | `three-distinct-cells`, `invalid-intent-classifier-source`, `brand-extraction-precedence`, `adapt-content-route` |
| `tests/visual/creative-families.spec.ts` | `family-{id}-palette-{id}-{ratio}` (baseline diff ≤ 0.1%) |

---

## 12. Evolução futura — especificação do snapshot v4 (NÃO implementar agora)

Gatilho: qualquer efeito da lista "impossível hoje" virar prioridade de produto.

**Mudanças de contrato (todas juntas, um único bump):**
```typescript
// shared/postspark.ts
type BlendMode = ... | "color" | "hue" | "saturation" | "luminosity"; // duotone real

interface ElementEffects {           // opcional em TextElement e ImageElement
  zIndex?: number;
  textShadow?: string;
  textStroke?: { width: string; color: string };
  mixBlendMode?: BlendMode;
  filter?: string;                   // blur/brightness por elemento
  backdropFilter?: string;           // glass real
  clipPath?: string;                 // splits diagonais, máscaras
}

type BackgroundType = ... | "gradient";
interface BackgroundValue { gradient?: { angle: number; stops: Array<{ color: string; at: number }> } }

interface PostVisualSnapshot { snapshotVersion: 1 | 2 | 3 | 4; }
```

**Migração:** `migrateV3ToV4` em `client/src/lib/snapshotMigration.ts` (padrão existente: spread + bump; efeitos ausentes = comportamento v3). Schemas Zod aceitam v1-v4 para leitura, gravam v4.

**Riscos mapeados:** export PNG (html-to-image) com `backdrop-filter`/`mix-blend-mode` — exige a suíte visual da Fase 5 rodando contra o export, não só o preview; `clipPath` em Safari; performance de muitos elementos com `filter` (limitar a 3 elementos com efeito por post).

**Famílias desbloqueadas na v4:** layered typography real (z-index + cutout de sujeito via asset segmentado), dupla exposição, glass fiel, glitch com blend, split diagonal, duotone verdadeiro.

---

## 13. Checklist de pronto (definition of done do projeto)

- [ ] `shared/creative/` completo, puro, coberto pelos testes da seção 11.
- [ ] `post.generate` emite `creativeIntent`; motor aplica direção; 3 células distintas por geração.
- [ ] Rotação de repertório ativa: famílias dos últimos posts salvos são preteridas em novas gerações.
- [ ] `creativeDirection` persistido (incl. `hiddenOrnaments`), validado por Zod, sobrevive a save/restore/histórico.
- [ ] Política de ornamentos e `cardMode` em vigor: nenhum ornamento presente em 100% do catálogo; ≥ 6 famílias full-bleed.
- [ ] HoloDeck troca família/paleta client-side sem sparks; "Surpreenda-me" funcional; variações nomeadas pela família; adaptação Groq só quando fit falha.
- [ ] Workbench: edição manual rebaixa `paletteId` para `custom`; `cd-*` editado vira `usr-*`.
- [ ] Export PNG fiel para as 12 famílias (suíte visual no CI).
- [ ] `DOCUMENTO_MESTRE.md` com a nova seção; `AUDITORIA_FINAL.md` checklist itens críticos fechados (bugs #1-#5 tornados irrelevantes ou corrigidos por este design; lacunas #1, #2, #3, #5, #8 endereçadas; #4, #6, #7, #9, #10 com mitigação declarada nas fases).
- [ ] `snapshotVersion` permanece 3; renderer alterado em exatamente 2 pontos documentados (§9.5: condição da accentBar + hook de fontes de textElements) — nada além disso.
