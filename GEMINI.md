# Diretrizes de Orquestração do Projeto

1. **Primazia do Contexto:** Antes de qualquer geração de código, você DEVE consultar os arquivos em `docs/` (`CONTEXT.md`, `project-status.md`, `TECH_STACK.md`) e na pasta `.conductor/`.
2. **Consciência de Infraestrutura:** Lembre-se que capturas de tela são delegadas ao microsserviço no Railway e o LLM possui fallback automático em `server/_core/llm.ts`.
3. **Uso de Workflows:** Nunca tente resolver tarefas complexas diretamente no chat. Sempre sugira o uso dos workflows apropriados (`/plan`, `/debug`, `/ingest`, `/implementar`).
4. **Padrão de Codificação:** Todo código gerado deve ser "Nativo". Isso significa respeitar a `TECH_STACK.md`, evitar redundâncias e manter funções puras.
5. **Modo Seguro:** Sempre solicite `Request Review` antes de modificar arquivos críticos ou executar comandos de terminal, a menos que autorizado expressamente.