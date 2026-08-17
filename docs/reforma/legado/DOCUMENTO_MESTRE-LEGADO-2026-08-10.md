# DOCUMENTO_MESTRE

> **Rebaseline em andamento (2026-08-10).** Este documento continua sendo fonte de contexto histórico e riscos conhecidos, mas não deve prevalecer sozinho sobre o código ativo. A reforma do PostSpark 3 está sendo conduzida pela baseline factual, pelo plano curto e pelas specs em [`docs/reforma/`](./docs/reforma/README.md). O corte definitivo deste documento ocorrerá na SPEC-006, depois da implementação e conferência do programa.

> **Delta SPEC-003 (2026-08-12, aguardando conferência).** A geração foi reestruturada para um orquestrador único (`server/ai/generationOrchestrator.ts`); `post.generate` é borda fina. O caminho feliz faz exatamente 1 chamada generativa; reparo é 1 chamada com apenas os slots rejeitados. Estratégia (`content_strategy` LLM) e síntese LLM de captions saíram do caminho síncrono (planejamento determinístico; captions na chamada principal com fallback determinístico marcado). Os grafos de geração (`shadow`/`pipeline`, flags `AI_GRAPH_SHADOW`/`AI_GRAPH_PIPELINE`, `shared/graphEngine.ts`, `shared/generationGraph.ts`) foram removidos. `GenerationOutcome` distingue approved/rejected/failed até a borda; ambos os não-aprovados fazem refund da reserva. As seções abaixo que descrevem o fluxo antigo (caption synthesis LLM tardia em 5.6.1, contagens por slot, grafos) são histórico: o comportamento produtivo é o descrito na baseline da reforma.

> **Delta SPEC-004 (2026-08-12, aguardando conferência).** Foi criada a cadeia de evidência runtime↔migrations↔Supabase: `npm run verify:runtime` (verificador read-only com manifesto derivado do código, validação SQL pelo parser real do Postgres e sondas remotas com sentinela). Auditoria remota do projeto `spbu…hfir` confirmou: migrations 0005/0007/0012/0013/0014 nunca aplicadas; tabelas `spark_reservations`, `site_intelligence`, `content_fingerprints` e colunas `generation_runs.events`/`events_version` ausentes; RPCs de reserva (`reserve_sparks`, `commit_spark_reservation`, `refund_spark_reservation`) e `get_billing_profile` ausentes. Correção consolidada e idempotente em `drizzle/0015_harden_manifest_corrective.sql` — **aplicação em produção pendente de autorização do dono**. `generation_runs.events_version` agora é 2 (contrato do orquestrador). Billing sem casts `as any` (wrapper tipado `rpcCall`) e máquina de estados da reserva provada por testes (double-submit, commit/refund repetidos, transições inválidas).

> **Delta SPEC-005 (2026-08-12, aguardando conferência).** Removidos com evidência de grafo: `voiceTranscription.ts`, `slimBriefing.ts`, caminhos LLM de `captionSynthesis`/`contentStrategy`/`postEvaluation` (evaluateAndReviseCandidates), `assertVariationSet`, métricas shadow/pipeline de `db.ts`, flag `AI_CONTENT_STRATEGY_ENABLED`, deps `@aws-sdk/*`/`axios`/`nodemailer`/`@hookform/resolvers`; card "Gate do pipeline de grafo" removido do Admin. `postJudge.ts` mantido como compatibilidade nomeada (endpoint público). Ledger do Next em `docs/reforma/NEXT-LEDGER.md` (Next intacto). Correção de build herdada da SPEC-001: indireção `shared/typography/measurer.ts` — `npm run build` volta a gerar `api/index.js` a partir das fontes.

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
- modelo selecionado permanece no contrato por compatibilidade, mas o backend resolve provedor/modelo por `taskRoute`.

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

- `billing.ts`, `db.ts`, `storage.ts`, `screenshotService.ts`, `brandDNA.ts`, `chameleon.ts`, `styleExtractor.ts`, `postJudge.ts`, `imageGenerateBackground.ts`.

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

- OpenRouter PAYG via endpoint OpenAI-compatible como primario para geracao textual forte, carrossel, vision criativa e imagem;
- Groq via endpoint OpenAI-compatible para microcopy (`openai/gpt-oss-120b`) e vision rapida (`meta-llama/llama-4-scout-17b-16e-instruct`);
- Gemini via endpoint OpenAI-compatible para fallback textual e fallback multimodal/vision;
- Forge API como alternativa/custom endpoint para o caminho Gemini quando configurado;
- Pollinations apenas como fallback legacy de background.

**Riscos e observações**

- Há múltiplos pipelines de análise visual coexistindo (`extractStyles`, `extractBrandDNA`, `analyzeBrand`, `chameleon`, `Brand DNA`), o que aumenta sobreposição conceitual.
- A nomenclatura sugere evolução incremental com camadas novas mantendo rotas legadas.

#### 5.6.1 Caption Synthesis Pass (coerência legenda ↔ conteúdo visual)

Fato observado:

- A legenda (`caption`) de cada variação é gerada em um passo dedicado, posterior a toda a pipeline de geração, QA, diversificação e revisão de qualidade.
- O módulo responsável é [`server/ai/captionSynthesis.ts`](./server/ai/captionSynthesis.ts) e é invocado em `server/routers.ts` imediatamente após `evaluateAndReviseCandidates`.
- A síntese extrai o conteúdo visual final da variação (slides, seções ou headline+body) e o fornece como input obrigatório para um LLM dedicado via `taskRoute: "caption_synthesis"`.
- O LLM recebe instruções explícitas de: sintetizar, expandir e dar contexto ao conteúdo visual; nunca inventar tópicos/números diferentes; respeitar o limite de caracteres da plataforma; incluir gancho + contexto + síntese + CTA.
- O schema de saída é simples: `{ caption: string }`, com fallback resiliente — se a síntese falhar, a caption original da geração primária é preservada.
- O limite de truncamento em `applyDeterministicCopyGuards` aumentou de 300 para 1500 caracteres para respeitar limites reais das plataformas (Instagram: 2200, LinkedIn: 3000).
- O regex band-aid anterior (`/veja\s+3\s+checagens?\s+r(?:a|á)pidas?/`) foi removido pois a síntese estrutural torna patches manuais desnecessários.
- A dimensão `captionCoherence` foi adicionada a `GenerationEvaluationSummary.dimensions` e à avaliação determinística em `postEvaluation.ts`, detectando discrepâncias de número de itens (ex: caption diz "3 dicas" quando há 5 slides) e penalizando a aceitação do candidato.
- A nova `taskRoute` `"caption_synthesis"` usa OpenRouter com política própria: `temperature: 0.5`, `topP: 0.9`, `reasoningEffort: "minimal"`, `timeoutMs: 25000`.

Motivação estrutural:

- Antes desta mudança, a caption era um campo secundário gerado no mesmo passe do LLM que produzia slides, cores, layout, seções e copyAngle — um schema de 15+ campos. Não havia garantia de coerência entre a legenda e o conteúdo visual, resultando em discrepâncias como "3 dicas" na legenda quando os slides apresentavam 5 dicas.
- A solução estrutural garante que a legenda seja sempre sintetizada a partir do conteúdo visual final, eliminando a possibilidade de inconsistência.

### 5.7 Screenshot service
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

- No desktop, o canvas do Workbench escala de acordo com o espaco central disponivel, preserva o aspect ratio e pode chegar a `2x` da base logica de 360 px. Em viewports menores, a escala e reduzida automaticamente para manter o post e seus controles dentro da area util; o dimensionamento mobile permanece independente e limitado a `1x`.
- Quando o ima esta ativo, blocos e sections usam a mesma malha visual `9x9`, com pontos de snap entre 10% e 90% do canvas em intervalos de 10%.
- A normalizacao de uma variacao nao cria coordenadas absolutas nem `layoutSettingsByAspectRatio`; HoloDeck e Workbench iniciam com o mesmo fluxo responsivo de `PostCardV2`.
- Ao trocar o formato, o store preserva o layout manual do formato atual e hidrata o layout salvo do destino. Quando nao existe layout salvo, usa o layout estrutural correspondente a `PostVariation.layout`.
- `layoutSettings.sectionLayouts` contem somente posicoes criadas explicitamente pelo usuario ou aplicadas pelo AutoPilot. Sections sem override continuam ocupando seu lugar no fluxo do template.
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
3. `generateBackgroundImage()` chama OpenRouter/Nano Banana 2 e usa Pollinations apenas como fallback legacy.
4. O backend devolve `data:image/...;base64,...`.
5. O frontend injeta a imagem diretamente no editor.

O backend registra no console o servico e o modelo efetivamente chamados, o sucesso do provedor e a troca para Pollinations quando o OpenRouter falha. A resposta do OpenRouter e lida somente dos campos estruturados de imagem e validada pela assinatura binaria de PNG, JPEG, WebP ou GIF; payloads base64 que nao representam imagens validas sao rejeitados e acionam o fallback.

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

- `OPENROUTER_API_KEY`
- `OPENROUTER_TEXT_MODEL`
- `OPENROUTER_VISION_MODEL`
- `OPENROUTER_IMAGE_MODEL`
- `OPENROUTER_PLATFORM_FEE_PERCENT`
- `GEMINI_API_KEY`
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `GROQ_API_KEY`

Observação:

- `invokeLLM()` prioriza OpenRouter/GPT-5 mini por `taskRoute` para texto forte, carrossel e vision criativa; Groq fica restrito a microcopy e vision rapida; Gemini/Forge aparecem como fallback quando configurados.
- Falhas transitórias (`408`, `429`, `500`, `502`, `503`, `504`, timeout ou rede) recebem retry exponencial com jitter e respeito limitado ao header `Retry-After`.
- Após esgotar retries de uma chamada OpenRouter/Groq sem tools, o runtime pode usar Gemini como fallback.
- `server/ai/providers/modelAdapters.ts` usa `json_schema` nativo no OpenRouter/GPT-5 mini e no Groq `openai/gpt-oss-120b`; se o Groq rejeitar esse formato com erro de contrato, rebaixa a chamada para `json_object` com schema textual.
- Para modelos Groq sem suporte explícito a schema nativo, o adapter preserva o caminho textual: converte `json_schema` para `json_object`, injeta o schema no prompt, valida localmente e permite um reparo único.
- Chamadas com tools não migram automaticamente para o fallback textual.

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

- `post.listBackgrounds` em `server/routers.ts` antes montava paths de imagem com espaços em `"/ images / backgrounds / ..."`. Já corrigido (ver §sobre fixes de paths): agora retorna URLs públicas sem espaços e com segmentos codificados.

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
  - `post.generate` executa novamente `extractBrandDNA` para gerar os posts.
- Os dois resultados nao compartilham um snapshot unico. Como usam LLM, podem produzir classificacoes, cores e interpretacoes diferentes para o mesmo site.
- `BrandDNA` descreve identidade visual, setor, personalidade, composicao e perfil emocional, mas nao modela explicitamente proposta de valor, produtos, publico, diferenciais, objetivos de negocio, pilares editoriais ou topicos prioritarios.
- `generateThemesFromBrandDNA` gera sempre tres familias fixas (`Original`, `Remix`, `Contraste`) por regras deterministicas de cor, ritmo, alinhamento e card style. Nao existe avaliacao semantica posterior que confirme se cada tema combina com o assunto e o objetivo comercial do site.
- A geracao de copy usa o texto da homepage obtido por `scrapeUrl`, limitado aos primeiros 10.000 caracteres. A analise visual pode capturar varias paginas, mas o contexto semantico da geracao nao sintetiza o conteudo dessas paginas internas.
- _Histórico (G11):_ `chameleonVision` — extração image→tokens+copy via Vision LLM — foi removido como branch morto do pipeline legado de URL; os tipos `ChameleonVisionResult` e `chameleonResultToDesignTokens` permanecem em `shared/postspark.ts` como utilitários compartilhados.
- A diversidade das tres variacoes e validada por similaridade Jaccard de palavras e igualdade de alguns campos. Nao ha comparacao semantica com posts salvos, geracoes anteriores, concorrentes, frases do site ou cliches do setor.
- `post.evaluateQuality` existe como endpoint separado, mas nao e chamado automaticamente pelo fluxo principal. Sua avaliacao nao inclui uma dimensao especifica de originalidade nem de aderencia aos objetivos do site.
- O parametro `model` recebido por `invokeLLM` permanece para compatibilidade, mas a selecao efetiva de provedor/modelo e feita por `taskRoute`; chamadas sem rota explicita usam OpenRouter/GPT-5 mini, e chamadas multimodais usam `vision_analysis` com fallback Gemini.
- No modo execution, `brandInput.websiteUrl` e incluido como texto no briefing, mas nao aciona a extracao de Brand DNA dentro de `post.generate`, pois a requisicao usa `inputType: "text"`.

Riscos confirmados:

1. Temas do HoloDeck e posts gerados podem refletir interpretacoes diferentes do mesmo site.
2. Temas visualmente coerentes podem ser semanticamente inadequados ao produto, publico ou objetivo do site.
3. Variacoes lexicalmente diferentes podem continuar sendo conceitualmente genericas ou pouco originais.
4. A avaliacao de qualidade pode existir no backend sem proteger efetivamente a entrega principal.
5. O seletor de modelo permanece como compatibilidade de contrato; a decisao efetiva ocorre no backend por `taskRoute`, com OpenRouter como rota principal e Gemini como fallback.

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
- Candidatos reprovados podem passar por uma unica revisao cirurgica orientada apenas pelo candidato, pela estrategia daquele indice e pela avaliacao daquele indice; nao ha loop aberto nem revisao do pacote inteiro quando apenas um item falha.
- Se a revisao falhar, o candidato original e preservado e `generationMeta.revisionFailed` marca o ocorrido; revisoes bem-sucedidas usam `generationMeta.revisionApplied`.
- Antes de acionar ou persistir resultados, guardas deterministicas reduzem textos longos, limitam hashtags e ajustam CTAs simples quando possivel.
- `PostVariation.generationMeta` registra estrategia, avaliacao, quantidade de revisoes e flags de revisao aplicada/falha.

### Modelos efetivos e observabilidade

- [`server/ai/modelRouter.ts`](./server/ai/modelRouter.ts) centraliza a matriz de IA por `taskRoute`, substituindo o default operacional baseado apenas em `gemini`/`llama`.
- OpenRouter PAYG e o caminho principal para geracao forte: `content_strategy`, `static_generation`, `carousel_generation`, `post_evaluation`, `quality_revision` e `vision_analysis` usam `OPENROUTER_TEXT_MODEL`/`OPENROUTER_VISION_MODEL`, com default `openai/gpt-5-mini`.
- Groq permanece na stack para tarefas curtas: `microcopy` usa `openai/gpt-oss-120b` e `fast_vision` usa `meta-llama/llama-4-scout-17b-16e-instruct`.
- Gemini direto (`gemini-2.5-flash` via Google ou Forge) nao e rota principal; ele e fallback apos erros transitorios, quota/429, 5xx ou indisponibilidade, controlado por `AI_MODEL_FALLBACK_ENABLED`.
- [`server/ai/providers/modelAdapters.ts`](./server/ai/providers/modelAdapters.ts) preserva `json_schema` nativo para OpenRouter/GPT-5 mini e Groq GPT-OSS; para Groq sem suporte explicito ou rejeicao 400/422, rebaixa para `json_object` com schema textual.
- Para `openai/gpt-oss-120b`, `invokeLLM` aplica defaults de estabilidade quando a chamada nao informa valores: `temperature: 0.45`, `top_p: 0.9`, `reasoning_effort: "low"` e `max_completion_tokens: 2048`.
- Para OpenRouter, `invokeLLM` aplica politica por `taskRoute`: `content_strategy` usa `reasoning_effort: "minimal"`, `temperature: 0.35`, `top_p: 0.85` e timeout de 12s; `static_generation` usa `minimal`, `0.4`, `0.85` e 35s; `carousel_generation` usa `low`, `0.45`, `0.85` e 60s; `post_evaluation` e `quality_revision` usam `minimal` com timeouts de 20s e 25s. Em todas essas rotas, o payload envia `reasoning: { exclude: true }` para evitar tokens de raciocinio na resposta.
- Chamadas OpenRouter sem politica especifica preservam defaults gerais: `temperature: 0.55`, `top_p: 0.9`, `max_tokens: 2048` e provider routing com `allow_fallbacks` e `data_collection: "deny"`.
- O pipeline principal aumenta o teto apenas onde precisa de mais saida estruturada: estrategia usa `1024`, slots estaticos usam `3072` na primeira tentativa e `2048` na tentativa curta, slots de carrossel usam `4096` e `3072`, e revisoes usam orcamento curto por candidato.
- A geracao principal por slot usa um prompt dedicado de exatamente uma variacao, sem carregar a instrucao global contraditoria de tres variacoes; o schema continua exigindo `variations` com um item por slot.
- Respostas estruturadas vazias ou truncadas (`finish_reason`/`native_finish_reason` de limite) sao classificadas como `empty_content` ou `truncated` e nao disparam reparo generico; falhas de estrategia caem no fallback deterministico, slots fazem no maximo uma tentativa curta adicional e revisao truncada preserva o candidato original.
- O trace registra `taskRoute`, tentativa, provedor, modelo efetivo, `fallbackFrom`, modo de saida estruturada (`native_schema` ou `text_schema`), parametros efetivos do payload, traducao de schema, reparo de output, `reasoningTokens`, `finishReason`, `nativeFinishReason`, `contentLength` e `structuredFailureType`.
- [`server/ai/generationTrace.ts`](./server/ai/generationTrace.ts) agrega chamadas, prompts, hashes, modelos, tokens, latencia e custo configuravel.
- [`drizzle/0006_add_generation_runs.sql`](./drizzle/0006_add_generation_runs.sql) cria `postspark.generation_runs` para estrategias, avaliacoes, revisoes e saidas.
- `.env.example` documenta `OPENROUTER_API_KEY`, modelos OpenRouter, taxa PAYG de 5,5%, `GEMINI_API_KEY`, `GROQ_API_KEY`, Supabase e taxas opcionais de custo por milhao de tokens.
- Snapshots visuais novos registram `snapshotVersion: 1`.

Mapa atual de uso de LLM:

- Texto/estrategia/geracao: `contentStrategy`, slots de `post.generate`, diversificacao, revisao de qualidade, `postEvaluation`, `postJudge`, `siteIntelligence` e `designPatternAnalyzer` usam OpenRouter/GPT-5 mini via `taskRoute`.
- Vision/multimodal criativa: `brandDNA.analyzeWithVision`, `visionExtractor.extractStylesFromScreenshot`, `post.autoPilotDesign` e slots de geracao com `inputType=image` usam OpenRouter/GPT-5 mini.
- Microcopy: `sentiment` usa Groq GPT-OSS por `taskRoute: "microcopy"`; novas legendas/CTAs/hashtags curtos devem seguir a mesma rota.
- Embeddings: `semanticOriginality` usa `@google/genai` com `gemini-embedding-001`; nao passa por `invokeLLM`.
- Imagem/background: `imageGenerateBackground` e `_core/imageGeneration` usam OpenRouter `OPENROUTER_IMAGE_MODEL` (Nano Banana 2 por default operacional) e mantem Pollinations apenas como fallback legacy.

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
- Sections permitem editar label, descricao, numero e icone, alem de selecao direta no canvas, movimento e largura.
- Sections novas continuam nascendo no fluxo responsivo do template (`feature-grid`, `numbered-list` ou `step-by-step`); `sectionLayouts` so e criado e persistido quando o usuario altera posicao, largura ou disposicao manualmente.
- Text elements avancados permitem editar texto, tipografia, cor, tamanho, rotacao, posicao, largura e altura.
- Formas decorativas automaticas de tema nao sao expostas como layers independentes.
- O recurso `post.autoPilotDesign` permanece implementado, mas o Workbench nao exibe acesso ao botao "Ajustar com IA" enquanto a experiencia estiver em revisao.
- O fluxo oficial do editor e `Home -> HoloDeck -> WorkbenchV2`; os componentes `Workbench`, `WorkbenchRefactored`, `ArchitectOverlayV2` e o antigo `EditorContext` foram removidos por nao integrarem a arvore ativa.
- `layoutToAdvanced` foi isolado em [`client/src/lib/layoutToAdvanced.ts`](./client/src/lib/layoutToAdvanced.ts) e continua atendendo o store, CanvasWorkspace e o fallback legado de SavedPosts.
- Componentes auxiliares exclusivos dos workbenches removidos tambem foram excluidos: `PostCard`, `DraggableCardOverlay`, `MagnetToggle`, `WorkbenchModeToggle`, `AdvancedModeToggle`, `AdvancedTextPropertyBar`, `AdvancedTextSidebar` e `TextFitIndicator`.
- O estado `isMagnetActive` permanece no Zustand porque e consumido por `CanvasWorkspace` e `PostCardV2` no snap do editor ativo.

### Contrato estrito de variacoes e editor

- [`shared/postspark.ts`](./shared/postspark.ts) define os contratos compartilhados `ImageSettings` e `AdvancedLayoutSettings`.
- [`client/src/types/editor.ts`](./client/src/types/editor.ts) e apenas uma fachada de reexportacao; nao mantem copias locais desses contratos.
- [`shared/postsparkSchemas.ts`](./shared/postsparkSchemas.ts) valida em runtime o mesmo estado visual nas rotas `post.save` e `post.update`, eliminando `z.any()` dos campos persistidos do editor.
- `PostVariation` nao aceita mais `any` em `layoutSettingsByAspectRatio`, `imageSettings`, `layoutSettings`, `bgValue` e `bgOverlay`.
- O alinhamento de `textElements.styles.textAlign` e restrito a `left`, `center` ou `right`.
- `editorStore.setPlatform` e `editorStore.setAspectRatio` sincronizam atomicamente plataforma e proporcao com `activeVariation` e `baseVariation`, evitando snapshots persistidos com metadados antigos.
- `editorStore.setActiveVariation` e a unica operacao de hidratacao usada por HoloDeck e SavedPosts; plataforma, proporcao, slides, background, imagem e layout entram no Zustand na mesma transacao.
- `post.autoPilotDesign` trata a geometria enviada em `currentState.elements` como ancora: preserva o posicionamento manual e limita sua atuacao a margens de seguranca, legibilidade, largura e microcorrecoes de sobreposicao ao adaptar o aspect ratio.
- `TheVoid` apresenta o progresso de geracao como parte nativa do fluxo do `SmartInput`: um trilho fino com etapa atual, tempo discreto, percentual secundario e nota suave para geracoes longas. A logica funcional continua centralizada em `getGenerationProgress`.

### Operacao, rollout e privacidade da IA

- [`drizzle/0008_add_generation_quality_metrics.sql`](./drizzle/0008_add_generation_quality_metrics.sql) adiciona metricas denormalizadas em `generation_runs`.
- Runs com falha e chamadas LLM com erro passam a ser rastreadas, alem das runs concluidas.
- `AI_TRACE_STORE_CONTENT=false` e o default: input e substituido por hash e prompts/outputs brutos nao sao persistidos.
- `admin.getGenerationMetrics` agrega conclusao, aceitacao, revisao, fallback, erros de chamada, qualidade, latencia, tokens e custo.
- `admin.getAiRollout` informa as flags efetivas, tambem exibidas no painel Admin.
- Flags independentes controlam Site Intelligence, estrategia LLM, juiz LLM e embeddings semanticos.
- [`docs/AI_OPERATIONS.md`](./docs/AI_OPERATIONS.md) documenta deploy, alertas, rollback, diagnostico e retencao.
- [`OPERATIONAL_ERRORS.txt`](./OPERATIONAL_ERRORS.txt) recebe entradas append-only geradas por [`server/_core/operationalLog.ts`](./server/_core/operationalLog.ts), com timestamp ISO, `console.error`, excecoes nao tratadas, respostas HTTP com status diferente de 200, chamadas de provedores de IA com status 200 ou erro, e o ciclo completo de `post.generate` (`POST_GENERATION_REJECTED`, `POST_GENERATION_STARTED`, `POST_GENERATION_COMPLETED`, `POST_GENERATION_FAILED`). Sucessos de geracao registram `generationRunId`, metadados, chamadas LLM, validacao final e resumo das variacoes retornadas. O logger redige tokens/cookies/autorizacao e trunca campos longos para reduzir risco de vazamento e crescimento excessivo.

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

