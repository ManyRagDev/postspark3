# DOCUMENTO_MESTRE

## 1. Objetivo do documento

Este documento é a fonte central de contexto funcional e técnico do repositório. Ele existe para apoiar manutenção, análise, correção, refatoração e evolução do projeto por humanos e agentes, com base no **estado real do código**.

Sempre que possível, este documento diferencia:

- **Fato observado no código**;
- **Inferência razoável a partir do código**;
- **Hipótese, lacuna ou ponto a validar**.

## 2. Visão geral da arquitetura

### Visão macro do sistema

Fato observado:

- O projeto é uma aplicação full stack em TypeScript.
- O frontend roda em React 19 + Vite dentro de [`client/`](./client).
- O backend roda em Express + tRPC dentro de [`server/`](./server).
- O deploy empacota o servidor em [`api/index.js`](./api/index.js) e os assets do frontend em `dist/public`.
- A comunicação frontend/backend ocorre principalmente por tRPC em `/api/trpc`, com alguns endpoints REST complementares.

### Camadas principais

1. **UI e experiência do usuário**
   - React, Wouter, React Query, Zustand, Framer Motion, Tailwind.
2. **Orquestração de aplicação**
   - páginas e componentes que conduzem o fluxo `TheVoid -> HoloDeck -> Workbench`.
3. **API e regras de negócio**
   - Express + tRPC em `server/_core/index.ts` e `server/routers.ts`.
4. **Integrações externas**
   - Supabase, Stripe, Gemini/Forge/Groq, Pollinations, serviço de screenshot.
5. **Persistência**
   - Supabase/Postgres acessado diretamente por `@supabase/supabase-js` no backend.
6. **Modelagem compartilhada**
   - tipos e contratos centrais em `shared/postspark.ts`, `shared/const.ts`, `shared/types.ts`.

### Fluxo macro entre componentes

Fato observado:

1. O usuário acessa a landing pública e/ou autentica via Supabase.
2. O frontend sincroniza o token Supabase com um cookie httpOnly do backend.
3. O backend valida esse cookie por request e injeta `ctx.user` no tRPC.
4. O usuário envia insumo para geração de posts.
5. O backend pode:
   - debitar `Sparks`;
   - chamar LLM;
   - capturar screenshot de site;
   - extrair Brand DNA;
   - gerar imagem;
   - salvar post ou background asset.
6. O frontend recebe variações, mostra seleção visual e abre o editor avançado.
7. O resultado pode ser salvo em banco e reaberto depois.

## 3. Estrutura do projeto

### Raiz

- [`package.json`](./package.json): scripts de dev/build/test e dependências principais.
- [`vite.config.ts`](./vite.config.ts): define `client/` como raiz do frontend e aliases compartilhados.
- [`vercel.json`](./vercel.json): configura build estático do frontend e função Node para `api/index.js`.
- [`drizzle.config.ts`](./drizzle.config.ts): configuração de schema/migrações Drizzle.
- [`README.md`](./README.md): visão geral útil, mas parcialmente desatualizada frente ao código atual.

### Frontend

- [`client/src/main.tsx`](./client/src/main.tsx): bootstrap React, QueryClient e cliente tRPC.
- [`client/src/App.tsx`](./client/src/App.tsx): roteamento principal, rotas protegidas e callback OAuth.
- [`client/src/pages/`](./client/src/pages): páginas de alto nível (`Home`, `Pricing`, `Billing`, `SavedPosts`, `NotFound`).
- [`client/src/components/views/`](./client/src/components/views): estágios principais de produto e editor.
- [`client/src/components/ui/`](./client/src/components/ui): biblioteca de componentes reutilizáveis.
- [`client/src/store/`](./client/src/store): estado global do editor com Zustand.
- [`client/src/lib/`](./client/src/lib): cliente Supabase, bridge de auth, cliente tRPC e utilitários.
- [`client/public/`](./client/public): assets públicos, incluindo backgrounds curados e `debug-collector.js`.

### Backend

