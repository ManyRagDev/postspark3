# Design System do PostSpark

## 1. Escopo

Este documento descreve o design system observado no codigo atual do PostSpark. Ele cobre duas camadas diferentes:

1. **Interface do produto**: telas, paineis, botoes, inputs, modais, editor e fluxos `TheVoid -> HoloDeck -> WorkbenchV2`.
2. **Sistema visual dos posts gerados**: `DesignTokens`, presets de tema, renderer unico e regras de composicao usadas no preview, edicao e exportacao.

Fonte primaria: codigo em `client/src`, contratos em `shared/postspark.ts` e regras em `client/src/lib/designRules.ts`. O arquivo historico `guia_design.md` continua util como referencia conceitual de composicao de posts, mas nao e a fonte principal da UI do app.

## 2. Principios Visuais

O produto usa uma identidade **dark studio**: fundo profundo, superficies translucidas, bordas discretas, acentos luminosos e movimento suave. A interface deve parecer uma ferramenta criativa operacional, nao uma landing page decorativa.

Principios ativos:

- **Dark-only por padrao**: `App.tsx` monta `ThemeProvider defaultTheme="dark"` e nao habilita alternancia.
- **Glassmorphism funcional**: paineis e barras usam blur, borda branca translucida e inset highlight.
- **Acento contextual**: muitas telas herdam a cor ativa do post, tema ou modo (`accentColor`), principalmente HoloDeck e Workbench.
- **Movimento como feedback**: Framer Motion sinaliza foco, selecao, progresso, swipe, loading e transicoes de estado.
- **Renderer unico**: preview, edicao e exportacao devem passar por `PostRenderer` e `PostCardV2`, evitando divergencia visual entre etapas.

## 3. Fundacoes Tecnicas

Arquivos principais:

- `client/src/index.css`: tokens CSS, tema Tailwind v4, utilitarios globais, glass, glow, scrollbars e gradientes.
- `components.json`: configuracao shadcn/ui estilo `new-york`, CSS variables ativo e aliases.
- `client/src/contexts/ThemeContext.tsx`: aplica classe `.dark` quando o tema ativo e dark.
- `client/src/lib/themes.ts`: presets visuais e ponte `ThemeConfig -> DesignTokens`.
- `shared/postspark.ts`: contrato `DesignTokens`, `AspectRatio` e constantes compartilhadas.
- `client/src/components/PostRenderer.tsx`: entrada unica de renderizacao visual de posts.
- `client/src/components/ThemeRenderer.tsx`: aplica `ThemeConfig` ou `DesignTokens` ao canvas/card do post.
- `client/src/components/views/WorkbenchV2/PostCardV2.tsx`: renderizador efetivo do post ativo.

Stack visual:

- React 19 + Vite.
- Tailwind CSS 4 via `@import "tailwindcss"` e `@theme inline`.
- Radix/shadcn como base para componentes acessiveis.
- `lucide-react` para icones.
- Framer Motion para interacoes e transicoes.
- `html2canvas-pro` para exportacao.

## 4. Tokens Globais da UI

Os tokens globais vivem em `client/src/index.css`. A semantica principal e:

### Tipografia

- `--font-sans`: `"Inter", ui-sans-serif, system-ui, sans-serif`.
- `--font-display`: `"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif`.

Use `--font-sans` para corpo, formularios e UI operacional. Use `--font-display` para marca, titulos curtos, headers de modal, labels de alto impacto e pontos de identidade.

### Cores de Fundo

- `--bg-void`: `#050505`, fundo mais profundo.
- `--bg-base`: `#0a0b0f`, base geral.
- `--bg-elevated`: `#13141c`, superficies elevadas.
- `--bg-floating`: `#1c1d26`, popovers, overlays e elementos destacados.

Tambem existem tokens shadcn/Tailwind:

- `--background`, `--foreground`
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--primary`, `--secondary`, `--accent`, `--muted`, `--destructive`
- `--border`, `--input`, `--ring`

### Cores de Texto

- `--text-primary`: `#f8fafc`.
- `--text-secondary`: `#94a3b8`.
- `--text-tertiary`: `#64748b`.

Use `primary` para informacao essencial, `secondary` para labels e estado normal, `tertiary` para metadados, hints e affordances fracas.

### Acentos