- Preview, edicao e exportacao usam o fluxo normal do template quando nao ha
  `layoutSettings.sectionLayouts` explicito. Variacoes novas nao recebem
  coordenadas artificiais ao entrar no Workbench.
- Quando somente algumas sections possuem posicao manual, o fluxo preserva
  placeholders invisiveis para manter a geometria das demais e sobrepoe apenas
  os itens explicitamente movidos.
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

4. ~~Validar o endpoint `post.listBackgrounds` e o formato real dos paths retornados.~~ Resolvido: paths corrigidos para URLs codificadas sem espaços.
5. Revisar e alinhar `docs/` legados ao estado atual do código, ou marcar claramente o que é histórico.

## 25. Design system do PostSpark - 2026-06-16

Fato observado:

- [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md) documenta o design system atual do PostSpark com base no código ativo.
- A documentação separa duas camadas: a interface dark studio do produto e o sistema visual dos posts gerados.
- A UI do app usa Tailwind CSS 4, shadcn/Radix, tokens CSS em [`client/src/index.css`](./client/src/index.css), ícones `lucide-react`, Framer Motion e componentes próprios como `GlassCard`, `SmartInput`, `OrganicBackground` e `SparkLogo`.
- O tema operacional é dark-only na prática, pois [`client/src/App.tsx`](./client/src/App.tsx) monta `ThemeProvider` com `defaultTheme="dark"` sem alternância habilitada.
- O sistema visual dos posts é centralizado em [`client/src/components/PostRenderer.tsx`](./client/src/components/PostRenderer.tsx), [`client/src/components/ThemeRenderer.tsx`](./client/src/components/ThemeRenderer.tsx), [`client/src/components/views/WorkbenchV2/PostCardV2.tsx`](./client/src/components/views/WorkbenchV2/PostCardV2.tsx), [`client/src/lib/themes.ts`](./client/src/lib/themes.ts) e no contrato `DesignTokens` de [`shared/postspark.ts`](./shared/postspark.ts).
- `guia_design.md` permanece como referência conceitual para composição de posts, mas não deve ser tratado como fonte primária da UI atual.

Lacunas registradas:

- `--bg-panel` e `--accent-primary` aparecem em alguns componentes com fallback local, mas não foram encontrados como tokens globais definidos em `client/src/index.css`.
- Existem tokens legados e novos coexistindo em `client/src/index.css`, incluindo nomes de Captain/Architect que ainda aparecem em componentes específicos.

## 26. Brand Soul Guardian e fonte unica da verdade de cores - 2026-06-17

Contexto da mudanca:

- A geracao por URL apresentava inconsistencia de cores entre HoloDeck e Workbench, e o passo de QA visual baseado em LLM falhava de forma recorrente.
- `siteIntelligenceToDesignTokens` devolvia cores neutras que ignoravam o palette extraido do site.
- O editorStore ignorava completamente `aspectRatioOptimizations`, usando apenas o nivel superior da variacao para derivar cores e `bgValue`.

Comportamento implantado:

- [`server/siteIntelligence.ts`](./server/siteIntelligence.ts) agora possui utilitarios de cor (WCAG, brilho, saturacao) e escolhe `primary` como a cor mais saturada do palette, `background` como a cor escura adequada da marca, e `text` com contraste WCAG >= 4.5:1.
- `siteIntelligenceToPrompt` emite regras de CORES OBRIGATORIAS explicitas.
- [`server/ai/brandVisualGuardian.ts`](./server/ai/brandVisualGuardian.ts) substitui o LLM `brand_visual_qa` por correcao deterministica (snap de palette + WCAG).
- [`client/src/lib/variationSnapshot.ts`](./client/src/lib/variationSnapshot.ts) expoe `applyAspectRatioToVariation(variation, aspectRatio)`: aplica `aspectRatioOptimizations[aspectRatio]` sobre a variacao. Esta e a "fonte unica da verdade" usada por HoloDeck e Workbench.
- `editorStore.setActiveVariation` aplica o helper ANTES de derivar cores e `bgValue`.
- `editorStore.setAspectRatio` aplica o helper ao trocar de formato, atualizando cores e recriando `bgValue`.
- HoloDeck `getPreviewVariation` aplica o helper ao aspect ratio atual.

Contrato de prioridade de cor por aspect ratio:

1. `aspectRatioOptimizations[aspectRatio].backgroundColor/textColor/accentColor`
2. `variation.backgroundColor/textColor/accentColor` (nivel superior)
3. `variation.designTokens.colors.*`
4. fallback neutro (`#171717` / `#a855f7` / `#ffffff`)

## 27. Snapshot visual canônico e handoff imutável - 2026-06-23

Esta seção substitui as descrições anteriores que tratavam apenas cores ou que afirmavam que a equivalência HoloDeck/Workbench era garantida por convenção.

### Contrato oficial

O fluxo canônico é:

`post.generate -> PostVariation bruta -> createPostVisualSnapshot -> PostVisualSnapshot v2 -> HoloDeck -> editorStore.visualSnapshot -> Workbench/exportacao/post.save`

Fatos observados:

- A API continua retornando `variations`; não houve quebra do contrato público de geração.
- `client/src/lib/variationSnapshot.ts` é a única fronteira autorizada a resolver otimizações por aspect ratio, cores, `designTokens`, layout avançado, background, imagem, overlay, sections e defaults.
- O HoloDeck renderiza o snapshot completo, inclusive `designTokens`, e entrega ao editor exatamente o snapshot confirmado pelo usuário.
- Durante a troca de Motor de Famílias (em `adaptContentForFamily`), o campo legado `aspectRatioOptimizations` deve ser expurgado (`undefined`). Caso contrário, sua precedência (definida em regras legadas) sobrescreverá silenciosamente os novos `designTokens` e layouts ao entrar no Workbench.
- `editorStore.visualSnapshot` é o documento autoritativo durante a edição. Os campos históricos `activeVariation`, `baseVariation`, `slides`, `imageSettings`, `layoutSettings`, `bgValue` e equivalentes permanecem como projeções compatíveis para os controles existentes e são sincronizados atomicamente por `setWithSnapshot`.
- `PostRenderer` projeta overrides de `slides[].editorState` somente para leitura. Essa projeção não promove o slide atual para o nível-base do documento.
- `Home.handleSave` persiste diretamente `editorStore.visualSnapshot`; ele não reconstrói o post combinando fontes independentes.
- Posts salvos v1 e registros legados são normalizados em memória para v2. O schema aceita snapshots v1 para leitura e v2 para novas gravações.
- A restauração de histórico também atravessa a mesma fronteira canônica antes de retornar ao HoloDeck.

### Invariantes de manutenção

1. Renderers não resolvem design e não removem campos do snapshot.
2. Toda ação editável precisa atualizar `visualSnapshot` na mesma transação do Zustand.
3. Salvamento, exportação e canvas leem `visualSnapshot`, nunca uma remontagem ad hoc de projeções internas.
4. Tema ou customização explícita atualiza o próprio snapshot, mantendo cores top-level e `designTokens.colors` coerentes.
5. Troca de formato passa novamente pelo normalizador canônico e produz um snapshot completo para a proporção escolhida.
6. Overrides do slide atual permanecem serializados em `slides[].editorState`.
7. Uma mudança estrutural no snapshot exige nova versão, fallback para versões anteriores, testes e atualização deste documento.

### Proteção contra regressões

Os testes de `client/src/lib/variationSnapshot.test.ts` validam normalização completa, otimização por formato, sincronização de tokens, handoff HoloDeck/Store/Save e isolamento de overrides de carrossel. `shared/postsparkSchemas.test.ts` valida o contrato persistível. Esses testes são obrigatórios em refatorações do fluxo visual.

## 28. Auditoria do motor de interação do Workbench - 2026-06-23

Fatos confirmados no código:

- O fluxo ativo possui três semânticas de geometria/interação: `DraggableBlock`
  usa percentual com origem central; `AdvancedTextNode` usa pixels com origem no
  canto superior esquerdo e corrige a escala do workspace; `ImageElementBlock`
  usa pixels com origem no canto superior esquerdo, mas não corrige o delta pela
  escala CSS externa.
- Blocos comuns mantêm preview local e atualizam o Zustand ao final do drag.
  Textos avançados e imagens atualizam o Zustand em cada `pointermove`, fazendo
  `setWithSnapshot` reconstruir `visualSnapshot` repetidamente durante o gesto.
- O ímã atual é snap para uma grade fixa de coordenadas percentuais entre 10% e
  90%. Ele não calcula alinhamento com outros elementos e não constitui smart
  guides.
- `useResizeElement` possui ciclo próprio, suporta apenas alteração de largura e
  não tem rollback explícito para `pointercancel`, embora `DraggableBlock`
  apresente oito handles visuais.
- `AdvancedTextCanvas` e `AdvancedTextSelectionBox` não possuem consumidores no
  fluxo ativo.
- A Fase 0 da reforma corrigiu a perda silenciosa de `imageElements`:
  `ImageElement` passou a ser contrato compartilhado e o schema Zod preserva o
  campo tanto na raiz do snapshot quanto em
  `slides[].editorState.variation`.
- `variationSnapshot` continua sendo a única persistência autoritativa de
  imagens livres; não foi criado campo legado, coluna ou parâmetro tRPC
  paralelo e `snapshotVersion` permanece em v2.
- A projeção `editorStore.imageElements` foi removida. As APIs públicas
  `addImageElement`, `removeImageElement` e `updateSingleImageElement` agora
  derivam o conjunto da variação ativa e delegam a `updateVariation`.
- Em carrossel, `applyScope=current` grava somente no override do slide atual;
  `applyScope=all` usa o conjunto efetivo do slide atual como autoritativo e o
  aplica à raiz e a todos os slides. IDs duplicados ou inexistentes são no-op e
  não reconstroem o snapshot.
- Testes cobrem schema raiz/slide, posts estáticos, isolamento de carrossel,
  propagação global, no-ops e round-trip
  `Store -> Snapshot -> Zod -> JSON -> Restore`.
- Não existe histórico transacional undo/redo para ações do editor.

Decisão arquitetural registrada:

- A reforma será incremental e preservará `visualSnapshot` como documento
  autoritativo.
- O novo núcleo usará document space em pixels lógicos e estado transitório
  separado, com adapters para os contratos v2 existentes.
- Cada gesto terá preview transitório, um único commit no `pointerup` e rollback
  em cancelamento.
- A unificação do contrato persistido ficará para um snapshot v3 posterior à
  estabilização do motor.
- A renderização DOM e o `PostRenderer` comum serão preservados; não há evidência
  de que uma migração para Fabric, Konva, Canvas 2D ou WebGL seja necessária.
- Smart guides permanecem no backlog até a migração de blocos, textos e imagens
  para o controlador comum.

Plano detalhado:

- [`docs/canva/PLANO_REFORMA_MOTOR_WORKBENCH.md`](./docs/canva/PLANO_REFORMA_MOTOR_WORKBENCH.md)

## 29. Kernel geométrico puro do Workbench - 2026-06-23

A Fase 1 da reforma introduziu `client/src/editor/geometry/` como núcleo
matemático independente para as próximas migrações do Workbench. O kernel ainda
não possui consumidores em runtime; portanto, esta fase não altera o
comportamento visual ou interativo atual.

Contrato implementado:

- Tipos opacos distinguem pontos, deltas, retângulos e dimensões em screen space
  e document space, além de pontos percentuais, viewport, geometria de elemento
  e os oito handles de resize.
- Construtores públicos rejeitam números não finitos e dimensões inválidas,
  normalizam `-0` e aceitam retângulos de tamanho zero somente nos contratos em
  que isso é geometricamente válido.
- `createCanvasViewport` deriva as escalas a partir do retângulo em CSS pixels e
  do canvas lógico, sem aplicar `devicePixelRatio`. Diferenças relativas de até
  0,1% entre os eixos são toleradas; deformações superiores são rejeitadas.
- Transformações puras cobrem pontos, deltas, retângulos e tolerâncias entre
  tela e documento nos dois sentidos.
- Operações de bounds cobrem centro, translação, união, rotação normalizada,
  bounds de retângulos rotacionados e conversão entre centro percentual e
  retângulo no documento.
- Constraints cobrem clamp numérico, de ponto e de retângulo, centralização com
  overflow simétrico quando o elemento excede o canvas e resize pelos oito
  handles, com mínimos e bounds opcionais preservando a borda oposta.

Limites arquiteturais confirmados:

- O kernel não importa React, Zustand, DOM, contratos compartilhados ou
  `variationSnapshot`, e não lê `HTMLElement` ou `DOMRect`.
- `useDragElement`, `useResizeElement`, `DraggableBlock`, textos, imagens, store,
  snapshot e persistência permanecem inalterados nesta fase.
- A adaptação de eventos de ponteiro e o estado transitório pertencem à Fase 2;
  a substituição dos motores concorrentes começa somente com os adapters da
  Fase 3.
- Os testes unitários do kernel cobrem 34 casos; após sua inclusão, a suíte
  completa possui 137 testes passando.

## 30. FSM e sessão transitória do Workbench - 2026-06-23

A Fase 2 introduziu `client/src/editor/interaction/` como motor de interação
isolado. Ele ainda não possui consumidores em runtime e, portanto, não altera o
drag, o resize ou a renderização atuais do Workbench.

Contrato implementado:

- A interação é representada por uma união discriminada com os estados `idle`,
  `pressing`, `dragging`, `resizing`, `committing` e `cancelling`.
- O controller expõe início, preview, commit, cancelamento, leitura, assinatura
  e descarte da sessão. Uma segunda interação é rejeitada enquanto houver um
  ponteiro ativo e eventos de outros ponteiros são ignorados.
- O limiar de 5 CSS pixels é calculado em screen space e permanece independente
  do zoom. A geometria transitória usa o viewport capturado no início para
  converter movimentos ao document space da Fase 1.
- Drag e resize delegam ao kernel geométrico translação, constraints, bounds e
  os oito handles. A rotação original é preservada.
- Movimentos físicos são coalescidos por uma `FrameScheduler`; `pointerup`
  cancela o frame pendente e processa a posição final antes do commit.
- Captura e liberação do ponteiro atravessam uma `PointerCapturePort`. Falha de
  captura rejeita o gesto; falhas de liberação ou commit não impedem a limpeza
  do estado transitório.
- Clique abaixo do limiar e geometria final idêntica à inicial não geram commit.
  Cancelamento, Escape, invalidação de viewport, desmontagem e descarte também
  encerram a sessão sem commit.
- O transient store é próprio, imutável e independente de Zustand. O motor não
  importa React, DOM, contratos compartilhados, `editorStore` ou
  `variationSnapshot`.

Fronteira arquitetural:

- A Fase 2 garante no máximo uma chamada ao `InteractionCommitPort` por gesto.
- Não foi criada uma ação provisória em `editorStore` e nenhum snapshot é
  reconstruído durante preview.
- O primeiro `setWithSnapshot` real e sua semântica `current/all` serão
  implementados e comprovados junto ao adapter de blocos da Fase 3.
- Adapters v2, hooks React e migração de elementos permanecem fora desta fase.
- Os testes unitários do motor cobrem 35 casos; após sua inclusão, a suíte
  completa possui 172 testes passando.

## 31. Motor único de interação e desconcentração do Workbench - 2026-06-23

As Fases 3, 4 e 5 conectaram o kernel e a FSM ao Workbench ativo. Esta seção
substitui o diagnóstico anterior de motores concorrentes como descrição do
runtime atual; aquele diagnóstico permanece apenas como histórico da reforma.

Contrato vigente:

- Blocos percentuais, sections, card, textos avançados e imagens livres iniciam
  gestos pelo mesmo `CanvasInteractionProvider` e pelo mesmo controller.
- O provider pertence ao stage editável do `CanvasWorkspace`, captura viewport
  e geometria no início do gesto, mantém preview transitório e cancela em
  Escape, resize, mudança de slide/aspect ratio, carregamento de fonte ou
  desmontagem.
- `editorStore.commitGeometry` é a única fronteira geométrica persistente. Cada
  gesto gera no máximo um `setWithSnapshot`; movimentos de ponteiro não escrevem
  no Zustand nem reconstroem `visualSnapshot`.
- O commit preserva a semântica de carrossel: `current` altera apenas o override
  ativo; `all` replica o conjunto efetivo para raiz e slides; IDs ausentes e
  geometrias inalteradas são no-op.
- `TextElement` e `ImageElement` são contratos compartilhados. Resize de texto é
  horizontal, com mínimo de 24 px e altura `auto`; resize de imagem usa quatro
  cantos, proporção preservada e mínimo de 40 x 40 px. Imagens com altura `auto`
  mantêm `auto` no snapshot.
- Bounds visuais consideram rotação. Elementos maiores que o canvas mantêm
  overflow simétrico segundo as regras do kernel.

Desconcentração originalmente pretendida (reavaliada em 2026-06-23):

- A primeira implementação de `InteractiveElement` centralizava apenas handlers
  básicos e registro. Medição, seleção e início ainda estavam distribuídos entre
  bloco, texto e imagem. Essa lacuna foi corrigida pela Fase 5.1 descrita abaixo.
- `InteractionOverlay` é irmão de `data-post-export-root`; outlines, handles,
  exclusão e a grade temporária não pertencem à árvore exportável.
- `PostRenderer`, `PostCardV2` e `ThemeRenderer` não importam o `editorStore`.
  O stage injeta `PostEditorBindings` apenas em modo de edição; preview e export
  consomem exclusivamente o snapshot projetado.
- Edição de conteúdo, seleção e exclusão continuam comandos semânticos separados
  de geometria.
- `AdvancedTextCanvas`, `AdvancedTextSelectionBox`, `useDragElement` e
  `useResizeElement` foram removidos após inspeção de consumidores.
- AutoPilot/captura, loading e controles de ímã/carrossel foram extraídos do
  `CanvasWorkspace` para módulos próprios.

Não houve mudança de schema nem incremento de `snapshotVersion`: os campos
alterados já pertenciam ao contrato v2. Smart guides, rotação interativa, crop,
undo/redo e snapshot v3 continuam fora deste escopo.

Validação em 2026-06-23: typecheck, 133 testes focados e a suíte completa com
25 arquivos/218 testes passaram; a
inspeção estática confirmou ausência dos motores antigos e de imports do store
nos renderers. A validação visual automatizada permanece pendente porque o
runtime de browser da sessão não estava disponível; o plano mantém as Fases 3,
4 e 5 em estado de validação até esse gate ser executado.

## 32. Invariância do primeiro gesto do Workbench — 2026-06-23

Fato confirmado no código e em teste React/DOM:

- A causa do primeiro drag irregular era a troca estrutural de
  `DraggableBlock` ao cruzar o slop: o nó capturado passava do ramo flow para um
  fragmento com placeholder e outro ramo absoluto durante o gesto.
- `DraggableBlock` agora mantém um único `HTMLElement` interativo. O espaço de
  flow é preservado por um shell sem duplicar conteúdo, e o preview usa
  `translate3d` relativo à geometria inicial. A conversão para absoluto ocorre
  somente após o commit.
- `CanvasInteractionProvider` recebe a referência explícita de
  `data-post-export-root`; todo viewport é derivado desse canvas lógico. Um
  container interno pode posicionar CSS, mas não cria outro document space.
- `ElementRegistry` armazena um descriptor por target com node, containing
  block, resolução de geometria, constraints, handles, seleção e elegibilidade
  de snap. `useInteractiveElement` é a API comum usada por blocos, texto e
  imagem.
- O clamp de drag preserva overflow inicial: o primeiro frame não corrige uma
  geometria antiga, e movimentos que aumentariam o overflow são bloqueados.
- Loading de imagem e fonte cancela somente a sessão do target afetado.
- O overlay mede geometria em layout effect, usa o draft transitório durante o
  gesto e não executa `getBoundingClientRect()` durante render.
- Controller e overlay são montados apenas em modo de edição; export continua
  contendo somente `data-post-export-root`.

Validação automatizada:

- `happy-dom` é a única nova dependência de desenvolvimento.
- O teste `firstDrag.dom.test.tsx` monta React diretamente com
  `react-dom/client` e comprova identidade do nó, captura contínua e ausência de
  `lostpointercapture` por reconciliação.
- Typecheck e 140 testes focados passaram após a estabilização.

Lacuna ainda aberta:

- A matriz visual completa dos três formatos, cinco escalas e escopos de
  carrossel não foi executada porque os runtimes de browser disponíveis na
  sessão estavam indisponíveis. Por isso Fases 3–5 permanecem reabertas, e
  Snapshot v3, histórico e smart guides não foram iniciados.

## 33. Reauditoria da reforma do Workbench — 2026-06-24

A validação posterior com browser confirmou que as Fases 3–5 continuam
reabertas e identificou regressões que não aparecem na suíte unitária atual.

Fatos confirmados:

- `buildVariationSnapshot` promove `textElements` efetivos do slide atual para a
  raiz do snapshot de carrossel; overrides de slide, portanto, ainda podem vazar
  para o documento-base.
- Drag básico de texto e imagem funciona, e `applyScope=current` restaura a
  geometria correta ao navegar entre slides.
- Resize por handles não foi determinístico na validação browser e permanece
  reprovado até receber teste E2E estável.
- Geometria livre editada em 1:1 pode colidir com conteúdo estrutural ao trocar
  para 9:16, confirmando a necessidade de geometria independente por formato no
  snapshot v3.
- A exportação não produziu um download observável dentro de 30 segundos no
  cenário auditado e permanece sem gate de aceite.
- `InteractionOverlay` mede DOM em layout effect sempre que o estado transitório
  muda; essa leitura por frame contradiz a meta de fluidez da reforma.
- O ciclo `register -> update -> cleanup` pode manter descriptor órfão porque o
  cleanup compara a identidade anterior à atualização.
- A tela de histórico falha no ambiente auditado porque o runtime ordena
  `generation_runs` por `createdAt`, coluna ausente no banco acessado.

O plano normativo de recuperação, com ordem de entregas, contratos e gates, está
em [`docs/canva/PLANO_RECUPERACAO_DEFINITIVA_WORKBENCH.md`](./docs/canva/PLANO_RECUPERACAO_DEFINITIVA_WORKBENCH.md).

## 34. Correções pós-auditoria Qwen do Workbench — 2026-06-25

Após leitura dos relatórios em
[`docs/canva/auditoria-qwen/`](./docs/canva/auditoria-qwen/), a revisão humana
assistida por Codex reclassificou parte dos achados:

- O relatório Qwen foi útil como coleta inicial, mas superestimou a conclusão
  de que exportação e validação visual estavam corretas. A validação browser
  completa continua obrigatória.
- O vazamento de `textElements` do slide atual para a raiz do snapshot de
  carrossel, registrado na seção anterior, foi reavaliado no código atual:
  `buildVariationSnapshot` usa a variação base como fonte canônica em posts de
  carrossel, e há testes específicos cobrindo `scope=current`, `scope=all` e
  navegação entre slides. A correção ainda depende da suíte permanecer verde.
- O logger HTTP atual só registra `statusCode >= 400`, então o diagnóstico de
  304 como erro não é mais fato confirmado no código atual; permanece apenas
  como histórico operacional se `OPERATIONAL_ERRORS.txt` contiver linhas antigas.

Correções aplicadas nesta rodada:

- `WorkbenchV2.handleExport` agora trata corretamente o caso em que
  `canvasRef.current` é o próprio `data-post-export-root` e passa o root
  exportável para `html2canvas`. Antes, `querySelector("[data-post-export-root]")`
  procurava apenas descendentes e podia abortar a exportação com
  `Export root element not found`.
- `post.listBackgrounds` agora retorna URLs públicas sem espaços e com segmentos
  codificados: `/images/backgrounds/<categoria>/<arquivo>`.
- A migração `drizzle/0009_normalize_generation_runs_created_at.sql` teve a
  condição idempotente corrigida para testar separadamente `createdAt` e
  `created_at`.
- Logs quentes e/ou com risco de vazamento foram removidos de `PostCardV2`,
  `editorStore.setBgValue`/`cloneBgValue`, `post.generateBackground`,
  `post.extractStyles` e `server/imageGenerateBackground.ts`.

