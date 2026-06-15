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
- [`docs/ensino/`](./docs/ensino): trilha didática para explicar stack, camadas, fluxo de requisição, auth, dados, billing, build, deploy, Git e Docker usando o PostSpark 3 como exemplo.
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
- [`server/_core/manylabs.ts`](./server/_core/manylabs.ts)

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

- `auth.me` e `auth.logout` via tRPC;
- `manylabs.ts` para verificação de acesso ao app.

**Dependências externas**

- Supabase Auth;
- Schema `manylabs` no Supabase (perfis, app_access, app_roles, audit_events).

**Dados consumidos**

- access token do Supabase;
- metadata do usuário no Supabase;
- `manylabs.app_access` para verificação de acesso ao PostSpark.

**Dados produzidos**

- cookie httpOnly;
- objeto `AuthenticatedUser`;
- registros em `manylabs.profiles`, `manylabs.app_access`, `manylabs.app_roles`, `manylabs.audit_events` (via auto-ativação).

**Integrações envolvidas**

- Supabase `auth.getUser`, `signInWithPassword`, `signUp`, `signInWithOAuth`, `signOut`;
- RPC `manylabs.has_app_access(user_id, app_slug)`.

**Riscos e observações**

- Há dois estados de sessão para manter coerentes: cliente Supabase e cookie bridge do backend.
- Em `development`, `BYPASS_AUTH=true` injeta usuário fixo admin e pula checagem ManyLabs. Isso altera comportamento de segurança e deve ser tratado como modo especial, não como fluxo padrão.
- A checagem ManyLabs ocorre em dois pontos: emissão do cookie (`supabaseAuth.ts`) e validação por request (`sdk.ts`), garantindo que cookies antigos sejam bloqueados se o acesso for revogado.

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
  - recebe screenshot do canvas, estado visual atual e geometria medida dos elementos identificados;
  - retorna ajustes por `id` para headline, body, decoracoes, secoes e textos avancados;
  - as coordenadas retornadas representam o centro do bloco em percentual do canvas.
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
- [`client/src/lib/variationSnapshot.ts`](./client/src/lib/variationSnapshot.ts)
- [`client/src/components/views/WorkbenchV2/WorkbenchV2.tsx`](./client/src/components/views/WorkbenchV2/WorkbenchV2.tsx)
- [`client/src/components/views/WorkbenchV2/PostCardV2.tsx`](./client/src/components/views/WorkbenchV2/PostCardV2.tsx)

**Entradas**

- `PostVariation` selecionada;
- slides de carrossel;
- ações do usuário no editor.

**Saídas**

- estado persistível com `imageSettings`, `layoutSettings`, `bgValue`, `bgOverlay`, `slides`.
- snapshot visual completo em `variation_snapshot` ao salvar posts novos.

**Riscos e observações**

- O store trata diferenciação entre base global e override por slide; mudanças aqui têm alto risco de regressão de editor.
- Posts salvos novos usam `variation_snapshot` como fonte preferencial para reabrir o estado visual rico do Workbench. Esse snapshot preserva templates estruturados, `sections`, tokens visuais e ajustes do editor que não cabem integralmente nos campos legados.
- Itens centrais de templates estruturados (`sections`) são normalizados com `id` estável e podem ter layouts individuais persistidos em `layoutSettings.sectionLayouts`.
- `client/src/lib/variationSnapshot.ts` centraliza a normalização da variação antes de entrar no editor e antes de persistir. Isso evita que campos exibidos no HoloDeck, mas não representados por campos legados (`headline`, `body`, `layout` etc.), fiquem fora do salvamento.
- `sections` deixam de ser apenas renderização auxiliar de template no Workbench: cada item ganha `id`, fallback de ícone e alvo de layout `section:<id>`, permitindo drag/resize e persistência individual.
- A seleção de elementos no canvas pode ser removida clicando fora dos blocos editáveis ou pressionando `Escape`, reduzindo estado preso de edição.
- Validação funcional confirmada em uso real: post novo salvo após essa mudança reabre visualmente igual ao post gerado e exibido no HoloDeck.

