# Tech Stack: PostSpark

Este documento mapeia as tecnologias e padrões arquiteturais adotados no projeto para garantir consistência em futuras manutenções.

## 🏗️ Core Architecture
- **Framework:** React 19 (Vite) + Node.js (Express).
- **API:** [tRPC](https://trpc.io/) v11 para comunicação *end-to-end type-safe*.
- **Database:** PostgreSQL (via Supabase) com manipulação direta via SQL Triggers para lógica de inicialização de perfil.
- **ORM-ish:** tRPC Context + Supabase Admin SDK para operações de servidor com privilégios.

## 🔐 Auth & Security (RBAC)
- **Identity:** Supabase Auth (Google SSO + Email/Password).
- **Session:** Bridge de sessão via cookie HttpOnly (`postspark-session`).
- **Authorization:** Role-Based Access Control (RBAC). 
  - Roles: `user` (padrão), `admin`.
  - Sincronização via `app_metadata` no JWT para validação instantânea no tRPC.
  - Middlewares: `protectedProcedure` (usuário logado) e `adminProcedure` (excluxivo admin).

## 🚀 Key Libraries
- **Styling:** Vanilla CSS + Radix UI + Framer Motion (Glassmorphism & Glow System).
- **State Management:** [Zustand](https://github.com/pmndrs/zustand).
- **Billing:** Stripe (Checkout + Webhooks).
- **AI/ML:** Google Gemini API (Content Generation) + Pollinations/AWS S3 (Images).
- **Communication:** Nodemailer (via Hostinger SMTP).

## 🛠️ Infrastructure Patterns
- **Env Validation:** Zod schema para validação de variáveis de ambiente no servidor.
- **Service Models:** Injeção de dependência via contexto do tRPC para reutilização de clientes (Supabase, Stripe, Gemini).
