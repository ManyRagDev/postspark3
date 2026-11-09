# Tech Stack: PostSpark 3

Documento canônico das tecnologias, bibliotecas homologadas e padrões arquiteturais adotados no PostSpark 3. Nenhuma dependência externa deve ser adicionada sem autorização expressa.

---

## 1. Frontend Architecture

| Camada | Tecnologia | Versão | Papel / Descrição |
| :--- | :--- | :--- | :--- |
| **Framework** | React | `^19.2.1` | Interface declarativa em Strict Mode |
| **Bundler & Dev Server** | Vite | `^7.1.7` | Build rápido e HMR com `@vitejs/plugin-react` |
| **Roteamento** | Wouter | `^3.3.5` (patcheada) | Roteador SPA leve com patch em `patches/wouter@3.7.1.patch` |
| **Motor Gráfico 2D** | Konva / React-Konva | `^10.3.2` / `^19.2.5` | Motor gráfico vetorial da prancheta do CanvasLab (`CanvasPostStage`) |
| **Gerenciamento de Estado** | Zustand | `^5.0.11` | Estado autoritativo do editor (`editorStore.ts`) e cache de UI |
| **Comunicação / RPC** | tRPC Client & React Query | `^11.6.0` / `^5.90.2` | Tipagem ponta a ponta e cache inteligente de consultas |
| **Estilização** | Tailwind CSS v4 | `^4.1.14` | Estilos utilitários nativos via `@tailwindcss/vite` |
| **Design System / UI** | Radix UI | `^1.1.x` - `^2.2.x` | Primitivos acessíveis de interface (`@radix-ui/react-*`) |
| **Animações Físicas** | Framer Motion & GSAP | `^12.23.22` / `^3.14.2` | Micro-interações, gavetas e palco cilíndrico (`/stage-3d`) |
| **Notificações (Toasts)** | Sonner | `^2.0.7` | Feedback visual não-intrusivo de ações |
| **Gavetas Mobile** | Vaul | `^1.1.2` | Bottom sheets táteis ergonômicos no mobile |
| **Exportação & Arquivos** | JSZip | `^3.10.1` | Compactação cliente de carrosséis em ZIP com PNGs 4K |
| **Ícones** | Lucide React | `^0.453.0` | Conjunto consistente de ícones vetoriais |

---

## 2. Backend Architecture

| Camada | Tecnologia | Versão | Papel / Descrição |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | `>=22` (ESM nativo) | Ambiente de execução do servidor |
| **Framework HTTP** | Express | `^4.21.2` | Servidor base e middleware pipeline |
| **API Layer** | tRPC Server | `^11.6.0` | Routers de procedimentos tipados com Zod schemas |
| **Orquestração de IA** | LangChain LangGraph | `1.0.0` | Grafos de geração e pipelines estruturados de criação |
| **Modelos de IA (LLM)** | Google Gemini SDK | `^1.41.0` (`@google/genai`) | Geração de copy, arquétipos e síntese de briefings |
| **Modelos Multimodais / Visão** | Anthropic Claude / OpenRouter | via `server/_core/llm.ts` | Revisão visual e reparo estético com fallback automático |
| **Renderização Headless** | Playwright Core | `1.64.0` | Renderizador headless para inspeção e revisão visual das propostas |
| **Canvas no Backend** | `@napi-rs/canvas` | `^1.0.5` | Operações gráficas de pré-render e medição de caixas de texto |
| **Medição Tipográfica** | Fontkit | `^2.0.4` | Cálculo preciso de kerning, baseline e quebra de linhas idêntico ao Konva |
| **OCR** | Tesseract.js | `^7.0.0` | Extração de textos em uploads de templates e referências visuais |
| **Billing & Pagamentos** | Stripe SDK | `^20.3.1` | Gestão de assinaturas, planos Pro/Agency e recarga de Sparks |

---

## 3. Banco de Dados, Persistência e Autenticação

| Componente | Implementação | Regra Arquitetural Obrigatória |
| :--- | :--- | :--- |
| **Banco de Dados** | PostgreSQL via Supabase | Hospedado na nuvem Supabase |
| **Acesso em Runtime** | `@supabase/supabase-js` (`server/db.ts`) | **PROIBIDO o uso de Drizzle em runtime**. O acesso em produção e desenvolvimento é estritamente via Supabase Client. |
| **Schema Declarativo** | `drizzle/` + `drizzle.config.ts` | Histórico declarativo de migrações e documentação de tabelas. |
| **Autenticação** | Supabase Auth | Google SSO e Email/Senha gerenciados pelo Supabase Auth. |
| **Ponte de Sessão (Cookie)** | Cookie HTTP-Only `postspark-session` | Sincronização segura da sessão entre React e Express via cookies com assinatura. |
| **Autorização (RBAC)** | Roles `user` e `admin` | Middlewares `protectedProcedure` (logado) e `adminProcedure` (restrito ao admin). |

---

## 4. Padrões de Infraestrutura e Build

- **Build Serverless / Produção:** `vite build` para o cliente e `esbuild server/_core/index.ts --platform=node --bundle --outfile=api/index.js`.
- **Worker de Geração Durável:** Execução de geração com tarefas persistidas no Postgres (`server/ai/workflows/generationWorker.ts`).
- **Validação com Zod:** Todos os inputs e outputs de endpoints tRPC são estritamente validados por esquemas Zod antes do consumo.
- **Ambiente & Variáveis:** Tipagem estrita e validação com Zod de todas as chaves (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `GEMINI_API_KEY`, etc.).

---

## 5. Regras para Novas Dependências

1. **Prioridade Nativa:** Sempre verificar se a funcionalidade pode ser implementada com Tailwind CSS, utilitários nativos do React 19 ou APIs nativas do navegador antes de instalar um novo pacote.
2. **Autorização Expressa:** NENHUM pacote npm pode ser adicionado ao `package.json` sem aprovação prévia do usuário.
3. **Compatibilidade ESM:** Pacotes devem suportar ESM nativo sem conflitos com Vite ou esbuild.