- `--primary`: Thermal Orange em OKLCH.
- `--accent`: Cyber Cyan em OKLCH.
- `--destructive`: Ember Red.
- `--accent-gold`: `#d4af37`, usado como modo Captain e sliders premium.
- `--accent-architect`: `#6366f1`, usado como modo Architect.

Tokens nomeados do tema:

- `--color-thermal-orange`
- `--color-cyber-cyan`
- `--color-void-purple`
- `--color-ember-red`
- `--color-plasma-pink`
- `--color-soul-deep`
- `--color-soul-base`
- `--color-soul-glass`

### Raios

- `--radius`: `0.75rem`.
- `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl` derivam de `--radius`.

Padrao observado: componentes shadcn usam `rounded-md`/`rounded-xl`; superficies autorais usam bastante `rounded-2xl`. Em novos componentes operacionais, prefira `rounded-lg` ou `rounded-xl`; reserve `rounded-2xl` para paineis glass ou objetos de alto destaque ja existentes.

## 5. Superficies e Vidro

Utilitarios globais:

- `.glass`: base glass sutil com blur 24px, borda translucida e inset highlight.
- `.glass-strong`: variante mais opaca e forte.
- `.glass-floating`: variante elevada com sombra externa.
- `.glass-panel`: painel premium com blur/saturacao e sombra grande.
- `.glass-panel-elevated`: maior elevacao.
- `.glass-panel-architect`: painel orientado ao modo Architect, com borda roxa.

Componente dedicado:

- `client/src/components/ui/GlassCard.tsx`
  - `elevation`: `resting`, `elevated`, `floating`.
  - `mode`: `default`, `captain`, `architect`.
  - `interactive`: ativa hover com deslocamento e sombra via Framer Motion.

Regra pratica: use utilitarios `.glass` para barras pequenas e grupos de acoes. Use `GlassCard` quando a superficie for um painel reutilizavel com estado/interacao.

## 6. Componentes Base

O projeto usa shadcn/Radix em `client/src/components/ui`. Componentes como `Button`, `Card`, `Dialog`, `Sheet`, `Tabs`, `Select`, `Slider`, `Tooltip`, `DropdownMenu` e afins devem ser reaproveitados antes de criar primitives novas.

### Button

Arquivo: `client/src/components/ui/button.tsx`.

Variantes:

- `default`: fundo `primary`.
- `destructive`: vermelho destrutivo.
- `outline`: transparente com borda.
- `secondary`: superficie secundaria.
- `ghost`: sem fundo ate hover.
- `link`: link textual.

Tamanhos:

- `default`: `h-9`.
- `sm`: `h-8`.
- `lg`: `h-10`.
- `icon`, `icon-sm`, `icon-lg`.

Para comandos com icone, use `lucide-react`. Para ferramentas compactas, prefira `size="icon"` e tooltip quando o significado nao for obvio.

### Card

Arquivo: `client/src/components/ui/card.tsx`.

Base: `bg-card`, `text-card-foreground`, `rounded-xl`, `border`, `py-6`, `shadow-sm`. Use para itens repetidos, estados vazios, blocos de dashboard e cards informacionais. Para paineis densos do editor, o codigo ativo tende a usar superficies customizadas com `--bg-panel` e bordas brancas translucidas.

### Controles Especializados

- `PrecisionSlider`: slider premium com trilho preenchido por `--accent-gold`.
- `EditorSlider`: slider de editor.
- `HexColorInput`: entrada padronizada para cor.
- `PositionGrid`: escolha visual de posicao.
- `PostModeSelector`: seletor de post estatico/carrossel.
- `FontDropdown`: selecao de fonte.
- `CaptionPreview`: preview de legenda.
- `CollapsibleSection`: secao expansivel usada no Workbench.

## 7. Layouts do Produto

### TheVoid

Arquivo: `client/src/components/views/TheVoid.tsx`.

Funcao: entrada principal do fluxo autenticado.

Padroes:

- tela full-screen fixa;
- fundo `oklch(0.04 0.06 280)`;
- `OrganicBackground` reagindo ao modo ou tom detectado;
- `SparkLogo` com glow;
- `SmartInput` como ponto focal;
- progresso de geracao em dock discreto com trilho fino;
- reducao de performance em mobile.

### SmartInput

Arquivo: `client/src/components/SmartInput.tsx`.

Funcao: entrada multimodal e seletor de modo.

Estados visuais:

- texto: Thermal Orange;
- URL: Cyber Cyan;
- imagem: Void Purple;
- execution/briefing: acento dourado quente.

