# Stack Tecnológica e Padrões (TECH_STACK)

## Contexto de Servidor Externo
* **Screenshot Service:** App independente em Playwright hospedado no Railway (`https://screenshot-service-production-2177.up.railway.app`).
* **Capacidades do Serviço:** Browser Pooling (reuso de instância Chromium) e Context Isolation.
* **Sanitização:** Scripts automáticos para remoção de banners de cookies, GDPR e widgets de chat antes da captura.

## Backend Central
* **Linguagem:** TypeScript (Node.js v20+).
* **Framework:** Express customizado + tRPC API para comunicação tipada.
* **Banco de Dados:** PostgreSQL com migrações geridas via Drizzle ORM.
* **Inteligência Artificial (LLMs):** * **Principal:** Gemini-2.5 via API oficial.
    * **Fallback Nativo:** Groq API (`llama-3.3-70b-versatile`).
    * **Regra de Fallback:** Converter `json_schema` para `json_object` e realizar stripping de conteúdo multimodal on-the-fly (`server/_core/llm.ts`).
* **Storage e Pagamentos:** Integração Manus OAuth / Amazon S3 Uploads e Webhooks do Stripe.

## Frontend
* **Core:** React 18+ com Vite.
* **Estilização:** TailwindCSS v4 (Prioritário).
* **Motion & Interação:** Framer Motion predominante.
* **Manejo de Estado Remoto:** `react-query` gerido pelo tRPC provider.

## UX e Mobile (Obrigatório)
* **Mobile-First:** Uso de Toolbar Fixa Inferior e Sheet modais (`MobileEditSheet.tsx`).
* **Acessibilidade:** Alvos mínimos de toque de `44px` e `touch-action: none` em controles de precisão.

## Testes e Qualidade
* **Comando para rodar testes:** `pnpm test` (executa `vitest run`).
* **Framework:** Vitest.
* **Padrões de UI:** Evite bibliotecas complexas ou "shadcn-like" redundantes. Prefira nativo Tailwind 4 e funções puras.

## Padrões de Código
* **Commits:** Usar Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`).
* **Idioma do código:** Inglês (funções, variáveis, schemas).
* **Idioma da documentação:** Português (para contexto rápido, specs e logs).