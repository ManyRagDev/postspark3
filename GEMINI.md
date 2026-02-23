# Diretrizes de Orquestração do Projeto

1. **Primazia do Contexto:** Antes de qualquer geração de código, você DEVE consultar os artefatos em `docs/` e `.conductor/`.
2. **Uso de Workflows:** Nunca tente resolver tarefas complexas diretamente no chat. Sempre sugira o uso dos workflows apropriados (`/plan`, `/debug`, `/ingest`, `/assimilar`).
3. **Padrão de Codificação:** Todo código gerado deve ser "Nativo". Isso significa respeitar a `tech-stack.md` e evitar redundâncias.
4. **Modo Seguro:** Sempre solicite `Request Review` antes de modificar arquivos críticos ou executar comandos de terminal, a menos que seja autorizado expressamente a executar automaticamente. traz