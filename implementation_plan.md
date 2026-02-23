# Implementation Plan

## Status: ✅ IMPLEMENTADO

## [Overview]
Implementar um sistema de extração de estilo visual de websites que captura padrões de design (moderno, brutalista, minimalista, neon, etc.) e gera temas temporários para aplicação no HoloDeck e Workbench.

O sistema será acionado quando o usuário digitar uma URL no TheVoid. O fluxo atual de scrape será aprimorado para extrair não apenas conteúdo textual, mas também propriedades visuais do site. Essas informações serão processadas por LLM para classificar o padrão de design e gerar variações de temas temporários que serão apresentados ao usuário no HoloDeck para seleção.

## [Types]

### Extraídos do Website (CSS/HTML)
```typescript
interface ExtractedStyleData {
  // Cores extraídas
  colors: {
    primary: string;       // Cor dominante (hex)
    secondary: string;     // Cor secundária (hex)
    background: string;    // Cor de fundo predominante (hex)
    text: string;          // Cor de texto principal (hex)
    accent: string;        // Cor de destaque (hex)
    palette: string[];     // Paleta completa extraída (máx 8 cores)
  };
  
  // Tipografia
  typography: {
    headingFont: string;   // Família da fonte de título
    bodyFont: string;      // Família da fonte de corpo
    headingWeight: string; // Peso da fonte de título
    bodyWeight: string;    // Peso da fonte de corpo
  };
  
  // Espaçamento e Layout
  spacing: {
    density: 'compact' | 'normal' | 'spacious';  // Densidade visual
    borderRadius: 'square' | 'rounded' | 'pill'; // Estilo de bordas
    padding: 'tight' | 'normal' | 'loose';       // Padding geral
  };
  
  // Efeitos visuais detectados
  effects: {
    shadows: boolean;       // Presença de sombras
    gradients: boolean;     // Presença de gradientes
    animations: boolean;    // Presença de animações
    glassmorphism: boolean; // Efeito glass/blur
    noise: boolean;         // Textura de ruído
  };
  
  // Metadados do site
  metadata: {
    favicon?: string;       // URL do favicon
    logo?: string;          // URL do logo detectado
    siteName?: string;      // Nome do site
  };
}
```

### Padrão de Design Classificado (LLM Output)
```typescript
interface DesignPattern {
  id: string;                           // ID único do padrão
  name: string;                         // Nome do padrão (ex: "Modern Minimalist")
  category: DesignPatternCategory;      // Categoria principal
  confidence: number;                   // 0-100, confiança da classificação
  characteristics: string[];            // Lista de características identificadas
  description: string;                  // Descrição breve do estilo
}

type DesignPatternCategory = 
  | 'modern'           // Clean, minimal, whitespace
  | 'brutalist'        // Raw, bold, unconventional
  | 'neon'             // Cyberpunk, glowing, dark backgrounds
  | 'classic'          // Traditional, serif, elegant
  | 'playful'          // Colorful, rounded, fun
  | 'corporate'        // Professional, blue tones, structured
  | 'artistic'         // Creative, unique layouts
  | 'minimalist'       // Ultra-simple, essential only
  | 'retro'            // Vintage aesthetics
  | 'futuristic';      // Sci-fi, advanced feel
```

### Tema Temporário Gerado
```typescript
interface TemporaryTheme extends ThemeConfig {
  id: string;                           // ID único com prefixo 'temp-'
  source: 'website-extraction';         // Origem do tema
  sourceUrl: string;                    // URL do site original
  designPattern: DesignPattern;         // Padrão de design detectado
  isTemporary: true;                    // Flag indicando tema temporário
  createdAt: number;                    // Timestamp de criação
}
```

### Resposta do Endpoint de Extração
```typescript
interface StyleExtractionResult {
  extractedData: ExtractedStyleData;    // Dados brutos extraídos
  designPatterns: DesignPattern[];      // Padrões classificados (1-3)
  themes: TemporaryTheme[];             // Temas gerados (2-3 variações)
  fallbackUsed: boolean;                // Se usou fallback LLM-only
}
```

## [Files]

### Novos Arquivos

**`server/styleExtractor.ts`**
- Propósito: Módulo principal de extração de estilo
- Funções: `extractStyleFromUrl()`, `parseCSSProperties()`, `extractColors()`, `extractTypography()`

**`server/designPatternAnalyzer.ts`**
- Propósito: Análise e classificação de padrões de design via LLM
- Funções: `analyzeDesignPattern()`, `generateThemeFromPattern()`

**`client/src/components/ExtractedStyleSelector.tsx`**
- Propósito: Componente UI para exibir estilos extraídos
- Funções: Exibir preview dos temas extraídos, permitir seleção múltipla

**`client/src/hooks/useExtractedStyles.ts`**
- Propósito: Hook para gerenciar estilos extraídos na sessão
- Funções: Cache temporário, seleção, aplicação de temas

### Arquivos Modificados