O componente combina textarea, controles segmentados, menu de modo de post e botao de submit iconico. Mantenha o submit como botao quadrado com `ArrowRight`/`Loader2`; nao substitua por CTA textual grande.

### HoloDeck

Arquivo: `client/src/components/views/HoloDeck.tsx`.

Funcao: selecao de variacoes geradas.

Padroes:

- fundo dark com `OrganicBackground`, grain e glow radial baseado no `accentColor` da variacao ativa;
- modos `peek` e `wallet`;
- cards sempre via `PostRenderer`;
- action bar glass com tres comandos: sintetizar visual, selecionar, estilo visual;
- sidebar desktop para estilos extraidos, presets e variacoes;
- mobile com cards empilhados/swipe.

### WorkbenchV2

Arquivos:

- `client/src/components/views/WorkbenchV2/WorkbenchV2.tsx`
- `client/src/components/views/WorkbenchV2/CanvasWorkspace.tsx`
- `client/src/components/views/WorkbenchV2/blocks/*.tsx`

Funcao: editor ativo.

Padroes:

- desktop em tres areas: sidebar esquerda, canvas central, painel direito;
- topbar de 48px;
- sidebars com `--bg-panel` fallback `rgba(18,18,28,0.95)`;
- canvas central com `OrganicBackground`, glow radial e grain;
- card logico de 360px escalado conforme viewport;
- mobile com bottom nav e `MobileEditSheet`.

## 8. Sistema Visual dos Posts

O post renderizado possui um sistema proprio, separado da UI do app.

### DesignTokens

Contrato em `shared/postspark.ts`:

```ts
interface DesignTokens {
  colors: {
    background: string;
    primary: string;
    secondary: string;
    text: string;
    card: string;
  };
  typography: {
    fontFamily: string;
    customFontUrl: string;
    originalFont: string;
    textTransform: "none" | "uppercase";
    textAlign: "left" | "center";
  };
  structure: {
    borderRadius: string;
    boxShadow: string;
    border: string;
  };
  decorations: "minimal" | "playful";
}
```

Esses valores sao CSS-ready e podem vir de:

- fallback `DEFAULT_DESIGN_TOKENS`;
- presets legados convertidos por `themeToDesignTokens`;
- extracao visual de site pelo Chameleon/Brand DNA.

### Presets de Tema

Arquivo: `client/src/lib/themes.ts`.

Presets ativos:

- `cyber-core`
- `morning-paper`
- `swiss-modern`
- `bold-hype`
- `y2k-glitch`
- `eco-zen`
- `dark-academia`
- `velvet-noir`

Categorias:

- `brand`: mais coerentes/conservadores.
- `remix`: reinterpretacao visual.
- `disruptive`: visual mais contrastante ou experimental.

Cada `ThemeConfig` define cores, tipografia, alinhamento, borda, decoracao, padding, efeito e opcionalmente `cardStyle`.

### Card Styles

Aplicados em `ThemeRenderer`:

- `flat`: base sem alteracao estrutural.
- `glass`: fundo semi-transparente, blur, borda de acento e inset highlight.
- `neobrutalist`: borda forte, sombra offset dura e canto quadrado.
- `minimal`: sem borda/sombra, padding generoso.
- `editorial`: regra superior de acento, cantos quadrados e sem sombra.

### Efeitos

Arquivo: `client/src/styles/theme-effects.css`.

- `glitch`: overlays animados.
- `glow`: brilho pulsante.
- `noise`: textura SVG inline com blend.
- `grid`: grade suave.
- `shimmer`: feedback de processamento.
- `ai-pulse`: pulso discreto para elementos de IA.
- `flash-gold`: confirmacao visual curta.
- `input-premium`: foco de input com sombra interna.

## 9. Aspect Ratios e Canvas

Contratos:

- `1:1`
- `5:6`
- `9:16`

Definidos em `shared/postspark.ts` por `AspectRatio`, `ASPECT_RATIO_VALUES` e `ASPECT_RATIO_LABELS`.

No Workbench, o canvas usa largura logica base de 360px e escala responsivamente para caber no viewport. Nao altere tamanhos internos do post apenas para caber na tela; ajuste o wrapper/escala.

Exportacao:

- deve capturar somente o post em `data-post-export-root`;
- controles, workspace, overlays e barras nao devem entrar no PNG;
- `PostRenderer mode="export"` deve preservar o visual do modo de edicao sem UI de edicao.