- [`server/_core/index.ts`](./server/_core/index.ts): bootstrap Express, middleware tRPC, auth bridge, webhook Stripe e endpoints REST.
- [`server/routers.ts`](./server/routers.ts): router tRPC principal; hoje concentra grande parte das regras de negócio.
- [`server/_core/`](./server/_core): infraestrutura transversal, autenticação, contexto, cookies, LLM, image generation, notification, vite adapter.
- [`server/db.ts`](./server/db.ts): acesso a dados em runtime via Supabase service role.
- [`server/billing.ts`](./server/billing.ts): billing, Stripe Checkout, top-ups, perfis e webhook handling.
- serviços especializados na raiz de [`server/`](./server): screenshot, Brand DNA, style extraction, design analysis, image generation, avaliação de qualidade e afins.

### Compartilhado e dados

- [`shared/postspark.ts`](./shared/postspark.ts): principal contrato de domínio compartilhado.
- [`shared/const.ts`](./shared/const.ts): constantes de cookie, auth e mensagens padronizadas.
- [`drizzle/schema.ts`](./drizzle/schema.ts): schema declarativo das tabelas `users`, `posts` e `background_assets`.
- [`drizzle/*.sql`](./drizzle): migrações versionadas.

### Artefatos auxiliares

- [`api/index.js`](./api/index.js): artefato gerado para execução/deploy do backend.
- [`dist/`](./dist) e [`dist-server/`](./dist-server): artefatos de build.
- [`docs/`](./docs): documentação de apoio. Útil para histórico, mas não confiável como fonte única.
- [`tours/`](./tours): automação/geração de tours visuais; não parece participar do runtime principal do produto.

## 4. Pontos de entrada

### Frontend

- [`client/src/main.tsx`](./client/src/main.tsx): monta o app, inicializa React Query e cliente tRPC.
- [`client/src/App.tsx`](./client/src/App.tsx): define rotas:
  - `/` -> landing pública / redirecionamento;
  - `/thevoid` -> fluxo principal autenticado;
  - `/pricing`;
  - `/billing`;
  - `/saved-posts`;
  - `/billing/success`;
  - `/billing/topup-success`;
  - `/auth/google-callback`.

### Backend

- [`server/_core/index.ts`](./server/_core/index.ts): inicializa Express e registra:
  - `POST /api/stripe/webhook`;
  - `POST /api/extract`;
  - `POST /api/brand-dna`;
  - `POST /api/auth/supabase-session`;
  - `POST /api/auth/supabase-logout`;
  - `tRPC` em `/api/trpc` e `/trpc`.

### Build e execução

- `pnpm dev`: executa `tsx watch server/_core/index.ts`.
- `pnpm build`: compila frontend com Vite e empacota backend com esbuild para `api/index.js`.
- `pnpm start`: executa `node api/index.js`.
- `pnpm test`: roda Vitest.

### Bootstrap e inicialização

Fato observado:

- Em desenvolvimento, o backend também acopla Vite middleware via `setupVite`.
- Fora da Vercel, o servidor HTTP escolhe uma porta disponível a partir de `PORT` ou `3000`.
- Em produção Vercel, o código evita `listen()` explícito.

## 5. Mapa dos módulos / domínios / componentes

### 5.1 Fluxo principal do produto

**Responsabilidade principal**

Conduzir o usuário do insumo inicial até a geração, seleção e edição do post.

**Arquivos centrais**

- [`client/src/pages/Home.tsx`](./client/src/pages/Home.tsx)
- [`client/src/components/views/TheVoid.tsx`](./client/src/components/views/TheVoid.tsx)
- [`client/src/components/views/HoloDeck.tsx`](./client/src/components/views/HoloDeck.tsx)
- [`client/src/components/views/ExecutionBrief.tsx`](./client/src/components/views/ExecutionBrief.tsx)
- [`client/src/components/views/WorkbenchV2/WorkbenchV2.tsx`](./client/src/components/views/WorkbenchV2/WorkbenchV2.tsx)

**Entradas**

- texto, URL ou imagem;
- modo de criação (`ideation` ou `execution`);
- modo de post (`static` ou `carousel`);
- modelo selecionado (`gemini` ou `llama`, embora o backend atual privilegie Gemini/Forge).

