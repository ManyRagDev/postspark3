# Estado Atual do Projeto

## Funcionalidades Implementadas
- **TextCanvas (Architect 2.0):** Ambiente de edição livre com `AdvancedTextCanvas`, `AdvancedTextNode`, `AdvancedTextSelectionBox`, `AdvancedTextPropertyBar`, e `AdvancedTextSidebar`. Suporta drag, resize, rotate e formatação de texto inline.
- **PostCard multi-layout:** Componente com 4 layouts (`centered`, `left-aligned`, `split`, `minimal`) e 3 proporções (1:1, 5:6, 9:16). Inclui `ArchitectOverlay` com grid 3×3 para posicionamento preciso.
- **Modo Carrossel:** `PostVariation` suporta array de `slides`; `PostCard` renderiza carrossel com navegação. TheVoid e WorkbenchRefactored integrados ao modo carrossel.
- **HoloDeck → Workbench (Fuga de Dados Corrigida):** Prop drilling auditado; deep clone implementado para isolamento da variação. Schema Drizzle atualizado com colunas JSON para `textElements`, `slides` e `postMode`.
- **Font Size Control:** Multiplicadores `headlineFontSize` e `bodyFontSize` no `PostVariation`; sliders no Workbench ajustam tamanho via `calc()`.
- **Princípios de Design (guia_design.md):** systemPrompt enriquecido com hierarquia 3:2:1, layout inteligente, psicologia das cores e contraste WCAG. Helper `designRules.ts` com `validateDesignChecklist()`. Painel `DesignChecklistPanel` colapsável no Workbench.

## Estrutura de Dados Atual
- Projeto Supabase: `Brincar / PostSpark` (ref: `spbuwcwmxlycchuwhfir`)
- Schema principal: `postspark` (isolado de `brincareducando`)
- Banco de Dados definido em código: PostgreSQL (Drizzle ORM)
- Migração inicial gerada (aguardando conexão e apply)

## Decisões Arquiteturais Recentes
- **Mobile UI Redesign:** Substituição do menu circular arcaico (`ReactorArc.tsx`) por uma Toolbar Fixa Inferior e um Sheet modal de edição (`MobileEditSheet.tsx`).
- **Otimização Touch:** Todos os controles numéricos (Precisão) e botões de grid agora possuem `touch-action: none` e alvos mínimos de `44px` conforme diretrizes de acessibilidade mobile.
- Projeto iniciado usando stack definida em `tech-stack.md`.