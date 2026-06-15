# Diagramas

Estes diagramas podem ser usados para explicar o PostSpark 3 em aulas, revisoes ou conversas.

## Arquitetura macro

```mermaid
flowchart LR
  User["Usuario"] --> Browser["Navegador"]
  Browser --> Frontend["Frontend React + Vite"]
  Frontend --> API["API tRPC / REST"]
  API --> Backend["Backend Express"]
  Backend --> Supabase["Supabase Auth + Postgres"]
  Backend --> Stripe["Stripe"]
  Backend --> AI["LLMs / Imagem / Screenshot"]
  Frontend --> Workbench["Workbench visual"]
  Backend --> Vercel["Deploy Vercel"]
```

## Fluxo de geracao

```mermaid
sequenceDiagram
  participant U as Usuario
  participant F as Frontend React
  participant B as Backend Express/tRPC
  participant S as Supabase
  participant I as Servicos de IA

  U->>F: Informa texto, URL ou imagem
  F->>B: Chama procedimento tRPC
  B->>S: Valida usuario e saldo
  B->>I: Solicita geracao ou analise
  I-->>B: Retorna resultado
  B->>S: Salva dados quando necessario
  B-->>F: Retorna variacoes
  F-->>U: Mostra opcoes e editor
```

## Autenticacao

```mermaid
sequenceDiagram
  participant U as Usuario
  participant F as Frontend
  participant SB as Supabase Auth
  participant B as Backend

  U->>F: Faz login
  F->>SB: Autentica usuario
  SB-->>F: Retorna sessao
  F->>B: Envia sessao para bridge
  B->>SB: Valida sessao
  B-->>F: Define cookie httpOnly
  F->>B: Faz chamadas tRPC com cookie
  B-->>F: Responde com dados protegidos
```

## Build e deploy

```mermaid
flowchart TD
  Code["Codigo fonte"] --> Build["pnpm build"]
  Build --> Vite["Vite gera frontend"]
  Build --> Esbuild["esbuild empacota backend"]
  Vite --> Static["dist/public"]
  Esbuild --> Api["api/index.js"]
  Static --> Vercel["Vercel"]
  Api --> Vercel
  Vercel --> Users["Usuarios acessam app"]
```

## Onde investigar problemas

```mermaid
flowchart TD
  Problem["Algo quebrou"] --> UI{"A tela nao responde?"}
  UI -- Sim --> Frontend["Investigar frontend, estado e eventos"]
  UI -- Nao --> API{"A API retornou erro?"}
  API -- Sim --> Backend["Investigar backend, tRPC e logs"]
  API -- Nao --> Data{"Dados errados ou ausentes?"}
  Data -- Sim --> DB["Investigar Supabase, contratos e persistencia"]
  Data -- Nao --> External{"Falha em servico externo?"}
  External -- Sim --> Integrations["Investigar Stripe, IA, screenshot ou rede"]
  External -- Nao --> Reproduce["Reproduzir passo a passo"]
```