**`server/routers.ts`**
- Adicionar novo endpoint: `post.extractStyles`
- Modificar `scrapeUrl()` para retornar mais dados visuais

**`client/src/pages/Home.tsx`**
- Adicionar estado para temas extraídos
- Integrar fluxo de extração quando inputType === 'url'

**`client/src/components/views/HoloDeck.tsx`**
- Adicionar seção "Estilos Extraídos" quando houver temas temporários
- Permitir aplicação de temas extraídos nas variações

**`client/src/components/StyleSelector.tsx`**
- Adicionar suporte para temas temporários
- Diferenciar visualmente temas extraídos dos presets

**`shared/postspark.ts`**
- Adicionar tipos `ExtractedStyleData`, `DesignPattern`, `TemporaryTheme`

## [Functions]

### Novas Funções

**`server/styleExtractor.ts`**

1. `extractStyleFromUrl(url: string): Promise<ExtractedStyleData>`
   - Entrada: URL do site
   - Saída: Dados de estilo extraídos
   - Lógica: Fetch HTML, parse CSS inline/external, extrair cores dominantes, detectar tipografia

2. `extractColorsFromHTML(html: string): string[]`
   - Entrada: HTML completo
   - Saída: Array de cores hex
   - Lógica: Regex para cores em CSS, contagem de frequência

3. `extractTypographyFromHTML(html: string): TypographyInfo`
   - Entrada: HTML completo
   - Saída: Informações de tipografia
   - Lógica: Parse de font-family, font-weight

**`server/designPatternAnalyzer.ts`**

4. `analyzeDesignPattern(data: ExtractedStyleData): Promise<DesignPattern[]>`
   - Entrada: Dados de estilo extraídos
   - Saída: Array de padrões classificados
   - Lógica: LLM analisa dados e classifica em categorias

5. `generateThemeFromPattern(pattern: DesignPattern, data: ExtractedStyleData): TemporaryTheme`
   - Entrada: Padrão classificado + dados extraídos
   - Saída: Tema temporário completo
   - Lógica: Mapear padrão para ThemeConfig + metadados

### Funções Modificadas

**`server/routers.ts`**

6. `scrapeUrl()` - Modificar
   - Adicionar retorno de dados de estilo
   - Integrar com `extractStyleFromUrl()`

**`client/src/pages/Home.tsx`**

7. `handleVoidSubmit()` - Modificar
   - Quando inputType === 'url', chamar extração de estilo
   - Armazenar temas extraídos no estado

## [Classes]

Não há criação de novas classes. A implementação utiliza funções puras e interfaces TypeScript.

## [Dependencies]

### Sem Novas Dependências

A implementação utiliza apenas as dependências existentes:
- `invokeLLM()` para análise de padrões
- `fetch()` nativo para scraping
- Regex para parsing de CSS

### Dependências Existentes Utilizadas
- LLM (Gemini via `server/_core/llm.ts`) - para classificação de padrões
- ThemeConfig (`client/src/lib/themes.ts`) - estrutura base para temas

## [Testing]

### Testes Unitários (Vitest)

**`server/styleExtractor.test.ts`**
- Testar extração de cores de HTML
- Testar extração de tipografia
- Testar parsing de CSS inline

**`server/designPatternAnalyzer.test.ts`**
- Testar classificação de padrões com dados mock
- Testar geração de tema a partir de padrão

### Testes de Integração

- Testar fluxo completo: URL → extração → temas → UI
- Testar fallback quando scraping falha
- Testar comportamento com sites sem CSS acessível

## [Implementation Order]

1. **Definir tipos** (`shared/postspark.ts`)
   - Adicionar interfaces `ExtractedStyleData`, `DesignPattern`, `TemporaryTheme`

2. **Criar extrator de estilo** (`server/styleExtractor.ts`)
   - Implementar `extractStyleFromUrl()`
   - Implementar funções auxiliares de parsing

3. **Criar analisador de padrões** (`server/designPatternAnalyzer.ts`)
   - Implementar `analyzeDesignPattern()` com LLM
   - Implementar `generateThemeFromPattern()`

4. **Adicionar endpoint** (`server/routers.ts`)
   - Criar `post.extractStyles`
   - Modificar `scrapeUrl()` para incluir extração

5. **Criar hook de estado** (`client/src/hooks/useExtractedStyles.ts`)
   - Gerenciar temas extraídos na sessão
   - Cache e seleção de temas

6. **Modificar Home.tsx**
   - Integrar extração no fluxo de URL
   - Passar temas extraídos para HoloDeck

7. **Modificar HoloDeck.tsx**
   - Exibir estilos extraídos quando disponíveis
   - Permitir aplicação nas variações

8. **Modificar StyleSelector.tsx**
   - Adicionar seção para temas extraídos
   - Diferenciar visualmente

9. **Criar ExtractedStyleSelector.tsx**
   - Componente dedicado para preview de estilos extraídos

10. **Testes**
    - Escrever testes unitários
    - Testar fluxo completo