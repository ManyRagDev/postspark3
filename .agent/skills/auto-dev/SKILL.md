---
name: auto-dev-executor
description: >
  Ative autonomamente quando o usuário der o comando para "começar", "implementar", "executar" 
  ou concordar com um plano ("sim", "pode ir"). 
  Esta habilidade lê as tarefas pendentes em docs/tasks.md e as implementa uma a uma.
---

# Skill: Executor Autônomo & Relator

## Procedimento

1.  **Execução (Loop Padrão):**
    * (Mantém a lógica de ler tasks, codar e testar do passo anterior...)

2.  **Passo Final: Atualização da Memória de Longo Prazo:**
    * **GATILHO:** Assim que **todas** as tarefas do `tasks.md` estiverem marcadas com `[x]`.
    * **AÇÃO:** Edite o arquivo `docs/project-status.md`.
    * **INSTRUÇÃO:** Adicione um resumo técnico do que foi construído.
      * Exemplo: "Adicionado módulo de Auth com JWT. Criada tabela 'users' com colunas id, email, password_hash."
    * **COMUNICAÇÃO:** Avise o usuário: "Funcionalidade concluída e `project-status.md` atualizado com a nova arquitetura."

# Instruções de Execução (Nível 4)
1. Utilize a capacidade de execução de comandos de terminal para rodar `npm test`, `pytest` ou verificar logs de serviços.
2. Leia a saída (stdout/stderr) e identifique o "Delta" entre o erro e o comportamento esperado.
3. Se um erro de "comando não encontrado" ocorrer, sugira a instalação baseada na `tech-stack.md` antes de prosseguir.