Validação desta rodada:

- `npm run check` passou.
- `npm test` passou com 28 arquivos e 240 testes.
- `git diff --check` passou para os arquivos alterados.

Pendências mantidas:

- Validar exportação em browser gerando PNG real e confirmando ausência de
  overlays/controles.
- Validar matriz visual de drag/resize em 1:1, 5:6 e 9:16, com escalas e
  carrossel.
- Schema real do Supabase para `generation_runs.created_at` foi confirmado e a
  base High Ticket foi aplicada via Supabase MCP em 2026-07-07. Pendencias
  restantes de `/history`, se houver, devem ser tratadas no codigo de consumo.

## 35. Ajustes pós-teste manual de HoloDeck e interação — 2026-06-25

O teste manual posterior identificou três sintomas:

- O mesmo post aparecia desalinhado no HoloDeck, mas correto no Workbench.
- Drag/drop e resize de elementos estruturais continuavam instáveis; em
  contraste, imagens livres adicionadas pelo botão "Adicionar imagem" tinham
  drag, resize, exclusão e seleção funcionando corretamente.
- As guias/ímã de alinhamento podiam estar interferindo ou ainda não estavam
  suficientemente validadas.

Correções aplicadas:

- `HoloDeck.getPreviewVariation` deixou de re-normalizar snapshots que já têm
  `snapshotVersion`. O preview agora preserva o `PostVisualSnapshot` recebido e
  só normaliza objetos legados sem versão. Isso reduz divergência visual entre
  HoloDeck e Workbench.
- `DraggableBlock` passou a expor handles horizontais também para blocos ainda
  em fluxo, evitando o estado com apenas um handle clicável. Não foram adotados
  handles de canto para blocos estruturais porque o contrato atual persiste
  largura e centro, mas não altura; usar cantos sugeriria um resize vertical que
  o snapshot não salvaria.
- `isMagnetActive` agora inicia desligado no store e no reset. O snap/guia fica
  disponível pelo botão "Ímã", mas não interfere por padrão enquanto a matriz
  visual das guias não for validada.

Pendência específica:

- Revalidar manualmente HoloDeck versus Workbench usando o mesmo post gerado.
- Testar drag/resize de headline/body/sections com ímã desligado e ligado.
- Se as guias ainda forem necessárias para a próxima entrega, validar
  `snapEngine` em browser antes de deixá-las ativas por padrão novamente.

## 36. Correção do shell vazio e da caixa grande em blocos estruturais — 2026-06-25

Novo teste manual mostrou que, ao arrastar um bloco estrutural em fluxo
(`headline`, `body` ou `section`), o texto podia ser movido para baixo enquanto
um retângulo vazio permanecia no local original. Também foi observado que a
caixa de seleção/resize era maior que o conteúdo real, obrigando o usuário a
redimensionar antes de alinhar.

Causa identificada:

- `DraggableBlock` criava um `flowFootprint` para preservar o espaço durante o
  primeiro drag, mas o wrapper podia continuar com esse footprint mesmo depois
  que o bloco passava a ser absoluto.
- O commit de drag de um bloco em fluxo persistia apenas `freePosition`; quando
  o bloco não tinha largura explícita, ele podia continuar usando `width: 100%`
  como absoluto, gerando caixa grande e desalinhamento.

Correções aplicadas:

- O `flowFootprint` agora só fixa tamanho enquanto o bloco ainda está em fluxo;
  depois que `freePosition` existe, o shell deixa de reservar espaço vazio.
- O primeiro drag de bloco em fluxo também persiste a largura medida quando o
  layout ainda não tinha `width` explícito.
- Em modo editável, blocos sem largura explícita usam `fit-content` com
  `maxWidth: 100%` como largura inicial, aproximando a caixa de interação do
  conteúdo real sem alterar preview/export.

Validação automatizada:

- `npm run check` passou.
- Testes focados de `layoutPositionAdapter`, `blockInteraction`,
  `firstDrag.dom` e `editorStore` passaram.

Pendência:

- Revalidar visualmente no Workbench se o drag de título, corpo e itens de lista
  deixou de criar shell vazio e se a caixa inicial ficou próxima do conteúdo.

Complemento a partir de vídeo manual:

- O vídeo `video_postspark.mp4` confirmou que blocos estruturais absolutos ainda
  eram renderizados dentro de um wrapper `position: relative` criado para o fluxo.
  Assim, `left/top` eram calculados contra o wrapper antigo em vez do canvas/card,
  causando salto, truncamento e colisão com outros itens.
- O wrapper de `DraggableBlock` agora usa `display: contents` quando o bloco já
  tem `freePosition`, permitindo que o absoluto seja posicionado pelo ancestral
  correto do card.
- A medição de `flowFootprint` deixou de ocorrer no `pointerdown`. Antes, apenas
  clicar em um elemento já podia alterar largura/altura visual. Agora a medição
  só ocorre quando o estado realmente entra em `dragging`.

Validação adicional:

- `npm run check` passou.
- Testes focados de `blockInteraction`, `firstDrag.dom`, `editorStore` e
  `layoutPositionAdapter` passaram após o ajuste do vídeo.

## 37. Ajustes finais de handoff HoloDeck -> Workbench e overlay de interação — 2026-06-25

Novo teste manual após a estabilização do drag mostrou melhora importante, mas
ainda havia três sintomas:

- às vezes era necessário clicar para selecionar antes de arrastar;
- em algumas movimentações a seleção/overlay parecia acompanhar outro elemento;
- variações exibidas em 1:1 no HoloDeck podiam chegar ao Workbench em 5:6.

Correções aplicadas:

- `HoloDeck.handleSelect` agora passa para o callback `onSelect` o
  `aspectRatio` real do `PostVisualSnapshot` selecionado
  (`selectedSnapshot.aspectRatio`) em vez de sempre reutilizar o estado local do
  seletor de formato. Isso remove uma divergência possível entre o snapshot
  autoritativo carregado no Zustand e o parâmetro entregue ao fluxo pai.
- `InteractionOverlay` agora só usa o draft transitório quando
  `interactionState.initial.id === layoutTarget`. Com isso, um re-render durante
  press/drag não deve desenhar caixa de seleção de outro elemento enquanto o
  registry e o store convergem.

Observação operacional:

- O primeiro clique em um elemento seleciona o alvo; o movimento só vira drag
  depois do limiar de interação (`DEFAULT_INTERACTION_SLOP_PX`, hoje 5px).
  Movimentos muito curtos podem, portanto, parecer apenas seleção. Isso é
  esperado para evitar drag acidental; se a experiência ainda parecer
  inconsistente, o próximo ajuste deve reduzir o slop ou iniciar drag em
  `pointerdown` apenas para elementos já selecionados.

Validação desta rodada:

- Testes focados passaram: `blockInteraction`, `firstDrag.dom`, `editorStore` e
  `variationSnapshot` (43 testes).
- `npm run check` foi executado, mas ficou bloqueado por dependência ausente
  preexistente (`react-helmet-async`) usada por `Cookies.tsx`, `Privacy.tsx`,
  `PrivacySettings.tsx` e `Terms.tsx`. Esse bloqueio não foi introduzido pelos
  ajustes de Workbench desta rodada.

## 38. Preservação de fluxo ao mover blocos estruturais — 2026-06-25

Novo teste manual mostrou que, mesmo com o elemento arrastado posicionado
corretamente, mover o título ainda podia "empurrar" ou "puxar" outros blocos.

Causa identificada:

- `headline`, `body` e `section:*` ainda nascem dentro do fluxo estrutural do
  template. No primeiro drag, o bloco movido recebe `freePosition` e passa a ser
  absoluto. Se o shell de fluxo colapsa nesse momento, os irmãos que continuam
  em fluxo ocupam o espaço liberado. Visualmente isso parece que mover um
  elemento mexe em outro.

Correção aplicada:

- `DraggableBlock` agora mantém um espaçador invisível com a largura/altura
  medidas durante o primeiro drag mesmo depois que o bloco passa a ter
  `freePosition`.
- O elemento real continua absoluto e posicionado pelo canvas/card; o espaçador
  só preserva o fluxo dos irmãos e não deve desenhar borda, overlay ou área
  clicável antiga.
- Para elementos que já chegam absolutos sem uma medição de primeiro drag, o
  wrapper continua usando `display: contents`, preservando o posicionamento
  correto contra o canvas.

Validação desta rodada:

- `firstDrag.dom.test.tsx` agora cobre que o shell de fluxo permanece com
  dimensões após o primeiro drag.
- Testes focados passaram: `firstDrag.dom`, `blockInteraction`, `editorStore` e
  `variationSnapshot` (43 testes).

## 39. Estabilização da exportação PNG do Workbench — 2026-06-25

Diagnóstico confirmado após teste manual com arquivo exportado:

- O PNG exportado em formato 5:6 saía com `2160 x 2592`, quando o contrato
  esperado para a base lógica de 360 px com escala 3 é `1080 x 1296`.
- A causa era a captura pelo `html2canvas` incorporar o `transform: scale(...)`
  usado apenas para zoom visual do workspace, somando esse zoom à escala de
  exportação.
- Além disso, blocos fixos do card sem largura explícita, como `headline` e
  `body`, podiam divergir entre `edit` e `export`: em edição eles usavam largura
  visual aproximada por `fit-content`, enquanto no modo exportável voltavam para
  `100%`.

Correção aplicada:

- `WorkbenchV2.handleExport` agora mede `offsetWidth` e `offsetHeight` da raiz
  `data-post-export-root` e passa essas dimensões lógicas explicitamente ao
  `html2canvas`.
- No clone interno do `html2canvas`, transforms de ancestrais da raiz exportada
  são neutralizados para impedir que o zoom do editor altere dimensão ou métricas
  do PNG.
- `PostCardV2` preserva, apenas em `mode="export"`, a largura padrão
  `fit-content` dos blocos fixos do card que ainda não têm `layoutSettings.width`,
  espelhando a aparência do Workbench sem alterar drag, resize, store,
  snapshot ou interações do editor.

Validação:

- `npm run check` continua bloqueado pela dependência ausente preexistente
  `react-helmet-async` nas páginas `Cookies`, `Privacy`, `PrivacySettings` e
  `Terms`; o bloqueio já estava registrado antes desta correção.

## 40. Simplificação do Workbench pós-auditoria — 2026-06-25

Base: `plano-workbench-audit.md` (executado fase a fase, commit por fase).

Objetivo: remover duplicidade e ambiguidade nos controles do Workbench sem tocar
no motor de interação, no snapshot ou na persistência. Nenhuma mudança de
contrato (`shared/postspark.ts`, `PostVisualSnapshot`) foi feita.

### Fronteira funcional canônica adotada

Cada ação primária passa a ter um único dono visível:

- **Texto** (`FontColorBlock` + `CaptionBlock`): família de fonte, escala,
  alinhamento tipográfico, cores de destaque/override e metadados de publicação.
- **Design** (`ChameleonPanel`): paleta global, primária/acento, texto global,
  fundo/card, estrutura, decorações e fonte customizada global (`customFontUrl`).
- **Mídia** (`ImageBlock`): background, overlay, calibração e blend mode.
- **Layout** (`LayoutBlock` + `PlatformBlock`): preset, geometria de layers,
  padding, split image position, plataforma e aspect ratio.
- **Canvas**: seleção, drag, resize, snap e carrossel.

### Mudanças implementadas

- **Painel direito removido**: a função `RightPanel` de `WorkbenchV2.tsx` (que
  duplicava o controle de `aspectRatio` do `PlatformBlock` e exibia a seção morta
  `+ (V2 Actions)`) foi removida. `PlatformBlock` é o único dono de
  plataforma/proporção. Removidos também `DESKTOP_ACCOUNT_SAFE_HEIGHT` e
  `topClearance`; `DESKTOP_ACCOUNT_SAFE_WIDTH` permanece (reserva o espaço do
  badge de conta/Sparks no `paddingRight` do header).
- **Fonte com dono único**: o `FontDropdown` duplicado foi removido do
  `ChameleonPanel`; o seletor de família tipográfica vive apenas no
  `FontColorBlock`. Ao trocar a fonte global, `FontColorBlock` limpa
  `designTokens.typography.customFontUrl` (proteção antes existente no
  `ChameleonPanel`, necessária porque `getActiveFontInfo` prioriza uma URL válida
  do Google Fonts sobre a família escolhida).
- **Acento com escrita canônica**: o controle "Destaque" do `FontColorBlock`
  passa a escrever apenas `designTokens.colors.primary`.
  `editorStore.normalizeVariationPatch` deriva `accentColor` no mesmo patch.
  Por §26, `accentColor` top-level mantém prioridade de leitura; a coerência é
  garantida pela derivação, não por escrita dupla.
- **Alinhamento com dono único**: o select de alinhamento foi removido do
  `ChameleonPanel`; o toggle do `FontColorBlock` é o único controle de
  `designTokens.typography.textAlign`. `layoutSettings[layer].textAlign`
  (`LayoutBlock`) é conceito distinto e permanece.
- **Cores de texto reclassificadas**: `designTokens.colors.text` é a "Texto
  global" (no Design); `headlineColor`/`bodyColor` são overrides explícitos
  ("Título (override)"/"Corpo (override)") no `FontColorBlock`, com botão
  "Limpar" que remove o override e volta ao fallback `textColor`. O fallback
  `headlineColor || textColor` / `bodyColor || textColor` em `PostCardV2` foi
  preservado.
- **`blendMode` editável**: `ImageBlock` ganhou seletor de Mesclagem
  (`normal/multiply/screen/overlay/darken/lighten`) na seção de Sobreposição,
  escrevendo via `updateImageSettings`. O campo já era lido por `PostCardV2` e
  só tinha UI no componente legado `tabs/ImageTab.tsx`. O efeito depende da
  opacidade do overlay (o overlay só renderiza com opacidade > 0).
- **Metadados de publicação separados**: `CaptionBlock` divide visualmente
  "Conteúdo do card" (título/corpo) de "Metadados de publicação"
  (CTA/legenda/hashtags), comunicando que estes não alteram o design do card.
- **Comunicação contextual**: `LayoutBlock` exibe dica quando o layout não é
  `split`; o label de `customFontUrl` virou "Fonte global via Google Fonts".

### Limpeza de código morto associada

- Removidos `FONT_SCOPES` (declarado e nunca renderizado) de `FontColorBlock`;
  `fontGroups` e o import de `FONT_CATALOG`/`FontDropdown` de `ChameleonPanel`.

### Validação

- `tsc --noEmit` limpo (o bloqueio de `react-helmet-async` registrado na seção 39
  não se reproduziu neste worktree).
- Suíte completa `vitest run`: 240 testes passando, incluindo
  `variationSnapshot` e `postsparkSchemas` (obrigatórios por §27).
- Pendência registrada: validação de rede ao vivo do `customFontUrl` (colar URL
  do Google Fonts e ver render/export) depende de browser e ficou para checagem
  manual; o caminho de código foi confirmado cabeado
  (`useDynamicFont` → `getActiveFontInfo` → `loadFont`; `PostCardV2:447`).

## 41. Ajuste de UX do carrossel no Workbench — 2026-06-26

Mudança focada em apresentação dos controles do canvas, sem alteração de
contrato, snapshot, persistência ou normalização visual.

Fatos observados/aplicados:

- O controle de escopo de edição de carrossel em `CanvasControls.tsx` passou a
  mostrar explicitamente "Slide atual", "Todos" e "Escolher", com contagem dos
  slides afetados. A seleção manual de slides agora aparece em chips inline,
  evitando popover/dropdown e removendo a rolagem vertical sem propósito no
  mobile.
- A navegação entre slides deixou de usar setas laterais sobrepostas ao canvas.
  No desktop, `CarouselSlideNavigator` concentra setas e botões numerados em uma
  régua abaixo do card, fora da área editável.
- No mobile, não há filmstrip; `CarouselMobileArrows` oferece apenas anterior,
  próximo e contador do slide atual.
- Backlog: miniaturas reais na filmstrip só devem voltar quando cada thumbnail
  puder renderizar de forma fiel ao canvas principal. A tentativa com
  `PostRenderer` em miniatura não foi suficiente visualmente e foi retirada para
  evitar prévias enganosas.
- A régua de slides considera o zoom visual do canvas para ficar abaixo do
  controle de ímã; o controle de ímã foi reduzido para não disputar atenção com
  o conteúdo editável no desktop. No mobile, o controle de ímã é maior para
  preservar área de toque.
- O banner de escopo e o botão "Adicionar Imagem" deixaram de ser posicionados
  de forma absoluta sobre o workspace. No desktop, eles participam do fluxo
  vertical acima do card, e o card usa margem calculada pelo zoom para não ficar
  sob os controles.
- `CanvasWorkspace.tsx` passou a reservar altura no cálculo de escala quando o
  post é carrossel, considerando controles superiores, régua inferior e bottom
  sheet mobile.

Validação:

- Testes focados passaram: `variationSnapshot.test.ts` e `editorStore.test.ts`
  (42 testes).
- `npm run check` segue bloqueado pela dependência ausente preexistente
  `react-helmet-async` nas páginas legais (`Cookies`, `Privacy`,
  `PrivacySettings`, `Terms`); o typecheck não reportou erros nos arquivos
  alterados.

## 42. Auditoria do ímã, guias e grade 9x9 do Workbench — 2026-06-26

Auditoria solicitada após teste manual em que o botão "Ímã" parecia não ter
efeito prático e a grade 9x9 não aparecia no canvas.

Fatos observados no código atual:

- O controle visual do ímã existe em `CanvasControls.tsx` e alterna
  `editorStore.isMagnetActive`.
- `CanvasWorkspace` repassa `isMagnetActive` para `PostCardV2`, e
  `PostCardV2` repassa `snapEnabled` para `DraggableBlock` apenas em modo
  editável, não compacto e com ímã ativo.
- `DraggableBlock` registra o elemento como `snapEligible`, mas não desenha
  nenhuma grade visual.
- `CanvasInteractionProvider` monta candidatos de snap a partir do canvas e dos
  elementos registrados, mas chama `controller.beginInteraction` sem
  `snapConfig`.
- `interactionReducer` só executa `snapDraft` quando `snapConfig?.isSnapEnabled`
  é verdadeiro. Como `snapConfig` não é enviado, o motor de snap fica
  desativado mesmo com o ímã ligado.
- `InteractionOverlay` só desenha linhas-guia quando `snapGuides` chega do
  reducer; com o snap desativado, essas guias não aparecem.
- As constantes de grade 9x9 (`GRID_SNAP_COORDINATES` e
  `GRID_SNAP_POSITIONS`) existem como resíduo legado em `DraggableBlock`, mas
  não têm consumidor de renderização no canvas.
- `layoutPositionAdapter.test.ts` confirma o comportamento atual de commit:
  `layoutPositionFromCommit` grava a geometria real sem aplicar snap legado de
  grade, mesmo quando `snapEnabled: true`.

Conclusão:

- A sensação de que o ímã está inútil é consistente com o código: o estado do
  botão chega aos blocos, mas não chega ao reducer como `snapConfig`, portanto
  não altera o draft, não mostra guias e não altera o commit.
- A grade 9x9 não está apenas escondida: no fluxo ativo não há componente
  responsável por desenhá-la.
- A documentação anterior que descreve o ímã como snap funcional para uma grade
  fixa 10%–90% está desatualizada frente ao código atual.

Plano normativo resumido:

1. Primeiro corrigir a ativação do `snapEngine` enviando `snapConfig` em
   `CanvasInteractionProvider.begin`, com `isSnapEnabled` derivado do ímã e
   `altSuspended` preservado pelo reducer.
2. Decidir explicitamente se a próxima experiência será grade 9x9 visível,
   smart guides, ou ambos. O plano de recuperação definitiva já aponta para
   smart guides como direção final; se a grade voltar, ela deve ser tratada como
   overlay visual opcional, não como segundo motor de snap.
3. Se a grade 9x9 for mantida temporariamente, criar um overlay em
   `CanvasWorkspace`/`InteractionOverlay` fora de `data-post-export-root`, visível
   apenas com o ímã ligado, usando a escala do canvas e sem entrar no snapshot.
4. Cobrir com testes: ímã ligado chama `snapDraft`; ímã desligado não chama;
   `Alt` suspende; guias aparecem apenas quando há snap; exportação não contém
   grade/guias.
5. Revalidar em browser com drag de `headline`, `body`, `section:*` e imagens
   livres nos formatos 1:1, 5:6 e 9:16.

## 43. Correção do ímã, snap e grade 9x9 do Workbench — 2026-06-26

Correção aplicada a partir da auditoria da seção 42, sem alteração de contrato,
schema, tRPC, persistência, normalização visual ou `snapshotVersion`.

Mudanças aplicadas:

- `CanvasInteractionProvider` agora envia `snapConfig` para
  `controller.beginInteraction`, com `isSnapEnabled` derivado do ímã e os
  valores padrão de tolerância/histerese de `DEFAULT_SNAP_CONFIG`.
- O reducer já suspendia o snap quando `Alt` está pressionado; esse caminho foi
  preservado e coberto por teste.
- Foi criado `CanvasGridOverlay` como overlay interno do Workbench. Ele renderiza
  a grade 9x9 com linhas e pontos em 10% a 90% de cada eixo.
- `CanvasWorkspace` mostra a grade somente quando `renderMode === "edit"` e
  `isMagnetActive` está ativo.
- Blocos estruturais, textos avançados e imagens livres passam a se registrar
  como candidatos de snap quando o ímã está ativo.
- A grade é irmã de `data-post-export-root`, usa `pointer-events: none` e não
  entra na árvore exportável nem no snapshot.
- O snap continua acontecendo no draft transitório; `layoutPositionAdapter` não
  voltou a aplicar snap no commit.

Validação:

- Testes focados passaram: `interaction.test.ts`, `firstDrag.dom.test.tsx` e
  `CanvasGridOverlay.test.tsx` (42 testes).
- `npm run check` foi tentado via `npm.cmd`, mas segue bloqueado pela dependência
  ausente/preexistente `react-helmet-async` nas páginas legais (`Cookies`,
  `Privacy`, `PrivacySettings`, `Terms`).

## 44. Correção do primeiro drag e layout shift no Workbench — 2026-06-26

Problema observado e confirmado em uso real:

- Primeiro clique e arrasto não funciona corretamente — apenas seleciona o elemento
- Segundo arrasto funciona normalmente
- Durante o primeiro arrasto, os outros elementos se reorganizam visualmente (layout shift)
- Elementos parecem "sair do plano" durante o arrasto, fazendo os vizinhos recalcularem posição
- Ímã não está "prendendo" os elementos

Causa raiz identificada após investigação profunda:

Três problemas interconectados foram identificados:

1. **Container `pointer-events-none` intercepta eventos**: Os containers que envolvem
   `AdvancedTextNode` e `ImageElementBlock` no `PostCardV2.tsx` possuem `pointer-events-none`,
   o que interfere na captura do primeiro clique.

2. **Ausência de placeholder para elementos absolutos**: Diferente do `DraggableBlock`,
   elementos absolutos (`AdvancedTextNode` e `ImageElementBlock`) não têm sistema de
   placeholder para preservar o espaço durante o drag, causando reorganização dos vizinhos.

3. **Timing bug no cleanup**: A ordem do cleanup no `useInteractiveElement` pode
   cancelar interações prematuramente.

Mudanças implementadas:

1. **`PostCardV2.tsx` linhas 611 e 635**: Removido `pointer-events-none` dos containers
   ```typescript
   // Antes:
   <div className="absolute inset-0 z-20 pointer-events-none">
   // Depois:
   <div className="absolute inset-0 z-20">
   ```
   Isso permite que eventos de pointer sejam capturados corretamente desde o primeiro clique.

2. **`AdvancedTextNode.tsx`**: Adicionado sistema de placeholder
   - Import de `useLayoutEffect` adicionado
   - State `flowFootprint` adicionado
   - Placeholder renderizado durante drag para preservar espaço original
   - `isDragging` agora inclui `pressing`

3. **`ImageElementBlock.tsx`**: Adicionado sistema de placeholder
   - Import de `useLayoutEffect` adicionado
   - State `flowFootprint` adicionado
   - Placeholder renderizado durante drag para preservar espaço original
   - `isDragging` agora inclui `pressing`