### 5.8.1 Layout responsivo e interacao no canvas

- Novas variacoes normalizadas recebem `layoutSettingsByAspectRatio`, com composicoes calculadas separadamente para `1:1`, `5:6` e `9:16`.
- Ao trocar o formato, o store preserva o layout atual e hidrata o layout correspondente ao destino.
- A distribuicao inicial de `sections` considera template, quantidade de itens e proporcao. Grades usam multiplas linhas e listas usam uma coluna, evitando concentrar todos os itens no mesmo eixo horizontal.
- O drag usa o retangulo visual real para preservar o ponto de grab, captura o gesto no documento e limita o centro conforme as dimensoes do elemento.
- O botao `Ajustar com IA` captura a imagem e um snapshot geometrico com `id`, centro, largura e altura de cada bloco visivel. A resposta de visao e aplicada por identificador, inclusive em `section:<id>` e `textElement:<id>`.

## 6. Fluxos principais

### 6.1 Fluxo de autenticação

1. O usuário faz login/registro por email/senha ou Google no frontend público.
2. O Supabase retorna sessão/token no cliente.
3. O frontend chama `/api/auth/supabase-session` com `access_token`.
4. O backend valida o token com Supabase Admin.
5. O backend verifica acesso ManyLabs via `ensurePostSparkAccess()`:
   - Se existe `manylabs.app_access` com status `active` ou `trial` → acesso permitido.
   - Se não existe registro prévio → auto-ativação (cria profile, app_access, app_role, audit_event) → acesso permitido.
   - Se existe registro com status bloqueante (`blocked`, `revoked`, `suspended`, `inactive`) ou desconhecido → acesso negado (HTTP 403, `postspark_access_required`).
6. Se acesso permitido, o backend grava cookie httpOnly `app_session_id`.
7. Em cada chamada tRPC protegida, `sdk.authenticateRequest` valida o cookie e chama `hasPostSparkAccess()` para verificar se o acesso continua ativo.
8. Se acesso revogado desde a emissão do cookie, a request é bloqueada com `ForbiddenError`.

Observação:

- `useAuth` também escuta `onAuthStateChange` para manter o backend sincronizado com refresh/logout do cliente.
- A checagem dupla (login + cada request) garante que revogação de acesso seja efetiva imediatamente, mesmo com cookies válidos.
- Em `development` com `BYPASS_AUTH=true`, toda a checagem ManyLabs é pulada.

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

Durante as etapas de extração e geração, `Home.tsx` mantém um estado único que
cobre tanto a identidade visual quanto a mutation `post.generate`. O `TheVoid`
exibe tempo decorrido, etapa corrente e uma barra de progresso estimada, limitada
abaixo de 100% até a resposta real. Em processamentos longos, a interface informa
explicitamente que a análise continua no servidor. Falhas retornam para um aviso
inline e preservam o conteúdo digitado para revisão e novo envio.

O percentual não representa progresso emitido pelo backend. Ele é uma indicação
visual baseada em tempo e fase (`extracting` ou `generating`) centralizada em
`client/src/lib/generationProgress.ts`.

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
2. Ao abrir um post, o frontend prefere `variation_snapshot` quando presente.
3. Se o snapshot não existir, o frontend reconstrói uma `PostVariation` pelos campos legados.
4. O store do editor é hidratado com layout, bg, slides, settings persistidos e layouts individuais de `sections`.
5. O app redireciona para `/`, e `Home.tsx` abre o editor a partir de `sessionStorage`.

### 6.8 Fluxo de salvamento visual fiel ao HoloDeck

1. A geração retorna uma `PostVariation` que pode conter campos estruturados como `template` e `sections`.
2. Antes de abrir o Workbench, `HoloDeck` normaliza a variação para garantir `sections` com `id` estável e ícones consistentes.
3. No Workbench, `PostCardV2` renderiza `sections` estruturadas como blocos editáveis individuais, com alvo de layout `section:<id>`.
4. Movimentos e redimensionamentos desses blocos são gravados em `layoutSettings.sectionLayouts`.
5. Ao salvar, `Home.tsx` monta um `variation_snapshot` com a variação normalizada, estilos, layout, background, overlays, slides e campos ricos do editor.
6. `post.save` persiste esse snapshot em `postspark.posts.variation_snapshot`, além dos campos legados usados para listagem e compatibilidade.
7. Ao reabrir, `SavedPosts` usa o snapshot como fonte principal e só cai para campos legados se o snapshot não existir.