**Saídas**

- variações de post em memória;
- brief estruturado de execução;
- post editado salvo via tRPC;
- background assets salvos.

**Dependências internas**

- store do editor;
- hook de extração de estilos;
- cliente tRPC;
- tipos de `shared/postspark.ts`.

**Dependências externas**

- LLM;
- Pollinations;
- Supabase;
- backend Express/tRPC.

**Dados consumidos**

- `PostVariation`, `CreativeExecutionBrief`, `TemporaryTheme`.

**Dados produzidos**

- mutações `post.generate`, `post.generateBackground`, `post.save`.

**Integrações envolvidas**

- extração de Brand DNA para URLs;
- cobrança de Sparks antes de operações caras.

**Riscos e observações**

- O fluxo de UI depende de estado local + Zustand; regressões podem quebrar transições entre etapas.
- `Home.tsx` concentra muita coordenação de estado.

### 5.2 Autenticação e sessão

**Responsabilidade principal**

Autenticar via Supabase no frontend e converter a sessão em cookie httpOnly para o backend.

**Arquivos centrais**

- [`client/src/lib/supabaseClient.ts`](./client/src/lib/supabaseClient.ts)
- [`client/src/lib/authBridge.ts`](./client/src/lib/authBridge.ts)
- [`client/src/_core/hooks/useAuth.ts`](./client/src/_core/hooks/useAuth.ts)
- [`client/src/components/views/TheVoid2.tsx`](./client/src/components/views/TheVoid2.tsx)
- [`client/src/components/LoginModal.tsx`](./client/src/components/LoginModal.tsx)
- [`server/_core/supabaseAuth.ts`](./server/_core/supabaseAuth.ts)
- [`server/_core/sdk.ts`](./server/_core/sdk.ts)
- [`server/_core/context.ts`](./server/_core/context.ts)
- [`server/_core/cookies.ts`](./server/_core/cookies.ts)

**Entradas**

- email/senha;
- OAuth Google;
- token Supabase do frontend;
- cookie `app_session_id`.

**Saídas**

- cookie bridge de sessão;
- `ctx.user` no backend;
- estado autenticado no frontend.

**Dependências internas**

- `auth.me` e `auth.logout` via tRPC.

**Dependências externas**

- Supabase Auth.

**Dados consumidos**

- access token do Supabase;
- metadata do usuário no Supabase.

**Dados produzidos**

- cookie httpOnly;
- objeto `AuthenticatedUser`.

**Integrações envolvidas**

- Supabase `auth.getUser`, `signInWithPassword`, `signUp`, `signInWithOAuth`, `signOut`.

**Riscos e observações**

- Há dois estados de sessão para manter coerentes: cliente Supabase e cookie bridge do backend.
- Em `development`, `BYPASS_AUTH=true` injeta usuário fixo admin. Isso altera comportamento de segurança e deve ser tratado como modo especial, não como fluxo padrão.

### 5.3 API tRPC e regras de negócio

**Responsabilidade principal**

Expor as operações de geração, persistência, billing e análise.

**Arquivos centrais**

- [`server/routers.ts`](./server/routers.ts)
- [`server/_core/trpc.ts`](./server/_core/trpc.ts)
- [`server/_core/systemRouter.ts`](./server/_core/systemRouter.ts)

**Entradas**

- chamadas tRPC do frontend.

**Saídas**

- dados para UI;
- persistência;
- redirecionamentos de checkout;
- chamadas a integrações externas.

**Dependências internas**

- `billing.ts`, `db.ts`, `storage.ts`, `screenshotService.ts`, `brandDNA.ts`, `chameleon*.ts`, `styleExtractor.ts`, `postJudge.ts`, `imageGenerateBackground.ts`.

**Dependências externas**

- Supabase, Stripe, LLMs, Pollinations, serviço de screenshot.

**Procedimentos mapeados**