4. **`InteractiveElement.tsx` linhas 10-17**: Ordem de cleanup corrigida
   ```typescript
   // Antes:
   return () => {
     interaction.unmountTarget(descriptor.id);  // Unmount primeiro
     cleanup();  // Depois cleanup
   };
   // Depois:
   return () => {
     cleanup();  // Cleanup primeiro
     interaction.unmountTarget(descriptor.id);  // Depois unmount
   };
   ```

> Nota de estado: este registro é histórico e foi superado pelo gate 70.1,
> que restaurou o contrato testado de 5 CSS px independente de zoom.

5. **`types.ts` linha 10**: Threshold de slop reduzido de 5 para 3 pixels
   ```typescript
   export const DEFAULT_INTERACTION_SLOP_PX = 3;
   ```

6. **`DraggableBlock.tsx` linha 104**: `isDragging` já inclui `pressing` (alteração anterior mantida)

Impacto:

- Primeiro clique e arrasto agora funciona imediatamente (events não são bloqueados)
- Placeholder existe desde o mount para todos os elementos, eliminando layout shift
- Feedback visual mais responsivo (isDragging inclui pressing)
- Latência reduzida (threshold de 3px em vez de 5px)
- Cleanup não cancela mais interações ativas prematuramente

Arquivos alterados:

- `client/src/components/views/WorkbenchV2/PostCardV2.tsx` (linhas 611, 635)
- `client/src/components/canvas/AdvancedTextNode.tsx` (imports, state, placeholder)
- `client/src/components/canvas/ImageElementBlock.tsx` (imports, state, placeholder)
- `client/src/editor/integration/InteractiveElement.tsx` (linha 15-16)
- `client/src/editor/interaction/types.ts` (linha 10)
- `client/src/components/canvas/DraggableBlock.tsx` (linha 104)

