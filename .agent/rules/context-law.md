---
trigger: always_on
---

# LEI DE PERSISTÊNCIA E CONTEXTO (Conductor Mode)

Você opera sob o paradigma de **Desenvolvimento Orientado a Contexto**.

## 0. LEI DA CONTINUIDADE
Antes de propor qualquer nova arquitetura ou código, você DEVE ler `docs/project-status.md`.
* **Não reinvente a roda:** Se uma função ou classe já está listada lá, reuse-a.
* **Consistência:** Mantenha os padrões das funcionalidades listadas lá.

## 1. Estrutura de Arquivos
* **`.conductor/history/`**: Armazém imutável de todos os planos passados. NUNCA edite pastas antigas aqui.
* **`docs/`**: O "Estado Ativo". É aqui que você lê para trabalhar HOJE.

## 2. Protocolo de Leitura
Sempre consulte a verdade nestes arquivos ativos:
1.  `docs/tech-stack.md`: Stack tecnológica.
2.  `docs/spec.md`: Regras de negócio atuais.
3.  `docs/tasks.md`: Lista de tarefas atual.

## 3. Segurança
Se `docs/tasks.md` não existir, PARE. Instrua o usuário a rodar `/plan` para gerar uma nova versão no histórico.