Resultado confirmado:

- Posts novos salvos após essa mudança preservam a composição visual exibida no HoloDeck, incluindo itens centrais gerados em `sections`.
- Posts antigos sem `variation_snapshot` continuam abrindo pelo fallback legado, mas não recuperam dados que nunca foram persistidos.

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
- `variation_snapshot`
- `exported`
- timestamps

Observações sobre `variation_snapshot`:

- Campo `jsonb` usado para preservar o estado visual rico de posts novos.
- Armazena a `PostVariation` normalizada e ajustes de editor que não cabem completamente nos campos legados.
- Preserva `template`, `sections`, `imageSettings`, `layoutSettings`, `bgValue`, `bgOverlay`, `slides`, tokens visuais e demais dados necessários para reabrir o post no Workbench com fidelidade.
- É a fonte preferencial de reabertura em `SavedPosts`; campos como `headline`, `body`, `caption`, `imageUrl` e `layout` seguem úteis para listagem, busca, compatibilidade e fallback.

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

- `invokeLLM()` prioriza Gemini quando `GEMINI_API_KEY` está presente; Forge aparece como endpoint alternativo de configuração.
- Falhas transitórias (`408`, `429`, `500`, `502`, `503`, `504`, timeout ou rede) recebem retry exponencial com jitter e respeito limitado ao header `Retry-After`.
- Após esgotar retries de uma chamada textual Gemini, o runtime pode usar Groq com `llama-3.3-70b-versatile`.
- O fallback não reutiliza cegamente o payload: `server/ai/providers/modelAdapters.ts` converte `json_schema` para `json_object`, injeta o schema no prompt, valida a resposta localmente e permite um reparo único.
- Imagens, arquivos e chamadas com tools não migram automaticamente para o fallback textual.

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
- Como o deploy atual aponta para `api/index.js`, mudanças de backend/tRPC só chegam à produção se o build for regenerado e o artefato correto for enviado no deploy. Isso foi relevante na correção de `variation_snapshot`: o código fonte já estava atualizado, mas um `api/index.js` antigo ainda não continha o novo contrato de salvamento.

### Billing dependente de estruturas externas ao schema local

- O código depende de tabelas e RPCs não totalmente descritas na modelagem Drizzle local.

### Exemplo de detalhe sensível

- `post.listBackgrounds` em `server/routers.ts` monta paths de imagem com espaços em `"/ images / backgrounds / ..."`.
- Isso parece inconsistente com paths web esperados e deve ser validado antes de confiar nesse endpoint como verdade funcional.

## 13. ManyLabs Access Control

### Visão geral

O PostSpark agora integra com o schema `manylabs` para controle de acesso por app. O Supabase Auth continua sendo a identidade global, mas o acesso ao PostSpark é controlado por `manylabs.app_access`.

### Schema manylabs

Tabelas confirmadas:

- `manylabs.profiles`: `user_id`, `email_normalized`, `display_name`, `avatar_url`, `source`, `metadata`, `created_at`, `updated_at`
- `manylabs.app_access`: `user_id`, `app_slug`, `status`, `source`, `activated_at`, `expires_at`, `metadata`, `created_at`, `updated_at`
- `manylabs.app_roles`: `id`, `user_id`, `app_slug`, `role`, `source`, `metadata`, `created_at`, `updated_at`
- `manylabs.audit_events`: `id`, `actor_user_id`, `target_user_id`, `app_slug`, `action`, `source`, `metadata`, `created_at`

RPC confirmada:

- `manylabs.has_app_access(p_user_id uuid, p_app_slug text)` → boolean

### Arquivo central

- [`server/_core/manylabs.ts`](./server/_core/manylabs.ts)