- `system.health`
- `system.notifyOwner`
- `billing.getProfile`
- `billing.startTrial`
- `billing.createCheckout`
- `billing.getTopupPackages`
- `billing.createTopupCheckout`
- `auth.me`
- `auth.logout`
- `post.generate`
- `post.generateImage`
- `post.scrapeUrl`
- `post.save`
- `post.update`
- `post.list`
- `post.get`
- `post.generateBackground`
- `post.saveBackgroundAsset`
- `post.listSavedBackgrounds`
- `post.autoPilotDesign`
- `post.listBackgrounds`
- `post.analyzeBrand`
- `post.extractStyles`
- `post.extractBrandDNA`
- `post.evaluateQuality`

**Riscos e observações**

- `server/routers.ts` está muito concentrado e mistura validação, orchestration, prompts, billing e persistência.
- Esse arquivo é um ponto de alto acoplamento e manutenção sensível.

### 5.4 Persistência de posts e assets

**Responsabilidade principal**

Salvar e recuperar posts e imagens de background do usuário.

**Arquivos centrais**

- [`server/db.ts`](./server/db.ts)
- [`drizzle/schema.ts`](./drizzle/schema.ts)
- [`drizzle/0000_overrated_lucky_pierre.sql`](./drizzle/0000_overrated_lucky_pierre.sql)
- [`drizzle/0001_strange_riptide.sql`](./drizzle/0001_strange_riptide.sql)
- [`drizzle/0002_user_uuid_dual_write.sql`](./drizzle/0002_user_uuid_dual_write.sql)
- [`drizzle/0003_add_caption_to_posts.sql`](./drizzle/0003_add_caption_to_posts.sql)

**Entradas**

- dados do post editado;
- asset de background gerado ou enviado.

**Saídas**

- registros em `posts`;
- registros em `background_assets`.

**Dependências internas**

- `post.save`, `post.update`, `post.list`, `post.get`, `post.saveBackgroundAsset`, `post.listSavedBackgrounds`.

**Dependências externas**

- Supabase Postgres.

**Dados consumidos**

- `user_uuid`, conteúdo gerado, layout, slides, configurações de editor.

**Dados produzidos**

- posts recuperáveis em `SavedPosts`;
- assets reutilizáveis de background.

**Integrações envolvidas**

- Supabase client com `db.schema = "postspark"`.

**Riscos e observações**

- O runtime não usa Drizzle ORM para CRUD; usa Supabase client diretamente.
- O schema Drizzle ajuda a entender o modelo, mas não é a única fonte da verdade operacional.
- Existe sinal de transição histórica de `userId` inteiro para `user_uuid`.

### 5.5 Billing e créditos (`Sparks`)

**Responsabilidade principal**

Gerenciar plano, saldo de Sparks, trials, top-ups e Stripe Checkout/Webhook.

**Arquivos centrais**

- [`server/billing.ts`](./server/billing.ts)
- [`client/src/pages/Billing.tsx`](./client/src/pages/Billing.tsx)
- [`client/src/pages/Pricing.tsx`](./client/src/pages/Pricing.tsx)
- [`BILLING_HANDOFF.md`](./BILLING_HANDOFF.md)

**Entradas**

- e-mail do usuário autenticado;
- plano e ciclo desejados;
- eventos Stripe;
- RPCs Supabase.

**Saídas**

- URL de checkout Stripe;
- atualização de perfil/plano;
- débito de Sparks;
- top-up processado.

**Dependências internas**

- router `billing.*`;
- `post.generate`, `post.generateBackground`, `post.analyzeBrand`, `post.extractBrandDNA`.

**Dependências externas**

- Stripe;
- Supabase, incluindo RPCs como `start_trial`, `debit_sparks`, `process_topup`.

**Dados consumidos**

- `profiles`, `subscriptions`, `topup_packages` no schema `postspark`.

**Dados produzidos**

- atualização de plano e saldo;
- assinaturas e top-ups processados.

**Integrações envolvidas**

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

**Riscos e observações**

- Existe acoplamento por e-mail entre identidade do app e perfil de billing.
- Parte relevante do domínio de billing depende de tabelas/RPCs que não estão totalmente descritas em `drizzle/schema.ts`.

### 5.6 IA, geração e análise visual

