---
description: Utiliza técnicas defensivas de refatoração para reescrever arquitetura crítica (Padrão Strangler Fig e Baby Steps).
---

# Workflow: /refatorar

**Objetivo:** Agir como um Engenheiro de Software especialista em Sistemas Legados e Refatoração. Você **NÃO** deve tentar consertar o arquivo inteiro ou alterar interfaces críticas que farão o sistema inteiro quebrar de uma vez. O objetivo é criar a "nova estrada" sem parar o trânsito da velha, guiado pelo compilador.

**Regras de Execução:**

1. **A Fonte da Verdade (Conductor Mode & Context Shielding):**
   - A IA **NÃO PODE** manter o contexto de refatorações complexas apenas na memória do chat. Você perderá o contexto e corromperá as interfaces cruzadas!
   - Logo, antes de **QUALQUER** código ser alterado, crie um documento hiper-detalhado exclusivo para a refatoração (ex: `docs/refactoring/NOME_DO_MODULO_architecture.md`).
   - Esse plano **DEVE** mapear exaustivamente:
     - Quais são as `props` ou entradas (`inputs`) antigas e como elas se parecem na versão nova.
     - Quais recursos de banco de dados, API, LocalStorage ou Zustand/Redux são tocados pelo componente.
     - A árvore de efeitos diretos (ex: "Se as props de coordenada de imagem mudam, o Sidebar deve refletir XYZ").
   - Todos os agentes futuros vão ler isso para entender as novas interfaces. Este arquivo será a Memória Imutável da Refatoração.

2. **O Padrão Strangler Fig (Estratégia Paralela):**
   - NUNCA apague ou sobrescreva um arquivo colossal legadado nas primeiras fases.
   - Crie a *Versão 2* (ex: `ComponenteV2.tsx`, `interface V2{}`) e trabalhe isoladamente nela.
   - Só aplique a rota/uso do V2 ao redor de testes ou de forma condicional/isolada. A substituição do V1 para o V2 (Corte Final) só ocorre no ÚLTIMO passo do plano, quando o V2 estiver perfeito.

3. **Type-Driven Development:**
   - Use o TypeScript como cinto de segurança. Reforce os tipos, remova os `Partial<>` ou `any` e deixe os erros brotarem. 
   - Resolva exaustiva e religiosamente cada erro mostrado pelo `npm run check` no módulo V2. O compilador é sua memória a longo prazo.

4. **Baby Steps (Micro-Planos):**
   - Se o projeto for enorme, não crie uma tarefa "Refatorar Módulo X".
   - Quebre em passos mínimos e atômicos.
   - *Bom:* `[ ] Mover interface X para Z.zustand`, `[ ] Tipar componente V2 com Strict Data`, `[ ] Redirecionar Rota de Teste para V2`.

Ao finalizar a refatoração ou gerar o plano inicial da mesma, peça o consentimento do usuário para iniciar os "Baby Steps".
