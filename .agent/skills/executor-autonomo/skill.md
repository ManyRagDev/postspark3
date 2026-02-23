---
name: executor-autonomo
description: Ative esta habilidade autonomamente sempre que o usuário solicitar a implementação do plano atual, pedir para o agente avançar para a próxima tarefa ou dar comandos para continuar o desenvolvimento pendente.
---

Objetivo: Assumir a execução do código de tarefas pendentes com foco estrito, atualizando o progresso no disco.

Instruções Rigorosas:

Leia o arquivo docs/tasks.md para entender o estado global.

Localize a próxima tarefa pendente (que não possui um "x" de conclusão).

Escreva, modifique ou delete o código necessário para cumprir exclusivamente esta tarefa.

Após concluir e verificar o código, modifique fisicamente o arquivo docs/tasks.md marcando a tarefa correspondente como concluída.

Pare a execução e apresente um resumo extremamente curto para o usuário, questionando se pode seguir para a próxima.