**Responsabilidade principal**

Gerar textos, imagens, extrações visuais, Brand DNA e avaliação de qualidade.

**Arquivos centrais**

- [`server/_core/llm.ts`](./server/_core/llm.ts)
- [`server/_core/imageGeneration.ts`](./server/_core/imageGeneration.ts)
- [`server/imageGenerateBackground.ts`](./server/imageGenerateBackground.ts)
- [`server/styleExtractor.ts`](./server/styleExtractor.ts)
- [`server/designPatternAnalyzer.ts`](./server/designPatternAnalyzer.ts)
- [`server/brandDNA.ts`](./server/brandDNA.ts)
- [`server/brandThemeGenerator.ts`](./server/brandThemeGenerator.ts)
- [`server/chameleon.ts`](./server/chameleon.ts)
- [`server/chameleonVision.ts`](./server/chameleonVision.ts)
- [`server/postJudge.ts`](./server/postJudge.ts)
- [`server/visionExtractor.ts`](./server/visionExtractor.ts)

**Entradas**

- prompt do usuário;
- URL;
- screenshot de site;
- execution brief;
- variações geradas para avaliação.

**Saídas**

- variações de post;
- backgrounds em data URI;
- design tokens;
- temas temporários;
- avaliações de qualidade.

**Dependências externas**

- Gemini via endpoint OpenAI-compatible;
- Forge API como alternativa/custom endpoint;
- Groq API para fallback em alguns cenários;
- Pollinations para geração de background.

**Riscos e observações**

- Há múltiplos pipelines de análise visual coexistindo (`extractStyles`, `extractBrandDNA`, `analyzeBrand`, `chameleon`, `Brand DNA`), o que aumenta sobreposição conceitual.
- A nomenclatura sugere evolução incremental com camadas novas mantendo rotas legadas.

### 5.7 Screenshot service

**Responsabilidade principal**

Intermediar capturas e descoberta de páginas de sites externos para análise visual.

**Arquivos centrais**

- [`server/screenshotService.ts`](./server/screenshotService.ts)
- uso em [`server/_core/index.ts`](./server/_core/index.ts) e módulos de análise.

**Entradas**

- URL do site;
- tipo de captura;
- seletores e lista de páginas.

**Saídas**

- screenshots em `ArrayBuffer`;
- lista de páginas descobertas.

**Dependências externas**

- microserviço HTTP configurado por `SCREENSHOT_SERVICE_URL`.

**Riscos e observações**

- Se `SCREENSHOT_SERVICE_URL` faltar ou falhar, o pipeline degrada graciosamente em alguns pontos, mas perde precisão visual.

### 5.8 Editor e estado de composição

**Responsabilidade principal**

Gerenciar o estado editável do post e suas variantes/overrides por slide.

**Arquivos centrais**

- [`client/src/store/editorStore.ts`](./client/src/store/editorStore.ts)
- [`client/src/components/views/WorkbenchV2/WorkbenchV2.tsx`](./client/src/components/views/WorkbenchV2/WorkbenchV2.tsx)
- [`client/src/components/views/WorkbenchV2/PostCardV2.tsx`](./client/src/components/views/WorkbenchV2/PostCardV2.tsx)

**Entradas**

- `PostVariation` selecionada;
- slides de carrossel;
- ações do usuário no editor.

**Saídas**

- estado persistível com `imageSettings`, `layoutSettings`, `bgValue`, `bgOverlay`, `slides`.

**Riscos e observações**

- O store trata diferenciação entre base global e override por slide; mudanças aqui têm alto risco de regressão de editor.

## 6. Fluxos principais

### 6.1 Fluxo de autenticação

1. O usuário faz login/registro por email/senha ou Google no frontend público.
2. O Supabase retorna sessão/token no cliente.
3. O frontend chama `/api/auth/supabase-session` com `access_token`.
4. O backend valida o token com Supabase Admin.
5. O backend grava cookie httpOnly `app_session_id`.
6. Em cada chamada tRPC protegida, `sdk.authenticateRequest` valida o cookie e preenche `ctx.user`.

Observação:

- `useAuth` também escuta `onAuthStateChange` para manter o backend sincronizado com refresh/logout do cliente.

### 6.2 Fluxo principal do usuário autenticado

1. O usuário entra em `/thevoid`.
2. Em `Home.tsx`, define modo de criação e tipo de post.
3. Envia texto, URL ou imagem.
4. Se for URL, o frontend dispara extração visual em paralelo.
5. O backend gera variações via `post.generate`.
6. O frontend exibe as variações em `HoloDeck`.
7. O usuário seleciona uma variação e abre o `WorkbenchV2`.
8. O usuário edita o post e salva via `post.save`.
9. O post salvo pode ser reaberto em `SavedPosts`.

### 6.3 Fluxo de execução estruturada

1. O usuário entra em `creationMode = execution`.
2. O frontend monta um `CreativeExecutionBrief`.
3. O usuário ajusta formato, objetivo, restrições e inputs de marca.
4. O backend recebe `executionBrief` em `post.generate`.
5. A geração tenta respeitar briefing, itens obrigatórios e modo de adaptação.

### 6.4 Fluxo de extração de identidade visual

1. O usuário informa uma URL.
2. O frontend chama `post.extractBrandDNA` por `useExtractedStyles`.
3. O backend pode capturar screenshots, analisar site e sintetizar `BrandDNA`.
4. O backend gera `themes` temporários.
5. O frontend pode usar esses temas como apoio visual.

### 6.5 Fluxo de geração de background

1. O usuário pede geração de imagem.
2. O backend debita Sparks.
3. `generateBackgroundImage()` chama Pollinations.
4. O backend devolve `data:image/...;base64,...`.
5. O frontend injeta a imagem diretamente no editor.

### 6.6 Fluxo de billing

1. O frontend consulta `billing.getProfile`.
2. Para upgrade ou top-up, chama `createCheckout` ou `createTopupCheckout`.
3. O backend cria Stripe Checkout Session.
4. O usuário conclui pagamento no Stripe.
5. Stripe envia webhook para `/api/stripe/webhook`.
6. `handleStripeWebhook()` atualiza dados em Supabase.

### 6.7 Fluxo de reabertura de posts salvos

1. `SavedPosts` consulta `post.list`.
2. Ao abrir um post, o frontend reconstrói uma `PostVariation`.
3. O store do editor é hidratado com layout, bg, slides e settings persistidos.
4. O app redireciona para `/`, e `Home.tsx` abre o editor a partir de `sessionStorage`.

## 7. Dados e persistência

### Entidades confirmadas no código

#### `postspark.users`

Em [`drizzle/schema.ts`](./drizzle/schema.ts):

- `id`
- `openId`
- `name`
- `email`
- `loginMethod`
- `role`
- timestamps

Observação:

- Este modelo parece refletir uma fase anterior ou paralela do sistema. O runtime atual de autenticação trabalha principalmente com `auth.users` do Supabase e `user.id` UUID.

#### `postspark.posts`

Campos principais confirmados:

- `id`
- `user_uuid`
- `userId`
- `inputType`
- `inputContent`
- `platform`
- `headline`
- `body`
- `caption`
- `hashtags`
- `callToAction`
- `tone`
- `imagePrompt`
- `imageUrl`
- `backgroundColor`
- `textColor`
- `accentColor`
- `layout`
- `postMode`
- `slides`
- `textElements`
- `image_settings`
- `layout_settings`
- `bg_value`
- `bg_overlay`
- `copy_angle`
- `exported`
- timestamps

#### `postspark.background_assets`

Campos confirmados:

- `id`
- `user_uuid`
- `image_url`
- `source_type`
- `prompt`
- `label`
- timestamps

### Estruturas adicionais inferidas por uso

Fato observado em `billing.ts`:

- existem tabelas ou visões `profiles`, `subscriptions`, `topup_packages`;
- existem RPCs `start_trial`, `debit_sparks`, `process_topup`.

Hipótese controlada:

- essas estruturas vivem no mesmo schema `postspark`, mas não estão descritas no `drizzle/schema.ts` atual.

### Contratos de dados relevantes