### Funções exportadas

- `hasPostSparkAccess(userId)`: chama RPC `has_app_access`. Fail-closed (retorna `false` em erro).
- `ensurePostSparkAccess(userId, email, name)`: verifica se o usuário tem acesso; auto-ativa se não houver registro prévio. Nunca reativa status bloqueante.

### Regras de auto-ativação

1. Query `manylabs.app_access` WHERE `user_id + app_slug = 'postspark'`.
2. Se encontrado com status `active` ou `trial` → retorna `true`.
3. Se encontrado com status `blocked`, `revoked`, `suspended`, `inactive` ou desconhecido → retorna `false` (nunca reativa).
4. Se não encontrado → cria registros em `profiles`, `app_access` (status `active`), `app_roles` (role `user`) e `audit_events` (action `app_access.auto_activated`).

### RLS no schema postspark

Migration `postspark_rls_hardening` aplicada:

- RLS habilitado em `posts`, `background_assets`, `users`, `topup_packages`, `plan_save_limits`.
- `authenticated` só acessa `posts` e `background_assets` se o registro pertence a `auth.uid()` E o usuário tem acesso ativo em `manylabs.app_access`.
- `topup_packages` e `plan_save_limits` seguem com leitura pública.

### Fluxo de erro no frontend

- `LoginModal`: captura `postspark_access_required` e exibe mensagem neutra.
- `GoogleAuthCallback`: em caso de 403, redireciona para `/?auth_error=postspark_access_required`.
- `PublicLandingRoute`: lê `auth_error` dos query params e exibe toast com mensagem.

## 14. Lacunas de conhecimento

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

### Auditoria do pipeline de IA para sites e geracao de posts

Fatos observados:

- O fluxo de URL executa duas extracoes independentes de identidade:
  - `Home.tsx` dispara `post.extractBrandDNA` para alimentar os temas do HoloDeck;
  - `post.generate` executa novamente `extractBrandDNA` e `chameleonVision` para gerar os posts.
- Os dois resultados nao compartilham um snapshot unico. Como usam LLM, podem produzir classificacoes, cores e interpretacoes diferentes para o mesmo site.
- `BrandDNA` descreve identidade visual, setor, personalidade, composicao e perfil emocional, mas nao modela explicitamente proposta de valor, produtos, publico, diferenciais, objetivos de negocio, pilares editoriais ou topicos prioritarios.
- `generateThemesFromBrandDNA` gera sempre tres familias fixas (`Original`, `Remix`, `Contraste`) por regras deterministicas de cor, ritmo, alinhamento e card style. Nao existe avaliacao semantica posterior que confirme se cada tema combina com o assunto e o objetivo comercial do site.
- A geracao de copy usa o texto da homepage obtido por `scrapeUrl`, limitado aos primeiros 10.000 caracteres. A analise visual pode capturar varias paginas, mas o contexto semantico da geracao nao sintetiza o conteudo dessas paginas internas.
- `chameleonVision` recebe no maximo 2.000 caracteres do contexto textual e gera angulos de copy junto com tokens visuais.
- A diversidade das tres variacoes e validada por similaridade Jaccard de palavras e igualdade de alguns campos. Nao ha comparacao semantica com posts salvos, geracoes anteriores, concorrentes, frases do site ou cliches do setor.
- `post.evaluateQuality` existe como endpoint separado, mas nao e chamado automaticamente pelo fluxo principal. Sua avaliacao nao inclui uma dimensao especifica de originalidade nem de aderencia aos objetivos do site.
- O parametro `model` recebido por `invokeLLM` nao e aplicado ao payload: o runtime fixa `gemini-2.5-flash`. Portanto, a selecao `gemini`/`llama` exposta no contrato nao altera o modelo efetivamente utilizado.
- No modo execution, `brandInput.websiteUrl` e incluido como texto no briefing, mas nao aciona a extracao de Brand DNA dentro de `post.generate`, pois a requisicao usa `inputType: "text"`.

Riscos confirmados:

