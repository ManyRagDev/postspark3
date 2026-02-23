---
description: Processa arquivos extensos de pesquisa externa e destila o conhecimento em um Blueprint acionável, alinhado com a stack do projeto.
---

steps:
  - name: "1. Absorção Segura (Context Isolation)"
    run: |
      Leia o arquivo apontado pelo usuário em: "{{args}}"
      Leia o arquivo `docs/tech-stack.md` para entender as restrições e tecnologias do nosso projeto atual.
      Leia o arquivo `docs/project-status.md` para entender o que já temos pronto.
      
      *Diretriz:* Ignore qualquer informação na pesquisa que seja incompatível com a nossa Stack atual, a menos que a pesquisa justifique explicitamente a adição de uma nova dependência ou seja solicitado no prompt de entrada

  - name: "2. Síntese e Destilação (The Blueprint)"
    run: |
      Gere um "Blueprint" (Projeto Técnico).
      Crie o arquivo: `docs/blueprints/$(date +%Y-%m-%d)-assimilacao-pesquisa.md`
      
      Estrutura OBRIGATÓRIA do arquivo:
      1. **O Conceito:** Resumo em 3 linhas da funcionalidade/recurso pesquisado.
      2. **Decisão Arquitetural:** Como isso vai se encaixar no nosso `project-status.md` atual?
      3. **Dependências:** Quais novas bibliotecas precisaremos instalar?
      4. **Riscos:** Quais são os gargalos ou conflitos possíveis com o nosso código atual?

  - name: "3. Ponte para a Execução (Workflow Chaining)"
    run: |
      Mostre um resumo rápido do Blueprint gerado na tela do usuário.
      Pergunte: "A pesquisa foi destilada e salva na pasta `docs/blueprints/`. Deseja que eu acione o workflow `/plan` usando este novo conhecimento como base?"