## 10. Tipografia Dinamica

Arquivo: `client/src/lib/fonts.ts`.

Catalogo:

- Sans: Inter, Roboto, Montserrat, Poppins, Lato, Open Sans, Raleway, Work Sans, Quicksand, Space Grotesk, Plus Jakarta Sans, Nunito.
- Serif: Playfair Display, Merriweather, Lora, PT Serif, Crimson Text, EB Garamond.
- Display: Oswald, Bebas Neue, Syne, Anton, Righteous, Abril Fatface.
- Mono: Space Mono, JetBrains Mono, Fira Code.

`customFontUrl` tem prioridade sobre `fontFamily`. Fontes Google sao carregadas sob demanda por `loadFont`.

Regra: UI do app usa `Inter`/`Space Grotesk`; fontes dinamicas devem afetar o post/renderizador, nao a interface operacional inteira.

## 11. Regras de Qualidade Visual

Arquivo: `client/src/lib/designRules.ts`.

Regras implementadas:

- contraste WCAG entre `textColor` e `backgroundColor`;
- adequacao de layout ao aspect ratio;
- proporcao entre headline/body;
- alerta para layout split com headline curta;
- alerta para body longo que reduz respiro.

Fonte conceitual: `guia_design.md`.

Ao evoluir templates, preserve:

- legibilidade minima;
- safe areas nos formatos verticais;
- hierarquia clara em ate 1 segundo;
- maximo de dois alinhamentos dominantes por composicao;
- texto essencial fora de margens extremas.

## 12. Iconografia

Padrao: `lucide-react`.

Uso observado:

- navegacao: `ArrowLeft`, `ChevronLeft`, `ChevronRight`, `ChevronDown`.
- IA/criacao: `Sparkles`, `Loader2`.
- midia: `Image`, `ImagePlus`.
- layout: `LayoutGrid`, `Layout`.
- texto: `Type`, `AlignJustify`.
- billing/energia: elementos de Spark e saldo.

Nao crie SVG manual para icones comuns. Use `RatioIcon` para proporcoes e `SparkLogo` para marca.

## 13. Movimento e Feedback

Use movimento para:

- entrada/saida de telas;
- foco de input;
- loading e progresso;
- selecao de tabs/segmentos;
- swipe/navegacao de cards;
- confirmacao curta.

Evite animar propriedades caras. O codigo atual privilegia `transform`, `opacity`, `filter` controlado e sombras pontuais. Em mobile, reduza intensidade, quantidade de blobs e efeitos de fundo quando possivel.

## 14. Estados e Acessibilidade

Padroes ja presentes:

- foco visivel via `focus-visible:ring-ring/50`.
- disabled com `opacity-50` e `pointer-events-none`.
- `role="status"` e `aria-live="polite"` no progresso de geracao.
- `role="alert"` em erro de geracao.
- `title` em varios botoes iconicos.

Ao criar novos controles:

- mantenha label acessivel (`aria-label` ou texto visivel);
- preserve foco por teclado;
- use contraste suficiente;
- nao dependa apenas de cor para diferenciar estados criticos;
- evite hover-only para acoes essenciais.

## 15. Como Criar ou Alterar UI

Checklist:

1. Verifique se existe componente shadcn/ui ou componente proprio equivalente.
2. Use tokens de `index.css` antes de criar cores soltas.
3. Em telas dark studio, prefira superficies `glass`, `bg-elevated`, `bg-floating` ou `--bg-panel`.
4. Use `lucide-react` para icones.
5. Use Framer Motion apenas quando houver feedback claro de estado.
6. Se o componente renderiza post, passe pelo `PostRenderer`.
7. Se alterar tokens, renderer, temas, editor visual ou fluxo de exportacao, atualize este documento e o `DOCUMENTO_MESTRE.md`.

## 16. Lacunas Observadas

- `--bg-panel` e `--accent-primary` sao usados em alguns componentes como variaveis com fallback, mas nao aparecem definidos globalmente em `index.css`.
- O `ThemeContext` suporta light/dark, mas a aplicacao usa dark-only na pratica.
- Existem tokens legados e novos coexistindo em `index.css`; alguns nomes de "Captain/Architect" sobrevivem mesmo com WorkbenchV2 mais simplificado.
- `guia_design.md` e util para principios de posts, mas nao documenta o design system real da UI atual.