1. Temas do HoloDeck e posts gerados podem refletir interpretacoes diferentes do mesmo site.
2. Temas visualmente coerentes podem ser semanticamente inadequados ao produto, publico ou objetivo do site.
3. Variacoes lexicalmente diferentes podem continuar sendo conceitualmente genericas ou pouco originais.
4. A avaliacao de qualidade pode existir no backend sem proteger efetivamente a entrega principal.
5. O seletor de modelo pode induzir o usuario a acreditar que escolheu um provedor que nao esta sendo usado.

### Baseline executavel da auditoria

- [`docs/AUDITORIA_IMPLEMENTACAO.md`](./docs/AUDITORIA_IMPLEMENTACAO.md) registra os casos representativos, metricas e metas das fases de melhoria.
- [`tests/fixtures/postspark.ts`](./tests/fixtures/postspark.ts) concentra fixtures deterministicas de sites e composicoes visuais ricas para testes.
- [`server/ai/variationDiversity.ts`](./server/ai/variationDiversity.ts) isola, sem alterar o comportamento, o guard lexical de diversidade antes embutido em `server/routers.ts`.
- A baseline automatizada cobre snapshot visual, estado estatico, overrides de carrossel, aplicacao global e diversidade lexical.

### SiteIntelligence: snapshot unico de site

- [`shared/postspark.ts`](./shared/postspark.ts) define `SiteIntelligence`, reunindo Brand DNA visual, negocio, publico, objetivos, estrategia editorial, evidencias e qualidade.
- [`server/siteContent.ts`](./server/siteContent.ts) normaliza URLs, coleta ate cinco paginas priorizadas, extrai texto legivel e calcula fingerprint SHA-256.
- [`server/siteIntelligence.ts`](./server/siteIntelligence.ts) orquestra conteudo, Brand DNA, sintese semantica, cache, persistencia, contexto de prompt e tokens visuais.
- [`drizzle/0005_add_site_intelligence.sql`](./drizzle/0005_add_site_intelligence.sql) cria `postspark.site_intelligence`, com isolamento por `user_uuid`, unicidade por URL/fingerprint e RLS.
- `post.extractBrandDNA` preserva os campos legados e passa a retornar tambem `siteIntelligence` e `cached`.
- `post.generate` aceita `siteIntelligenceId`; URL em ideacao e `brandInput.websiteUrl` em execution usam o mesmo pipeline.
- `Home.tsx` aguarda a extracao antes da geracao e repassa o ID, eliminando snapshots concorrentes entre temas e posts.
- O endpoint REST `/api/brand-dna` usa o mesmo pipeline sem persistencia porque nao possui identidade autenticada.

### Planejamento estrategico antes da geracao

- [`server/ai/contentStrategy.ts`](./server/ai/contentStrategy.ts) gera cinco estrategias, pontua relevancia, objetivo, evidencia e distincao, e seleciona tres.
- [`server/ai/postGenerator.ts`](./server/ai/postGenerator.ts) converte as estrategias selecionadas em contratos de prompt por variacao.
- [`server/ai/generationPipeline.ts`](./server/ai/generationPipeline.ts) prepara o plano consumido por `post.generate`.
- O objetivo vem do briefing execution ou dos objetivos observados no `SiteIntelligence`.
- A geracao possui fallback deterministico quando a etapa de estrategia falha, sem perder o vinculo com o conteudo de origem.

### Avaliacao e revisao automatica da geracao

- [`server/ai/postEvaluation.ts`](./server/ai/postEvaluation.ts) avalia marca, objetivo, publico, factualidade, originalidade, clareza, plataforma e legibilidade.
- Regras deterministicas validam contraste WCAG, tamanho de copy, numeros sem evidencia e similaridade lexical.
- Juizes LLM por candidato executam em paralelo e sao agregados as regras deterministicas.
- Candidatos reprovados podem passar por uma unica revisao orientada pelos feedbacks; nao ha loop aberto.
- `PostVariation.generationMeta` registra estrategia, avaliacao e quantidade de revisoes.

### Modelos efetivos e observabilidade

