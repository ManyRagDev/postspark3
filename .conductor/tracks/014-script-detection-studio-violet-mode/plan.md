# Track 014: Detecção Inteligente de Roteiros, Modo Violet Studio e Diagramação Fiel

## Objetivo
Permitir que usuários que já possuem briefings estruturados (roteiros slide a slide) vejam seu conteúdo diagramado diretamente no Acervo 82 com fidelidade total de texto, adicionando a tríade de estados visuais no `/thevoid` (Laranja = Ideação, Azul = URL, Violeta = Roteiro Pro) e blindando o comparador de citações contra divergências de formatação Markdown.

---

## Fases de Execução

### FASE 1: Blindagem e Resiliência de Citações e Fontes (Backend & Shared)
- [x] **T1.1**: Atualizar `comparableQuote` em `shared/generationPlan.ts` para sanitizar sintaxe Markdown comum (`**`, `*`, `__`, `_`, `#`, `##`, `===`, bullets `-`, `\r`) e normalizar pontuações/espaços antes do teste de inclusão (`includes`).
- [x] **T1.2**: Adicionar mapeamento defensivo em `normalizeGenerationIntent` (`shared/generationPlan.ts`) para converter IDs alucinados comuns (`s1`, `s2`, `s3`) nos IDs reais disponíveis em `factualSourceIds` (`sources[0].id`, etc.).
- [x] **T1.3**: Criar/atualizar testes automatizados em `shared/generationPlan.test.ts` (ou teste dedicado) validando que o prompt da ZHUB e briefings com Markdown não geram mais `unattributed_requirement` ou `unknown_source`.

### FASE 2: Parser de Roteiro e Detecção Heurística no Client
- [x] **T2.1**: Criar helper puro `client/src/pages/StudioApp/lib/scriptDetector.ts`:
  - `detectScriptStructure(text: string)`: detecta padrões como `Slide \d+:`, `\*\*Slide \d+:\*\*`, `Lâmina \d+:`, etc.
  - Extrai quantidade de slides e parsed slides (`title`, `body`).
- [x] **T2.2**: Adicionar testes unitários em `client/src/pages/StudioApp/lib/scriptDetector.test.ts` com diferentes formatos de briefing (ZHUB, listas numeradas, markdown, etc.).

### FASE 3: Tríade Visual no `/thevoid` e Seletor Inline (Client)
- [x] **T3.1**: Em `StudioCreateViewV2B.tsx`, implementar a tríade de cores da caixa de entrada:
  - 🟠 **Laranja**: Texto livre / Ideação (padrão atual).
  - 🔵 **Azul**: URL informada.
  - 🟣 **Violeta Studio (`#8b5cf6` / `#a855f7`)**: Roteiro com slides detectado.
- [x] **T3.2**: Auto-ajuste de slides: Quando o script for detectado com $N$ slides ($2 \le N \le 10$), sincronizar o seletor de slides para $N$ automaticamente com feedback visual.
- [x] **T3.3**: Componente Seletor de Modo Inline abaixo da caixa de texto:
  - `[ 🟣 Preservar meus slides (Design Fiel) ✓ ]`
  - `[ ⚪ Deixar a IA reescrever ]`
  - Permite override manual a qualquer momento.

### FASE 4: Integração com Pipeline de Geração
- [x] **T4.1**: Conectar a opção selecionada ao payload de `executionBrief` (`interventionLevel: "visual_only"`, `contentSourceType: "carousel_slides"`).
- [x] **T4.2**: Testar fluxo completo ponta a ponta com o briefing da ZHUB e verificar as propostas geradas.
