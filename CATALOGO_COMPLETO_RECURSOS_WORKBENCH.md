# Catálogo Completo de Recursos de Edição do Workbench
**PostSpark 3 - Documento Técnico de Reconstrução**

**Propósito:** Este documento cataloga exaustivamente todos os recursos de edição presentes no WorkbenchV2, permitindo a reconstrução completa da aplicação. Sinaliza duplicações, bugs conhecidos e dependências entre componentes.

**Data de Geração:** 2026-08-05  
**Versão do Alvo:** PostSpark 3 (main branch)

---

## ÍNDICE

1. [Arquitetura Geral](#arquitetura-geral)
2. [Blocos de Edição](#blocos-de-edição)
3. [Controles Globais](#controles-globais)
4. [Sistemas de Interação](#sistemas-de-interação)
5. [Duplicações Conhecidas](#duplicações-conhecidas)
6. [Bugs e Problemas Conhecidos](#bugs-e-problemas-conhecidos)
7. [Estrutura de Arquivos](#estrutura-de-arquivos)
8. [Dependências Externas](#dependências-externas)

---

## ARQUITETURA GERAL

### Layout do WorkbenchV2

```
WorkbenchV2 (client/src/components/views/WorkbenchV2/WorkbenchV2.tsx)
│
├── Topbar (ações globais)
│   ├── Botão "Voltar" (onBack)
│   ├── Título do post (headline ou "Sem título")
│   ├── "Adicionar Imagem" (addImageElement)
│   ├── Undo / Redo (useEditorHistory)
│   ├── "Salvar" (onSave)
│   └── "Exportar" (onExport)
│
├── LeftSidebar (Desktop) / MobileEditSheet (Mobile)
│   │
│   ├── [Seção TEXTO]
│   │   ├── ElementContentBlock (seções + textElements)
│   │   ├── FontColorBlock (fonte, cores, badge/sticker, alinhamento global)
│   │   └── CaptionBlock (headline, body, CTA, caption, hashtags)
│   │
│   ├── [Seção DESIGN]
│   │   └── DesignBlock → ChameleonPanel (paleta, tipografia, estrutura, decorações)
│   │
│   ├── [Seção MÍDIA]
│   │   └── ImageBlock (fundo, overlay, calibração fotográfica, IA)
│   │
│   └── [Seção LAYOUT]
│       ├── LayoutBlock (presets, padding, posições, alinhamento por layer)
│       └── PlatformBlock (plataforma, proporção)
│
└── CanvasWorkspace (canvas central)
    ├── PostCardV2 (renderização do post)
    ├── InteractionOverlay (drag, resize, snap guides)
    ├── MagnetControl (toggle guias de alinhamento)
    ├── CarouselScopeControl (quando postMode === "carousel")
    ├── CarouselSlideNavigator (navegação desktop)
    ├── CarouselMobileArrows (navegação mobile)
    └── CanvasGridOverlay (grid visual quando magnet ativo)
```

### Estado Global (Zustand)

**Arquivo:** `client/src/store/editorStore.ts`

**Estado principal:** `activeVariation: PostVariation | null`

**Sub-estados importantes:**
- `layoutSettings`: Configurações de posição por layer
- `layoutTarget`: Elemento atualmente selecionado
- `postMode`: "static" | "carousel"
- `slides`: CarouselSlide[] (quando modo carrossel)
- `platform`: Platform (instagram, twitter, linkedin, facebook)
- `aspectRatio`: AspectRatio ("1:1", "5:6", "9:16")
- `bgValue`: BackgroundValue (tipo de fundo)
- `bgOverlay`: BgOverlaySettings (sobreposição)
- `imageSettings`: ImageSettings (calibração fotográfica)

---

## BLOCOS DE EDIÇÃO

## 1. PLANO DE FUNDO (ImageBlock)

**Arquivo:** `client/src/components/views/WorkbenchV2/blocks/ImageBlock.tsx`

### 1.1 Tipo de Fundo (5 opções)

| Tipo | Descrição | Estrutura de Dados |
|------|-----------|---------------------|
| **Nenhum** | Sem fundo | `{ type: "none" }` |
| **IA** | Geração por prompt | `{ type: "ai", url: string }` |
| **Galeria** | Seleção de biblioteca | `{ type: "gallery", url: string }` |
| **Cor Sólida** | Cor hex | `{ type: "solid", color: string }` |
| **Upload** | Imagem do dispositivo | `{ type: "upload", url: string }` |

### 1.2 Geração por IA

**Controles:**
- **Modelo de IA**: `pollinations_fast` (Básico) ou `pollinations_hd` (Pro)
- **Prompt input**: Textarea para descrição do que deseja criar
- **Botão "Gerar com IA"**: Dispara geração com provider e prompt
- **Preview da imagem gerada**: Aspect ratio com a imagem resultante

**Implementação:**
```typescript
const handleGenerate = async () => {
  if (!onGenerateImage || !aiPrompt.trim() || isGenerating) return;
  await onGenerateImage(aiPrompt, imageProvider);
};
```

### 1.3 Galeria de Backgrounds

**Recurso:** `BackgroundGallery` component

**Categorias disponíveis** (via `manifest.json`):
- `saved` - Imagens salvas pelo usuário (biblioteca pessoal)
- `acolhimento-respiro` - Categoria temática
- Demais categories definidas no manifesto

**Funcionalidades:**
- Seleção de categoria (tabs com ícones e labels)
- Grid 4x4 de thumbnails
- Indicador de seleção (checkmark overlay)
- Contador de backgrounds disponíveis
- Loading state e error state
- Hover effects (scale + overlay gradiente)

### 1.4 Cor Sólida

**Controles:**
- Input color (seletor hex)
- Input text (hex digitado, maxLength 9)

**Validação:** Aceita formatos HEX curtos (#RGB) e longos (#RRGGBBAA)

### 1.5 Upload

**Controles:**
- Botão "Selecionar imagem" (aciona input file oculto)
- Preview aspect-video da imagem carregada
- Botão "X" para limpar seleção

**Implementação:**
```typescript
const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const url = ev.target?.result as string;
    setBgValue({ type: "upload", url });
  };
  reader.readAsDataURL(file);
};
```

### 1.6 Salvar na Biblioteca

**Condição de exibição:** Apenas quando `bgValue.url` existe e type != "none"

**Funcionalidade:**
- Botão "Salvar na biblioteca" com ícone Save
- Chama `trpc.post.saveBackgroundAsset.mutateAsync`
- Persiste: imageUrl, sourceType, prompt, label
- Invalida query `listSavedBackgrounds` após sucesso
- Toast de sucesso/erro

### 1.7 Sobreposição (Overlay)

**Condição de exibição:** Apenas quando há imagem (gallery/upload/ai)

**Controles:**
- **Cor da sobreposição**: Input color
- **Opacidade**: Slider 0–100% (PrecisionSlider)
- **Modo de mesclagem (Blend Mode)**: 6 opções
  - Normal
  - Multiply
  - Screen
  - Overlay
  - Darken
  - Lighten

**Atenção:** O blend mode age sobre a sobreposição, não diretamente sobre a imagem. Aumentar opacidade para ver efeito.

### 1.8 Calibração Fotográfica

**Condição de exibição:** Apenas quando há imagem

**Controles (todos via PrecisionSlider):**

| Parâmetro | Range | Step | Unidade | Formatação |
|-----------|-------|------|---------|------------|
| **Zoom** | 50%–300% | 0.05 | - | Porcentagem |
| **Pan X** | 0–100 | 1 | % | Porcentagem |
| **Pan Y** | 0–100 | 1 | % | Porcentagem |
| **Brilho** | 0%–200% | 0.05 | - | Porcentagem |
| **Contraste** | 0%–200% | 0.05 | - | Porcentagem |
| **Saturação** | 0%–200% | 0.05 | - | Porcentagem |
| **Blur** | 0–20 | 0.5 | px | Pixels |

---

## 2. TIPOGRAFIA & COR (FontColorBlock)

**Arquivo:** `client/src/components/views/WorkbenchV2/blocks/FontColorBlock.tsx`

### 2.1 Família de Fonte

**Componente:** `FontDropdown` (seletor de fonte)

**Escopo de aplicação** (determinado por `layoutTarget`):
- **headline** - Apenas título (headlineFontFamily)
- **body** - Apenas corpo (bodyFontFamily)
- **global/both** - Global via designTokens.typography.fontFamily

**Lógica de seleção:**
```typescript
const fontValue =
  fontScope === "headline"
    ? (activeVariation.headlineFontFamily ?? activeVariation.designTokens?.typography?.fontFamily ?? "Inter")
    : fontScope === "body"
      ? (activeVariation.bodyFontFamily ?? activeVariation.designTokens?.typography?.fontFamily ?? "Inter")
      : (activeVariation.designTokens?.typography?.fontFamily ?? "Inter");
```

### 2.2 Tamanho de Fonte (Multiplicadores)

**Controles:**
- **Tamanho Título**: Range slider 60%–180% (headlineFontSize)
- **Tamanho Corpo**: Range slider 60%–180% (bodyFontSize)

**Exibição:** Porcentagem em tempo real

### 2.3 Cores de Texto

**Componente interno:** `ColorSwatch` (reutilizável)

**Funcionalidades:**
- Input color (seletor)
- Input text (hex digitado, maxLength 9)
- **Botão "Limpar"**: Remove override, volta ao texto global

**Campos:**
- **Título (override)**: headlineColor
- **Corpo (override)**: bodyColor

**Lógica de override:**
```typescript
value={activeVariation.headlineColor ?? activeVariation.textColor ?? "#ffffff"}
```

### 2.4 Elementos de Destaque (CopyAngle)

**Condição de exibição:** `activeVariation.copyAngle` existe

**Controles:**
- **Badge**: Input texto (ex: "FOCO", "SAIBA MAIS")
- **Sticker Text**: Input texto (ex: "UAU!", "MÁGICO")

**Armazenamento:** `activeVariation.copyAngle.badge` e `copyAngle.stickerText`

### 2.5 Alinhamento de Texto (Global)

**Controles:** 2 botões (left, center)

**Implementação:**
```typescript
onClick={() => {
  const baseTokens = activeVariation.designTokens ?? DEFAULT_DESIGN_TOKENS;
  updateVariation({
    designTokens: {
      ...baseTokens,
      typography: {
        ...DEFAULT_DESIGN_TOKENS.typography,
        ...baseTokens.typography,
        textAlign: align, // "left" | "center"
      },
    },
  });
}}
```

**Atenção:** Este é o alinhamento **global** via designTokens. Ver seção de duplicações.

---

## 3. CONTEÚDO DO CARD (CaptionBlock)

**Arquivo:** `client/src/components/views/WorkbenchV2/blocks/CaptionBlock.tsx`

### 3.1 Conteúdo Visual (no design do card)

**Título (headline):**
- Input texto simples
- Contagem de caracteres em tempo real
- Placeholder: "Digite o título..."

**Corpo (body):**
- Textarea (rows=4)
- Contagem de caracteres em tempo real
- Placeholder: "Digite o corpo do post..."
- Resize: none (altura fixa)

**Nota:** Em modo carrossel, usa `updateSlide` ao invés de `updateVariation`

### 3.2 Metadados de Publicação

**Nota:** Estes dados **não** aparecem no design do card, apenas na publicação.

**Call-to-Action (CTA):**
- Input texto simples
- Placeholder: "Ex: Saiba mais no link da bio..."

**Legenda (caption):**
- Textarea (rows=4)
- Placeholder: "Escreva a legenda para publicação..."
- Resize: none

**Hashtags:**
- Lista visual com badges removíveis
- Input "Nova hashtag..." + botão "+"
- Enter para adicionar
- Botão "X" em cada badge para remover

### 3.3 Preview de Legenda

**Componente:** `CaptionPreview`

**Funcionalidades:**
- Toggle para mostrar/ocultar preview
- Renderiza caption + hashtags formatadas
- Respeita limite de caracteres da plataforma

---

## 4. DISPOSIÇÃO (LayoutBlock)

**Arquivo:** `client/src/components/views/WorkbenchV2/blocks/LayoutBlock.tsx`

### 4.1 Presets de Layout

**4 opções principais:**

| Preset | Valor | Descrição |
|--------|-------|-----------|
| **Centralizado** | `centered` | Texto no centro |
| **Lateral** | `left-aligned` | Texto na base |
| **Bipartido** | `split` | Imagem + texto |
| **Minimal** | `minimal` | Só headline |

**Implementação importante:** Ao mudar preset, limpa `freePosition` de todos os layers ("Tiro de Sniper"):
```typescript
const clearedLayout = { ...currentLayout };
(["headline", "body", "accentBar", "badge", "sticker", "carouselArrow"] as const).forEach(layer => {
  if (clearedLayout[layer]) {
    clearedLayout[layer] = { ...clearedLayout[layer], freePosition: undefined };
  }
});
```

### 4.2 Posição da Imagem (Bipartido)

**Condição de exibição:** `activeVariation.layout === 'split'`

**Controles:** 2 botões
- **Cima** (`top`)
- **Baixo** (`bottom`)

**Armazenamento:** `activeVariation.splitImagePosition`

### 4.3 Respiro (Padding)

**Componente:** `PrecisionSlider`

**Configuração:**
- Range: 0–80px
- Step: 2px
- Armazenamento: `layoutSettings.padding`

### 4.4 Seletor de Elemento (Layer)

**Layers fixos:**
- `headline` - Título
- `body` - Corpo
- `accentBar` - Barra de destaque
- `badge` - Badge (tag)
- `sticker` - Sticker decorativo
- `carouselArrow` - Seta do carrossel
- `card` - Card principal

**Layers dinâmicos:**
- `section:*` - Seções customizadas (se `activeVariation.sections` existir)

**Seleção:** Define `layoutTarget`, que controla qual layer os controles subsequentes afetam.

### 4.5 Grid 3×3 de Posições

**9 posições:** `top-left`, `top-center`, `top-right`, `center-left`, `center`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`

**Implementação:**
```typescript
const handlePositionClick = (pos: TextPosition) => {
  updateActiveLayer({
    position: pos,
    freePosition: undefined, // Limpa posição livre ao usar grid
  });
};
```

**Ícones visuais:** ↖ ↑ ↗ ← • → ↙ ↓ ↘

### 4.6 Alinhamento de Texto (por Layer)

**Controles:** 3 botões
- **E** (left)
- **C** (center)
- **D** (right)

**Armazenamento:** `layoutSettings[activeLayer].textAlign`

**Atenção:** Este é o alinhamento **por layer**, diferente do alinhamento global do FontColorBlock. Ver seção de duplicações.

### 4.7 Largura do Bloco (por Layer)

**Componente:** `PrecisionSlider`

**Configuração:**
- Range: 10%–100%
- Step: 1%
- Armazenamento: `layoutSettings[activeLayer].width`

**Label dinâmico:** `Largura — {activeLayer}`

---

## 5. IDENTIDADE VISUAL (DesignBlock → ChameleonPanel)

**Arquivos:** 
- `client/src/components/views/WorkbenchV2/blocks/DesignBlock.tsx`
- `client/src/components/ChameleonPanel.tsx`

### 5.1 Paleta de Cores (DesignTokens.colors)

**Componente interno:** `ColorInput` (reutilizável)

**5 cores configuráveis:**
- **Fundo (Canvas)** - `colors.background`
- **Primária** - `colors.primary`
- **Secundária** - `colors.secondary`
- **Texto** - `colors.text`
- **Fundo (Card)** - `colors.card`

**Funcionalidades:**
- Input color (seletor)
- Input text (hex digitado, uppercase, maxLength 9)

### 5.2 Tipografia (DesignTokens.typography)

**Fonte global via Google Fonts:**
- Input text para URL customizada
- Placeholder: `https://fonts.googleapis.com/css2?family=...`
- Font monospace para URL

**Fonte original detectada:**
- **Campo read-only** exibe `originalFont`
- Apenas informativo (não editável)

**Transformação de texto:**
- **Normal** (`none`)
- **CAIXA ALTA** (`uppercase`)

**Componente:** `SelectInput` (dropdown)

**Atenção:** O seletor de família tipográfica (Inter, Playfair, etc.) vive no FontColorBlock, não aqui.

### 5.3 Estrutura (DesignTokens.structure)

**Cantos (Border Radius):**
- Seco (0px)
- Leve (8px)
- Médio (16px)
- Arredondado (24px)
- Pílula (40px)

**Sombra (Box Shadow):**
- Nenhuma (`none`)
- Suave Elegante (`0 10px 25px rgba(0,0,0,0.1)`)
- Suave Forte (`0 20px 40px rgba(0,0,0,0.15)`)
- Neo-Brutalista (`5px 5px 0px 0px rgba(0,0,0,0.85)`)

**Borda (Border):**
- Nenhuma (`none`)
- Fina Sutil (`1px solid rgba(0,0,0,0.1)`)
- Marcada 2px (`2px solid rgba(0,0,0,0.2)`)
- Grossa 4px (`4px solid rgba(0,0,0,0.3)`)

**Componente:** `SelectInput` (dropdown)

### 5.4 Decorações

**2 opções:**
- **Minimalista** (`minimal`)
- **Playful** (`playful`)

**Implementação:** 2 botões side-by-side com seleção visual

---

## 6. PLATAFORMA & PROPORÇÃO (PlatformBlock)

**Arquivo:** `client/src/components/views/WorkbenchV2/blocks/PlatformBlock.tsx`

### 6.1 Plataforma

**4 plataformas disponíveis:**

| Plataforma | Dimensões | Limite chars |
|------------|-----------|--------------|
| **Instagram** | 1080×1080 | 2200 |
| **Twitter/X** | 1200×675 | 280 |
| **LinkedIn** | 1200×627 | 3000 |
| **Facebook** | 1200×630 | 63206 |

**Implementação:** Grid 2×2 com cards detalhados (ícone, label, descrição, specs)

**Side-effect:** Ao mudar plataforma, ajusta aspectRatio para primeiro valor compatível:
```typescript
useEffect(() => {
  const allowed = PLATFORM_ASPECT_RATIOS[platform];
  if (allowed && !allowed.includes(aspectRatio)) {
    setAspectRatio(allowed[0]);
  }
}, [platform, aspectRatio, setAspectRatio]);
```

### 6.2 Proporção (Aspect Ratio)

**3 proporções principais:**
- **1:1** - Quadrado
- **5:6** - Retrato
- **9:16** - Stories

**Proporções disponíveis variam por plataforma** (via `PLATFORM_ASPECT_RATIOS`)

**Componente:** `RatioIcon` (representação visual)

---

## 7. ELEMENTOS AVANÇADOS (ElementContentBlock)

**Arquivo:** `client/src/components/views/WorkbenchV2/blocks/ElementContentBlock.tsx`

### 7.1 Modo 1: Seções de Conteúdo (sections)

**Condição:** `layoutTarget.startsWith("section:")` OU lista global de sections

**Campos editáveis:**
- **label** (string): Título do bloco
- **description** (string, textarea): Descrição do bloco
- **number** (number): Número do bloco (input type="number")
- **icon** (string): Nome do ícone (Lucide name)

**Lista global:**
- Exibe todas as sections em cards editáveis
- Botão "Focar" em cada card → define `layoutTarget = "section:{id}"`

**Modo focado:**
- Exibe apenas a section ativa
- Inputs inline sem card wrapper

### 7.2 Modo 2: Text Elements Avançados (textElement)

**Condição:** `layoutTarget.startsWith("textElement:")` 

**Campos editáveis:**

| Campo | Tipo | Range/Validação |
|-------|------|-----------------|
| **text** | Textarea | Livre |
| **fontFamily** | Input text | Livre |
| **color** | Input color | HEX |
| **fontSize** | PrecisionSlider | 8px–96px, step 1 |
| **rotation** | PrecisionSlider | -180° a 180°, step 1 |
| **x** | PrecisionSlider | 0–340px, step 1 |
| **y** | PrecisionSlider | 0–620px, step 1 |
| **width** | PrecisionSlider | 24–340px ou "auto", step 1 |

**Propriedades adicionais (não expostas na UI mas existem no tipo):**
```typescript
styles: {
  fontWeight: string;    // "normal" | "bold" | etc
  fontStyle: string;     // "normal" | "italic"
  textDecoration: string; // "none" | "underline" | etc
  textAlign: "left" | "center" | "right";
  lineHeight: string;    // ex: "1.5"
  opacity: string;       // ex: "0.8"
}
```

**⚠️ BUG CONHECIDO:** As propriedades `fontWeight`, `fontStyle`, `textDecoration`, `lineHeight`, `opacity` existem no tipo `TextElement` mas **não têm controles na UI**. Elas são usadas apenas se definidas programaticamente.

---

## 8. CONTROLES GLOBAIS (Topbar)

**Arquivo:** `client/src/components/views/WorkbenchV2/WorkbenchV2.tsx` (linhas 410–497)

### 8.1 Botão "Adicionar Imagem"

**Funcionalidade:**
- Abre file picker (input type="file" oculto)
- Aceita: `image/*`
- Ao selecionar:
  1. Cria `FileReader`
  2. lê como dataURL
  3. Calcula dimensões baseadas em aspectRatio
  4. Cria `ImageElement` centralizado:
     ```typescript
     {
       id: `img-${Date.now()}`,
       url: dataURL,
       x: cardWidth / 2 - 60,
       y: cardHeight / 2 - 60,
       width: 120,
       height: "auto",
       rotation: 0,
       source: "upload"
     }
     ```
  5. Chama `addImageElement(element)`
  6. Define `layoutTarget = "imageElement:{id}"` (entra em modo de edição)

**⚠️ ATENÇÃO:** Este fluxo é diferente do upload do ImageBlock (que define background). Este adiciona um elemento livre sobre o canvas.

### 8.2 Undo / Redo

**Implementação:** `useEditorHistory` hook

**Atalhos:**
- **Ctrl+Z**: Undo
- **Ctrl+Shift+Z**: Redo

**Estado:**
- `canUndo`: Boolean (habilita/desabilita botão)
- `canRedo`: Boolean (habilita/desabilita botão)

**Estados disabled:** Opacity 30% + cursor not-allowed

### 8.3 Salvar

**Props:**
- `onSave(variation: PostVariation)`
- `isSaving: boolean`

**Implementação:**
```typescript
onClick={() => onSave?.(baseVariation ?? activeVariation)}
```

**Loading state:** Exibe `<Loader2>` animado quando `isSaving === true`

### 8.4 Exportar PNG

**Funcionalidades completas:**

**1. Preparação (timeout 30s):**
```typescript
const EXPORT_TIMEOUT_MS = 30_000;
// Timeout de fonts + images
```

**2. Busca do export root:**
```typescript
const exportRoot = canvasRef.current.matches("[data-post-export-root]")
  ? canvasRef.current
  : canvasRef.current.querySelector("[data-post-export-root]");
```

**3. Await fonts ready:**
```typescript
document.fonts.ready.then(() => {
  // Aguarda todas as fontes carregarem
});
```

**4. Await images loaded:**
```typescript
const images = exportRoot.querySelectorAll("img");
let pending = images.length;
const decrement = () => {
  pending--;
  if (pending === 0) resolve();
};
images.forEach(img => {
  if (img.complete) decrement();
  else {
    img.addEventListener("load", decrement, { once: true });
    img.addEventListener("error", decrement, { once: true });
  }
});
```

**5. html2canvas com scale 3x:**
```typescript
const canvas = await html2canvas(exportRoot, {
  scale: 3,                    // HD
  width: logicalWidth,
  height: logicalHeight,
  backgroundColor: null,
  useCORS: true,
  onclone: (_document, element) => {
    // Limpa transforms para renderização limpa
    element.style.transform = "none";
    // Propaga cleanup para ancestors
  }
});
```

**6. Download automático:**
```typescript
const link = document.createElement("a");
link.download = `postspark-${exportPlatform}-${Date.now()}.png`;
link.href = canvas.toDataURL("image/png");
link.click();
```

**Tratamento de erros:**
- Timeout: "A exportação excedeu o tempo limite"
- Falha geral: "A exportação falhou"
- Canvas não encontrado: throw Error

---

## 9. CONTROLES DE CARROSSEL

**Arquivo:** `client/src/components/views/WorkbenchV2/CanvasControls.tsx`

### 9.1 CarouselScopeControl (Seleção de Escopo)

**Condição de exibição:** `postMode === "carousel"` e `slides.length > 0`

**3 opções de escopo:**

| Escopo | ID | Descrição |
|--------|-------|-----------|
| **Slide atual** | `current` | Edita apenas o slide ativo |
| **Todos** | `all` | Aplica a todos os slides |
| **Escolher** | `selected` | Seleção múltipla de slides |

**Indicador:** "Slide {index + 1} de {slides.length}"

**No modo "Escolher":**
- Exibe grid de 5 checkboxes (S1, S2, S3, S4, S5)
- Checkboxes visuais com borda colorida quando selecionados
- `effectiveSelected` = `selectedIndices.length > 0 ? selectedIndices : [index]`

**⚠️ ATENÇÃO:** Este controle determina qual escopo as edições subsequentes afetarão. É crítico para a experiência multi-slide.

### 9.2 CarouselSlideNavigator (Navegação Desktop)

**Condição de exibição:** `!isMobile && isCarousel && slides.length > 1`

**Funcionalidades:**
- **Botão anterior** (`<`): ChevronLeft
- **Botão próximo** (`>`): ChevronRight
- **Botões numéricos**: S1, S2, S3... (clicáveis)

**Estilo do botão ativo:**
- Border 2px com `accentColor`
- `accentColor18` background
- `boxShadow` com glow
- Opacity 100% (vs 70% inativos)

**Tooltips:** "Ir para slide {n}: {headline}" (se houver headline)

### 9.3 CarouselMobileArrows (Navegação Mobile)

**Condição de exibição:** `isMobile && isCarousel && slides.length > 1`

**Funcionalidades:**
- **Botão anterior** (`<`): ChevronLeft size 20
- **Contador**: "{currentIndex + 1} / {slides.length}"
- **Botão próximo** (`>`): ChevronRight size 20

**Estilo:** Cards arredondados com backdrop-blur

### 9.4 CarouselSlideEditorState

**Estrutura de dados:**
```typescript
interface CarouselSlideEditorState {
  variation?: Partial<Omit<PostVariation, "slides">>;
  imageSettings?: Partial<ImageSettings>;
  layoutSettings?: Partial<AdvancedLayoutSettings>;
  bgValue?: BackgroundValue;
  bgOverlay?: Partial<BgOverlaySettings>;
}
```

**Uso:** Cada slide pode ter sobrescritas visuais próprias. Quando o escopo é "current", as edições afetam apenas `slides[currentSlideIndex].editorState`.

**⚠️ ATENÇÃO:** Este é um recurso avançado. Edição per-slide pode gerar inconsistência visual entre slides se mal usado.

---

## 10. SISTEMAS DE INTERAÇÃO

**Arquivos principais:**
- `client/src/editor/integration/InteractionOverlay.tsx`
- `client/src/editor/integration/CanvasInteractionProvider.tsx`
- `client/src/editor/geometry/index.ts`

### 10.1 MagnetControl (Guia de Alinhamento)

**Local:** CanvasWorkspace, posicionado no bottom central

**Funcionalidade:**
- Toggle button com ícone Magnet
- **ON**: Exibe grid + snap guides
- **OFF**: Esconde grid + snap guides

**Estilo ON:**
- `accentColor` background/border
- Glow animation (pulse)
- Ícone rotacionado 15deg + scale 110%

**Estilo OFF:**
- Background escuro translúcido
- Border sutil
- Ícone opacity 50%

**Label:** "Imã ON" / "Imã OFF"

**Implementação:**
```typescript
onClick={() => onChange(!active)}
```

### 10.2 Snap Guides (Guias de Alinhamento)

**Condição de exibição:** `magnetActive === true` E drag/resize em progresso

**Funcionalidades:**
- **Linha vertical tracejada**: `guideX` (guideX !== null)
- **Linha horizontal tracejada**: `guideY` (guideY !== null)

**Coordenadas:** Calculadas via `interactionState.snapGuides`
```typescript
{
  guideX: number | null,
  guideY: number | null,
  candidateIdX: string | null,  // ID do elemento candidato ao alinhamento X
  candidateIdY: string | null   // ID do elemento candidato ao alinhamento Y
}
```

**Estilo:** Border dashed com `accentColor`

### 10.3 InteractionOverlay (Handles de Redimensionamento)

**Condição de exibição:** Elemento selecionado E `handlePolicy !== "none"`

**3 políticas de handles:**
```typescript
HANDLE_MAP = {
  "flow-right": ["right"],              // Apenas direita
  "horizontal": ["left", "right"],      // Esquerda + direita
  "corners": ["top-left", "top-right", "bottom-right", "bottom-left"]  // 4 cantos
}
```

**Handles visuais:**
- 4 círculos brancos (corners)
- Cursor adequado por handle (nwse-resize, nesw-resize, ew-resize, ns-resize)

### 10.4 Drag & Drop (Arrastar Elementos)

**Implementação:** `CanvasInteractionProvider`

**Fases de interação:**
- `idle` - Nada acontecendo
- `dragging` - Arrastando elemento
- `resizing` - Redimensionando elemento

**Dados da fase dragging:**
```typescript
{
  phase: "dragging",
  initial: { id: string, rect: Rect },
  draft: { rect: Rect },
  snapGuides?: { guideX, guideY, candidateIdX, candidateIdY }
}
```

**Coordenadas:** Sistema `DocumentRect` (coordenadas relativas ao canvas)

### 10.5 Tecla ESC (Deseleção)

**Implementação:**
```typescript
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setLayoutTarget("global");
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [setLayoutTarget]);
```

**Efeito:** Volta para contexto global (layoutTarget = "global")

---

## 11. CONTROLES MODO DE POST

**Arquivo:** `client/src/components/ui/PostModeSelector.tsx`

### 11.1 PostModeSelector (Dropdown)

**Localização:** HoloDeck (antes de entrar no Workbench)

**2 modos disponíveis:**

| Modo | ID | Label | Descrição | Ícone |
|------|----|----|----------|-------|
| **Post Estático** | `static` | Post Estático | Uma única imagem | Square |
| **Carrossel** | `carousel` | Carrossel | Múltiplos slides com narrativa | Layers |

**Funcionalidades:**
- Dropdown animado (Framer Motion)
- Trigger com ícone + label + chevron
- Highlight com `layoutId` (motion.div)
- Fechar: outside click ou Escape

**Hint dinâmico:**
```
value === "carousel" 
  ? "A IA criará uma narrativa com múltiplos slides"
  : "A IA criará variações de um único post"
```

**Componente:** Select controlado via props `value` e `onChange`

---

## 12. CONTROLES MOBILE ESPECIAIS

**Arquivo:** `client/src/components/views/WorkbenchV2/WorkbenchV2.tsx`

### 12.1 MobileEditSheet (Bottom Sheet)

**Implementação:** `useArcDrawer` hook

**4 abas mobile:**

| Tab | ID | Ícone | Label |
|-----|----|----|-------|
| **Conteúdo** | `text` | Type | Texto |
| **Design** | `design` | Palette | Design |
| **Mídia** | `image` | ImageIcon | Mídia |
| **Layout** | `composition` | LayoutIcon | Layout |

**Bottom Navigation Bar:** 4 botões com ícones + labels
- Glow animation no ativo
- Badge "●" opacity animado

**Conteúdo por tab:**
- `text`: ElementContentBlock + FontColorBlock + CaptionBlock
- `design`: DesignBlock (ChameleonPanel)
- `image`: ImageBlock
- `composition`: LayoutBlock + PlatformBlock

**Comportamento do sheet:**
- Altura dinâmica via `sheetHeightPx`
- `requestCollapse()` ao tocar fora
- Respeito `env(safe-area-inset-bottom)`

### 12.2 UserTopMenu (Inline Mobile)

**Condição:** `isMobile === true`

**Posição:** Topbar, lado direito

**Variant:** "inline" (compacto)

**⚠️ ATENÇÃO:** No desktop, este menu fica em posição fixa separada. No mobile, é integrado na topbar.

---

## DUPLICAÇÕES CONHECIDAS

Esta seção mapeia todas as duplicações identificadas no código, suas implicações e como reconstruir corretamente.

### 1. ALINHAMENTO DE TEXTO (3 LOCAIS)

#### 1.1 FontColorBlock (Alinhamento Global)

**Local:** `client/src/components/views/WorkbenchV2/blocks/FontColorBlock.tsx:246-299`

**Escopo:** Global via `designTokens.typography.textAlign`

**Opções:** left, center

**Efeito:** Afeta **todo** o texto do post (headline, body, elements, etc.)

**Código:**
```typescript
updateVariation({
  designTokens: {
    typography: {
      textAlign: align // "left" | "center"
    }
  }
});
```

#### 1.2 LayoutBlock (Alinhamento por Layer)

**Local:** `client/src/components/views/WorkbenchV2/blocks/LayoutBlock.tsx:284-308`

**Escopo:** Por layer via `layoutSettings[activeLayer].textAlign`

**Opções:** left, center, right (3 opções)

**Efeito:** Afeta apenas o layer selecionado

**Código:**
```typescript
updateActiveLayer({ textAlign: align });
// activeLayer = "headline" | "body" | "accentBar" | "badge" | "sticker" | "carouselArrow" | "card" | "section:*"
```

#### 1.3 TextElement (Alinhamento por Elemento Avançado)

**Local:** Tipo `TextElement` em `shared/postspark.ts:404`

**Escopo:** Por textElement individual

**Opções:** left, center, right

**Efeito:** Afeta apenas aquele textElement

**⚠️ PROBLEMA:** Esta propriedade existe no tipo mas **não há controle UI** para editá-la.

**Status:** 🔴 **QUEBRADO** - Propriedade não-exposta na interface

#### Implicações para Reconstrução

**Na reconstrução, implemente nesta ordem de prioridade:**

1. **Por elemento (textElement.textAlign)** - Mais específico, sobrescreve tudo
2. **Por layer (layoutSettings[layer].textAlign)** - Sobrescreve global
3. **Global (designTokens.typography.textAlign)** - Fallback padrão

**Lógica de renderização:**
```typescript
const getTextAlign = (element, layer) => {
  return element.styles.textAlign  // 1. Prioridade máxima
    ?? layoutSettings[layer]?.textAlign  // 2. Prioridade média
    ?? designTokens.typography.textAlign;  // 3. Fallback
};
```

---

### 2. FAMÍLIA DE FONTE (4 LOCAIS)

#### 2.1 headlineFontFamily (Override Título)

**Local:** `PostVariation.headlineFontFamily`

**Escopo:** Apenas título

**Prioridade:** Alta (sobrescrebe global)

**Uso:** Editado via FontColorBlock quando layoutTarget === "headline"

#### 2.2 bodyFontFamily (Override Corpo)

**Local:** `PostVariation.bodyFontFamily`

**Escopo:** Apenas corpo

**Prioridade:** Alta (sobrescrecreve global)

**Uso:** Editado via FontColorBlock quando layoutTarget === "body"

#### 2.3 designTokens.typography.fontFamily (Global)

**Local:** `DesignTokens.typography.fontFamily`

**Escopo:** Todo o post

**Prioridade:** Baixa (sobrescrita por overrides)

**Uso:** Editado via FontColorBlock quando layoutTarget === "global"

#### 2.4 designTokens.typography.customFontUrl (Google Fonts)

**Local:** `DesignTokens.typography.customFontUrl`

**Escopo:** Todo o post

**Prioridade:** **MÁXIMA** (sobrescrete fontFamily se definida)

**Uso:** Editado via ChameleonPanel (aba Tipografia)

**⚠️ ATENÇÃO:** Se `customFontUrl` estiver definida, ela tem **prioridade absoluta** sobre `fontFamily`. O sistema de renderização prioriza a URL sobre o nome.

#### Implicações para Reconstrução

**Na reconstrução, implemente nesta ordem de prioridade:**

1. **customFontUrl** - Se existe, usa a URL do Google Fonts
2. **headlineFontFamily** - Se existe, usa esta fonte para título
3. **bodyFontFamily** - Se existe, usa esta fonte para corpo
4. **fontFamily** - Fallback global

**Lógica de renderização:**
```typescript
const getFontFamily = (scope) => {
  // 1. URL customizada tem prioridade absoluta
  if (designTokens.typography.customFontUrl) {
    return loadGoogleFont(designTokens.typography.customFontUrl);
  }
  
  // 2. Overrides por tipo
  if (scope === "headline" && headlineFontFamily) {
    return headlineFontFamily;
  }
  if (scope === "body" && bodyFontFamily) {
    return bodyFontFamily;
  }
  
  // 3. Fallback global
  return designTokens.typography.fontFamily || "Inter";
};
```

---

### 3. TAMANHO DE FONTE (2 SISTEMAS DIFERENTES)

#### 3.1 Multiplicadores (FontColorBlock)

**Local:** `client/src/components/views/WorkbenchV2/blocks/FontColorBlock.tsx:142-182`

**Campos:**
- `headlineFontSize` (60%–180%)
- `bodyFontSize` (60%–180%)

**Sistema:** Multiplicadores de um tamanho base

**Efeito:** Escala proporcionalmente

#### 3.2 Pixels Absolutos (TextElement)

**Local:** `ElementContentBlock.tsx:214-222`

**Campo:** `styles.fontSize` ("8px"–"96px")

**Sistema:** Pixels absolutos

**Efeito:** Tamanho fixo independente de base

#### Implicações para Reconstrução

**Estes são sistemas completamente diferentes e não entram em conflito:**

- **Multiplicadores** aplicam-se a headline/body principais
- **Pixels absolutos** aplicam-se apenas a TextElements avançados

**Não há sobreposição de escopo.** São independentes.

---

### 4. COR DE TEXTO (3 LOCAIS)

#### 4.1 headlineColor (Override Título)

**Local:** `PostVariation.headlineColor`

**Escopo:** Apenas título

**Efeito:** Sobrescrece cor global

#### 4.2 bodyColor (Override Corpo)

**Local:** `PostVariation.bodyColor`

**Escopo:** Apenas corpo

**Efeito:** Sobrescrece cor global

#### 4.3 textColor (Global + Fallback)

**Local:** `PostVariation.textColor` + `DesignTokens.colors.text`

**Escopo:** Todo o post

**Efeito:** Cor padrão, usada se não houver override

**Lógica:**
```typescript
// Título
const headlineColorFinal = headlineColor ?? textColor ?? designTokens.colors.text;

// Corpo
const bodyColorFinal = bodyColor ?? textColor ?? designTokens.colors.text;
```

#### 4.4 TextElement (Por Elemento Avançado)

**Local:** `TextElement.styles.color`

**Escopo:** Apenas aquele textElement

**Efeito:** Cor independente para o elemento

**Uso:** Editado via ElementContentBlock (focus textElement)

#### Implicações para Reconstrução

**Na reconstrução, implemente nesta ordem de prioridade:**

1. **textElement.styles.color** - TextElements avançados
2. **headlineColor/bodyColor** - Overrides por tipo
3. **textColor** - Override global (PostVariation)
4. **designTokens.colors.text** - Fallback do Design Tokens

---

### 5. COR DE FUNDO (2 LOCAIS - SEPARADOS)

#### 5.1 ImageBlock (bgValue)

**Local:** `client/src/components/views/WorkbenchV2/blocks/ImageBlock.tsx`

**Campo:** `bgValue.color` (quando type === "solid")

**Escopo:** Plano de fundo do post

**Efeito:** Define cor sólida do fundo

#### 5.2 ChameleonPanel (DesignTokens)

**Local:** `client/src/components/ChameleonPanel.tsx:149`

**Campo:** `designTokens.colors.background`

**Escopo:** Cor de fundo global do tema

**Efeito:** Cor de fundo aplicada em múltiplos elementos

**⚠️ ATENÇÃO:** Estes são **campos separados** no estado. Não sobrescrevem um ao outro.

**Relação:**
- `bgValue.color` é usado especificamente quando o usuário seleciona "Cor Sólida" no ImageBlock
- `designTokens.colors.background` é usado pela renderização do card como cor de fundo base

**Implicações para Reconstrução:**

**Na reconstrução, respeite a separação:**

```typescript
// Renderização do fundo
const getBackground = () => {
  if (bgValue.type === "solid") {
    return bgValue.color;  // Prioridade para cor sólida selecionada
  }
  if (bgValue.type === "none") {
    return designTokens.colors.background;  // Fallback para tema
  }
  // gallery/upload/ai usam url, não cor
};
```

---

### 6. ALINHAMENTO DE TEXTO - INCONSISTÊNCIA DE OPÇÕES

**Local:**
- FontColorBlock: 2 opções (left, center)
- LayoutBlock: 3 opções (left, center, right)

**⚠️ PROBLEMA:** O alinhamento global **não tem opção "right"**, mas o alinhamento por layer **tem**.

**Status:** 🔴 **INCONSISTENTE** - Funcionalidade desigual

**Implicações para Reconstrução:**

**Na reconstrução, padronize para 3 opções em ambos:**

```typescript
const ALIGNMENT_OPTIONS = ["left", "center", "right"];

// FontColorBlock deve ter 3 opções, não 2
// LayoutBlock já está correto com 3 opções
```

---

## BUGS E PROBLEMAS CONHECIDOS

Esta seção lista bugs conhecidos que devem ser corrigidos na reconstrução.

### 🔴 CRÍTICOS

#### 1. TextElement - Propriedades Não-Expostas

**Local:** `ElementContentBlock.tsx`

**Problema:** O tipo `TextElement` define 7 propriedades de estilo, mas a UI só expõe 4.

**Propriedades Expostas:**
- ✅ fontSize
- ✅ fontFamily
- ✅ color
- ✅ rotation
- ✅ x
- ✅ y
- ✅ width

**Propriedades Ocultas (não há controle UI):**
- ❌ fontWeight
- ❌ fontStyle
- ❌ textDecoration
- ❌ textAlign
- ❌ lineHeight
- ❌ opacity

**Impacto:** Usuário não pode usar negrito, itálico, sublinhado, ajustar line-height ou opacidade de TextElements.

**Reconstrução:** Adicionar controles para essas 6 propriedades no ElementContentBlock.

---

#### 2. Alinhamento Global - Opção Faltante

**Problema:** FontColorBlock só permite left/center, mas LayoutBlock permite left/center/right.

**Impacto:** Usuário não pode alinhar texto globalmente à direita.

**Reconstrução:** Adicionar botão "right" no FontColorBlock.

---

### 🟡 MÉDIOS

#### 3. Galeria - Categoria Hardcoded

**Local:** `BackgroundGallery.tsx:71`

**Problema:** Categoria default está hardcoded como `'acolhimento-respiro'`.

**Código:**
```typescript
const [activeCategory, setActiveCategory] = useState<string>('acolhimento-respiro');
```

**Impacto:** Se a categoria for removida do manifesto, pode quebrar.

**Reconstrução:** Usar primeira categoria disponível no manifesto:
```typescript
const firstCategory = manifest ? Object.keys(manifest.categories)[0] : 'saved';
const [activeCategory, setActiveCategory] = useState<string>(firstCategory);
```

---

#### 4. Exportação - Sem Feedback de Progresso

**Problema:** Exportação pode levar 30s (timeout), mas não há barra de progresso.

**Impacto:** Usuário pensou que travou.

**Reconstrução:** Adicionar indicador de progresso durante as fases:
- "Aguardando fontes..."
- "Carregando imagens..."
- "Renderizando..."

---

### 🟢 BAIXOS

#### 5. Placeholder de Prompt Genérico

**Local:** `ImageBlock.tsx:176`

**Problema:** Placeholder "Ex: Praia paradisíaca ao pôr do sol..." é muito específico.

**Impacto:** Pode não inspirar usuários de outros nichos.

**Reconstrução:** Placeholder mais genérico: "Descreva o que você quer criar..."

---

#### 6. Contador de Hashtags - Sem Limite Visual

**Problema:** Usuário pode adicionar hashtags infinitamente.

**Impacto:** UI pode quebrar com 50+ hashtags.

**Reconstrução:** Limitar a 30 hashtags e mostrar warning.

---

## ESTRUTURA DE ARQUIVOS

### Diretório Principal do WorkbenchV2

```
client/src/components/views/WorkbenchV2/
├── WorkbenchV2.tsx                    # Shell principal (topbar + layout)
├── CanvasWorkspace.tsx                # Canvas central + scaling
├── CanvasControls.tsx                 # Controles de carrossel + magnet
├── PostCardV2.tsx                     # Renderização do post
├── useAutoPilotDesign.ts              # Hook de design autônomo
├── CanvasLoadingOverlay.tsx           # Overlay de loading
├── CanvasGridOverlay.tsx              # Grid visual (magnet mode)
├── blocks/                            # Blocos de edição da sidebar
│   ├── ImageBlock.tsx                # Fundo & Mídia
│   ├── FontColorBlock.tsx            # Tipografia & Cor
│   ├── CaptionBlock.tsx              # Conteúdo do card
│   ├── LayoutBlock.tsx               # Disposição
│   ├── DesignBlock.tsx               # Identidade Visual
│   ├── PlatformBlock.tsx             # Plataforma & Proporção
│   └── ElementContentBlock.tsx       # Seções + TextElements
└── MobileEditSheet.tsx               # (reutilizado de /components)
```

### Componentes UI Reutilizados

```
client/src/components/ui/
├── FontDropdown.tsx                   # Seletor de fonte
├── PrecisionSlider.tsx                # Slider com formatação
├── BackgroundGallery.tsx              # Galeria de backgrounds
├── CaptionPreview.tsx                 # Preview de legenda
├── PostModeSelector.tsx               # Selector estático/carrossel
├── CollapsibleSection.tsx             # Seção colapsável
└── ChameleonPanel.tsx                 # (não está em /ui, mas é reutilizado)
```

### Sistema de Interação

```
client/src/editor/
├── integration/
│   ├── CanvasInteractionProvider.tsx # Context de interação
│   └── InteractionOverlay.tsx         # Handles + snap guides
├── geometry/
│   └── index.ts                       # Utilitários de geometria
└── history/
    └── useEditorHistory.ts            # Undo/redo
```

### Estado Global

```
client/src/store/
└── editorStore.ts                     # Zustand store principal
```

### Tipos Compartilhados

```
shared/
└── postspark.ts                       # Types PostVariation, etc.
```

---

## DEPENDÊNCIAS EXTERNAS

### Bibliotecas Principais

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "framer-motion": "^11.0.0",        // Animações
    "lucide-react": "^0.400.0",         // Ícones
    "zustand": "^4.5.0",                // Estado global
    "@trpc/client": "^11.0.0",          // API client
    "@trpc/server": "^11.0.0",          // API server
    "@supabase/supabase-js": "^2.39.0", // Auth + DB
    "html2canvas-pro": "^1.4.0"          // Exportação PNG
  }
}
```

### Dependências de Tipos

```typescript
import type {
  PostVariation,
  DesignTokens,
  BackgroundValue,
  ImageSettings,
  CarouselSlide,
  TextElement,
  ImageElement,
  ContentSection
} from "@shared/postspark";
```

---

## MATRIZ DE RECONSTRUÇÃO

Use esta matriz para guiar a reconstrução, na ordem recomendada.

### Fase 1: Estrutura Base (Semana 1)

| Componente | Complexidade | Dependências | Prioridade |
|-----------|-------------|--------------|-----------|
| WorkbenchV2 shell | Alta | Zustand, hooks | 🔴 Crítica |
| CanvasWorkspace | Média | PostCardV2, scaling | 🔴 Crítica |
| Topbar (botões) | Baixa | EditorStore | 🔴 Crítica |
| Mobile navigation | Média | ArcDrawer | 🟡 Média |

### Fase 2: Blocos de Edição (Semana 2-3)

| Bloco | Complexidade | Dependências | Prioridade |
|-------|-------------|--------------|-----------|
| ImageBlock | Alta | trpc, BackgroundGallery | 🔴 Crítica |
| FontColorBlock | Média | FontDropdown | 🔴 Crítica |
| LayoutBlock | Alta | PrecisionSlider | 🔴 Crítica |
| CaptionBlock | Baixa | CaptionPreview | 🔴 Crítica |
| DesignBlock | Média | ChameleonPanel | 🟡 Média |
| PlatformBlock | Baixa | - | 🟡 Média |
| ElementContentBlock | Alta | - | 🟢 Baixa |

### Fase 3: Interações (Semana 4)

| Sistema | Complexidade | Dependências | Prioridade |
|---------|-------------|--------------|-----------|
| CanvasInteractionProvider | Alta | Geometry types | 🔴 Crítica |
| InteractionOverlay | Média | Provider | 🔴 Crítica |
| MagnetControl | Baixa | - | 🟡 Média |
| Snap guides | Média | Geometry math | 🟡 Média |

### Fase 4: Carrossel (Semana 5)

| Componente | Complexidade | Dependências | Prioridade |
|-----------|-------------|--------------|-----------|
| CarouselScopeControl | Média | - | 🔴 Crítica |
| CarouselSlideNavigator | Baixa | - | 🟡 Média |
| CarouselMobileArrows | Baixa | - | 🟡 Média |
| EditorState per-slide | Alta | Store types | 🟢 Baixa |

### Fase 5: Correções de Bugs (Semana 6)

| Bug | Impacto | Esforço | Prioridade |
|-----|---------|---------|-----------|
| TextElement props faltando | Alto | Médio | 🔴 Crítica |
| Alinhamento global sem "right" | Médio | Baixo | 🟡 Média |
| Categoria hardcoded | Baixo | Baixo | 🟢 Baixa |

---

## CONCLUSÃO

Este documento catalogou **todos** os recursos de edição do WorkbenchV2, incluindo:

✅ 8 blocos de edição principais  
✅ 30+ sub-recursos de edição  
✅ 6 duplicações identificadas e mapeadas  
✅ 6 bugs conhecidos documentados  
✅ 4 sistemas de interação completos  
✅ 3 níveis de controle (global, layer, elemento)  
✅ Matriz de reconstrução faseada

**Para reconstruir o aplicativo:**

1. Comece pela **Fase 1** (estrutura base)
2. Implemente blocos na **Fase 2** (por ordem de prioridade)
3. Adicione interações na **Fase 3**
4. Complete carrossel na **Fase 4**
5. Corrija bugs na **Fase 5**

**Use as seções de Duplicações e Bugs como guia para evitar reproduzir erros conhecidos.**

---

**Documento mantido por:** Equipe PostSpark  
**Última atualização:** 2026-08-05  
**Versão:** 1.0