- [`server/_core/llm.ts`](./server/_core/llm.ts) roteia `gemini` para `gemini-2.5-flash` no Google e `llama` para `llama-3.3-70b-versatile` no Groq.
- Llama selecionado diretamente exige `GROQ_API_KEY`; não existe fallback silencioso de Llama para Gemini.
- Chamadas textuais solicitadas como Gemini possuem fallback operacional explícito para Groq após retries transitórios, controlado por `AI_MODEL_FALLBACK_ENABLED`.
- [`server/ai/providers/modelAdapters.ts`](./server/ai/providers/modelAdapters.ts) preserva mensagens e instruções essenciais, traduz capacidades de saída estruturada e valida o contrato antes de aceitar a resposta do Groq.
- O trace registra tentativa, provedor, modelo efetivo, `fallbackFrom`, tradução de schema e reparo de output.
- [`server/ai/generationTrace.ts`](./server/ai/generationTrace.ts) agrega chamadas, prompts, hashes, modelos, tokens, latencia e custo configuravel.
- [`drizzle/0006_add_generation_runs.sql`](./drizzle/0006_add_generation_runs.sql) cria `postspark.generation_runs` para estrategias, avaliacoes, revisoes e saidas.
- `.env.example` documenta `GEMINI_API_KEY`, `GROQ_API_KEY`, Supabase e taxas opcionais de custo por milhao de tokens.
- Snapshots visuais novos registram `snapshotVersion: 1`.

### Originalidade semantica

- [`server/ai/semanticOriginality.ts`](./server/ai/semanticOriginality.ts) gera embeddings de candidatos e referencias com `gemini-embedding-001`, task `SEMANTIC_SIMILARITY` e 768 dimensoes.
- Cada candidato e comparado aos demais, as evidencias do site e a ate vinte posts recentes do usuario.
- Na indisponibilidade da API, um embedding deterministico local preserva a checagem, marcado como fallback.
- A nota de originalidade alimenta `postEvaluation` e fica exposta em `generationMeta.originality`.
- [`drizzle/0007_add_content_fingerprints.sql`](./drizzle/0007_add_content_fingerprints.sql) persiste hashes, vetores e metadados ligados a execucao.

### Renderer unico e capacidades do editor

- [`client/src/components/PostRenderer.tsx`](./client/src/components/PostRenderer.tsx) e a entrada unica do fluxo ativo para `preview`, `edit` e `export`.
- HoloDeck, Workbench V2 e SavedPosts renderizam `PostCardV2` a partir do mesmo snapshot.
- Previews externos usam defaults isolados e nao leem ajustes residuais do Zustand.
- A referencia de exportacao envolve somente o post em tamanho logico; escala do workspace e controles ficam fora da captura.
- `layoutTarget` sincroniza canvas e `LayoutBlock`, incluindo `card`, `section:<id>` e `textElement:<id>`.
- Sections permitem editar label, descricao e icone, alem de movimento e largura.
- Text elements avancados permitem editar texto, tipografia, cor, tamanho, rotacao, posicao, largura e altura.
- Formas decorativas automaticas de tema nao sao expostas como layers independentes.

### Operacao, rollout e privacidade da IA

- [`drizzle/0008_add_generation_quality_metrics.sql`](./drizzle/0008_add_generation_quality_metrics.sql) adiciona metricas denormalizadas em `generation_runs`.
- Runs com falha e chamadas LLM com erro passam a ser rastreadas, alem das runs concluidas.
- `AI_TRACE_STORE_CONTENT=false` e o default: input e substituido por hash e prompts/outputs brutos nao sao persistidos.
- `admin.getGenerationMetrics` agrega conclusao, aceitacao, revisao, fallback, erros de chamada, qualidade, latencia, tokens e custo.
- `admin.getAiRollout` informa as flags efetivas, tambem exibidas no painel Admin.
- Flags independentes controlam Site Intelligence, estrategia LLM, juiz LLM e embeddings semanticos.
- [`docs/AI_OPERATIONS.md`](./docs/AI_OPERATIONS.md) documenta deploy, alertas, rollback, diagnostico e retencao.

Hipoteses antigas invalidadas pela implementacao:

1. HoloDeck e generate nao produzem mais snapshots independentes quando o cliente envia `siteIntelligenceId`.
2. O endpoint separado de qualidade deixou de ser a unica protecao; a avaliacao faz parte do fluxo principal.
3. O seletor de modelo agora altera o provedor/modelo efetivo e falha explicitamente quando a chave exigida nao existe.
4. Originalidade deixou de ser apenas lexical e passa a considerar historico, site e candidatos por embeddings.

### Pontos que deveriam ser validados futuramente

1. Confirmar em producao as taxas reais de custo por modelo e recalibrar os alertas operacionais.
2. Confirmar o schema e as RPCs reais de billing e documentá-los de forma explícita.
3. Confirmar se Drizzle ainda é a estratégia de evolução do banco ou apenas documentação de parte do modelo.

## 24. Auditoria da geracao de posts - 2026-06-12

Fatos confirmados no codigo:

- `post.generate` retorna um objeto com `variations`, `generationRunId` e,
  quando autorizado, `debug`.
- A redacao das tres variacoes usa tres chamadas LLM paralelas. Cada chamada
  recebe um contrato estrategico exclusivo e deve retornar exatamente um post.
- O conjunto final so e entregue quando possui exatamente tres variacoes
  completas e distintas. Conjuntos parciais, carrosseis sem cinco slides e
  variacoes excessivamente semelhantes geram falha explicita.
- Schemas de QA visual, diversificacao e revisao exigem exatamente tres itens.
  Uma etapa intermediaria incompleta nao pode substituir silenciosamente o
  conjunto anterior.
- Para URL, `analyzeSiteIntelligence` coleta conteudo e paginas uma vez e, apos
  essa coleta compartilhada, executa em paralelo a sintese semantica e a
  extracao visual de Brand DNA. O `SiteIntelligence` e compilado somente depois
  que as duas analises terminam.
- O trace efemero registra prompts, respostas, provedor, modelo solicitado,
  modelo efetivo, fallback, tokens, latencia e eventos do pipeline.
- O trace bruto so e retornado quando `AI_UI_DEBUG_ENABLED` e a solicitacao de
  debug estao ativos. HoloDeck e Workbench exibem o mesmo trace em um painel
  marcado por `AUDIT_DEBUG_START` / `AUDIT_DEBUG_END`.
- Prompts e respostas brutas nao entram em `generation_runs`. A persistencia
  remove `messages` e `response` das chamadas e mantem hashes, modelos,
  metricas, erros e contadores.
- `AI_TRACE_STORE_CONTENT` continua controlando snapshots persistidos de input,
  estrategias e output; ele nao e necessario para o painel efemero.

Risco operacional confirmado:

- A nova estrategia faz tres chamadas de redacao em paralelo, alem das chamadas
  de estrategia, avaliacao e eventuais correcoes. Isso aumenta o numero de
  chamadas por run e deve ser acompanhado por latencia, tokens e custo em
  `generation_runs`.

### Correcao de densidade dos templates estruturados

- O renderer de preview so usa posicionamento absoluto de `sections` quando o
  snapshot possui `layoutSettings.sectionLayouts` explicito. Variacoes novas
  sem layout salvo usam o fluxo normal do template.
- Quando ha layout explicito, as coordenadas percentuais das secoes sao
  aplicadas sobre a area integral do post, e nao sobre um container interno de
  altura reduzida.
- Posts estaticos exibem no maximo tres secoes estruturadas. O backend exige
  exatamente tres itens para `feature-grid`, `numbered-list` e `step-by-step`,
  com `label` de ate 24 caracteres e `description` de ate 48 caracteres.
- O template `simple` deve retornar `sections: []`. A validacao de completude
  rejeita e tenta novamente respostas que violem essas regras.
- O calculo de auto-fit reduz tipografia e padding quando existem secoes
  estruturadas, reservando espaco para os elementos auxiliares.
4. Validar o endpoint `post.listBackgrounds` e o formato real dos paths retornados.
5. Revisar e alinhar `docs/` legados ao estado atual do código, ou marcar claramente o que é histórico.
