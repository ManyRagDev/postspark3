# Estado Atual do Projeto

## Funcionalidades Implementadas
- **TextCanvas (Architect 2.0):** Ambiente de edição livre com `AdvancedTextCanvas`, `AdvancedTextNode`, `AdvancedTextSelectionBox`, `AdvancedTextPropertyBar`, e `AdvancedTextSidebar`. Suporta drag, resize, rotate e formatação de texto inline.
- **PostCard multi-layout & Grid Snap 5x5:** Layouts flexíveis e proporções dinâmicas. O sistema de ímã agora utiliza uma grade 5x5 **padding-aware**, que mapeia as coordenadas 0-100% para a área interna segura do card, evitando que elementos encostem nas bordas.
- **Glow Premium & Polimento UI:** Implementação de um sistema de estética de luxo com brilhos reativos (glows) no Header, Sidebar, Bottom Bar e botões de estado (Ímã, Proporção), sincronizados com a `accentColor` do post.
- **Estabilização de Arraste (Drag Fix):** Correção do "glitch" de salto no primeiro clique através da captura tardia (*late-binding*) dos bounds do container no momento de ultrapassagem do threshold de drag.
- **Modo Carrossel:** `PostVariation` suporta array de `slides`; `PostCard` renderiza carrossel com navegação. TheVoid e WorkbenchRefactored integrados ao modo carrossel.
- **HoloDeck → Workbench (Fuga de Dados Corrigida):** Prop drilling auditado; deep clone implementado para isolamento da variação. Schema Drizzle atualizado com colunas JSON para `textElements`, `slides` e `postMode`.
- **Font Size Control:** Multiplicadores `headlineFontSize` e `bodyFontSize` no `PostVariation`; sliders no Workbench ajustam tamanho via `calc()`.
- **Princípios de Design (guia_design.md):** systemPrompt enriquecido com hierarquia 3:2:1, layout inteligente, psicologia das cores e contraste WCAG. Helper `designRules.ts` com `validateDesignChecklist()`. Painel `DesignChecklistPanel` colapsável no Workbench.

## Estrutura de Dados e Serviços
- **Screenshot Microservice (Railway):** Playwright isolado. Lógica de **Browser Pooling** (reuso de instância Chromium) e **Context Isolation** (um contexto por request). Sanitização automática de banners de cookies/GDPR e widgets de chat. Descoberta inteligente de links internos via `/discover`.
- **LLM Engine (Robustez):** Implementada em `server/_core/llm.ts`. Uso primário de Gemini-1.5, com fallback automático para Groq (`llama-3.3-70b-versatile`) quando necessário, incluindo stripping de conteúdo multimodal (imagens) não suportado pelo fallback.
- Projeto Supabase: `Brincar / PostSpark` (ref: `spbuwcwmxlycchuwhfir`)
- Schema principal: `postspark` (isolado de `brincareducando`)
- Banco de Dados definido em código: PostgreSQL (Drizzle ORM)
- Migração inicial gerada (aguardando conexão e apply)

## Decisões Arquiteturais Recentes
- **Mobile UI Redesign:** Substituição do menu circular arcaico (`ReactorArc.tsx`) por uma Toolbar Fixa Inferior e um Sheet modal de edição (`MobileEditSheet.tsx`).
- **Otimização Touch:** Todos os controles numéricos (Precisão) e botões de grid agora possuem `touch-action: none` e alvos mínimos de `44px` conforme diretrizes de acessibilidade mobile.
- Projeto iniciado usando stack definida em `tech-stack.md`.