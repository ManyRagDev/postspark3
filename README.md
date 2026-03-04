# PostSpark 3

Esse é o repositório principal do PostSpark. O projeto foi projetado para capturar contexto de URLs ou entradas de texto e transformá-los magicamente em posts prontos para redes sociais por meio de Inteligência Artificial, oferecendo uma experiência de edição avançada (Workbench) para ajustes visuais finos.

## Tecnologias Principais (Stack)

* **Visão Geral:** Aplicação React (Vite) no Frontend e Node.js (Express) no Backend, tipada fortemente com tRPC.
* **Frontend:** React, TailwindCSS v4, Framer Motion (animações fluidas).
* **Backend:** Express, tRPC, Drizzle ORM (PostgreSQL).
* **Serviços Acoplados:**
  * Microsserviço Playwright (deploy no Railway) para capturas de tela desktop e mobile (`SCREENSHOT_SERVICE_URL`).
  * Processamento LLM com Gemini e fallback de robustez usando Llama via Groq API.
  * Integração com Stripe para webhook de pagamentos e Manus OAuth.

## Como rodar o ambiente local

1. Clone o repositório e rode `pnpm install` (usamos pnpm como gerenciador de pacotes).
2. Configure as variáveis de ambiente baseando-se no `.env.example` (necessária configuração do Supabase/PG, Gemini API Key e Screenshot Service URL).
3. Rode `pnpm dev` para iniciar tanto o frontend quanto o backend em modo de desenvolvimento.
4. Para testes, rode `pnpm test` (usando Vitest).

## Documentação do Projeto

O projeto segue a metodologia Conductor, mantendo a documentação alinhada e atualizada com o estado do código:

* [CONTEXT.md](./docs/CONTEXT.md) - O "Cérebro" do projeto (regras de design, decisões).
* [PROJECT_MAP.md](./docs/PROJECT_MAP.md) - Mapa estrutural das pastas e componentes.
* [TECH_STACK.md](./docs/TECH_STACK.md) - Aprofundamento das escolhas técnicas e versões.
* [PROGRESS.md](./docs/PROGRESS.md) - Estado atual de desenvolvimento e log de tarefas concluídas.