- `PostVariation`
- `CreativeExecutionBrief`
- `TemporaryTheme`
- `BrandDNA`
- `PostEvaluation`
- `BackgroundValue`
- `BgOverlaySettings`

Todos estão principalmente em [`shared/postspark.ts`](./shared/postspark.ts).

### Storage

Fato observado:

- Uploads de background asset podem ser enviados a um storage proxy externo via `storagePut()`.
- A URL base e a autenticação desse storage vêm de `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY`.

### Cache e estado local

- React Query para cache de consultas e mutações.
- Zustand para estado do editor.
- `sessionStorage` para reabrir post salvo no fluxo da Home.

## 8. Integrações externas

### Supabase

Uso confirmado para:

- autenticação;
- validação de sessão;
- persistência de posts;
- billing/profile/subscriptions/top-ups;
- possivelmente tabelas e RPCs extras fora do schema Drizzle local.

Variáveis relevantes:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Stripe

Uso confirmado para:

- checkout de assinatura;
- checkout de top-up;
- webhook de cobrança;
- sincronização de status de subscription.

Variáveis relevantes:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_ANNUAL`
- `STRIPE_PRICE_AGENCY_MONTHLY`
- `STRIPE_PRICE_AGENCY_ANNUAL`
- `STRIPE_PRICE_TOPUP_STARTER`
- `STRIPE_PRICE_TOPUP_POWER`
- `STRIPE_PRICE_TOPUP_MEGA`

### Gemini / Forge / Groq

Uso confirmado para:

- geração textual;
- extração/análise visual;
- avaliação de qualidade;
- operações multimodais.

Variáveis relevantes:

- `GEMINI_API_KEY`
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `GROQ_API_KEY`

Observação:

- `invokeLLM()` prioriza Gemini quando `GEMINI_API_KEY` está presente; Forge aparece como endpoint alternativo.

### Pollinations

Uso confirmado para:

- geração de backgrounds.

Variável relevante:

- `POLLINATIONS_API_KEY` opcional.

### Serviço externo de screenshot

Uso confirmado para:

- screenshot desktop/mobile;
- multi-capture;
- captura por seletor;
- descoberta de páginas.

Variável relevante:

- `SCREENSHOT_SERVICE_URL`

### Vercel

Uso confirmado para:

- deploy do backend e frontend compilado.

### Variáveis de ambiente importantes não refletidas integralmente em `.env.example`

Fato observado:

- `.env.example` está incompleto/desatualizado em relação a `server/_core/env.ts`, `client/src/lib/supabaseClient.ts` e `server/imageGenerateBackground.ts`.

Exemplos faltantes ou parcialmente faltantes:

- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- variáveis Stripe completas
- `BYPASS_AUTH`
- `POLLINATIONS_API_KEY`

## 9. Eventos, automações e processos assíncronos

### Confirmados

- Webhook Stripe em `POST /api/stripe/webhook`.
- Listener de auth no frontend via `supabase.auth.onAuthStateChange`.
- Subscribers do React Query para tratar erros de autenticação em `client/src/main.tsx`.

### Não confirmados como runtime principal

- filas dedicadas;
- brokers de mensageria;
- cron jobs do servidor;
- workers persistentes;
- schedulers explícitos no backend.

Observação:

- Existem `setTimeout`/`setInterval` em UI e no `debug-collector.js`, mas isso não caracteriza infraestrutura de jobs do sistema.

## 10. Regras de negócio relevantes

### Billing por consumo

Fato observado:

- geração de posts, carrosséis, imagens e análises visuais debita `Sparks` antes da operação;
- mensagens de erro e bloqueio de plano são tratadas no backend.

### Limite de posts salvos por plano

Fato observado:

- o backend trata erro de limite de posts salvos e traduz para mensagem por plano.

### Bridge de autenticação

Fato observado:

- o backend não confia apenas no estado do cliente; exige cookie bridge validado por Supabase.

### Persistência rica do editor

Fato observado:

- não se salva apenas headline/body; o sistema persiste também estado visual e estrutura de carrossel.

### Execução orientada por briefing

Fato observado:

- existe distinção clara entre geração aberta (`ideation`) e geração guiada (`execution`).

## 11. Fluxos de UI ou API

### UI principal

#### Landing e autenticação pública

- rota `/`;
- renderiza `TheVoid2Page`;
- inclui showcase visual e formulário de login/registro;
- redireciona autenticados para `/thevoid`.

#### Área principal autenticada

- rota `/thevoid`;
- `Home.tsx` coordena estados:
  - `void`
  - `execution-brief`
  - `holodeck`
  - `workbench`

#### Billing

- `/pricing` para comparação e CTA;
- `/billing` para plano atual, checkout e top-up.

#### Biblioteca

- `/saved-posts` para listar e reabrir posts salvos.

### API / contratos

#### REST

- `/api/stripe/webhook`
- `/api/extract`
- `/api/brand-dna`
- `/api/auth/supabase-session`
- `/api/auth/supabase-logout`

#### tRPC

Principalmente sob `system`, `billing`, `auth` e `post`.

### Autorização

- `publicProcedure` para rotas abertas;
- `protectedProcedure` para rotas autenticadas;
- `adminProcedure` para operações administrativas, como `system.notifyOwner`.

## 12. Observações, riscos e acoplamentos frágeis

### Documentação parcialmente desatualizada

Fato observado:

- `README.md`, `.env.example` e parte de `docs/` não refletem integralmente o código atual.
- Exemplo: `docs/PROJECT_MAP.md` menciona estruturas que não correspondem mais exatamente ao layout atual, como `server/routers/` e `server/db/`.

### Router monolítico

- [`server/routers.ts`](./server/routers.ts) concentra muitas responsabilidades.
- Qualquer alteração ali pode impactar autenticação, billing, IA, persistência e UX.

### Modelo de dados híbrido / em transição

- Há sinais de convivência entre campos históricos (`userId`, `openId`) e o fluxo UUID do Supabase (`user_uuid`).
- Isso merece cuidado em migrações e filtros de autorização.

### Dependência forte de infraestrutura externa

- Sem Supabase, Stripe, Gemini/Forge e screenshot service, partes centrais do sistema degradam ou deixam de funcionar.

### Build gerado dentro do repositório

- `api/index.js`, `dist/` e `dist-server/` podem induzir leitura errada se forem tomados como fonte principal.

### Billing dependente de estruturas externas ao schema local

- O código depende de tabelas e RPCs não totalmente descritas na modelagem Drizzle local.

### Exemplo de detalhe sensível

- `post.listBackgrounds` em `server/routers.ts` monta paths de imagem com espaços em `"/ images / backgrounds / ..."`.
- Isso parece inconsistente com paths web esperados e deve ser validado antes de confiar nesse endpoint como verdade funcional.

## 13. Lacunas de conhecimento

### Não foi possível confirmar apenas pelo código local

1. O schema completo de billing no Supabase (`profiles`, `subscriptions`, `topup_packages`, RPCs).
2. A configuração real de RLS/permissões do banco.
3. O comportamento exato do microserviço externo de screenshot além do contrato cliente.
4. O comportamento e disponibilidade reais dos endpoints Forge em produção.
5. Se todos os pipelines legados de extração visual ainda são usados em produção ou se alguns já são residuais.

### Depende de ambiente

1. Credenciais e disponibilidade de Supabase.
2. Chaves Gemini/Groq/Forge.
3. URLs e price IDs Stripe.
4. `SCREENSHOT_SERVICE_URL`.
5. `BYPASS_AUTH` em ambiente de desenvolvimento.

### Pontos que deveriam ser validados futuramente

1. Atualizar `.env.example` para refletir variáveis atuais.
2. Confirmar o schema e as RPCs reais de billing e documentá-los de forma explícita.
3. Confirmar se Drizzle ainda é a estratégia de evolução do banco ou apenas documentação de parte do modelo.
4. Validar o endpoint `post.listBackgrounds` e o formato real dos paths retornados.
5. Revisar e alinhar `docs/` legados ao estado atual do código, ou marcar claramente o que é histórico.
