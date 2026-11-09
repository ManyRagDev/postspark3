# Coding Guidelines & Architectural Laws (Conductor Rules)

Estas regras são imutáveis e governam todas as implementações, correções de bugs, refatorações e gerações de código no PostSpark 3.

---

## 0. Idioma Obrigatório

- **Sempre responda em português brasileiro:** Todas as mensagens, explicações, planos de implementação e artefatos de governança devem ser redigidos em português do Brasil.

---

## 1. Fonte Única da Verdade do Editor (`CanvasPostModel`)

1. **O Editor Ativo é o CanvasLab:** O fluxo histórico (`Home.tsx` / `HoloDeck` / `WorkbenchV2`) é órfão de rotas. O editor oficial ativo do estúdio é o **CanvasLab** (`client/src/pages/CanvasLab/`), renderizado deterministicamente pelo motor Konva em `CanvasPostStage.tsx`.
2. **Autoridade do Modelo:** O `CanvasPostModel` (`client/src/pages/CanvasLab/components/types.ts`) é o documento autoritativo único de qualquer post em edição.
3. **Funil Centralizado de Mutação:** Toda e qualquer alteração de estado deve passar pelo funil `CanvasLabPage.handleUpdatePost`. É proibido atualizar o estado de camadas Konva por vias laterais que ignorem o modelo.
4. **Persistência Sem Perda:** Salvamento e reabertura são realizados na coluna `canvas_model` do Supabase via `client/src/pages/CanvasLab/lib/saveAdapter.ts`. O formato salvo deve ser 100% retrocompatível e fiel ao estado do editor.

---

## 2. Guardião de Contraste & Acessibilidade WCAG 2.1

1. **Auditoria Algorítmica Contínua:** Toda mudança de cor de fundo, cor de acento ou aplicação de família tipográfica é auditada por `lib/contrast.ts`. Fundo escuro exige texto claro e vice-versa.
2. **Metades do Brutal Split:** Em layouts divididos (Brutal Split), o título é contrastado contra a cor de fundo e o corpo de texto contra a cor de acento (ou vice-versa), garantindo razão de contraste > 4.5:1 em ambas as metades.
3. **Variação Cinemática (`cinematic-depth`):** Jamais aplicar fundo escuro fixo com texto escuro gerado pela IA. A paleta dinâmica do post deve ser respeitada e normalizada para assegurar contraste WCAG > 15:1.
4. **Preservação de Escolhas Manuais:** Se o usuário selecionou uma cor manualmente (`manualHeadlineColor`, `manualSubtextColor`), essa escolha é preservada, exibindo apenas o selo visual de "contraste baixo", sem sobrescrever arbitrariamente a decisão do criador.
5. **Preservação de Cores da Marca nos Presets:** O helper `applyFamilyPreset` altera **apenas** tipografia e composição. Ele **nunca** deve sobrescrever as cores da marca (`background` e `accent`).

---

## 3. UI com Propósito (Sem Elementos Zumbis)

1. **Nenhum Controle Decorativo Vazio:** Botões, abas, menus de contexto ou sliders visíveis na interface DEVEM ter comportamento funcional implementado.
2. **Proibição de UI Inerte:** Se uma funcionalidade ainda não foi conectada, remova o elemento visual da tela até que o backend/estado correspondente esteja pronto.
3. **Questionamento Ativo:** Agentes e desenvolvedores devem questionar e eliminar proativamente nós de interface que não gerem valor real para o usuário.

---

## 4. Mobile-First Inegociável (Regra do Toque)

1. **Alvos de Toque:** Todo botão, ícone ou elemento clicável deve ter área mínima de toque de **44x44px**.
2. **Bottom Sheets (Vaul):** No mobile, utilize gavetas inferiores deslizantes (bottom sheets) em vez de modais flutuantes centralizados que bloqueiam a visão da prancheta.
3. **Isolamento de Gestos:** É estritamente proibido conflito entre o scroll da página e o arrasto (drag-and-drop) de elementos Konva no mobile. O canvas deve gerenciar seus ponteiros de toque sem disparar scroll acidental do navegador.

---

## 5. Integridade do Acesso a Dados & Backend