Esta correção resolve os problemas onde:
- Containers `pointer-events-none` bloqueavam o primeiro clique
- Elementos absolutos "abandonavam o plano" sem placeholder durante o drag
- Vizinhos se reorganizavam devido à ausência de placeholder
   useLayoutEffect(() => {
     if (isAbsolute) return;
     // Calcular footprint imediatamente quando elemento monta, não esperar isDragging
     if (flowFootprint) return;
     // ... medição acontece no mount
     setFlowFootprint({ width: measuredWidth, height: measuredHeight });
   }, [flowFootprint, isAbsolute]); // isDragging removido das dependências
   ```
   Esta é a mudança crítica: o placeholder agora existe ANTES do primeiro drag,
   eliminando a janela de instabilidade onde os elementos se reorganizam.

3. **`types.ts` linha 10**: Threshold de slop reduzido (registro histórico,
   superado pelo gate 70.1)
   ```typescript
   // Antes: export const DEFAULT_INTERACTION_SLOP_PX = 5;
   // Depois:
   export const DEFAULT_INTERACTION_SLOP_PX = 3;
   ```
   3px ainda previne cliques acidentais, mas permite transição para dragging mais
   rápido, reduzindo a latência da resposta visual.

Impacto:

- Primeiro clique e arrasto agora funciona imediatamente
- Placeholder existe desde o mount, não há mais layout shift
- Feedback visual é mais responsivo (isDragging inclui pressing)
- Segundo arrasto mantém comportamento estável (já estava antes)

Arquivos alterados:

- `client/src/components/canvas/DraggableBlock.tsx` (linhas 104, 108-119)
- `client/src/editor/interaction/types.ts` (linha 10)

Esta correção resolve o problema descrito pelo usuário onde elementos pareciam
"abandonar o plano" durante o primeiro arrasto, fazendo os vizinhos se reorganizarem.

## 45. Base de dados do pipeline High Ticket — 2026-07-07

Mudanca aplicada diretamente no Supabase via MCP, restrita ao schema
`postspark`.

Objetivo:

- Criar a base persistente para um pipeline High Ticket com carregamento de
  contexto de marca/persona, estado operacional de grafo e retomada por
  `generation_runs`.

Mudancas aplicadas no banco:

- Criada `postspark.brand_kits`, uma tabela 1:1 por `user_uuid`, com tom de voz,
  regras de formatacao, termos proibidos, termos obrigatorios, dicionario,
  paleta visual, fonte e tokens visuais basicos.
- Criada `postspark.personas`, tambem 1:1 por `user_uuid`, com audiencia, dores,
  objetivos, estilo de linguagem e objecoes.
- Ambas referenciam `postspark.profiles(id)` com `ON DELETE CASCADE`, usam RLS e
  policies de dono para `SELECT`, `INSERT`, `UPDATE` e `DELETE`.
- `postspark.generation_runs` recebeu `graph_state jsonb NOT NULL DEFAULT '{}'`,
  `spark_cost integer` com constraint nao-negativa e `completed_at timestamptz`.
- Criado indice `idx_generation_runs_user_status_created` em
  `(user_uuid, status, created_at DESC)` para consultas por usuario/status.
- Policies de `brand_kits`, `personas` e das operacoes de usuario em
  `generation_runs` usam `(select auth.uid())`, evitando reavaliacao por linha
  recomendada pelo linter do Supabase.

Fronteira arquitetural:

- `generation_runs.graph_state` e estado operacional do grafo High Ticket
  (input, context, routing, workers, QA/revisao e output tecnico).
- `graph_state` nao substitui `PostVisualSnapshot` nem
  `postspark.posts.variation_snapshot`.
- Outputs aprovados pelo grafo ainda devem ser convertidos para `PostVariation`
  e atravessar uma unica vez o normalizador canonico antes de HoloDeck,
  Workbench, exportacao ou persistencia visual.

Registro local:

- As migracoes equivalentes estao em
  `drizzle/0010_high_ticket_pipeline_foundation.sql` e
  `drizzle/0011_high_ticket_policy_index_cleanup.sql`.
- `drizzle/schema.ts` foi alinhado para usar `created_at`/`updated_at` em
  `generation_runs`, `brand_kits` e `personas`, refletindo o schema real do
  Supabase para estes objetos.

## 46. Plano de implementacao do pipeline High Ticket - 2026-07-07

Foi criado o plano operacional em
[`HIGH_TICKET_PIPELINE_IMPLEMENTATION_PLAN.md`](./HIGH_TICKET_PIPELINE_IMPLEMENTATION_PLAN.md).

O plano estabelece que a implementacao High Ticket deve ser feita atras de
feature flag e sem criar uma segunda fonte da verdade visual. A fronteira
obrigatoria permanece:

`WorkerPayload aprovado -> PostVariation -> createPostVisualSnapshot -> HoloDeck -> editorStore.loadSnapshot -> Workbench`

Ponto critico registrado:

- `generation_runs.graph_state` guarda estado operacional do grafo e nao
  substitui `PostVisualSnapshot`, `editorStore.visualSnapshot` nem
  `postspark.posts.variation_snapshot`.
- O Workbench deve receber exatamente o mesmo `PostVisualSnapshot` renderizado e
  selecionado no HoloDeck.
- A primeira etapa tecnica recomendada e criar testes de contrato para o handoff
  HoloDeck -> Workbench e um `visualContractValidator` deterministico antes da
  integracao do novo grafo ao `post.generate`.

Revisao 1.1 do plano:

- A topologia High Ticket passou a incluir `semantic_originality` antes do QA,
  preservando a avaliacao por embeddings, os scores de originalidade usados em
  `postEvaluation` e a persistencia de fingerprints dos candidatos finais.
- `aspectRatioOptimizations` nao deve ser proibido no output High Ticket. O
  campo continua valido para adaptacao multi-formato (`1:1`, `5:6`, `9:16`) e
  so deve ser expurgado quando uma transformacao local o torna obsoleto, como
  troca de familia criativa.
- O `context_loader` agora exige budget/compressao de contexto quando BrandKit,
  Persona, Site Intelligence e briefing excederem o limite definido.
- O grafo nao deve entregar 1-2 variacoes parciais ao HoloDeck. Deve tentar
  reparo/regeneracao por slot e, se nao fechar exatamente 3 variacoes aprovadas,
  falhar explicitamente ou acionar fallback legado apenas por feature flag
  separada.

## 47. Implementacao inicial do pipeline High Ticket - 2026-07-07

Implementacao aplicada atras de feature flag, preservando o pipeline legado como
caminho padrao.

Arquivos principais criados:

- [`shared/highTicket.ts`](./shared/highTicket.ts): contratos compartilhados do
  grafo High Ticket (`MasterBriefing`, `WorkerPayload`, `RouterOutput`,
  `OriginalityResult`, `QaResult`, `HighTicketGraphState`).
- [`shared/highTicketSchemas.ts`](./shared/highTicketSchemas.ts): schemas Zod
  dos payloads High Ticket.
- [`server/ai/highTicket/`](./server/ai/highTicket): modulos do grafo
  (`contextLoader`, `contextBudget`, `intentRouter`, `workers`,
  `semanticOriginality`, `qaEvaluator`, `correctionLoop`,
  `captionSynthesis`, `visualContractValidator`, `finalMapper`, `persist`,
  `graph`, `index`).
- [`HIGH_TICKET_IMPLEMENTATION_AUDIT.md`](./HIGH_TICKET_IMPLEMENTATION_AUDIT.md):
  log auditavel dos passos executados, decisoes e validacoes.

Alteracoes de integracao:

- `server/_core/env.ts` recebeu:
  - `AI_HIGH_TICKET_PIPELINE` (default `false`);
  - `AI_HIGH_TICKET_LEGACY_FALLBACK` (default `false`).
- `server/ai/modelRouter.ts` recebeu rotas High Ticket para roteamento futuro de
  modelo por tarefa.
- `server/routers.ts` chama `runHighTicketPipeline` somente quando
  `ENV.aiHighTicketPipelineEnabled` esta ativo, depois de auth/billing/trace e
  antes do pipeline legado.
- Se o pipeline High Ticket falhar, o fallback legado so acontece quando
  `AI_HIGH_TICKET_LEGACY_FALLBACK=true`.

Persistencia:

- `server/db.ts` agora possui helpers para ler `brand_kits`, `personas` e
  atualizar `generation_runs.graph_state` incrementalmente.
- `createGenerationRun` passou a usar `upsert` para permitir que o grafo crie o
  run no inicio e `finishGenerationTrace` finalize depois sem conflito de chave.
- O `upsert` preserva `graph_state` quando `finishGenerationTrace` nao envia um
  novo estado de grafo.

Fronteiras preservadas:

- O backend High Ticket retorna `PostVariation[]`.
- O backend nao cria `PostVisualSnapshot`.
- `captionSynthesis` roda apos a aprovacao visual/QA e antes do output final,
  reutilizando o modulo legado de legenda coerente com slides/secoes/body.
- HoloDeck/Workbench continuam dependendo do normalizador canonico
  `client/src/lib/variationSnapshot.ts`.

Validacoes executadas:

- `npm run check`: passou.
- Testes focados passaram:
  `shared/highTicketSchemas.test.ts`,
  `server/ai/highTicket/visualContractValidator.test.ts`,
  `server/ai/highTicket/finalMapper.test.ts`.
- Foi adicionado e validado um teste explicito de handoff High Ticket em
  `client/src/lib/variationSnapshot.test.ts`, cobrindo
  `PostVariation -> createPostVisualSnapshot -> editorStore.loadSnapshot` com
  `aspectRatioOptimizations`, `layoutSettingsByAspectRatio` e `designTokens`.
  A revalidacao focada passou com 4 arquivos e 18 testes.
- `npm test` completo foi executado. A camada High Ticket passou, mas a suite
  completa ainda falha em testes preexistentes/externos a esta implementacao:
  `client/src/editor/interaction/interaction.test.ts` e
  `client/src/editor/integration/firstDrag.dom.test.tsx`.

## 48. Refinamento da implementacao High Ticket — QA, modelos e otimizacoes — 2026-07-07

Fato observado: apos auditoria de codigo, foram identificadas correcoes
necessarias na implementacao inicial do pipeline High Ticket.

### 48.1. QA High Ticket com invokeLLM proprio

Fato:

- O arquivo [`server/ai/highTicket/qaEvaluator.ts`](./server/ai/highTicket/qaEvaluator.ts)
  foi reescrito para usar `invokeLLM` com `taskRoute: "high_ticket_qa"` e
  `reasoningEffort: "high"`.
- O QA agora usa prompt e schema proprios com criterios High Ticket (coesao
  copy-visual, aderencia ao BrandKit, forca estrategica do angulo, clareza
  visual, originalidade). Nao depende mais do `post_evaluation` legado.
- Hard gates: `brandAlignment >= 80`, `visualReadability >= 80`,
  `captionCoherence >= 70`, `overallScore >= 75`.
- As 9 dimensoes de avaliacao (incluindo `captionCoherence`) sao validadas
  contra `generationEvaluationSchema` exportado de `postsparkSchemas.ts`.

### 48.2. Roteamento de modelo por no

Fato:

- [`server/ai/modelRouter.ts`](./server/ai/modelRouter.ts) foi refatorado para
  rotear cada no High Ticket para um modelo independente:
  - `high_ticket_context_summary` → `ENV.highTicketContextSummaryModel`
  - `high_ticket_intent_router` → `ENV.highTicketIntentRouterModel`
  - `high_ticket_worker` → `ENV.highTicketWorkerModel`
  - `high_ticket_qa` → `ENV.highTicketQaModel`
    (default: `anthropic/claude-3.5-sonnet`)
  - `high_ticket_revision` → `ENV.highTicketRevisionModel`
  - `high_ticket_caption_synthesis` → `ENV.highTicketCaptionSynthesisModel`
- Todos os defaults herdam de `OPENROUTER_TEXT_MODEL` quando a env var
  especifica nao esta definida, garantindo retrocompatibilidade.
- Variaveis de ambiente: `HT_CONTEXT_SUMMARY_MODEL`, `HT_INTENT_ROUTER_MODEL`,
  `HT_WORKER_MODEL`, `HT_QA_MODEL`, `HT_REVISION_MODEL`,
  `HT_CAPTION_SYNTHESIS_MODEL`.

### 48.3. Correction loop com json_schema estrito

Fato:

- [`server/ai/highTicket/correctionLoop.ts`](./server/ai/highTicket/correctionLoop.ts)
  trocou `response_format: { type: "json_object" }` por `json_schema` com o
  schema completo do `WorkerPayload`.
- Reduz falhas de parsing JSON e evita gastar tentativas de correcao com
  payloads estruturalmente invalidos.

### 48.4. Projecao enxuta do MasterBriefing

Fato:

- Criado [`server/ai/highTicket/slimBriefing.ts`](./server/ai/highTicket/slimBriefing.ts)
  com a funcao `slimBriefingForWorker()` que extrai apenas os campos relevantes
  do `MasterBriefing` para workers, QA e revision.
- Evidencia do site: limitada a 8 itens. Tone guidelines: limitadas a 5 itens.
- [`workers.ts`](./server/ai/highTicket/workers.ts),
  [`qaEvaluator.ts`](./server/ai/highTicket/qaEvaluator.ts) e
  [`correctionLoop.ts`](./server/ai/highTicket/correctionLoop.ts) usam a
  projecao enxuta em vez do briefing completo serializado.

### 48.5. Originality single-pass

Fato:

- [`server/ai/highTicket/graph.ts`](./server/ai/highTicket/graph.ts) foi
  corrigido para calcular `assessHighTicketOriginality` uma unica vez antes do
  loop de QA/correcao.
- Recalcula apenas apos uma revisao real (quando `revisedIndexes.length > 0`),
  nao a cada iteracao do loop. Comportamento alinhado ao pipeline legado
  (`routers.ts:1439` + `routers.ts:1552`).

### 48.6. Schema de auditoria com GenerationEvaluationSummary

Fato:

- `generationEvaluationSchema` em [`shared/postsparkSchemas.ts`](./shared/postsparkSchemas.ts)
  foi exportado e recebeu a dimensao `captionCoherence` faltante.
- `qaResultSchema` em [`shared/highTicketSchemas.ts`](./shared/highTicketSchemas.ts)
  substituiu `evaluation: z.unknown()` por `evaluation: generationEvaluationSchema`.

### 48.7. Validacao final

Fato:

- `npm run check` (tsc --noEmit): passou sem erros.
- Testes focados High Ticket: 3 arquivos, 5 testes passaram.
- Teste de handoff HoloDeck → Workbench em `variationSnapshot.test.ts`:
  1 arquivo, 13 testes passaram (incluindo o teste High Ticket).
- Total: 18 testes passando.

## 49. Correção de consistência visual: cores e layout por formato — 2026-07-07

### Diagnóstico

Três problemas estruturais causavam inconsistência entre designs gerados (alguns
"certos", outros "tortos"):

1. **`composeVariation` descartava decisões de design do LLM**: em
   [`shared/creative/compose.ts`](./shared/creative/compose.ts), a função
   substituía `backgroundColor`, `textColor` e `accentColor` escolhidos pelo LLM
   (baseados em contexto de marca, estratégia e plataforma) por cores de paletas
   estáticas + família criativa sorteada. O LLM investia tokens significativos
   nessas decisões, que eram descartadas.

2. **`aspectRatioOptimizations` era completamente ignorado para layout**: o LLM
   gera objetos `FormatOptimization` por formato (1:1, 5:6, 9:16) com dados ricos
   de posicionamento (`x`, `y`, `width`, `textAlign` para headline, body e card),
   mas `normalizeLayoutSettings` em
   [`client/src/lib/variationSnapshot.ts`](./client/src/lib/variationSnapshot.ts)
   nunca lia esse campo. Caía direto no fallback `layoutToAdvanced(variation.layout)`.

3. **Prioridade de layout ignorava dados do LLM por formato**: a cadeia era
   `layoutSettingsByAspectRatio` → `layoutSettings` → `layoutToAdvanced(layout)`,
   sem nenhuma etapa que lesse `aspectRatioOptimizations`.

### Correção 1: composeVariation preserva cores do LLM

`composeVariation` em [`shared/creative/compose.ts`](./shared/creative/compose.ts)
foi alterada para:

- Capturar `backgroundColor`, `textColor`, `accentColor` existentes da variação
  antes de qualquer processamento.
- Injetar essas cores nos `designTokens` usados pela família criativa (`compose`),
  garantindo que elementos decorativos (`textElements`, `bgOverlay`) usem a paleta
  correta escolhida pelo LLM.
- Preservar as cores originais no `PostVariation` retornado. Cores de paleta só
  são usadas como fallback quando o LLM não definiu a cor.
- A família criativa continua contribuindo com `layout`, `layoutSettings`,
  `template`, fontes, tipografia, estrutura e elementos decorativos.

### Correção 2: formatOptimizationToLayoutSettings

Nova função em [`client/src/lib/variationSnapshot.ts`](./client/src/lib/variationSnapshot.ts)
converte `FormatOptimization` (coordenadas do LLM: `x`, `y`, `width`, `textAlign`,
`backgroundColor`, `borderRadius`) em `AdvancedLayoutSettings` (com `LayoutPosition`
via `freePosition`).

Mapeamento:
- `FormatOptimization.headline.x → LayoutPosition.freePosition.x` (percentual)
- `FormatOptimization.headline.y → LayoutPosition.freePosition.y` (percentual)
- `FormatOptimization.headline.width → LayoutPosition.width` (percentual)
- `FormatOptimization.headline.textAlign → LayoutPosition.textAlign`
- `FormatOptimization.headline.backgroundColor → LayoutPosition.backgroundColor`
- `FormatOptimization.headline.borderRadius → LayoutPosition.borderRadius`
- O campo `position` recebe `"top-left"` como padrão (ignorado quando `freePosition` existe)

### Correção 3: normalizeLayoutSettings integra aspectRatioOptimizations

A cadeia de prioridade de layout foi estendida:

1. `layoutSettingsByAspectRatio[aspectRatio]` (salvo pelo editor, maior precedência)
2. `layoutSettings` (global do editor)
3. `aspectRatioOptimizations[aspectRatio]` → convertido via `formatOptimizationToLayoutSettings` (NOVO)
4. `layoutToAdvanced(variation.layout)` (fallback genérico)

A etapa 3 usa `formatOptimizationToLayoutSettings` somente quando o
`FormatOptimization` contém dados de posicionamento (`headline` ou `body` ou `card`).
Se vazio, pula direto para o fallback. Isso garante que o posicionamento por
formato que o LLM produziu seja efetivamente usado por HoloDeck e Workbench.

### Impacto na invariante

- `PostVisualSnapshot` permanece como documento autoritativo; `layoutSettings`
  agora pode ser derivado também de `aspectRatioOptimizations`.
- `snapshotVersion` permanece em 3; não houve mudança de schema.
- HoloDeck e Workbench continuam usando a mesma função `normalizeLayoutSettings`
  via `createPostVisualSnapshot`.
- A família criativa do Motor de Variabilidade recebe as cores do LLM nos tokens,
  mantendo coerência entre elementos decorativos e cores principais.

### Validação

- `tsc --noEmit`: passou sem erros.
- `variationSnapshot.test.ts`: 13/13 testes passaram.
- `editorStore.test.ts`: 30/30 testes passaram.
- Testes de compose.ts: não existiam previamente; a mudança apenas preserva
  valores existentes (sem quebra de contrato).

## 50. Correção de vazamentos de precedência layout/cores por formato — 2026-07-07

### Diagnóstico

Após a integração de `aspectRatioOptimizations` ao `normalizeLayoutSettings`
(seção 49), uma auditoria revelou dois vazamentos de precedência onde o layout
resolvido por formato era descartado:

1. **HoloDeck `getPreviewVariation`** ignorava troca de formato para snapshots
   (`HoloDeck.tsx:379-380`): variações com `snapshotVersion` pulavam a
   renormalização por `createPostVisualSnapshot(variation, aspectRatio)`. O
   `aspectRatio` do seletor estava na dependência do `useCallback` mas só era
   usado no branch `else` (variações legadas sem versão). Resultado: ao trocar
   de 1:1 para 5:6, o preview mantinha `layoutSettings` e cores do formato
   original.

2. **`editorStore.setAspectRatio`** descartava o layout resolvido
   (`editorStore.ts:616-627`): `createPostVisualSnapshot` produzia o layout
   correto via `aspectRatioOptimizations`, mas `nextLayout` (calculado sem
   consultar `aspectRatioOptimizations`) sobrescrevia o resultado. O
   `nextLayout` usava apenas `storedLayouts[currentRatio]` (layout manual
   salvo) ou `layoutToAdvanced` (fallback genérico).

### Correção 1: HoloDeck sempre renormaliza com aspectRatio atual

`getPreviewVariation` em [`client/src/components/views/HoloDeck.tsx`](./client/src/components/views/HoloDeck.tsx)
agora sempre chama `createPostVisualSnapshot(variation, aspectRatio)`,
independente de `snapshotVersion`. `customTokens` (tema aplicado pelo usuário)
continua sendo aplicado depois via `applyDesignTokensToSnapshot`, preservando
edições locais.

### Correção 2: setAspectRatio respeita o layout resolvido

`setAspectRatio` em [`client/src/store/editorStore.ts`](./client/src/store/editorStore.ts)
foi reestruturado:

- `createPostVisualSnapshot` produz o layout correto para o formato destino
  (resolvendo `aspectRatioOptimizations` quando disponível).
- Se existe `layoutSettingsByAspectRatio[currentRatio]` (layout salvo
  manualmente pelo usuário para este formato), este tem precedência.
- Caso contrário, `arPatched.layoutSettings` (resolvido de
  `aspectRatioOptimizations`) é usado.
- O `resolvedLayout` do retorno agora deriva da variação processada, não de
  um cálculo paralelo que ignorava `aspectRatioOptimizations`.

### Cadeia final de precedência de layout (pós-correção)

1. `layoutSettingsByAspectRatio[aspectRatio]` — salvo pelo usuário no editor
2. `aspectRatioOptimizations[aspectRatio]` → `formatOptimizationToLayoutSettings` — gerado pelo LLM
3. `layoutSettings` — global do editor
4. `layoutToAdvanced(variation.layout)` — fallback genérico

### Validação

- `tsc --noEmit`: passou sem erros.
- `variationSnapshot.test.ts`: 13/13 passaram.
- `editorStore.test.ts`: 30/30 passaram.
- Falhas restantes (9) são pré-existentes em `interaction.test.ts` e
  `firstDrag.dom.test.tsx` (zoom/slop não relacionados).

## 51. Correção de contenção horizontal de blocos absolutos — 2026-07-08

Fato observado:

- Após a correção de precedência por formato, HoloDeck e Workbench passaram a
  renderizar consistentemente o mesmo `PostVisualSnapshot`, mas alguns posts
  gerados ainda podiam sair mal diagramados.
- O caso reproduzido usava o layout criativo `data-punch`, que posiciona a
  headline com `freePosition: { x: 8, y: 58 }` e `width: 84`.
- `DraggableBlock` interpretava todo `freePosition` como centro do bloco e
  aplicava `transform: translate(-50%, -50%)`. Com `x: 8` e `width: 84`, metade
  do bloco ficava fora do canvas à esquerda.

Correção aplicada:

- [`client/src/components/canvas/DraggableBlock.tsx`](./client/src/components/canvas/DraggableBlock.tsx)
  agora limita horizontalmente o centro renderizado de blocos absolutos quando
  `layoutPos.width` existe.
- A regra preserva o contrato atual de `freePosition` como centro geométrico
  usado pelos drags e pelo `layoutPositionAdapter`, mas impede que um bloco largo
  renderize fora do canvas.
- Exemplo: `x: 8`, `width: 84` passa a renderizar com centro mínimo em `42%`,
  mantendo o bloco inteiro dentro do card.

Validação:

- `client/src/components/canvas/DraggableBlock.test.ts`: 2/2 testes passaram.
- `client/src/lib/variationSnapshot.test.ts` e
  `client/src/store/editorStore.test.ts`: 43/43 testes passaram.

## 52. Restauração do contrato de placeholder no primeiro drag — 2026-07-08

Fato observado:

- O bug antigo de elementos "mudarem de plano" durante drag estava documentado
  nas seções 32, 36, 38 e 44.
- O contrato correto para `DraggableBlock` é:
  - o nó interativo não pode ser desmontado/remontado ao cruzar o slop;
  - enquanto um bloco estrutural nasce em fluxo e passa a ter `freePosition`,
    um espaçador invisível deve preservar a largura/altura originais;
  - elementos que já chegam absolutos sem medida de primeiro drag continuam com
    `display: contents`, para posicionar contra o canvas/card correto.
- A regressão atual apareceu porque `flowFootprint` podia ser medido antes do
  layout real existir e ficar congelado com `0px x 0px`. Nesse estado, o shell
  existia, mas não preservava espaço, reabrindo o rearranjo dos irmãos.

Correção aplicada:

- [`client/src/components/canvas/DraggableBlock.tsx`](./client/src/components/canvas/DraggableBlock.tsx)
  agora ignora medições de `flowFootprint` com largura ou altura zerada.
- A medição é tentada no mount e novamente quando a interação entra em
  `pressing`/`dragging`, permitindo capturar a geometria real antes do primeiro
  movimento efetivo.

Validação:

- `client/src/editor/integration/firstDrag.dom.test.tsx`,
  `client/src/editor/integration/blockInteraction.test.ts` e
  `client/src/components/canvas/DraggableBlock.test.ts`: 6/6 testes passaram.

## 53. Correcao da precedencia entre motor criativo e layout por formato - 2026-07-08

Fato observado:

- O fluxo de geracao monta `aspectRatioOptimizations` no LLM e, depois disso,
  aplica o motor criativo via `composeVariation`.
- `composeVariation` pode injetar `layoutSettings` globais, `textElements`,
  fontes e multiplicadores de fonte apos a geracao original.
- `normalizeLayoutSettings` estava escolhendo `layoutSettings` antes de
  `aspectRatioOptimizations[aspectRatio]`.
- Na pratica, um layout global injetado pelo motor criativo podia sobrepor o
  layout especifico por formato gerado pela IA, causando posts com elementos
  coincidentes ou texto atropelado em HoloDeck e Workbench.

Correcao aplicada:

- [`client/src/lib/variationSnapshot.ts`](./client/src/lib/variationSnapshot.ts)
  voltou a resolver layout com a precedencia canonica:
  1. `layoutSettingsByAspectRatio[aspectRatio]` - posicao manual salva pelo usuario;
  2. `aspectRatioOptimizations[aspectRatio]` - layout por formato gerado pela IA;
  3. `layoutSettings` - layout global herdado/editorial/criativo;
  4. `layoutToAdvanced(variation.layout)` - fallback.
- O motor criativo ainda pode contribuir com estilo global, mas nao pode mais
  derrubar a geometria especifica do formato quando ela existe.

Validacao adicionada:

- [`client/src/lib/variationSnapshot.test.ts`](./client/src/lib/variationSnapshot.test.ts)
  ganhou um teste que simula `layoutSettings` global injetado pelo motor
  criativo competindo com `aspectRatioOptimizations["5:6"]`.
- O teste confirma que o snapshot final usa a geometria por formato para
  headline e body.

## 54. Correcao da ancora de coordenadas e anti-colisao de blocos - 2026-07-08

### Diagnostico (causa raiz do "titulo em cima do corpo")

As secoes 49-53 trataram *precedencia* (quem escreve o layout) e *contencao
horizontal* (clamp de X), mas o defeito estrutural persistia porque era de
**semantica de coordenadas**, nao de precedencia:

- `freePosition` e o **CENTRO geometrico** do bloco. E o que o drag manual grava
  ([`layoutPositionAdapter.ts`](./client/src/editor/adapters/layoutPositionAdapter.ts)
  via `geometryCenterPercent`) e o que o renderer aplica
  ([`DraggableBlock.tsx`](./client/src/components/canvas/DraggableBlock.tsx):
  `translate(-50%, -50%)`).
- Os dois produtores automaticos de layout escreviam no mesmo campo com a
  convencao **oposta** (canto superior esquerdo):
  1. O schema do prompt em [`server/routers.ts`](./server/routers.ts) descrevia
     apenas `"Posicao X em % (0-100)"`, sem ancora. Um LLM assume top-left
     (convencao universal de design), entao headline `y:12` e body `y:30`
     chegavam colados; renderizados como centro, o headline subia meia-altura
     (truncando no topo) e o body colidia com ele.
  2. As familias do Motor de Variabilidade em
     [`shared/creative/families.ts`](./shared/creative/families.ts) autoravam
     `freePosition: { x: 8, ... }, width: 84` (margem esquerda de 8%), que como
     centro jogava metade do bloco para fora do canvas.
- Nao havia **nenhuma** validacao geometrica (sobreposicao / bounding box) em
  ponto algum do pipeline; o clamp da secao 51 so tratava X.

### Correcao 1: ancora explicita no schema do prompt

`layoutPositionSchema` em [`server/routers.ts`](./server/routers.ts) agora
declara que `x`/`y` sao o **centro** do bloco, que a caixa vai de `x - width/2`
a `x + width/2`, e exige folga vertical minima de 20 pontos percentuais entre o
`y` do headline e o do body. Ataca a fonte primaria do overlap (caminho
`aspectRatioOptimizations` do LLM, hoje de maior precedencia efetiva).

### Correcao 2: saneamento no boundary do cliente (rede de protecao)

`formatOptimizationToLayoutSettings` em
[`client/src/lib/variationSnapshot.ts`](./client/src/lib/variationSnapshot.ts)
passou a **sanear** (nao rejeitar) as coordenadas da IA:

- `clampFreePosition` prende o centro dentro do canvas considerando a largura
  (X entre `width/2` e `100 - width/2`; Y entre 8% e 92%).
- Anti-colisao: se headline e body usam posicao livre e o body esta a menos de
  18 pontos percentuais abaixo do headline, o body e empurrado para baixo
  respeitando a folga minima. E o que garante que "titulo em cima do corpo" nao
  chegue ao HoloDeck mesmo que a IA agrupe os dois no mesmo ponto.
- Optou-se por sanear no boundary (`createPostVisualSnapshot`, contrato canonico
  da secao 27, atravessado por todo render) em vez de validar no servidor:
  `assertVariationSet` lanca `BAD_GATEWAY` e rejeitaria posts, reintroduzindo o
  erro "A IA nao conseguiu produzir tres variacoes validas".

### Correcao 3: familias emitem centro correto

[`shared/creative/families.ts`](./shared/creative/families.ts) ganhou o helper
`flX(left, width) => left + width/2` e converteu as 6 ocorrencias de
`freePosition` (editorial-poster, glitch-signal, kinetic-type, data-punch) da
margem esquerda para o centro. Como o texto interno mantem `textAlign: "left"`
dentro da largura original, o design pretendido e reproduzido exatamente. Com
isso o clamp horizontal da secao 51 deixa de mascarar posicao errada e volta a
ser apenas protecao de borda.

### Pendencia registrada (nao incluida nesta correcao)

Os `textElements` decorativos ("figuras mal diagramadas" fora do 1:1) sao
autorados em px absolutos num doc fixo 360x360
([`shared/creative/compose.ts`](./shared/creative/compose.ts)) e renderizados
sem escala (`scale={1}`) em cards de 200-360px
([`PostCardV2.tsx`](./client/src/components/views/WorkbenchV2/PostCardV2.tsx) →
[`AdvancedTextNode.tsx`](./client/src/components/canvas/AdvancedTextNode.tsx)).
O espaco de coordenadas dos textElements e inconsistente (360-space no compose
vs px-real no commit de drag), entao a correcao correta unifica esse espaco e
toca o motor de interacao (auditado nas secoes 28-44) — fica isolada em tarefa
propria para nao desestabilizar o drag.

### Validacao

- `tsc --noEmit`: passou sem erros.
- Testes unitarios (variationSnapshot / editorStore / DraggableBlock): a cargo
  do operador nesta iteracao.

## 55. Saneamento geometrico por caixa estimada e fluxo obrigatorio - 2026-07-08

### Fato observado (prints do HoloDeck pos-secao 54)

Dois prints de variacoes do mesmo post mostraram que a correcao de ancora
funcionou (blocos centralizados, dentro do canvas), mas o overlap persistia em
duas formas:

1. **Headline e body atravessados**: com folga fixa de 18 p.p. entre CENTROS,
   um body de ~10 linhas e um headline de ~3 linhas ainda se cruzam — metade da
   altura de cada caixa ultrapassa a folga. Alem disso o post era estruturado
   (sections), e as sections renderizam em fluxo comecando por baixo dos blocos
   absolutos, cruzando o body no meio do card.
2. **Card espremido**: a IA sugeriu um `card` com largura minuscula; o conteudo
   inteiro (headline serif grande) estourou a caixa com texto cortado.

Licao consolidada: coordenada absoluta emitida por LLM e cega para a altura
renderizada do texto. Nao existe folga fixa correta — a viabilidade tem de ser
calculada com estimativa de altura por bloco.

### Correcao (client/src/lib/variationSnapshot.ts)

`formatOptimizationToLayoutSettings` agora recebe um `AiLayoutContext`
(headline/body reais, presenca de sections estruturadas, aspect ratio) e aplica
tres regras, todas no boundary canonico:

1. **Templates estruturados nunca usam geometria absoluta da IA**: se
   `template !== "simple"` e ha sections, `x/y` da IA sao descartados e a
   geometria fica com o layout de fluxo (`layoutToAdvanced`), que empilha sem
   sobreposicao. Estilo da IA (textAlign, width, cores, borderRadius, padding)
   e preservado.
2. **Anti-colisao por caixa estimada (templates simple)**:
   `estimateTextHeightPercent` estima a altura renderizada de headline e body
   (fonte de referencia 26px/13px, canvas 360xH proporcional ao ratio, margem de
   seguranca 15%). O body precisa comecar abaixo da borda inferior estimada do
   headline com folga de 4%; se couber, e empurrado para baixo; se nao couber no
   canvas, headline E body voltam ao fluxo.
3. **Guarda de largura do card**: card com `width < 45` volta a geometria de
   fluxo com a largura base, preservando o estilo.

### Ajuste de teste

O teste "prioritizes aspect-ratio layout over global creative layout settings"
(secao 53) usava o fixture padrao, que e estruturado (feature-grid + 3
sections). Sob a regra 1 ele deixaria de receber geometria absoluta — o teste
foi ajustado para `template: "simple"`, onde a precedencia de geometria da IA
continua valendo e as assercoes originais se mantem.

### Validacao

- `tsc --noEmit`: passou sem erros.
- Testes unitarios: a cargo do operador nesta iteracao.

## 56. Auditoria da renderizacao final de posts - 2026-07-08

Relatorio tecnico emitido em [`AUDITORIA_RENDERIZACAO_POSTS.md`](./AUDITORIA_RENDERIZACAO_POSTS.md).

### Diagnostico consolidado

Martelo batido: o problema dos posts "horriveis" nao e apenas copy ruim ou
modelo ruim. A causa estrutural e que o pipeline aprova `PostVariation` e
`PostVisualSnapshot` sem validar o render final do browser.

Fato observado:

- `post.generate` avalia e revisa candidatos antes de `composeVariation`.
- `composeVariation` injeta `layoutSettings`, `textElements`, fontes,
  multiplicadores e `designTokens` depois da avaliacao de qualidade.
- `validateVariationSet` valida quantidade/campos/diversidade/sections/slides,
  mas nao valida bounding boxes, clipping, overlap, z-index, escala ou area util.
- `postEvaluation.visualReadability` mede contraste entre texto e fundo; nao mede
  se texto ficou em cima de texto ou se o card cortou conteudo.
- `ThemeRenderer` adiciona uma segunda camada de card com `overflow:hidden`.
- `textElements` decorativos ainda sao autorados em um documento logico 360x360
  e renderizados com `scale={1}`, mantendo inconsistencia entre coordenadas
  logicas e pixels reais.

### Implicacao

As protecoes atuais em `client/src/lib/variationSnapshot.ts` mitigam os sintomas
dos prints anexados (coordenadas da IA, templates estruturados, caixa estimada e
largura minima de card), mas continuam sendo heuristicas. O sistema ainda precisa
de um gate visual pos-composicao, capaz de renderizar/medir o snapshot final e
reflowar ou rejeitar layouts com overlap, clipping ou texto fora da area util.

### Validacao executada na auditoria

- `node_modules/.bin/pnpm.cmd exec tsc --noEmit`: passou.
- Testes focados (`variationSnapshot`, `editorStore`, `DraggableBlock`,
  `generationValidation`): 52/52 passaram.
- `node_modules/.bin/pnpm.cmd test`: falhou apenas em
  `client/src/editor/interaction/interaction.test.ts`, com 7 falhas
  preexistentes/relacionadas a slop, snap e click do motor de interacao.

## 57. Gate visual deterministico e escala de elementos avancados - 2026-07-08

Correcao aplicada:

- Criado [`client/src/lib/visualFitValidator.ts`](./client/src/lib/visualFitValidator.ts)
  como gate visual deterministico pos-normalizacao.
- `createPostVisualSnapshot` agora aplica `applyVisualFitFallback` antes de
  retornar o snapshot autoritativo.
- O gate estima caixas de headline/body, detecta overlap, `card` estreito,
  geometria absoluta em templates estruturados e `textElements` decorativos
  gerados (`cd-*`) fora do canvas ou sobre a copy principal.
- Quando encontra problema:
  - headline/body voltam para layout de fluxo;
  - `card` estreito e expandido;
  - `sectionLayouts` automaticos sao limpos em templates estruturados;
  - `textElements` decorativos problematicos sao removidos, preservando
    elementos manuais.
- `PostCardV2` passou a medir a largura real do canvas/card com
  `ResizeObserver` e enviar escala para `AdvancedTextNode`.
- `AdvancedTextNode` aplica essa escala tambem em `x`, `y`, `width`, `height` e
  `fontSize`, alinhando os elementos autorados no doc logico 360x360 com o
  tamanho real do card.
- `adaptContentForFamily` foi corrigido para atualizar `creativeDirection.familyId`
  antes de chamar `composeVariation` e passar `brandTokens` reais, em vez de
  passar a direcao criativa no parametro errado.
- Itens nao bloqueantes descobertos durante a implementacao foram registrados em
  [`BACKLOG_RENDERIZACAO_POS_TESTES.md`](./BACKLOG_RENDERIZACAO_POS_TESTES.md).

Validacao:

- Testes automatizados nao foram executados nesta iteracao a pedido do operador,
  que fara a validacao manual.

## 58. Remocao do wrapper visual duplicado no PostCardV2 - 2026-07-08

Fato observado apos nova validacao visual:

- Os previews melhoraram, mas ainda exibiam um "quadro dentro do canvas".
- A origem confirmada era `ThemeRenderer`: em caminhos com `designTokens` ou
  `theme`, ele sempre criava um `DraggableBlock` com `.inner-card-layer`.
- `PostCardV2` ja entregava como filho um layout completo de post, com canvas,
  background e conteudo. Portanto o renderer estava embrulhando um post completo
  dentro de outro card visual.

Correcao aplicada:

- `ThemeRenderer` ganhou a opcao `wrapContentInCard`.
- O valor padrao continua `true`, preservando comportamento antigo para usos
  isolados do componente.
- `PostCardV2` passa `wrapContentInCard={false}` nos caminhos de `designTokens`
  e `themeOverride`.
- Nesses caminhos, `ThemeRenderer` continua fornecendo a camada de canvas,
  background/decoracoes e contexto visual, mas renderiza os filhos diretamente
  em `.theme-content`, sem `.inner-card-layer` e sem `DraggableBlock` interno.
- No caminho legado de `theme`, `wrapContentInCard=false` tambem desliga padding
  e border radius estruturais do canvas para nao criar um segundo inset visual.
- Quando o wrapper esta desligado, `cardRef` aponta para o canvas como fallback,
  evitando refs nulas para consumidores que ainda esperam uma referencia.

Implicacao:

- O fluxo principal deixa de criar a segunda moldura/clipping responsavel pelo
  efeito de "post dentro do post".
- `cardLayout`/`isEditingCard` nao devem ser reativados no `PostCardV2` por meio
  de um wrapper interno; se a edicao do card inteiro for necessaria, ela deve ser
  redesenhada no canvas externo ou no snapshot canonico.
- O item foi registrado em
  [`BACKLOG_RENDERIZACAO_POS_TESTES.md`](./BACKLOG_RENDERIZACAO_POS_TESTES.md).

## 59. Correcao global de overlap por pegada de fluxo e clamps - 2026-07-08

Fato observado apos novo print:

- A segunda moldura foi removida, mas headline, body e sections ainda podiam
  colidir verticalmente.
- A causa global nao era uma variacao especifica: `DraggableBlock` media uma
  `flowFootprint` e passava a fixar largura/altura do shell mesmo quando o bloco
  nao estava sendo arrastado.
- Se a medicao inicial acontecia antes da quebra final de linha/fonte, o shell
  ficava menor que o conteudo real; o proximo bloco subia no fluxo e invadia o
  texto anterior.
- Isso afetava preview, HoloDeck e render normal porque o componente era usado
  tambem quando `isDraggable=false`.
- `useTextAutoFit` ja calculava `headlineLineClamp` e `bodyLineClamp`, mas os
  layouts de `PostCardV2` quase nao aplicavam esses limites fora do modo
  compacto.

Correcao aplicada:

- `DraggableBlock` continua medindo `flowFootprint`, mas so reserva a caixa fixa
  durante `pressing`/`dragging` ou quando o bloco ja esta em `freePosition`.
- Em render normal de bloco em fluxo, o shell volta a acompanhar a altura real
  do conteudo, impedindo overlap por medicao congelada.
- `PostCardV2` agora aplica os clamps calculados por `useTextAutoFit` nos
  estilos de headline e body em todos os layouts principais.

Implicacao:

- A protecao de primeira interacao do drag permanece, mas deixa de contaminar o
  layout final.
- Posts estruturados deixam de depender de uma medicao inicial perfeita para nao
  colidir texto e sections.
- A garantia ainda nao substitui um gate visual com DOM real; esse ponto segue
  no backlog como validacao pos-testes.

Validacao:

- `node_modules/.bin/pnpm.cmd exec tsc --noEmit`: passou.

## 60. Gate de direcao de arte para posts estaticos estruturados - 2026-07-08

Fato observado apos os posts sairem de "quebrados" para "ok":

- Os cards passaram a caber e respeitar fluxo, mas ainda faltava acabamento de
  direcao de arte.
- Prints mostraram headlines com promessa incompleta ou numerica ("7...") em
  posts estaticos que, por contrato, renderizam exatamente 3 secoes.
- Isso nao era erro de renderer: era uma resposta de LLM aceita por gates que
  validavam campos, contraste, diversidade e quantidade de secoes, mas nao a
  coerencia entre promessa visual e estrutura renderizavel.
- As descricoes de secoes tambem estavam pequenas demais para funcionar como
  informacao visual; quando longas, viravam ruido de baixa legibilidade.

Correcao aplicada:

- O prompt de `post.generate` passou a instruir posts estaticos como
  pecas de poster/editorial, nao mini-artigos.
- Headline cortado, reticencias finais, dois-pontos finais e numero solto no fim
  passaram a ser proibidos na instrucao.
- Templates estruturados continuam com exatamente 3 secoes, mas agora:
  - headline que promete quantidade de itens deve prometer 3;
  - ideias com 5, 7 ou 10 itens devem virar carrossel ou ser reformuladas sem
    numero;
  - descriptions foram reduzidas de 48 para 36 caracteres.
- `generationValidation` ganhou `hasCoherentStaticItemCount` e rejeita posts
  estaticos estruturados cujo headline promete quantidade diferente das 3
  secoes.
- O criterio de slot completo em `post.generate` agora exige essa coerencia antes
  de aceitar a primeira resposta da LLM.
- `postEvaluation` passou a penalizar discrepancia numerica no headline, nao
  apenas na caption.
- `applyDeterministicCopyGuards` remove reticencias finais e contador solto em
  headline estruturado antes da validacao final.
- O renderer aumentou levemente a legibilidade das descriptions de secoes e
  aplicou `line-clamp-2`, para transformar suporte textual em microcopy legivel
  em vez de ruído.

Validacao:

- `server/ai/generationValidation.test.ts`: 7/7 passaram.
- `server/ai/postEvaluation.test.ts`: 4/4 passaram.
- `node_modules/.bin/pnpm.cmd exec tsc --noEmit`: passou.

## 61. Inicio da Fase 0 do blueprint de orquestracao - 2026-07-08

Fato observado durante o inicio da migracao:

- O boundary canonico de snapshot ainda podia ser atravessado mais de uma vez.
- Quando um `PostVisualSnapshot` v3 entrava novamente em
  `createPostVisualSnapshot`, `layoutSettingsByAspectRatio` podia voltar a vencer
  o `layoutSettings` ja saneado pelo fit visual.
- O mesmo problema aparecia no handoff `HoloDeck -> Workbench`: `editorStore`
  recarregava o snapshot e reescolhia `layoutSettingsByAspectRatio`, desfazendo
  parte da normalizacao visual final.
- A estimativa de altura de texto existia em dois lugares com constantes
  diferentes: `variationSnapshot.ts` e `visualFitValidator.ts`.

Correcao aplicada:

- Criados modulos compartilhados:
  - `shared/layoutToAdvanced.ts`;
  - `shared/visualFit.ts`;
  - `shared/validation.ts`.
- `client/src/lib/layoutToAdvanced.ts` e
  `client/src/lib/visualFitValidator.ts` viraram re-exports compatíveis para os
  imports antigos do frontend.
- `variationSnapshot.ts` passou a usar `shared/visualFit.textHeightPercent` como
  fisica unica para estimar altura de texto.
- `createPostVisualSnapshot` agora preserva `layoutSettings` quando recebe um
  snapshot v3 no mesmo aspect ratio, tornando a reentrada idempotente para esse
  contrato.
- `editorStore.setActiveVariation` preserva `layoutSettings` de snapshots v3 ja
  normalizados, em vez de reabrir a precedencia por
  `layoutSettingsByAspectRatio`.
- `generationValidation.ts` passou a importar as regras compartilhadas de copy,
  sections e coerencia numerica de `shared/validation`.
- `postEvaluation.ts` passou a usar a contagem compartilhada para a penalidade
  de headline/caption.
- `server/routers.ts` passou a chamar o copy guard compartilhado no caminho de
  geracao.

Validacao:

- `client/src/lib/variationSnapshot.test.ts`: 15/15 passaram, incluindo novo
  teste de idempotencia
  `createPostVisualSnapshot(createPostVisualSnapshot(v, ar), ar)`.
- `server/ai/generationValidation.test.ts`: 7/7 passaram.
- `server/ai/postEvaluation.test.ts`: 4/4 passaram; o stderr de "judge offline"
  e esperado pelo mock do teste.
- `node_modules/.bin/pnpm.cmd exec tsc --noEmit`: passou.

Pendencias registradas:

- Ainda existem funcoes locais antigas em `server/routers.ts` e
  `server/ai/postEvaluation.ts` que ficaram sem uso no caminho executado, mas
  nao foram removidas neste corte por diferencas de encoding no arquivo. O
  cleanup deve ser feito em PR separado ou com normalizacao de encoding.
- A premissa de replay por `generationTrace` do blueprint ainda precisa ser
  validada no codigo antes de virar dependencia da Fase 1.

## 62. Preparacao do generationTrace para replay sem nova chamada de LLM - 2026-07-08

Fato observado:

- O trace em memoria (`GenerationTrace.calls`) ja guardava `messages` e
  `response` de cada chamada LLM.
- A persistencia em `generation_runs.prompt_snapshot`, porem, removia
  explicitamente `messages` e `response` antes de salvar.
- Com isso, o shadow mode por replay descrito no blueprint nao era possivel a
  partir dos dados persistidos: havia metadados, custos e hashes, mas nao o
  artefato necessario para reproduzir as saidas sem chamar LLM novamente.

Correcao aplicada:

- `finishGenerationTrace` passou a persistir `promptSnapshot` em formato
  versionado:
  - `version: 2`;
  - `replayable: boolean`;
  - `calls: [...]`.
- Por padrao (`AI_TRACE_STORE_CONTENT=false`), o comportamento continua
  redigido: `messages` e `response` nao sao persistidos.
- Quando `AI_TRACE_STORE_CONTENT=true`, `promptSnapshot.calls[]` inclui
  `messages` e `response`, permitindo replay offline de nos LLM sem novo custo
  de token.
- A mudanca reutiliza a coluna JSONB existente `prompt_snapshot`; nao houve
  alteracao de schema SQL.

Implicacao:

- A Fase 1 do blueprint agora tem um caminho tecnico viavel para replay de
  traces reais sem dupla execucao de LLM, desde que a flag de conteudo esteja
  habilitada no ambiente onde os traces de calibracao forem coletados.
- Ambientes com a flag desligada continuam adequados para metricas e auditoria
  redigida, mas nao para replay completo.

Validacao:

- `server/ai/generationTrace.test.ts`: 3/3 passaram.

## 68. Landing publica `/crie-posts-incriveis` e dobra de prova visual - 2026-07-10

Fato observado:

- A rota publica `/crie-posts-incriveis` e definida em `client/src/App.tsx` e
  renderiza `client/src/pages/Landing4/Landing4.tsx`.
- `Landing4` combina blocos da landing viva (`client/src/pages/landing3`) com
  blocos da Landing2 (`client/src/pages/Landing2`):
  - `HeroDemo`, `HowItWorks`, `Personas`, `FinalCta` e `Footer` vem de
    `landing3`;
  - `ProofSection` e `ShowcaseMarquee` vem de `Landing2`.
- A segunda dobra da landing e `client/src/pages/Landing2/ProofSection.tsx`.
  Ela mostra tres pares "Antes -> Depois" e renderiza os posts com
  `PostRenderer` a partir dos snapshots canonicos criados por
  `createLanding2Snapshot`.
- Os dados demonstrativos ficam em `client/src/pages/Landing2/demoContent.ts`.
  Cada demo possui tres `PostVariation`, normalizadas por
  `createPostVisualSnapshot` antes de renderizar.

Correcao aplicada:

- `ProofSection` deixou de escolher sempre `demo.variations[0]`.
- A dobra agora escolhe intencionalmente uma direcao visual diferente por nicho:
  - restaurante/almoco: variacao `split`, com fotografia de comida e acento
    quente;
  - eletricista: variacao `minimal`, com composicao tecnica e paleta de
    autoridade;
  - salao de beleza: variacao `centered`, com visual de campanha premium em
    preto e rosa.
- O terceiro caso demonstrativo foi ajustado de clinica estetica generica para
  salao de beleza, alinhando prompt, copy, CTA, imagens e tokens visuais.

Implicacao:

- A dobra passa a reforcar a promessa de autoridade visual do PostSpark: tres
  entradas simples geram tres saidas com direcoes de arte distintas, sem criar
  renderer paralelo.
- A implementacao preserva a invariante de fonte unica visual: os exemplos
  continuam passando por `createPostVisualSnapshot` e renderizando pelo mesmo
  `PostRenderer` usado no produto.

Validacao:

- `node_modules/.bin/pnpm.cmd exec tsc --noEmit`: passou.
- `node_modules/.bin/pnpm.cmd exec tsc --noEmit`: passou.

## 63. Fundacao da Fase 1: runner de grafo e replay reader - 2026-07-08

Fato observado:

- O blueprint pede que a Fase 1 comece em shadow/replay, sem trocar o caminho de
  producao e sem duplicar chamadas de LLM.
- A base necessaria para isso ainda nao existia: nao havia runner generico de
  grafo, nem leitor versionado para consumir `prompt_snapshot.version = 2`.
- As metricas operacionais ainda assumiam que `prompt_snapshot` era um array
  legado; apos a secao 62, ele tambem pode ser um objeto `{ version, replayable,
  calls }`.

Correcao aplicada:

- Criado `shared/graphEngine.ts`, um runner tipado minimalista:
  - `nodes` como funcoes `(state, context) => state`;
  - `next` como edge condicional;
  - limite `maxTransitions` para impedir loops infinitos;
  - retorno com `state` final e lista `visited`.
- Criado `server/ai/generationGraph/replay.ts`, leitor de replay versionado:
  - aceita snapshots legados em array como `version: 1`, nao replayaveis;
  - aceita snapshots v2 `{ version, replayable, calls }`;
  - fornece `createReplayCallReader`, que consome chamadas por ordem/label sem
    reutilizar a mesma chamada duas vezes.
- `server/_core/env.ts` ganhou flags ainda nao conectadas ao router:
  - `AI_GRAPH_PIPELINE`;
  - `AI_GRAPH_SHADOW`.
- `server/db.ts` passou a calcular metricas de LLM/fallback tanto com
  `prompt_snapshot` legado em array quanto com o novo formato v2.
- Criado `server/ai/generationGraph/shadow.ts`, que executa um shadow graph
  deterministico atras de `AI_GRAPH_SHADOW`.
- `post.generate` chama esse shadow graph apos a validacao final do caminho
  legado. O shadow:
  - audita metadados de replay a partir do trace em memoria;
  - reexecuta `validateVariationSet` sobre as variacoes finais;
  - registra evento `generation_graph_shadow` no trace;
  - nunca altera a resposta servida ao usuario e nunca chama LLM.

Implicacao:

- A Fase 1 agora roda em modo shadow deterministico quando
  `AI_GRAPH_SHADOW=true`, sem trocar o caminho de producao.
- `AI_GRAPH_PIPELINE` permanece reservado para cutover futuro, depois de paridade
  mensurada.
- O shadow atual ainda cobre apenas replay/schema audit. Os proximos nos
  candidatos sao `creative_composition` e `visual_fit_validation`, depois que o
  snapshot server-side estiver disponivel em `shared/`.

Validacao:

- `shared/graphEngine.test.ts`: 2/2 passaram.
- `server/ai/generationGraph/replay.test.ts`: 2/2 passaram.
- `server/ai/generationGraph/shadow.test.ts`: 2/2 passaram.
- `server/ai/generationTrace.test.ts`: 3/3 passaram.
- `node_modules/.bin/pnpm.cmd exec tsc --noEmit`: passou.

## 64. Snapshot canonico compartilhado e fit visual no shadow graph - 2026-07-08

Fato observado:

- Para o shadow graph evoluir de schema audit para validacao visual, o servidor
  precisava conseguir executar o mesmo normalizador canonico usado pelo client.
- Antes deste corte, `createPostVisualSnapshot` vivia em
  `client/src/lib/variationSnapshot.ts`, junto com uma funcao dependente do
  estado do editor (`buildVariationSnapshot`).
- Isso impedia `visual_fit_validation` server-side sem criar um segundo
  normalizador, o que violaria a invariante de fonte unica dos posts.

Correcao aplicada:

- Criado `shared/variationSnapshot.ts` com o nucleo canonico puro:
  - `createPostVisualSnapshot`;
  - `applyAspectRatioToVariation`;
  - `applyDesignTokensToSnapshot`;
  - `projectSnapshotForSlide`;
  - normalizacao de sections/layouts;
  - sincronizacao de tokens de design.
- `client/src/lib/variationSnapshot.ts` virou wrapper de compatibilidade:
  - reexporta as funcoes canonicas de `shared/variationSnapshot`;
  - mantem localmente apenas `buildVariationSnapshot`, porque essa funcao ainda
    depende do `EditorState`/Zustand.
- `server/ai/generationGraph/shadow.ts` ganhou o no `visual_fit_validation`:
  - cria snapshots com `createPostVisualSnapshot` vindo de `shared`;
  - roda `validateVisualFit` server-side;
  - para carrossel, valida tambem as projecoes por slide via
    `projectSnapshotForSlide`;
  - registra `visualFitIssueCount` e `visualFitErrors` no evento
    `generation_graph_shadow`.

Implicacao:

- O servidor agora consegue auditar o contrato visual final sem depender do
  HoloDeck e sem criar normalizador paralelo.
- O caminho de producao segue inalterado: `AI_GRAPH_SHADOW` apenas registra
  divergencias; `AI_GRAPH_PIPELINE` continua sem cutover.
- Este corte antecipa parte da Fase 2 com baixo risco, porque o client continua
  importando pelo mesmo caminho antigo.

Validacao:

- `client/src/lib/variationSnapshot.test.ts`: 15/15 passaram.
- `server/ai/generationGraph/shadow.test.ts`: 2/2 passaram.
- `server/ai/generationGraph/replay.test.ts`: 2/2 passaram.
- `shared/graphEngine.test.ts`: 2/2 passaram.
- `server/ai/generationTrace.test.ts`: 3/3 passaram.
- `node_modules/.bin/pnpm.cmd exec tsc --noEmit`: passou.

## 65. Expansao do shadow graph com validacoes de copy e estrutura - 2026-07-09

Fato observado:

- A Fase 1 (shadow graph deterministico) começou com 3 nos: replay_audit,
  schema_validation e visual_fit_validation.
- O Blueprint define que o shadow graph deve expandir gradualmente para incluir
  todos os nos deterministicos do pipeline, acumulando baseline de metricas antes
  do cutover.
- Validacoes de copy e estrutura ja existiam em `shared/validation.ts`, mas nao
  eram auditadas no shadow.

Correcao aplicada:

- Expandido `GenerationShadowState` com novos campos de metrica:
  - `copyValidationErrors`: erros de completude de copy (headline, body, caption,
    CTA, imagePrompt)
  - `sectionsValidationErrors`: erros de templates estruturados (3 secoes,
    label/description validos, coerencia numero vs secoes)
  - `copyGuardsApplied`: indica se guards deterministicos truncaram conteudo
  - `copyGuardsChanges`: lista de campos alterados pelos guards
- Adicionados 3 novos nos ao shadow graph:
  - `copy_validation`: executa `hasRequiredCopy` de `shared/validation`
  - `sections_validation`: executa `hasValidStaticSections` e
    `hasCoherentStaticItemCount` de `shared/validation`
  - `copy_guards`: executa `applyDeterministicCopyGuards` e registra alteracoes
- Nova topologia do shadow graph:
  ```
  replay_audit -> schema_validation -> copy_validation -> sections_validation
  -> copy_guards -> visual_fit_validation -> completed
  ```
- Atualizado `recordGenerationEvent` para considerar todas as validacoes na
  determinacao do status (completed/rejected)
- Adicionado teste `detects copy and sections validation failures` para validar
  deteccao de falhas de copy/estrutura

Implicacao:

- O shadow graph agora audita 6 nos deterministicos: replay, schema, copy,
  sections, guards e visual-fit
- Metricas agregadas capturam taxa de falha de copy/estrutura em producao antes
  do cutover
- Novos campos no `generation_graph_shadow` event permitem comparar baseline de
  qualidade antes/depois de expandir nos
- O caminho de producao segue inalterado: divergencias sao registradas mas a
  resposta legado e mantida

Validacao:

- `server/ai/generationGraph/shadow.test.ts`: 3/3 passaram (novo teste adicionado)
- `server/ai/generationGraph/replay.test.ts`: 2/2 passaram
- `shared/graphEngine.test.ts`: 2/2 passaram
- `server/ai/generationTrace.test.ts`: 3/3 passaram
- Total de testes do shadow graph: 10/10 passaram
- `node_modules/.bin/pnpm.cmd exec tsc --noEmit`: passou

## 66. Metricas agregadas do shadow graph para baseline de paridade - 2026-07-09

Fato observado:

- O BLUEPRINT define que o cutover do grafo so deve acontecer apos N runs de
  replay sem divergencia, com baseline numerica estabelecida.
- A Fase 1 especifica coleta de KPIs: taxa de retry por slot, taxa de fallback por
  no, taxa de auto-fix do visual fit, taxa de rejeicao do juiz, taxa de degradacao
  de carrossel.
- Sem esses agregados, "paridade" vira opiniao; com eles, o cutover tem baseline
  numerica para detectar regressao.
- O servidor ja coletava metricas operacionais em `getGenerationOperationalMetrics`,
  mas o shadow graph nao tinha metricas especificas.

Correcao aplicada:

- Expandido `GenerationOperationalMetrics` com novo campo `shadowGraph:
  ShadowGraphMetrics`
- Criado tipo `ShadowGraphMetrics` com metricas especificas:
  - `totalShadowRuns`: total de runs com shadow events
  - `shadowCompletedRuns`/`shadowRejectedRuns`/`shadowFailedRuns`: por status
  - `shadowValidationErrors`/`shadowCopyErrors`/`shadowSectionsErrors`/
    `shadowVisualFitErrors`: contagem de erros por tipo de validacao
  - `shadowGuardsAppliedRate`: taxa de runs onde guards deterministicos alteraram
    conteudo
  - `shadowDivergenceRate`: taxa de runs com qualquer divergencia do shadow
- Implementado `extractShadowGraphEvents`: filtra eventos `generation_graph_shadow`
  de arrays de events
- Implementado `calculateShadowGraphMetrics`: calcula metricas agregadas a partir
  de eventos shadow
- Implementado `getEmptyShadowGraphMetrics`: retorna metricas zeradas quando nao
  ha dados de events disponiveis
- Modificado `getGenerationOperationalMetrics` para incluir `output_snapshot` no
  SELECT e processar shadow events
- Adicionado `server/db.test.ts` com 10 testes para validar as novas funcoes

Implicacao:

- `getGenerationOperationalMetrics` agora retorna metricas completas do shadow
  graph no campo `shadowGraph`
- A infraestrutura de metricas esta pronta para coletar baseline de paridade assim
  que events forem persistidos no banco
- NOTA: Atualmente, eventos do shadow graph sao mantidos apenas em memoria no
  `GenerationTrace` e nao persistidos em `generation_runs`. Para analise historica
  completa, sera necessario adicionar persistencia de events (tabela
  `generation_events` ou coluna `events` em `generation_runs`)
- As metricas retornam zeradas enquanto events nao forem persistidos, preparando
  a infraestrutura para o cutover

Limitacao conhecida:

- Sem persistencia de events no banco, as metricas do shadow graph so podem ser
  calculadas em tempo real, nao historicamente
- A proxima iteracao deve adicionar suporte a persistencia de events para permitir
  analise de baseline ao longo do tempo

Validacao:

- `server/db.test.ts`: 10/10 testes passaram (nova suite de testes de metricas)
- `server/ai/generationGraph/shadow.test.ts`: 3/3 passaram
- `server/ai/generationGraph/replay.test.ts`: 2/2 passaram
- `shared/graphEngine.test.ts`: 2/2 passaram
- `server/ai/generationTrace.test.ts`: 3/3 passaram
- Total de testes relacionados: 20/20 passaram
- `node_modules/.bin/pnpm.cmd exec tsc --noEmit`: passou

## 67. Auditoria e correções do blueprint de orquestração — 2026-07-10

Auditoria técnica read-only seguida de correções sobre tudo implementado até aqui
do `BLUEPRINT_ORQUESTRACAO_PIPELINE_GERACAO.md` (Fases 0 e 1). Esta seção registra
os defeitos encontrados e as correções aplicadas.

### 67.1. Pipeline graph determinístico (`server/ai/generationGraph/pipeline.ts`)

Fato confirmado (módulo não documentado antes desta seção):

- `pipeline.ts` é um segundo grafo determinístico, mais ambicioso que o shadow
  graph, conectado a `post.generate` em `server/routers.ts` atrás da flag
  `AI_GRAPH_PIPELINE` (default desligada).
- Diferente do shadow graph (auditoria silenciosa, sempre que
  `AI_GRAPH_SHADOW=true`), o pipeline graph percorre 13 nós cobrindo quase todo o
  fluxo canônico: `replay_audit → context_audit → schema_validation →
  copy_validation → sections_validation → copy_guards → quality_audit →
  composition_audit → snapshot_audit → visual_fit_validation → caption_audit →
  final_approval → completed`.
- Cada nó emite um `PipelineEvent` (`ok`/`warn`/`error`) e o `completed` computa
  KPIs agregados (`PipelineKpi`). O resultado é registrado como evento
  `generation_graph_pipeline` no trace, consumido por
  `calculatePipelineGraphMetrics` em `server/db.ts`.
- Como o shadow graph, é determinístico, re-executa apenas nós sem LLM e nunca
  altera a resposta servida ao usuário quando desligado.

### 67.2. Correções de bugs aplicadas

1. **`shadow.ts` quebrava o build e o runtime** (`tsc` → `TS2304`,
   `ReferenceError: updateGenerationRun is not defined`): um bloco tentava
   persistir os events do shadow chamando `updateGenerationRun`, mas a função não
   era importada e, mesmo importada, a chamada seria prematura (rode antes do
   `finishGenerationTrace` criar a linha em `generation_runs`). Removido. Os
   events do shadow graph já são persistidos pelo caminho correto:
   `recordGenerationEvent` adiciona ao `trace.events` em memória e
   `finishGenerationTrace` grava o array completo em `generation_runs.events`
   (após o upsert). Isto corrige também a descrição da §66: a persistência de
   events já funciona; não há lacuna pendente.
2. **Flag `replayable` hardcoded em `shadow.ts`/`pipeline.ts`**: agora deriva da
   realidade das calls em memória (`calls.every((c) => c.response !== undefined)`),
   com comentário esclarecendo que o trace em memória sempre popula
   `messages`/`response` e que `AI_TRACE_STORE_CONTENT` só controla persistência,
   não o objeto lido pelo grafo.
3. **`replayableCallCount`/`replayCallsReplayable` inconsistentes com o flag**:
   usavam `"response" in c` (verdadeiro mesmo para `response: undefined`).
   Alinhados para `c.response !== undefined`, consistentes com o cálculo do flag.
4. **`brandGuardianFallbackRate` era dead code** (`state.brandGuardianApplied ? 0
   : 0` — sempre zero). Agora reflete o estado: `0` quando o guardian
   determinístico rodou, `1` quando não há evento `brand_visual_qa` (caminho
   determinístico implícito).
5. **`visualFitAutoFixRate` misturava unidades** (total de issues vs número de
   variações com erro) e podia ser negativo. Como o nó observa apenas o snapshot
   pós-`applyVisualFitFallback`, a taxa real de auto-fix não é computável sem um
   hook pré-fallback. O KPI agora é `null` (indisponível) honestamente, e o tipo
   `PipelineGraphMetrics.pipelineVisualFitAutoFixRate` passou a `number | null`.
   `calculatePipelineGraphMetrics` ignora runs `null` no denominador da média.

### 67.3. Cobertura de testes adicionada

- Criado `server/ai/generationGraph/pipeline.test.ts` (5 testes): flag desligada,
  execução completa aprovando conjunto válido, `replayable` derivado de calls sem
  `response`, detecção de falhas de schema/copy/sections, e reprovação terminal no
  `final_approval`. O teste do flag `replayable` expôs o bug #3 acima (inconsistência
  entre o flag e o contador), que foi então corrigido em `shadow.ts` e `pipeline.ts`.

### 67.4. Gate da Fase 0 confirmado resolvido (sem seção própria até aqui)

Itens do diagnóstico do blueprint já estavam corrigidos no código, mas sem registro
no mestre:

- **G3** (chamada morta de `directCreative` em `routers.ts`): removida — não há mais
  referência.
- **G11** (branch morto do pipeline legado de URL: `isLegacySitePipelineEnabled`,
  `chameleonVision`, `captureScreenshot`, enriquecimento por `chameleonPosts`):
  removido — não há mais referência.
- **G12** (drift de contrato do snapshot persistido): `post.save`/`post.update` agora
  validam via `postVisualSnapshotSchema.parse(input.variationSnapshot)` em vez de
  `as any`; os casts foram eliminados.
- **Backlog item 10** (duplicatas locais): `applyDeterministicCopyGuards` em
  `routers.ts` e `advertisedItemCounts` em `postEvaluation.ts` foram removidos; ambos
  importam de `@shared/validation`. Confirmação atualizada no
  `BACKLOG_RENDERIZACAO_POS_TESTES.md`.

Validação:

- `npx tsc --noEmit`: passou (era `exit 2` antes da correção #1).
- `server/ai/generationGraph/` (shadow + replay + pipeline): 10/10 passaram.
- `server/db.test.ts`: 10/10 passaram.
- `shared/graphEngine.test.ts`: 2/2 passaram.
- `server/ai/generationTrace.test.ts`: 3/3 passaram.

## 68. Fase 2 do blueprint — Snapshot server-side e correção do G4 — 2026-07-10

Esta seção registra a implementação da Fase 2 do
`BLUEPRINT_ORQUESTRACAO_PIPELINE_GERACAO.md`. O objetivo é que o servidor emita
`PostVisualSnapshot[]` (v3 frozen) prontos, eliminando a re-normalização client
que causava layouts "tortos" e texto cortado. Resolve os defeitos estruturais
**G2, G4 e G5** do blueprint.

### 68.1. Correção do G4 — `composeVariation` parametriza canvas pelo aspect ratio

Fato observado (defeito G4):

- `shared/creative/compose.ts` hardcodedava `docWidth = 360`, `docHeight = 360`
  e `aspectRatio: "1:1"`. As decorações `textElements` (`cd-*`) das famílias
  criativas eram posicionadas via `pxX`/`pxY` neste espaço 1:1 fixo.
- Em cards 5:6/9:16, o `visualFitValidator` reinterpretava essas coordenadas px
  contra uma altura de canvas diferente, detectando-as como "fora do canvas" e
  removendo-as silenciosamente via `applyVisualFitFallback` — a origem estrutural
  de layouts quebrados por formato.

Correção aplicada:

- `compose.ts` agora deriva `docHeight` do `variation.aspectRatio` usando a mesma
  fórmula de `shared/visualFit.ts:canvasHeight` (`docWidth * h / w`).
- `1:1` permanece como fallback quando a variação não carrega aspect ratio —
  sem mudança de comportamento para o caso default.
- As famílias criativas (`families.ts`) não precisaram mudar: elas já usam
  `pxX`/`pxY` que derivam de `doc`; com `doc` correto, as decorações são
  autoradas no espaço geométrico certo.

### 68.2. Servidor emite snapshot frozen em `post.generate`

Fato observado:

- O servidor retornava `PostVariation[]` cru (output de `composeVariation`).
- O client re-normalizava em `Home.tsx` (3 pontos), `HoloDeck.getPreviewVariation`
  e `editorStore.setActiveVariation`.
- Essa re-normalização era a origem do defeito G2/G5: o que o juiz aprovou não
  era o que era entregue, pois o client re-deriva layout/cores/decorações.

Correção aplicada (`server/routers.ts`):

- Após `composeVariation` montar `generatedVariations`, o servidor mapeia cada
  variação por `createPostVisualSnapshot(v, v.aspectRatio ?? "1:1")`, produzindo
  `frozenSnapshots: PostVisualSnapshot[]`.
- Todo o fluxo seguinte (`validateVariationSet`, shadow/pipeline graph,
  `assertVariationSet`, `persistCandidateFingerprints`, `finishGenerationTrace`,
  log operacional e o `return`) passa a operar sobre os snapshots frozen.
- O `post.generate` retorna `variations: frozenSnapshots` (v3).
- Decisão de escopo: o aspect ratio usado é o da própria variação (emitido pelo
  LLM por variação), não um `input.aspectRatio` no request. Não houve adição de
  seletor de formato na UI — o usuário continua trocando formato no HoloDeck.

### 68.3. Client para de re-normalizar snapshots v3

Os pontos de entrada do client ganharam guards `snapshotVersion === 3`:
pass-through direto quando o snapshot já é frozen, normalização apenas para
variações legadas (sem versão).

- **`Home.tsx`**: helper `ensureSnapshot(variation)` aplicado nas 3 entradas
  (ideation, execution-brief, sessionStorage restore). As duas primeiras recebem
  v3 do servidor; a terceira pode receber v3 ou legado.
- **`HoloDeck.tsx:getPreviewVariation`**: consumo direto quando `snapshotVersion
  === 3`; o `customTokens`/tema aplicado pelo usuário continua aplicado
  client-side via `applyDesignTokensToSnapshot`.
- **`editorStore.ts:setActiveVariation`**: confia no snapshot v3 quando
  `snapshotVersion === 3 && variation.aspectRatio === aspectRatio`. O guard de
  `initialLayout` (já existente na linha 443) passa a ser efetivo.

Pontos que NÃO mudaram (por design — são interações do usuário):

- `HoloDeck.updateActiveVariation` (copy edit): re-normaliza variação mutada.
- `editorStore.setAspectRatio`: re-normaliza ao trocar formato no editor.
- `buildVariationSnapshot`/`setWithSnapshot`: fluxo de edição permanece
  re-derivando; o freeze só vale na entrega (fronteira servidor→client).

### 68.4. Invariante reforçada

A invariante da seção 27 ("fonte única da verdade dos posts") agora é garantida
por tipo frozen server-side, não apenas por disciplina:

- O servidor emite `PostVisualSnapshot` (v3) após `composeVariation` +
  `createPostVisualSnapshot` (que inclui `applyVisualFitFallback`).
- O client não re-atravessa o normalizador para snapshots v3 — o que foi
  congelado server-side é o que chega ao HoloDeck/Workbench.
- `snapshotVersion` permanece em 3; não houve mudança de schema persistido.
- Posts salvos legados (sem `snapshotVersion`) continuam funcionando: o guard
  detecta a ausência de versão e re-normaliza via fallback.

### 68.5. Testes de contrato

`client/src/lib/variationSnapshot.test.ts` ganhou 4 testes:
1. Snapshot v3 do servidor entra no store **idêntico** (sem re-normalização
   destrutiva) via `loadSnapshot`.
2. Re-normalizar um snapshot v3 no mesmo aspect ratio é idempotente
   (gate da Fase 0 aplicado ao contrato da Fase 2).
3. Snapshot em 9:16 é válido contra `postVisualSnapshotSchema` (validação
   indireta do G4: decorações `cd-*` não são mais droppadas como
   out-of-canvas).
4. Variação legada (sem `snapshotVersion`) ainda é normalizada na hidratação do
   store (compatibilidade reversa).

Validação final:

- `npx tsc --noEmit`: passou.
- `client/src/lib/variationSnapshot.test.ts`: 19/19 passaram.
- Suíte completa: ver seção de validação no final da entrega.

### 68.6. Correções pós-teste manual (HoloDeck/Workbench) — 2026-07-11

O teste manual após a Fase 2 revelou três regressões introduzidas pela
implementação inicial:

1. **HoloDeck: post "torto" em 1:1, alinha em 9:16.** O guard de `getPreviewVariation`
   fazia pass-through incondicional de qualquer snapshot v3, ignorando troca de
   formato no seletor. Resultado: ao trocar para um formato diferente do original
   do snapshot, o `PostCardV2` renderizava geometria do formato errado.
   - Correção: o guard agora compara `variation.aspectRatio === aspectRatio` (o
     do seletor). Só pass-through quando coincidem; troca de formato re-normaliza
     (comportamento legítimo, o usuário quer ver o post em outro formato).

2. **Workbench: trocar de formato mudava cor e design.** `setAspectRatio` chamava
   `createPostVisualSnapshot(variation, currentRatio)` que re-aplica
   `applyAspectRatioToVariation`, o qual sobrescreve cores com
   `aspectRatioOptimizations[currentRatio]` (otimizações por formato do LLM, que
   podem ter paletas completamente diferentes).
   - Correção: `setAspectRatio` agora remove os campos de cor
     (`backgroundColor`/`textColor`/`accentColor`) das `aspectRatioOptimizations`
     da variação de entrada antes de normalizar, preservando apenas a geometria
     (headline/body/card). As cores top-level e os `designTokens` são re-forçados
     via `synchronizeDesignTokenColors` após o snapshot. Geometria continua
     adaptando ao novo formato; cores permanecem as que o usuário via.
   - Decisão de produto: preservar design ao trocar formato (confirmado com o
     usuário). `aspectRatioOptimizations` do LLM fica restrito à geração inicial.

3. **Divergência HoloDeck vs Workbench.** Causa comum ao item 1: o HoloDeck
   mostrava o snapshot frozen sem re-normalizar, mas o `loadSnapshot` do store
   re-normalizava quando o formato não coincidia. Resolvido pela mesma correção
   — ambos agora operam sobre o mesmo snapshot re-normalizado quando há troca de
   formato.

Validação adicional:

- `client/src/store/editorStore.test.ts`: 31/31 (novo teste de regressão
  "preserves colors when switching aspect ratio, even with per-format color
  optimizations").
- `client/src/lib/variationSnapshot.test.ts`: 19/19.
- `npx tsc --noEmit`: passou.

Pendência registrada (fora do escopo desta correção):

- **Salto no drag-and-drop** (`DraggableBlock.tsx` — medição de `flowFootprint`
  no `pointerDown`): bug separado do motor de interação, não resolvido pela Fase 2.
  Permanece para corte próprio.

### 68.7. Causa raiz verdadeira — sincronização do seletor de aspecto — 2026-07-11

As correções 68.6.1 e 68.6.3 trataram sintomas, mas não resolveram o problema em
teste manual. A causa raiz real era diferente:

**O seletor de aspect ratio do HoloDeck (`useState<AspectRatio>("1:1")`) nunca
era sincronizado com o aspect ratio dos snapshots que chegavam do servidor.**

Fato confirmado:

- O design é multi-formato: cada uma das 3 variações de um run tem seu próprio
  `aspectRatio` (uma 1:1, outra 5:6, outra 9:16), conforme instrução do prompt
  (`server/routers.ts:835` — "Cada variação deve fluir formatada no aspectRatio
  correspondente").
- O `useEffect` que sincroniza `localVariations` em nova geração (HoloDeck.tsx)
  atualizava `localVariations` e `currentIndex`, mas **não** `aspectRatio`.
- Resultado: o servidor entregava um snapshot frozen 9:16, mas o seletor ficava
  preso em `"1:1"`. O guard de `getPreviewVariation` (`variation.aspectRatio ===
  aspectRatio`) sempre dava falso, re-normalizando para o formato errado. Daí:
  - post "torto" em 1:1 (snapshot era 9:16 forçado em canvas 1:1);
  - alinhava ao trocar manualmente para 9:16 (formato original do snapshot);
  - divergência HoloDeck/Workbench (cada um re-normalizava diferente).

Correção aplicada (`client/src/components/views/HoloDeck.tsx`):

- Ao chegar nova geração: `setAspectRatio(variations[0].aspectRatio)`.
- Ao navegar entre variações (`goNext`/`goPrev`/mudança de `currentIndex`):
  `setAspectRatio(localVariations[currentIndex].aspectRatio)` via `useEffect`
  reagindo a `[currentIndex, localVariations]`.
- O usuário ainda pode forçar um formato manualmente no seletor: o `useEffect`
  só re-sincroniza ao navegar, não ao clicar o seletor (as deps não mudam num
  clique manual). Assim, navegar mostra cada variação no seu formato original;
  forçar formato re-normaliza (comportamento legítimo).

Lição registrada:

- As duas primeiras tentativas corrigiram o guard de `getPreviewVariation` e o
  `setAspectRatio`, mas não resolveram porque a entrada do problema (seletor
  dessincronizado) estava num terceiro lugar não mapeado. Validação manual entre
  rodadas teria poupado as tentativas intermediárias; correções de layout visual
  não devem ser declaradas resolvidas sem confirmação no produto.

## 69. Fase 3 do blueprint — Juiz de direção de arte (layoutIntegrity) — 2026-07-11

Esta seção registra a implementação da Fase 3 do
`BLUEPRINT_ORQUESTRACAO_PIPELINE_GERACAO.md`. O objetivo é estender o juiz de
qualidade com a dimensão `layoutIntegrity`, alimentada pelo `validateVisualFit`
+ sumário geométrico. Candidatos com layout quebrado são rejeitados e revisados.
Resolve o defeito estrutural **G2** ("motor criativo/QA roda antes da composição;
o juiz não vê geometria").

### 69.1. O problema estrutural (G2)

`evaluateAndReviseCandidates` (`server/routers.ts:1477`) roda **antes** de
`composeVariation` (1623) e `createPostVisualSnapshot` (1627). No momento da
avaliação, `EvaluatedCandidate` só carregava texto+cor (herdava de
`VariationDiversityInput` que não tinha `layoutSettings`/`textElements`/
`template`/`sections`/`aspectRatio`). O juiz era cego para geometria.

### 69.2. Decisão arquitetural — snapshot transitório no avaliador

Em vez de reordenar o pipeline (mover `evaluateAndReviseCandidates` para depois
da composição — alto risco, muda a semântica da revisão cirúrgica de texto), a
solução escolhida foi **construir um snapshot transitório dentro do avaliador**:

- `EvaluatedCandidate` foi estendido com campos visuais opcionais
  (`template`, `aspectRatio`, `sections`, `layoutSettings`, `textElements`).
- `computeLayoutIntegrity` constrói um snapshot via `createPostVisualSnapshot`
  e roda `validateVisualFit`. Como `createPostVisualSnapshot` aplica
  `applyVisualFitFallback` internamente, `validateVisualFit` só vê issues
  **não-corrigíveis** — se o fallback resolveu, integridade é alta; se sobraram
  issues, penaliza.

### 69.3. Implementação (7 touchpoints, padrão captionCoherence)

A dimensão `layoutIntegrity` foi adicionada replicando o padrão da dimensão
`captionCoherence` (a prova de que o template funciona):

1. **Tipo** (`shared/postspark.ts`): `layoutIntegrity: number` em
   `GenerationEvaluationSummary.dimensions`.
2. **Schema Zod** (`shared/postsparkSchemas.ts`): `layoutIntegrity: z.number()`
   em `generationEvaluationSchema`. Propaga automaticamente para
   `generationMetaSchema` → `postVisualSnapshotSchema`.
3. **`EvaluatedCandidate`** (`server/ai/postEvaluation.ts`): estendido com
   campos visuais opcionais.
4. **`computeLayoutIntegrity`** (`server/ai/postEvaluation.ts`): nova função que
   constrói snapshot transitório, roda `validateVisualFit` e penaliza por tipo de
   issue (`headline_body_overlap: 35`, `structured_absolute_layout: 25`,
   `card_too_narrow: 20`, decorações: 15 cada).
5. **`deterministicEvaluation`**: adicionada `layoutIntegrity` ao objeto
   `dimensions`.
6. **`summarize`**: pesos rebalanceados (soma 1.00 com a nova dimensão) e
   `layoutIntegrity >= 50` adicionado como hard gate de aceitação.
7. **`llmEvaluation`**: JSON schema (strict) + `dimensionKeys` atualizados.
8. **Feedback geométrico**: quando `layoutIntegrity < 50`, `summarize` injeta
   feedback acionável ("encurte o body e o headline para que o conteúdo caiba sem
   colidir") que a closure `revise` em `routers.ts` já serializa no prompt de
   revisão — chega ao revisor automaticamente.

### 69.4. Rebalanceamento de pesos

Os 9 pesos originais somavam 1.00. Com `layoutIntegrity: 0.10`, os existentes
foram reduzidos preservando a importância relativa (maiores reduções nas
dimensões de maior peso). A soma permanece 1.00.

### 69.5. Ajuste do pipeline High Ticket

`server/ai/highTicket/qaEvaluator.ts` também foi atualizado para incluir
`layoutIntegrity` em `normalizeDimensions`, no schema JSON strict do juiz High
Ticket, no gate de aprovação do prompt e no fallback de erro. O default de
normalização é `75` (neutro) e o fallback de erro é `50`.

### 69.6. Comportamento

- Candidato sem issues visuais → `layoutIntegrity === 100`.
- Candidato com `headline_body_overlap` → penalizado (-35).
- `layoutIntegrity < 50` → `accepted === false` + feedback geométrico → revisão
  cirúrgica orientada a encurtar texto (o que reduz overflow e permite que
  `applyVisualFitFallback` resolva a geometria).
- Funciona mesmo com juiz LLM offline (`aiLlmJudgeEnabled=false`): a dimensão é
  determinística.

### 69.7. Validação

- `npx tsc --noEmit`: passou.
- `server/ai/postEvaluation.test.ts`: 8/8 (4 novos testes de `layoutIntegrity`).
- Suíte completa: ver seção de validação no final da entrega.

### 69.8. Fora de escopo (explicitamente)

- Revisão por slot que re-entra em `schema_validation` (G7/G8) — entrega futura.
- Juiz v2 com screenshot headless (visão computacional) — blueprint §5, evolução
  pós-migração.
- Per-slide evaluation (carousel) — blueprint linha 161, Fase 3 v1 é base slide
  apenas.
- Correção do salto no drag-and-drop (bug separado do motor de interação).

### 69.9. Detecção preventiva de truncamento visual

O `validateVisualFit` também detecta quando headline ou body exigem mais linhas
do que o `line-clamp` aplicado pelo `PostCardV2`. A estimativa considera a
largura efetiva do textbox, o decay de fonte do `useTextAutoFit`, os
multiplicadores `headlineFontSize`/`bodyFontSize`, o aspect ratio e os limites
de linhas do renderer.

Essa verificação não usa apenas quantidade de caracteres: uma frase curta pode
ser truncada quando colocada em uma caixa estreita. A issue
`text_exceeds_visible_area` recebe penalidade 55 em `layoutIntegrity`, suficiente
para acionar o hard gate e enviar o candidato à revisão. O feedback orienta
primeiro ampliar a caixa quando houver espaço e, caso contrário, encurtar a copy
até que todo o conteúdo fique visível, sem reticências. Em `9:16` a verificação
não é aplicada porque o renderer não usa line-clamp nesse formato.

### 69.10. Revisão por slot com reentrada no funil (G7/G8)

A revisão cirúrgica de qualidade deixou de aceitar diretamente a saída do LLM.
O fluxo de `evaluateAndReviseCandidates` agora processa slots rejeitados em
sequência, evitando corrida entre revisões que dependem da diversidade do
conjunto. O `post.generate` configura no máximo duas tentativas por slot.

Cada saída revisada passa por `validateRevisedCandidate`, em
`server/ai/revisionValidation.ts`, que executa:

1. `applyDeterministicCopyGuards`;
2. `enforceBrandVisualGuardian` quando existe Site Intelligence;
3. `validateVariationSet` sobre o conjunto provisório completo, incluindo
   schema, copy obrigatória, seções, carrossel e diversidade;
4. criação do snapshot canônico;
5. `validateVisualFit`, incluindo truncamento por line-clamp.

Se a tentativa falhar, os erros determinísticos entram no feedback da tentativa
seguinte. O candidato inválido não substitui o slot autoritativo. Quando o
limite é esgotado, o original é preservado e o índice entra em
`revisionFailedIndexes`; o evento `quality_revision_loop` registra
`fallback`, contagens e índices afetados. Assim:

- G7 é fechado porque uma revisão que reintroduz similaridade é rejeitada antes
  de entrar no conjunto;
- G8 é fechado porque cores emitidas pela revisão passam novamente pelo Brand
  Guardian e pelo gate WCAG;
- revisão que ainda produz texto truncado também é rejeitada.

Testes específicos cobrem retry com feedback, similaridade pós-revisão, reaplicação
de paleta/contraste e truncamento visual pós-revisão.

### 69.11. Validação da revisão por slot

Validação executada em 2026-07-11:

- `npm run check`: passou;
- `server/ai/postEvaluation.test.ts`: 9/9;
- `server/ai/revisionValidation.test.ts`: 3/3;
- `server/ai/generationValidation.test.ts`: 7/7;
- `client/src/lib/variationSnapshot.test.ts`: 21/21;
- `server/post.test.ts`: 5/5, incluindo integração de `post.generate`;
- suíte completa após estabilização do motor de interação: 305/305 passaram.

As 8 falhas inicialmente encontradas foram resolvidas no gate 70.1. O TypeScript
e toda a suíte estão verdes antes do próximo corte.

## 70. Sequência restante até a conclusão do blueprint

Esta ordem continua sendo dependência de entrega:

### 70.1. Gate de estabilização da Fase 3

Concluído em 2026-07-11 no corte automatizado:

1. O slop padrão passou de 3 para 5 CSS px e permanece independente do zoom.
2. Movimento abaixo do slop volta a ser click sem commit.
3. O reducer passou a consumir os candidatos reais de snap. No canvas integrado,
   o grid mantém prioridade quando oferece snap; candidatos são fallback. Fora
   do canvas, vence o snap de menor deslocamento por eixo.
4. O shell de blocos em fluxo preserva o footprint medido durante e após o
   primeiro drag, mantendo o HTMLElement capturado estável.
5. `PreviewState` passou a declarar `candidates` e `snapConfig`, alinhando
   o contrato TypeScript ao estado real.
6. Testes focados de interação/DOM: 45/45.
7. Suíte completa: 305/305.
8. `npm run check`: passou.

Validação manual de geração estática/carrossel e observação dos eventos
`quality_revision_loop` continuam sendo atividades de operação, sem bloquear
o início do corte 70.2. `AI_GRAPH_PIPELINE` permanece desligado.

### 70.2. Fechamento operacional da Fase 1 e cutover

Implementação de código concluída em 2026-07-11:

1. `finishGenerationTrace` persiste o array completo de
   `GenerationDebugEvent` em `generation_runs.events`.
2. O contrato ganhou `events_version = 1`, propagado por tipos, Drizzle e
   persistência Supabase.
3. A sintaxe inválida do índice GIN da migração `0012` foi corrigida.
4. A migração corretiva idempotente `0013_harden_generation_events.sql`
   cobre ambientes novos ou parcialmente migrados, normaliza valores não-array,
   aplica `NOT NULL`/default e recria o índice.
5. `getGenerationOperationalMetrics` agrega os eventos históricos de shadow e
   pipeline já persistidos.
6. `evaluateGraphCutoverReadiness` bloqueia rollout até existir:
   - pelo menos 100 runs shadow;
   - completion rate de pelo menos 99%;
   - divergence rate de no máximo 1%;
   - zero runs shadow com falha.
7. O painel Admin exibe o número de runs observados, estado
   `bloqueado`/`pronto para rollout` e todos os bloqueadores.
8. O gate é somente informativo: nenhuma flag é habilitada automaticamente e
   `AI_GRAPH_PIPELINE` permanece desligado.

Validação:

- `npm run check`: passou;
- `server/db.test.ts`: 13/13;
- `server/ai/generationTrace.test.ts`: 4/4;
- testes shadow/pipeline: 8/8.

Pendências operacionais antes do cutover:

1. Aplicar as migrações `0012` e `0013` no Supabase alvo.
2. Manter shadow/replay ativo até acumular o mínimo de 100 runs.
3. Investigar qualquer blocker mostrado pelo Admin.
4. Somente quando `graphCutoverReadiness.ready === true`, iniciar rollout
   gradual de `AI_GRAPH_PIPELINE`, mantendo fallback legado.
5. Remover o caminho legado apenas após paridade observada e rollback testado.

### 70.3. Fase 4 — billing reserve/commit/refund

1. Criar reserva lógica de Sparks no início da geração.
2. Fazer commit somente em `final_approval`.
3. Fazer refund idempotente em falha terminal.
4. Tipar os resultados: `refunded_failure`, `payment_required` e
   `delivered_degraded`.
5. Adaptar `Home.tsx` e `UpgradePrompt` para mensagens distintas.
6. Cobrir concorrência, retry, dupla finalização e idempotência.
7. Fazer deploy isolado, com observação exclusiva de saldo e rollback.

### 70.4. Fase 5 — unificação High Ticket

1. Fazer `strategy_router` absorver `intentRouter`.
2. Colapsar QA, captions, originalidade e fit visual nos nós canônicos.
3. Transformar `highTicket/` em configuração de estratégia, não pipeline
   paralelo.
4. Remover flags e caminhos duplicados após paridade de telemetria.

### 70.5. Evoluções pós-migração e backlog visual

1. Adicionar juiz v2 opcional com render DOM/headless e screenshot atrás de flag.
2. Validar todos os templates estruturados nos três aspect ratios em DOM real.
3. Definir contrato único de coordenadas de `textElements` e migração legada.
4. Persistir diagnóstico visual tipado em `generationMeta`, decidindo antes
   se exige incremento de `snapshotVersion`.
5. Corrigir slop, snap e click pendentes no motor de interação.
6. Validar família visual em snapshots legados sem `creativeDirection`.
7. Decidir o destino de `cardLayout` sem recriar wrapper visual interno.

### 70.6. Invariância visual na troca de aspect ratio

Correção implementada em 2026-07-12 após validação visual no HoloDeck em 1:1,
5:6 e 9:16:

1. A troca de formato de um `PostVisualSnapshot` autoritativo usa a opção
   `preserveVisualIdentity` do normalizador canônico. O reflow pode consumir
   geometria específica do formato, mas não pode trocar paleta, background,
   família de layout ou elementos visuais do post selecionado.
2. `aspectRatioOptimizations` continua sendo aplicado na resolução inicial da
   saída da IA. Em reflow de um snapshot já escolhido, seus campos de cor e
   `layout` não têm precedência sobre a identidade autoritativa.
3. Headline e body sugeridos pela IA têm largura mínima segura de 36% do canvas.
   Valores menores, ausentes ou superiores a 100% recebem fallback/clamp antes
   da renderização, impedindo texto em coluna, letra por letra.
4. O fallback visual continua podendo descartar decoração inválida durante a
   normalização inicial. Na mera troca de formato, `textElements` e
   `imageElements` do snapshot são preservados; o reflow não pode apagá-los.
5. HoloDeck e `editorStore.setAspectRatio` usam o mesmo caminho canônico. A
   lógica local duplicada de preservação de cores no store foi removida.
6. `variationSnapshot.test.ts` cobre a regressão observada: otimização 5:6 com
   paleta divergente, `layout: split`, textboxes estreitos e elementos visuais.
   O contrato exige identidade preservada e larguras seguras nos três formatos.

### 70.7. Auditoria da diversidade estrutural da geração

Diagnóstico confirmado em 2026-07-12 após uma geração em que as três variações
saíram visualmente como `split`:

1. `contentStrategy` diferencia estratégia editorial (tema, ângulo, promessa e
   audiência), mas não emite um contrato visual por slot.
2. Cada slot de LLM ainda escolhe livremente `layout` e
   `aspectRatioOptimizations`. O retry de diversificação pede ao modelo pelo
   menos dois layouts, mas `variationsNeedDiversification` só reprova layouts
   iguais quando combinados com alta semelhança de copy/tom/cores. Três copies
   diferentes com o mesmo `split` podem ser aceitas.
3. Depois da diversificação, `composeVariation` escolhe/aplica uma família
   criativa e pode substituir o layout do LLM. A chamada em `post.generate` é
   um `map` sem `excludeFamilyIds` nem memória das famílias já usadas; seeds
   únicos tornam a escolha determinística por slot, mas não garantem famílias
   ou células de composição distintas.
4. A validação final roda depois da composição, porém reutiliza o mesmo guard
   lexical; ela não exige quantidade mínima de layouts, `familyId` distinto ou
   distância entre eixos de composição.

Consequência: existem quatro produtores parciais de diversidade visual (LLM de
slot, rewrite de diversificação, família criativa e validação), mas nenhum dono
do contrato do conjunto final. Isso permite uma geração semanticamente variada
e visualmente monótona.

Próxima fase recomendada — **orquestrador de diversidade visual**:

1. Criar um plano visual de conjunto antes da composição, reservando para os
   três slots famílias/células distintas e pelo menos dois layouts compatíveis
   com o conteúdo.
2. Passar as reservas a `composeVariation` sequencialmente por
   `excludeFamilyIds`/células, em vez de escolher famílias de modo independente.
3. Tratar layout e paleta vindos do LLM como hints subordinados ao plano visual;
   `aspectRatioOptimizations` deve guardar geometria de formato, não trocar a
   identidade de uma variação.
4. Estender `validateVariationSet` com invariantes pós-composição: mínimo de
   dois layouts, famílias/células diferentes e elementos compatíveis. Em falha,
   recompor deterministicamente o slot, sem pedir reescrita de copy como primeira
   reação.
5. Persistir no trace métricas de diversidade visual (layouts, famílias, células
   e fallback de recomposição) para o Admin/shadow observar a distribuição real.

Implementação realizada em 2026-07-13:

1. `shared/creative/visualDiversityPlan.ts` é agora o dono do contrato visual
   do conjunto. Ele compõe os três slots em sequência, reservando famílias e
   células anteriores e avaliando o **layout efetivamente produzido** por cada
   família, não apenas o hint de `layout` da LLM.
2. `creativeCellOf` é exportado por `directCreative`; as reservas chegam à
   escolha determinística por `excludeFamilyIds`, em vez do `map` independente
   que existia em `post.generate`.
3. `validateVariationSet` aplica invariantes pós-composição: pelo menos dois
   layouts, duas famílias e duas células de composição. A recomposição ocorre
   antes desse gate, sem pedir uma reescrita de copy como primeira reação.
4. `post.generate` persiste no trace o evento `visual_diversity_plan`, com
   layouts, famílias, células, tentativas e eventual fallback. O shadow segue
   observacional; o evento permite acompanhar a distribuição real no Admin.
5. Os testes `visualDiversityPlan.test.ts` e `generationValidation.test.ts`
   cobrem tanto a composição de um conjunto diverso quanto a rejeição de um
   conjunto final que colapsa para um único layout.

## 70. Fase A — Fronteira canônica do snapshot (2026-07-13)

Conclusão das quatro sub-fases que fecham a consistência entre geração e
edição manual. Referência: `PLANO_CONCLUSAO_BLUEPIRNT.md` §3.

### A.1 — Normalização canônica em edições do Workbench

- **Antes:** `client/src/lib/variationSnapshot.ts::buildVariationSnapshot`
  montava o `PostVisualSnapshot` manualmente com `as PostVisualSnapshot`,
  pulando `createPostVisualSnapshot` e, portanto, `applyVisualFitFallback`.
  Uma edição podia produzir headline/body sobrepostos ou texto fora do canvas
  sem correção.
- **Agora:** `buildVariationSnapshot` constrói um draft `PostVariation` com os
  campos vivos do editor (`baseLayoutSettings`, `baseImageSettings`,
  `baseBgValue`, `baseBgOverlay`) e chama `createPostVisualSnapshot(draft,
  aspectRatio)`. Geração e edição manual compartilham a mesma fronteira
  canônica, incluindo o fallback visual.
- **Invariante preservada:** `layoutSettingsByAspectRatio` **não** é
  sobrescrito pelo layout pós-fallback do ratio ativo — isso poluiria a
  geometria canônica de outros ratios. O `layoutSettings` raiz é a fonte da
  verdade para o ratio corrente.

### A.2 — Validação real de snapshot v3

- **Antes:** `editorStore.ts::isFrozenV3` aceitava qualquer objeto com
  `snapshotVersion === 3` e aspect ratio correspondente, sem validar o shape.
- **Agora:** exige três condições: `snapshotVersion === 3` **E** aspect ratio
  bate **E** `postVisualSnapshotSchema.safeParse(variation).success`. Um v3
  truncado/inválido cai no normalizador canônico (com aviso em DEV).
- Snapshots v1/v2 legados continuam atravessando o normalizador (compatibilidade).

### A.3 — Contrato de design tokens

- **Antes:** `postVisualSnapshotSchema` aceitava `designTokens` parcial para
  qualquer versão, permitindo persistir v3 sem tokens ou com tokens
  incompletos — contrato mais frouxo que a garantia do runtime.
- **Agora:** `.superRefine` em `postVisualSnapshotSchema`
  (`shared/postsparkSchemas.ts`) exige `designTokens` completo (groups
  `colors`, `typography`, `structure`) **somente** quando `snapshotVersion
  === 3`. v1/v2 legados permanecem aceitos com tokens parciais. O
  `variationVisualPatchSchema` (patches de edição) não foi alterado — lá
  tokens parciais são legítimos.

### A.4 — Carrossel avaliado por slide

- **Antes:** `computeLayoutIntegrity` (`server/ai/postEvaluation.ts`) validava
  só o snapshot base. Slides 2-5 com overrides distintos nunca passavam por
  `validateVisualFit`.
- **Agora:** `computeLayoutIntegrity` detecta `snapshot.slides`, projeta cada
  slide com `projectSnapshotForSlide` e valida cada projeção. Issues de todos
  os slides alimentam a penalidade agregada. Padrão replica
  `server/ai/generationGraph/shadow.ts:157-186`.
- **Escopo do juiz LLM:** `llmEvaluation` não foi modificado para múltiplas
  chamadas por slide — o `computeLayoutIntegrity` agregado já alimenta o
  feedback geométrico que chega ao revisor.

### Validação

- `pnpm check`: limpo.
- `pnpm test`: 321/321 (+6 testes novos cobrindo A.1-A.4).

## 71. Fase B — Limpeza de código órfão (2026-07-13)

### B.1 — Remoção de `server/chameleonVision.ts`

- Auditoria confirmou zero imports ativos (só referência obsoleta em
  `api/index.js`, artefato de build gerado de estado anterior).
- Arquivo removido. Typecheck e 321/321 testes verdes após remoção.
- Os tipos `ChameleonVisionResult` e `chameleonResultToDesignTokens` em
  `shared/postspark.ts` **permanecem** como utilitários compartilhados — não
  foram afetados.
- **Distinção registrada:** `ChameleonProtocol` (endpoint ativo em
  `routers.ts:2220`, debita `SPARK_COSTS.CHAMELEON`, importa de `./chameleon`)
  é coisa distinta de `chameleonVision.ts` e não foi tocado.

### B.2 — Documentação residual reconciliada

- Removidas 5 referências stale a `chameleonVision` neste documento
  (dependências, file-tree, pipeline de URL, contrato de input, mapa de LLM).
  A nota G11 (linha ~3490) que já registrava a remoção foi preservada.
- `post.listBackgrounds`: a pendência de validação foi marcada como resolvida
  (paths já corrigidos para URLs codificadas sem espaços).
- **Não houve referências stale** em `docs/project-status.md`,
  `docs/audit-report.md`, `docs/AUDITORIA_IMPLEMENTACAO.md`,
  `plano-workbench-audit.md` ou `docs/workbench-audit.md`.

## 72. Fase C — Billing transacional (2026-07-13)

Substituição do débito imediato não-idempotente de `post.generate` por um
modelo de **reserva-no-início / commit-na-aprovação / refund-na-falha**.
Garante que nenhuma falha terminal de geração deixe Sparks cobrados e que um
duplo-click no botão Gerar não cobre duas vezes. Referência:
`PLANO_CONCLUSAO_BLUEPIRNT.md` §5.

### Modelo de reserva (semântica)

A reserva apenas **bloqueia** saldo; o débito real em `profiles.sparks` só
acontece no commit. Assim o refund é trivial (muda status, não precisa
"devolver" saldo).

| Operação | RPC | Efeito em `profiles.sparks` |
|---|---|---|
| Reservar | `reserve_sparks` | Nenhum (bloqueia via soma de reservas ativas) |
| Confirmar | `commit_spark_reservation` | Decrementa `sparks - amount` |
| Reembolsar | `refund_spark_reservation` | Nenhum (libera o bloqueio) |

Saldo disponível = `profiles.sparks − SUM(reservas 'reserved' ativas)`. A
RPC `reserve_sparks` checa esse cálculo antes de criar a reserva, impedindo
saldo negativo mesmo com reservas concorrentes.

### Persistência

- **Tabela `postspark.spark_reservations`** — migration
  `drizzle/0014_spark_reservations.sql` (aplicar no Supabase hosted). Colunas:
  `id`, `idempotency_key`, `user_uuid` (FK → profiles), `generation_run_id`,
  `amount`, `status` (`reserved`|`committed`|`refunded`), `description`,
  `error_detail`, timestamps.
- **Constraint de unicidade** `(user_uuid, idempotency_key)` — previne
  double-charge no duplo-click.
- **RLS** não aplicada — o runtime usa service role (`getSupabase()` em
  `server/billing.ts`).
- **Drizzle**: `sparkReservations` adicionado a `drizzle/schema.ts` como
  espelho declarativo (não é a camada de acesso em runtime).

### Funções em `server/billing.ts`

- `deriveIdempotencyKey(userUuid, input)` — chave estável
  `gen_<sha256(userUuid:inputType:postMode:platform:content)[:24]`. O client
  pode opcionalmente enviar `idempotencyKey` própria para retries explícitos.
- `reserveSparks(profile, amount, key, description)` → `{ reservationId }`.
- `commitSparkReservation(reservationId, generationRunId)` → `boolean` (idempotente).
- `refundSparkReservation(reservationId, errorDetail)` → `boolean` (idempotente).

Todas preservam o bypass de dev mode (Supabase desconfigurado ou perfil
sentinel `dev-mock`/`no-profile`/`error` → success sem DB), no mesmo padrão
do `debitSparks` legado.

### Integração em `post.generate`

1. **Reserva** — substitui o `debitSparks` imediato no início do handler.
   `idempotencyKey` derivada do input impede double-charge.
2. **Commit** — após `assertVariationSet`, `persistCandidateFingerprints` e
   aprovação final, antes do return de sucesso. Também no early-return do
   branch High Ticket (`ENV.aiHighTicketPipelineEnabled`).
3. **Refund** — no `catch` externo, cobrindo **qualquer** falha terminal:
   LLM, schema, fit, persistência, timeout e exceções não tipadas. Como todas
   as exceções escapam para o catch único, o refund é garantido.

### Erros tRPC tipados

- `PAYMENT_REQUIRED` — reserva falhou (saldo insuficiente considerando
  reservas ativas). Nenhum LLM é chamado, nenhum débito acontece.
- Falhas reembolsadas propagam o erro original (BAD_GATEWAY, INTERNAL_SERVER_ERROR,
  etc.) — o usuário não é cobrado.

### Dívida registrada (Fase C.2 futura)

Existem **três** outros pontos de débito além de `post.generate` que ainda
usam `debitSparks` imediato (não-idempotente):
- `server/routers.ts:1836` — `post.generateImage` (`GENERATE_IMAGE`).
- `server/routers.ts:1999` — `post.generateBackgroundImage` (`GENERATE_IMAGE`).
- `server/routers.ts:2223` — `ChameleonProtocol` (`CHAMELEON`).

Migrá-los para reserva/commit/refund fica como Fase C.2 futura. Sem isso, o
billing transacional cobre o fluxo principal (`post.generate`), mas três
entradas de cobrança continuam sujeitas a double-charge e débito sem entrega.

### Validação

- `pnpm check`: limpo.
- `pnpm test`: 331/331 (+10 testes de billing cobrindo `deriveIdempotencyKey`
  e o dev-mode bypass).
- Testes de integração reais (reserva→commit com débito, concorrência) exigem
  o Supabase hosted e ficam como teste manual de aceitação pós-deploy.
- **A migration `0014_spark_reservations.sql` deve ser aplicada no Supabase
  hosted antes do deploy.**

## 74. Fase E — Fechamento técnico obrigatório do blueprint (2026-07-14)

### E.1 — Schema Zod do estado do grafo

Criado `shared/generationGraph.ts` com os schemas especificados no blueprint
§4.1:

- `slotStatusSchema`: enum de 10 statuses (`pending` → `failed`).
- `visualFitIssueSchema`: 5 tipos de issue com `autoFixed`.
- `slotStateSchema`: estado por slot (index, status, attempts, strategy, draft,
  snapshot, visualFit, evaluation, seed reprodutível).
- `generationGraphStateSchema`: estado global do grafo com runId,
  idempotencyKey, status, input, billing, context, routing, slots[], control e
  events[].

Tipos exportados: `GenerationGraphState`, `SlotStatus`, `SlotState`,
`VisualFitIssueState`.

Os tipos TS soltos (`PipelineStatus`, `GenerationPipelineState` em
`pipeline.ts`) permanecem como estão — o schema Zod é o contrato de validação
para o futuro grafo de execução, não substitui o pipeline de auditoria atual.

Testes: `shared/generationGraph.test.ts` — 17 testes cobrindo parse, rejeição
de formatos inválidos, slots incompletos e estados aprovados/falhos.

### E.2 — Controle operacional do run

Criado `server/ai/generationGraph/control.ts`:

- `createGenerationControl({ idempotencyKey, deadlineAt, llmCallBudget? })` —
  factory do controle operacional.
- `evaluateLlmEdge(control)` → `"proceed" | "degrade" | "refund"` — guarda para
  nós LLM: verifica budget e deadline antes de invocar.
- `consumeLlmCall(control)` — incrementa `llmCallsUsed` atomicamente.
- `hasDeadlineExpired(control)`, `isWithinLlmBudget(control)` — checks
  individuais.
- `computeOperationalKpis(state: GenerationGraphState)` → `OperationalKpis` —
  computa slotRetryRate, fallbackRatePerNode, visualFitAutoFixRate,
  judgeRejectionRate, carouselDegradationRate, llmBudget/consumed/remaining.
- `formatKpiReport(kpis)` — relatório legível separado por `;`.

Testes: `server/ai/generationGraph/control.test.ts` — 16 testes cobrindo
criação de controle, expiração de deadline, consumo de budget, avaliação
de edge, KPIs nulos/quebrados e formatação.

### Validação

- `pnpm check`: limpo.
- `pnpm test`: 369/369 verdes (44 arquivos).

## 73. Fase D — Absorção mínima do High Ticket no pipeline canônico — 2026-07-14

### Objetivo

O pipeline paralelo High Ticket (server/ai/highTicket/, shared/highTicket.ts,
flags ENV) foi dissolvido. As capacidades reutilizáveis foram absorvidas como
módulos canônicos do pipeline principal, e o restante virou backlog documentado.

### Etapa 1 — Módulos relocados para o canônico

Quatro módulos saíram do namespace `highTicket/` e tornaram-se canônicos:

| Módulo antigo (`highTicket/`) | Módulo novo (`server/ai/`) |
|---|---|
| `highTicket/contextLoader.ts` | `contextLoader.ts` |
| `highTicket/contextBudget.ts` | `contextBudget.ts` |
| `highTicket/intentRouter.ts` | `intentRouter.ts` (+ `angleToStrategy` movido de `captionSynthesis.ts`) |
| `highTicket/slimBriefing.ts` | `slimBriefing.ts` |

Tipos compartilhados (`MasterBriefing`, `AngleAssignment`, `RouterOutput`)
foram movidos de `shared/highTicket.ts` para `shared/contextBriefing.ts`.
Schemas correspondentes em `shared/contextBriefingSchemas.ts`.

### Etapa 2 — Integração em post.generate

- O branch `if (ENV.aiHighTicketPipelineEnabled)` em `routers.ts:645-719` foi
  removido.
- Contexto enriquecido (BrandKit + Persona + context budget) carregado via
  `loadGenerationContext()` quando `creationMode === "execution"` && briefing
  persistido. Sem eles, comportamento idêntico ao modo ideation.
- Intent router atua como estratégia alternativa: `routeHighTicketIntent()`
  produz 3 ângulos ortogonais (story/authority/objection), `angleToStrategy`
  converte em `ContentStrategy[]`, que substitui `generationPlan.strategies.selected`.
- O resto do pipeline (slots, composition, snapshot, QA, captions) é idêntico
  entre os dois modos.
- Fallback: se o intent router falhar, as estratégias do `planContentStrategies`
  padrão são mantidas.

### Etapa 3 — Remoção do pipeline paralelo e backlog

- `server/ai/highTicket/` inteiro removido (11 módulos órfãos).
- `shared/highTicket.ts` e `shared/highTicketSchemas.ts` (e testes) removidos.
- Flags ENV removidas: `AI_HIGH_TICKET_PIPELINE` e `AI_HIGH_TICKET_LEGACY_FALLBACK`.
- Flags de modelo órfãs removidas do `modelRouter.ts` e `env.ts`:
  `highTicketWorkerModel`, `highTicketQaModel`, `highTicketRevisionModel`,
  `highTicketCaptionSynthesisModel`.
- Mantidas apenas `highTicketContextSummaryModel` e `highTicketIntentRouterModel`
  (usadas pelos módulos relocados).
- Criado `BACKLOG_HIGH_TICKET_CAPABILITIES.md` documentando capabilities
  descartadas (workers paralelos, QA próprio, correction loop, visual contract
  validator, final mapper) com justificativa e critérios para portagem futura.

### Etapa 4 — Testes

- `server/ai/intentRouter.test.ts`: 5 testes cobrindo `angleToStrategy` e
  fallback do dev mode.
- `server/ai/contextBudget.test.ts`: 3 testes cobrindo compressão.
- `client/src/lib/variationSnapshot.test.ts`: 24/24 verdes (regressão).
- `client/src/store/editorStore.test.ts`: 31/31 verdes (regressão do fallback
  visual corrigida — ver §73.1).

### §73.1 — Correção do fallback visual (efeito colateral)

A Fase D expôs um bug no `applyVisualFitFallback` (`shared/visualFit.ts`):
quando um usuário arrasta `body` para posição livre num template estruturado
(feature-grid), o `headline_body_overlap` (overlap marginal tolerado) removia
o `freePosition` antes do `structured_absolute_layout` preservá-lo.

**Correção**: o bloco `headline_body_overlap` agora só remove `freePosition`
quando `structured_absolute_layout` NÃO está presente. Quando ambos coexistem
(usuário arrastou deliberadamente num template estruturado), o `freePosition`
é preservado — apenas `sectionLayouts` é limpo.

### Validação

- `pnpm check`: limpo.
- `pnpm test`: 335/335 verdes (42 arquivos).

### §74 — SPEC-001: autoridade tipográfica única (docs/reforma, aguardando conferência)

Implementação da primeira entrega da reforma (`docs/reforma/EXECUCAO-AUTONOMA.md`),
em 2026-08-10. Estado real, critério a critério, em
`docs/reforma/SPEC-001-AUTORIDADE-TIPOGRAFICA.md`. Resumo:

**O que mudou:**
- `PostVisualSnapshot` ganha `snapshotVersion: 4`, `resolvedTypography` (headline/body
  medidos com fonte real via Fontkit) e `typographyResolutionError` (falha estruturada
  quando não há como resolver sem violar legibilidade).
- Núcleo de medição promovido de `harness/` para `shared/typography/` (`fit.ts`,
  `fontkitMeasurer.ts`, `resolve.ts`, `fonts/registry.ts`) — servidor, cliente e
  harness consomem a mesma implementação.
- `shared/creative/layoutArchetypes.ts`: 10 das 12 famílias criativas passam a
  declarar geometria explícita (`freePosition` + `width` + `height`) para
  headline e body, em vez de posição simbólica sem altura. `versus` e
  `mosaic-grid` (template `feature-grid`) ficam fora por decisão documentada.
- `PostCardV2.tsx`: `useTextAutoFit` e line-clamp só decidem o render quando
  `resolvedTypography` está ausente (v1-v3, ou v4 com falha estruturada).
- 7 fontes baixadas (Google Fonts, OFL) para `shared/typography/fonts/files/`.

**O que NÃO foi feito (registrado, não escondido):**
- Falha de resolução não aborta `post.generate` nem aciona rewrite — a variação
  afetada renderiza pelo caminho legado até uma entrega futura (SPEC-003).
- Resolução de carrossel não é persistida no momento da geração (computada sob
  demanda em `projectSnapshotForSlide`, determinística mas não gravada em
  `slide.editorState`).
- Âncora de corpus real do harness não é versionada nem anonimizada (decisão de
  privacidade pré-existente no `pullCorpus.ts`, mantida).
- Sem verificação de divergência fonte-medida × fonte-carregada-no-browser.

**Verificação real:** `npm run check` limpo; `npm test` 375/375 (era 369, +6 novos:
5 em `shared/typography/resolve.test.ts`, 1 em `editorStore.test.ts` provando
recomputação atômica); `npm run harness -- --aspect 1:1,5:6,9:16` — 2664 casos,
0 pulados, aprovado no perfil `baseline` (0% fora do canvas; 4,8% de sobreposição,
100% explicada por copy que não cabe nem no piso de legibilidade).

Pedido de conferência completo: `docs/reforma/conferencias/SPEC-001-PEDIDO.md`.

### §75 — SPEC-002: resolvedor visual e cor únicos (docs/reforma, aguardando conferência)

Segunda entrega da reforma, em 2026-08-10, sobre o resultado da SPEC-001.
Estado real, critério a critério, em
`docs/reforma/SPEC-002-RESOLVEDOR-VISUAL-E-COR.md`. Resumo:

**O que mudou:**
- `shared/creative/color.ts` é a única implementação produtiva de `contrastRatio`
  (`server/ai/postEvaluation.ts` e `server/postJudge.ts` delegam para ela).
  `client/src/lib/designRules.ts` (contraste duplicado, órfão) removido.
- `composeVariation` (`shared/creative/compose.ts`) não muta mais a entrada
  (`variation.creativeDirection`/`copyAngle` são clonados) e não usa `as any` —
  `TextElement.styles.textTransform` e `FamilyOutput.decorations` entraram no
  tipo em vez de escapar por cast.
- `effectiveBackgroundColor` (`shared/creative/color.ts`): contraste passa a
  considerar overlay sobre imagem; quando não há como provar (imagem sem
  overlay opaco), marca `basis: "unproven"` em vez de assumir.
- `applyVisualFitFallback` (`shared/visualFit.ts`) grava `visualFitIssues` e
  `removedTextElementIds` no snapshot — a correção deixou de ser silenciosa.
- Safe area absorvida de `postspark-next/.../safeArea.ts` (margens por
  proporção, 12% no rodapé de 9:16 — zona de UI do Instagram Stories) como
  novo tipo de issue (`outside_safe_area`).
- `client/src/lib/visualFitValidator.ts` (re-export órfão) removido.

**O que NÃO foi feito (registrado, não escondido):**
- 3 das 12 famílias (`editorial-poster`, `duotone-wash`, `brutal-split`)
  violam a safe area nova em 9:16 — checagem funciona, calibração não foi
  corrigida nesta entrega.
- "unproven" não ganha proteção visual automática, só teto de score.
- Faltam testes de fundo inválido e fixture sabotada que a spec pede.
- `server/postJudge.ts` continua existindo sem chamador confirmado (decisão
  de remoção é escopo de SPEC-005).

**Verificação real:** `npm run check` limpo; `npm test` 386/386 (era 375,
+11 novos); `npm run harness -- --aspect 1:1,5:6,9:16` — 2664 casos, 0
pulados, aprovado.

Pedido de conferência completo: `docs/reforma/conferencias/SPEC-002-PEDIDO.md`.
