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
- Vision/multimodal criativa: `brandDNA.analyzeWithVision`, `chameleonVision`, `visionExtractor.extractStylesFromScreenshot`, `post.autoPilotDesign` e slots de geracao com `inputType=image` usam OpenRouter/GPT-5 mini.
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

4. Validar o endpoint `post.listBackgrounds` e o formato real dos paths retornados.
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
- Confirmar schema real do Supabase para `generation_runs.created_at` e aplicar
  a migração no ambiente correto antes de considerar `/history` resolvido.

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