1. **PROIBIDO Drizzle em Runtime:** O backend do PostSpark opera em tempo de execução usando **exclusivamente o cliente Supabase oficial** (`@supabase/supabase-js`) instanciado em `server/db.ts`. O diretório `drizzle/` serve apenas como documentação e controle declarativo de migrações SQL.
2. **Validação de Fronteira com Zod:** Todos os procedimentos do tRPC (`server/routers.ts`) devem validar rigorosamente parâmetros de entrada (`input`) e saída (`output`) com esquemas Zod.
3. **Autenticação Segura via Cookie Bridge:** Sessões são transportadas pelo cookie HTTP-only `postspark-session`. Nunca armazene tokens de autenticação sensíveis em LocalStorage acessível por scripts terceiros.
4. **Controle de Acesso RBAC:** Endpoints de administração devem ser decorados com `adminProcedure`. Ações de usuário autenticado utilizam `protectedProcedure`.

---

## 6. Resiliência do Pipeline de IA & Orquestração

1. **Tarefas Persistidas e Duráveis:** Operações de IA que envolvam geração em lote ou revisão multimodal devem ser rastreadas com tarefas duráveis no PostgreSQL com estados explícitos (`pending`, `running`, `completed`, `failed`).
2. **Sem Temporizadores Falsos:** O feedback de geração (`ProductionOverlay`) deve se basear em tempo decorrido assintótico e eventos reais de progresso. É terminantemente proibido o uso de `setInterval` artificiais que cheguem a 96% e congelem.
3. **Fallback Automático de LLM:** Falhas transitórias de cota ou rede devem ser interceptadas pela cadeia de fallback em `server/_core/llm.ts`, mantendo a geração estável.
4. **Isolamento de Falhas Locais vs Externas:** Uma falha de Chromium headless ou medição tipográfica no servidor não pode ser classificada como falha de provedor externo e NUNCA deve debitar Sparks repetidamente do usuário.

---

## 7. Lições Aprendidas & Bugs a NUNCA Repetir

| Causa / Bug | Impacto Histórico | Como NUNCA Mais Repetir |
| :--- | :--- | :--- |
| **Drizzle `db.select()` em Runtime** | Erros críticos de execução no backend | Utilize sempre `supabase.from('...')` em `server/db.ts`. |
| **Texto Preto sobre Fundo Preto em `cinematic-depth`** | Variação central ilegível | Sempre invoque `applyContrastGuard` na ingestão e respeite `post.palette.background`. |
| **Vazamento de Estilo entre Slides de Carrossel** | Alteração em um slide alterava todo o carrossel | Overrides de lâminas devem ficar estritamente isolados em `slides[i].editorState`. |
| **`<select>` HTML Nativo para Fontes** | Todas as fontes exibidas com a fonte do sistema | Usar sempre o componente `FontPickerDropdown`, com preview direto estilizado e preload dinâmico de Google Fonts. |
| **Recompra Inadvertida de Sparks** | Cobrança indevida de créditos do cliente | Falhas de renderização local devem recuperar do journal sem acionar nova cobrança de LLM. |
| **Distorção no Resize de Texto** | Fonte encolhia sem controle durante resize | A largura do texto no Konva controla apenas o *word wrap*. O tamanho da fonte é alterado exclusivamente pelo slider numérico ou escala explícita. |

---

## 8. 🏁 DEFINITION OF DONE (Obrigatório)

Uma tarefa ou track SÓ é considerada finalizada quando:
1. O código foi gerado, aplicado e testado sem erros de compilação ou de tipo (`pnpm check` com exit code 0).
2. Os testes automatizados pertinentes foram executados e aprovados (`vitest run`).
3. O arquivo `plan.md` da track ativa em `.conductor/tracks/<track_id>/plan.md` foi atualizado (marcando os passos concluídos com `[x]`).
4. O arquivo `.conductor/tracks.md` foi atualizado com o status da track refletido.
5. Nenhuma dependência externa não-homologada foi adicionada ao `package.json`.

---

## 9. Manutenção da Verdade (Product & Tech Integrity)

- Os arquivos `.conductor/product.md` e `.conductor/tech-stack.md` refletem a realidade operacional do PostSpark 3.
- Se uma alteração de código modificar contratos de rotas, introduzir novos padrões arquiteturais ou alterar fluxos fundamentais de usuário, você DEVE propor a sincronização correspondente dos arquivos em `.conductor/` no mesmo commit.
