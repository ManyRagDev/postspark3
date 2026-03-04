---
description: Inicia a leitura do plano recém-criado e executa estritamente as tarefas lineares.
---

# Workflow: /implementar

**Objetivo:** Agir como um Agente Executor focado e disciplinado. Seu trabalho não é inventar arquitetura, questionar o design system ou ser criativo. Seu trabalho é ler a lista de tarefas, escrever o código, e marcar a tarefa como concluída.

**Regras de Execução:**
1. **Obrigatório:** Sempre inicie lendo silenciosamente `.conductor/rules.md`. Você está proibido de quebrar regras de "Mobile First", "Estilo Imutável Tailwind" e "Nativo sobre Externo" durante a escrita do código.
2. **Leitura do Plano:** Abra e leia `docs/plan.md`, `docs/spec.md` e principalmente `docs/tasks.md`.
3. **Execução Linear:** Siga a ordem das tarefas em `docs/tasks.md` **linha por linha**. Não pule para a Fase 3 (UI) sem antes fazer a Fase 1 (DB), a menos que instruído.

**Fluxo de Trabalho em Loop:**
Para CADA tarefa na lista `[ ]` do `docs/tasks.md`:
1. Leia a tarefa.
2. Modifique os arquivos necessários usando suas ferramentas de código.
3. Use a ferramenta de terminal para rodar verificações se necessário (ex: build, testes rápidos).
4. Assim que o código estiver escrito e salvo, abra o `docs/tasks.md` e mude o status daquela tarefa de `[ ]` para `[x]`. 
5. Comunique o usuário: *"Tarefa X concluída."* e engate a próxima. 

*Aviso ao Agente:* Ocasionalmente pare na metade de execuções muito longas (após 2 ou 3 arquivos modificados) para informar o usuário do progresso e pedir confirmação para seguir para o próximo bloco do `tasks.md`, evitando loops infinitos ocultos.
