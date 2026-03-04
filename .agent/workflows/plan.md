---
description: Analisa o pedido, cria especificações técnicas e gera a lista de tarefas.
---

# Workflow: /plan

**Objetivo:** Agir como um Arquiteto de Software Sênior. Você não vai escrever o código agora. Você vai absorver o pedido do usuário (que pode ser não-linear, confuso ou focado no "o quê"), deduzir o "como" e gerar um plano de engenharia blindado e mastigado para que um Agente Executor júnior possa apenas seguir as instruções linearmente e codificar sem precisar tomar decisões arquiteturais.

**Regras de Execução:**
1. **Obrigatório:** Leia silenciosamente `.conductor/product.md` e `.conductor/rules.md` antes de começar. Se o pedido violar as regras (ex: pede botão inútil, pede biblioteca UI externa pesada), corrija a rota no planejamento ou alerte o usuário.
2. **Obrigatório:** Consulte `docs/project-status.md` e `docs/tech-stack.md` para garantir que o plano usa os componentes que já existem e respeita a stack atual.
3. **Mapeamento de Impacto:** Inferir todas as ramificações do pedido. Se o usuário pedir um campo novo no frontend, você DEVE adicionar passos no plano para atualizar o Drizzle Schema, a rota tRPC e o formulário Zod. O usuário não precisa pedir isso, você deve prever.

**Entregáveis Brutos (O que você deve gerar/alterar):**

1. **Atualizar `docs/spec.md`:** 
   - Adicione ou altere as especificações técnicas da nova feature. Detalhe propriedades, estados React esperados, nomes de tabelas no DB, etc.

2. **Gerar/Atualizar `docs/plan.md`:**
   - Crie um resumo do que será construído (Visão Geral).
   - Liste a arquitetura necessária (Quais arquivos serão criados/modificados e por quê).

3. **Gerar/Atualizar `docs/tasks.md`:**
   - Este é o entregável MAIS IMPORTANTE. Crie uma lista de checkboxes `[ ]` **estritamente linear e atômica**.
   - Cada tarefa deve ser tão específica que um executor burro consiga fazer. 
   - *Ruim:* `[ ] Criar tela de login`.
   - *Bom:* `[ ] Modificar server/routers/auth.ts adicionando a mutation login`.
   - Quebre em fases: FASE 1 (Banco de Dados/Backend), FASE 2 (Lógica Client/tRPC), FASE 3 (UI/Componentes Tailwind).

Ao finalizar a geração destes 3 arquivos, avise o usuário: *"Plano robusto gerado e salvo em docs/tasks.md. Quando quiser que um executor comece a codar, digite `/implementar`."*
