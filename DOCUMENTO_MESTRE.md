# DOCUMENTO_MESTRE — PostSpark 3

> **Status do Documento:** Documento-Mestre Canônico e Fonte Primária da Verdade (Single Source of Truth).  
> **Revisão:** 2026-09-02 — Atualização Integral de Arquitetura, Mecanismos, Contratos, Rotas e Decisões Históricas (ADR).  
> **Regra Mandatória (AGENTS.md):** Todo agente ou desenvolvedor deve consultar este documento antes de alterações e atualizá-lo sempre que houver mudanças arquiteturais, estruturais, de contratos ou de rotas.

---

## 1. Propósito e Filosofia do Sistema

O **PostSpark 3** é uma plataforma full stack de alta performance para direção de arte, geração generativa, edição visual direta e exportação em alta fidelidade de posts e carrosséis para redes sociais.

O sistema combina inteligência semântica de marca (**Brand DNA**), diagramação determinística de design editorial (**14 Famílias Visuais Oficiais**) e uma prancheta vetorial nativa em 2D (**Konva Canvas**).

### O que o PostSpark É:
- Uma aplicação full stack coesa: frontend React 19/Vite (`client/`), backend Express/tRPC (`server/`) e contratos compartilhados estritos (`shared/`).
- Uma máquina de geração com **latência ultrabaixa (2 a 4s)** em chamada generativa única.
- Um estúdio de acabamento visual tátil com prancheta interativa, texturas nobres e exportação em 4K.
- Um sistema seguro com persistência transacional direta no PostgreSQL via Supabase e billing por Stripe.

### O que o PostSpark NÃO É (Invariantes de Arquitetura):
- **NÃO é um wrapper genérico de ChatGPT**: não expõe telas de chat nem formulários de prompt cru; a geração é guiada por teses de copywriting, arquétipos visuais e regras de direção de arte.
- **NÃO usa filas assíncronas, cron jobs ou workers dedicados**: todo o fluxo de geração e edição opera de forma síncrona e determinística.
- **NÃO usa Drizzle ORM em runtime**: `drizzle/` existe apenas como histórico declarativo de migrações SQL. Em runtime, todas as operações de banco utilizam o cliente oficial `@supabase/supabase-js` em `server/db.ts`.
- **NÃO possui múltiplos normalizadores visuais**: há apenas uma fonte da verdade após a geração (`PostVisualSnapshot`).

---

## 2. Arquitetura Técnica e Stack Real

| Camada | Tecnologia Principal | Papel no Sistema |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite, TailwindCSS, Framer Motion, GSAP | Interface reativa, animações físicas e navegação |
| **Motor Gráfico** | Konva 2D (`react-konva`, `konva`) | Prancheta gráfica vetorial, manipulação direta de camadas, guias magnéticas e renderização 4K |
| **Animação & 3D** | GSAP (`gsap@3.14.2`), Ticker 120 FPS | Palco 3D cilíndrico côncavo com inércia por scroll (`/stage-3d`) |
| **Tipografia & Métrica**| `fontkit`, Google Fonts | Medição idêntica de caixas de texto entre servidor e prancheta (`ResolvedTextBlock`) |
| **Estado Global** | Zustand (`editorStore.ts`), React Query | Estado autoritativo do editor e cache de chamadas tRPC |
| **Backend & API** | Node.js, Express, tRPC (`@trpc/server`) | Procedures com tipagem estrita de ponta a ponta |
| **Orquestrador de IA** | `server/_core/llm.ts`, `generationOrchestrator.ts` | Cascata resiliente de LLMs (OpenRouter ➔ Groq ➔ Gemini) |
| **Persistência Runtime**| Supabase Client (`@supabase/supabase-js`) | Acesso direto ao PostgreSQL e Storage de assets |
| **Autenticação** | Supabase Auth + Cookie Bridge HTTP-only | Sessão segura sincronizada entre cliente e servidor |
| **Billing & Planos** | Stripe SDK & Webhooks | Gestão de assinaturas Pro/Agency e recargas de `Sparks` |
| **Deploy & Serverless** | `api/index.js` (esbuild bundle) | Entrypoint serverless compatível com Vercel e Railway |

---

## 3. A Invariante Obrigatória: Fonte Única da Verdade (`PostVisualSnapshot`)

Após o procedimento `post.generate`, cada variação de post (`PostVariation`) atravessa obrigatoriamente uma única vez o normalizador canônico em `client/src/lib/variationSnapshot.ts` (e `shared/variationSnapshot.ts`) e torna-se um **`PostVisualSnapshot`**.

### Regras Mandatórias de Contrato:
1. **Consumo Unificado**: HoloDeck, Workbench, exportação, salvamento, histórico e banco de dados consomem o **mesmo** `PostVisualSnapshot`.
2. **Proibição de Recálculos Locais**: Renderers (`PostRenderer`, `PostCardV2`, Canvas Konva) **não podem** remover `designTokens`, recalcular prioridades de cor, inventar layouts arbitrários ou reconstruir fundos.
3. **Zustand como Guardião**: O Zustand mantém `visualSnapshot` como documento autoritativo. Qualquer edição manual no Workbench atualiza o `visualSnapshot` atomicamente antes da renderização seguinte.
4. **Isolamento de Carrossel**: Overrides específicos de slides residem exclusivamente em `slides[].editorState`; o slide em edição ativa nunca vaza para os campos-base do documento.
5. **Versionamento de Contrato**: O campo `snapshotVersion` controla a compatibilidade. Qualquer alteração estrutural no contrato exige incremento de versão e suporte a versões anteriores via `client/src/lib/snapshotMigration.ts`.

---

## 4. Pipeline Completo de Geração de Posts (`post.generate`)

```
   [Insumo do Usuário] ──► (Texto / Tese / URL de Site / Imagem)
                                  │
                                  ▼
   [Brand DNA & Site Intel] ──► Extração de Paleta, Tipografia e Tom de Voz (se URL)
                                  │
                                  ▼
   [Estratégia de Conteúdo] ──► prepareGenerationPlan() (Seleção Semântica de Ângulos)
                                  │
                                  ▼
   [Orquestrador Único LLM] ──► invokeLLM() (2 a 4s via OpenRouter -> Groq -> Gemini)
                                  │
                                  ▼
   [BrandVisualGuardian]    ──► Validação Determinística: Paleta Oficial + Contraste WCAG >= 4.5:1
                                  │
                                  ▼
   [Diversidade Forçada]    ──► ensureDistinctFamilies() (< 0.1ms em memória, 0 repetições)
                                  │
                                  ▼
   [Imagem de Fundo (IA)]   ──► OpenRouter com Fallback Pollinations.ai HD (Retorno em DataURI)
                                  │
                                  ▼
   [Normalizador Canônico]  ──► createPostVisualSnapshot() ──► PostVisualSnapshot Pronto
```

### Detalhes das Fases do Pipeline:
1. **Resolução de Insumo**: O usuário pode fornecer texto livre, link de website ou arquivo. Se for URL, o motor ativa a análise de inteligência de site.
2. **Cascata de LLMs Resiliente (`server/_core/llm.ts`)**:
   - Primário: OpenRouter (`openai/gpt-5-mini`);
   - Fallback 1: Groq;
   - Fallback 2: Gemini Direct;
   - Retries com backoff exponencial para erros transitórios (429, 503).
3. **BrandVisualGuardian (`server/ai/brandVisualGuardian.ts`)**:
   - Pure function síncrona que substitui juízes lentos de IA;
   - Força `backgroundColor` e `accentColor` na paleta da marca e garante contraste mínimo de 4.5:1 (WCAG AA).
4. **Geração de Imagens (`server/imageGenerateBackground.ts`)**:
   - Serviço primário: OpenRouter (`google/gemini-3.1-flash-image-preview`);
   - Serviço secundário automático: Pollinations.ai em alta definição;
   - Imagens são sempre entregues em formato DataURI validado, impedindo quebras de renderização por bloqueios de CORS ou links mortos.

---

## 5. Motor de Brand DNA & Site Intelligence

O PostSpark possui tecnologia própria para clonagem de identidade visual de qualquer site corporativo ou landing page.

### Mecânica de Extração:
1. **Coleta de Conteúdo (`server/siteContent.ts`)**:
   - Tenta coleta via HTTP direto com sanitização e parsing HTML (`cheerio`);
   - Se bloqueado por CDN/Cloudflare, aciona o microsserviço Railway configurado em `RAILWAY_SCREENSHOT_SERVICE_URL`.
2. **Extração de Estilos Visuais (`server/styleExtractor.ts` & `server/brandDNA.ts`)**:
   - Mapeia paleta cromática dominante a partir do CSS e tags de cor;
   - Identifica fontes Google Fonts e CSS `@import`;
   - Localiza favicons e URLs de logotipos em alta definição.
3. **Síntese Semântica de Negócio (`server/siteIntelligence.ts`)**:
   - Executa análise via LLM para extrair: proposta de valor única, dores do público-alvo, esteira de produtos/serviços e tom de voz editorial;
   - Possui `fallbackSynthesis` determinístico, assegurando que o pipeline **nunca trava** se o site tiver bloqueio agressivo de robôs.
4. **Endpoints Ativos**:
   - REST: `POST /api/brand-dna`
   - tRPC: `brand.extractDna` e integração automática em `post.generate`.

---

## 6. Catálogo das 14 Direções de Arte Oficiais

Todas as artes do PostSpark seguem rigorosamente as definições geométricas e tipográficas estabelecidas em `shared/creative/familyGeometry.ts` e `OFFICIAL_FAMILIES_META`:

### 🌟 Categoria 1: Tendências & Instagram (Novos Arquétipos)
1. **🔲 Stroke Impact (`stroke-impact`)**: Tipografia massiva em Bebas Neue com contorno vazado (*stroke outline*) intercalado com preenchimento sólido.
2. **🎬 Pôster de Cinema (`cinematic-depth`)**: Enquadramento cinematográfico, tipografia monumental e rodapé de créditos estilo cartaz de filme.
3. **⚡ Brutal Split (`brutal-split`)**: Divisão visual 50/50 em duas metades com blocos de contraste cromático forte (@design.deb) e tipografia em Syne.
4. **✨ Glass Veil (`glass-veil`)**: Cartão translúcido flutuante de vidro fosco (*glassmorphism*) com bordas iluminadas e badge em pílula de luxo.
5. **🤖 Cyber & Glitch (`cyber-glitch`)**: Miras táticas (+), scanlines vetoriais, código monospace e estética de terminal de alta tecnologia.

### 📰 Categoria 2: Editorial & Clássico
6. **📰 Editorial de Luxo (`editorial-poster`)**: Playfair Display itálica, aspas decorativas translúcidas gigantes e divisórias em tons nobres de ouro.
7. **💥 Minimalismo Brutal (`chromatic-block`)**: Anton massiva all-caps, bloco monocromático saturado de alto impacto e sticker rotacionado (-3°).
8. **🎨 Duotone Wash (`duotone-wash`)**: Gradiente linear diagonal a 135° combinando duas cores complementares com atmosfera elegante.
9. **💬 Citação de Autoridade (`quote-authority`)**: Tipografia Cinzel serifada para sentenças de grande peso moral, autoridade e liderança.
10. **🍃 Minimalismo Arejado (`minimal-air`)**: Espaço negativo generoso, equilíbrio zen e clareza visual absoluta.

### 📊 Categoria 3: Métricas & Conversão
11. **⚔️ Comparação Versus (`versus`)**: Estrutura em duas colunas contrastando "Antes vs Depois" ou "Certo vs Errado".
12. **📊 Data Punch (`data-punch`)**: Números monumentais e métricas quantitativas de retenção em destaque com fonte Space Grotesk.
13. **⚡ Tipografia Cinética (`kinetic-type`)**: Tipografia dinâmica em Syne Bold com ritmo visual e quebras de linha expressivas.
14. **🧱 Mosaico & Grade (`mosaic-grid`)**: Organização modular em blocos e passos sequenciais estruturados.

---

## 7. Workbench de Criação & Estúdio de Texturas

O editor visual do PostSpark (`CanvasLabPage` / `WorkbenchV2`) foi construído sobre o motor **Konva 2D**, garantindo performance de prancheta gráfica com aceleração por hardware.

### Recursos da Prancheta:
- **Projeção Vinculante (`ResolvedTextBlock`)**: As métricas de fonte calculadas no backend via `fontkit` coincidem perfeitamente com a renderização em tela (`shared/typography/equivalence.ts`), eliminando quebras de linha indesejadas.
- **Acabamento com Texturas Táteis de Luxo**: O **Estúdio de Texturas** conta com 6 materiais nobres integrados:
  - *Linho Fino*: editorial, moda e sofisticação;
  - *Couro Envelhecido*: acabamento rústico e brutal;
  - *Concreto Bruto*: arquitetura, robustez e impacto visual;
  - *Mármore Negro*: prestígio, high-ticket e luxo;
  - *Metal Oxidado*: textura industrial e presença marcante;
  - *Fibra de Carbono*: alta tecnologia, performance e precisão.
- **Dial Orbital Polar**: Seletor tátil circular para alternar texturas com preview instantâneo na prancheta.
- **Modo de Edição de Plano de Fundo (Estilo Canva)**: Modo contextual ativado sob demanda via barra lateral ou duplo-clique no fundo, conectando alças dedicadas do Konva `Transformer` ao fundo, permitindo reposicionamento e escala livres com atenuação das camadas de texto, barra flutuante de controle (`✓ Concluir` / `↺ Resetar`) e atalhos (`Esc` / `Enter`).
- **Download Direto de Imagens (Posse dos Assets)**: Botão de ação rápida na aba de Mídia e notificação pós-geração que permite ao usuário baixar imediatamente a imagem original de fundo em alta resolução gerada com seus créditos de IA ou aplicada ao slide.
- **Exportação Multiformato e 4K**:
  - Formatos nativos: **1:1 Feed**, **5:6 Retrato** e **9:16 Stories**;
  - Renderização direta em PNG e WebP em resolução 4K Ultra-HD;
  - Suporte a exportação completa de carrosséis em arquivo compactado `.zip` via `jszip`.

---

## 8. Autenticação, Sessões & Cookie Bridge

O sistema de autenticação utiliza o Supabase Auth integrado por uma ponte segura de cookies HTTP-only:

1. **Tokens de Sessão**:
   - `sb-access-token`: JWT de acesso com validade curta;
   - `sb-refresh-token`: token de renovação transparente;
   - `app_session_id`: identificador de sessão interna do PostSpark.
2. **Fluxo Google OAuth**:
   - O usuário clica em login Google ➔ redirecionamento para o provedor OAuth;
   - Retorno para `/auth/google-callback#access_token=...`;
   - O cliente captura o token e chama `POST /api/auth/supabase-session`;
   - O backend valida a credencial no Supabase, emite os cookies de sessão e redireciona para o estúdio oficial (`/thevoid`).
3. **Controle de Acesso**:
   - `ProtectedRoute`: assegura redirecionamento para `/` se não autenticado;
   - `AdminRoute`: restringe áreas de gestão (`/admin`) exclusivamente a usuários com role `admin`.

---

## 9. Billing, Sparks & Planos de Assinatura

O PostSpark adota um modelo híbrido de assinaturas com saldo de créditos consumíveis (**Sparks**):

### Estrutura de Consumo:
- **Geração de Posts**: Cada conjunto de variações consome Sparks do saldo do usuário.
- **Geração de Imagens por IA**: Débito específico por imagem gerada em alta definição.
- **Proteção de Saldo**: O backend verifica o saldo antes de iniciar qualquer chamada generativa externa; se insuficiente, instrui o cliente a exibir o modal de recarga ou upgrade.

### Planos e Integração Stripe:
- **Planos Recorrentes**:
  - *Free*: degustação com saldo inicial de Sparks;
  - *Pro* (Mensal/Anual): cota ampliada de Sparks e acesso a exportação 4K;
  - *Agency* (Mensal/Anual): alta capacidade, suporte prioritário e recursos corporativos.
- **Recargas Avulsas (Top-ups)**: Pacotes *Starter*, *Power* e *Mega* para compra imediata de Sparks.
- **Webhooks do Stripe**: Endpoint `POST /api/stripe/webhook` gerencia eventos de checkout concluído, renovação de ciclo, cancelamento e falha de pagamento com sincronização imediata no Supabase.

---

## 10. Mapa Oficial de Rotas Consolidadas

| Rota | Acesso | Componente de Página | Finalidade Principal |
| :--- | :--- | :--- | :--- |
| **`/`** | Pública | [`InspiracaoShowcasePage`](file:///client/src/pages/InspiracaoShowcase/InspiracaoShowcasePage.tsx) | **Home Oficial de Não Logados (Definitiva)**: Vitrine imersiva definitiva com palco 3D coverflow no desktop (matemática pura nativa sem GSAP), stories dinâmicos no mobile, typewriter reverso com acionamento por card e fundo cósmico TheVoid com 6 posts canônicos. Redireciona imediatamente para `/thevoid` assim que autenticado. |
| **`/criar`** | Pública | [`PreviewHomePage`](file:///client/src/pages/PreviewHome/PreviewHomePage.tsx) | **Landing Page Oficial de Tráfego / Anúncios (Dark Studio Editorial)**: Página de alta conversão para tráfego pago reformulada no padrão TheVoid (`oklch(0.04 0.06 280)`). Apresenta Hero com Live Sandbox tonal e backgrounds artísticos canônicos, Atelier de Brand DNA por URL (sem clichês de Mac dots), Galeria dos 6 espécimes canônicos em proporções 1:1, 4:5 e 9:16, e Estúdio de Texturas táteis interativo. Todos os CTAs e links de ação da página redirecionam diretamente para a rota `/` (Showcase de Insumo e Captura), maximizando conversão e retenção sem barreiras mecânicas de modal. |
| **`/thevoid`**, **`/studio`** | Protegida | [`StudioAppV2BPage`](file:///client/src/pages/StudioApp/StudioAppV2BPage.tsx) | **Estúdio Oficial Logado**: Criação com folha tonal, prateleira colapsável, Lente de Zoom 2x e transição para a Galeria e Editor. (*Alias: `/studio-v2b`*). |
| **`/pricing`** | Pública | `Pricing.tsx` | Tabela oficial de planos Pro, Agency e pacotes de recarga de Sparks. |
| **`/billing`** | Protegida | `Billing.tsx` | Painel de gestão de assinatura, histórico de faturas e saldo de Sparks. |
| **`/history`** | Protegida | `History.tsx` | Histórico cronológico de gerações realizadas pelo usuário. |
| **`/saved-posts`** | Protegida | `SavedPosts.tsx` | Galeria de posts salvos e finalizados. |
| **`/admin`** | Admin | `Admin.tsx` | Painel interno de telemetria, custos de tokens e gestão de usuários. |
| **`/familias`** | Pública | `FamilyCatalog.tsx` | Catálogo visual de referência das 14 famílias criativas oficiais. |
| **Rotas Redirecionadas ➔ `/criar`** | N/A | `RedirectToRoute` | `/criar-new` (canvas experimental), `/p`, `/preview-home`, `/crie-posts-incriveis`, `/landing`, `/landing2`, `/landing3`. |
| **Rotas Redirecionadas ➔ `/`** | N/A | `RedirectToRoute` | `/stage-3d` e `/3d-home` (palco 3D experimental descontinuado), `/studio-home` (landing legada), `/inspiracao`, `/showcase-stage`, `/thevoid2`. |
| **Rotas Redirecionadas ➔ `/thevoid`** | N/A | `RedirectToRoute` | `/canvas-lab` (laboratório experimental de prancheta), `/thevoid-clean`, `/studio-v2`. |

---

## 11. Modelo de Dados e Tabelas no Supabase (`server/db.ts`)

As operações em runtime ocorrem diretamente via cliente Supabase sobre as seguintes tabelas no PostgreSQL:

- **`posts`**: armazena os posts gerados e editados, contendo `id`, `user_uuid`, `platform`, `headline`, `body`, `slides` (JSON), `layoutSettings` (JSON), `imageSettings` (JSON), `variation_snapshot` (JSON canônico) e status de exportação.
- **`generation_runs`**: registro de telemetria de IA contendo tokens de prompt/conclusão, latência em milissegundos, modelos utilizados na cascata, custos em USD e eventos de depuração. Contém a coluna `graph_state` mantida exclusivamente para replay e auditoria histórica de execuções passadas.
- **`site_intelligence`**: cache de identidades de marca extraídas de sites, contendo URL normalizada, fingerprint de conteúdo e o snapshot estruturado do Brand DNA.
- **`background_assets`**: registro de imagens geradas por IA ou carregadas pelo usuário, armazenadas como DataURI ou no bucket de storage.
- **`content_fingerprints`**: armazenamento de hashes e embeddings vetoriais para garantia de originalidade semântica e prevenção de plágio.
- **`brand_kits`**: configurações salvas de identidade visual dos usuários (paletas cromáticas personalizadas, logos e preferências tipográficas).
- **`users`**: dados do perfil, e-mail, role (`user` ou `admin`), saldo atual de Sparks e vínculo com o customer do Stripe.

---

## 12. Variáveis de Ambiente e Configuração (`server/_core/env.ts`)

| Variável | Padrão | Obrigatória? | Finalidade |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development` | Sim | Define ambiente de execução (`production` ou `development`) |
| `SUPABASE_URL` | - | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY`| - | Sim | Chave de serviço (backend only) com permissões administrativas |
| `OPENROUTER_API_KEY` | - | Recomendada | Chave do OpenRouter (provedor primário de texto e imagem) |
| `OPENROUTER_TEXT_MODEL` | `openai/gpt-5-mini` | Não | Modelo de linguagem primário para geração de copywriting |
| `OPENROUTER_IMAGE_MODEL`| `google/gemini-3.1-flash-image-preview` | Não | Modelo de geração de imagens |
| `GROQ_API_KEY` | - | Recomendada | Chave da Groq para fallback rápido de LLM |
| `GEMINI_API_KEY` | - | Recomendada | Chave do Google Gemini para fallback de contingência |
| `STRIPE_SECRET_KEY` | - | Em Prod | Chave secreta da API do Stripe para billing |
| `STRIPE_WEBHOOK_SECRET` | - | Em Prod | Assinatura de validação de webhooks do Stripe |
| `RAILWAY_SCREENSHOT_SERVICE_URL` | - | Não | URL do microsserviço no Railway para captura e bypass de Cloudflare |
| `AI_LLM_JUDGE_ENABLED` | `false` | Não | Mantido em `false` para preservar a geração única em 2 a 4s |
| `AI_SITE_INTELLIGENCE_ENABLED` | `true` | Não | Habilita a extração automática de Brand DNA por URL |

---

## 13. Registro de Decisão Arquitetural (ADR): A Arquitetura em Grafos e a Transição para o Orquestrador Único

### 📜 Contexto Histórico:
Em versões anteriores do PostSpark (fases pré-SPEC-003), a geração de posts foi modelada e experimentada como uma **arquitetura orientada a grafos** (`shared/graphEngine.ts`, `shared/generationGraph.ts`, com nós para brief, workers paralelos, shadow graph e pipeline multi-etapas). 

### ⚠️ Por que a Arquitetura em Grafos foi Descontinuada no Runtime?
Durante os testes de carga e validação da **Reforma SPEC-003 / SPEC-005**, foram constatados gargalos severos no modelo em grafo:
1. **Latência Inviável**: A execução de múltiplos nós intermediários de LLM e avaliação causava tempos de espera entre **25 e 45 segundos**, quebrando a experiência interativa em tempo real desejada para o produto.
2. **Multiplicação de Custos e Timeouts**: Múltiplas etapas encadeadas quadruplicavam o consumo de tokens e multiplicavam a probabilidade de falhas de rede (erros 429, 503 e abortos de contexto em modelos como Gemini e OpenRouter).
3. **Divergência de Contratos**: Cada nó do grafo operava com pequenos deltas de tipagem, dificultando a garantia da invariante de normalização canônica.

### 🎯 A Decisão e a Arquitetura Atual (Consolidada na SPEC-003/SPEC-005):
1. **Orquestrador Único (`generationOrchestrator.ts`)**: Todo o pipeline produtivo foi simplificado para uma chamada generativa rica e única, que entrega as variações completas em **2 a 4 segundos**.
2. **Planejamento Determinístico em Memória**: Decisões que não exigem raciocínio generativo aberto (seleção de ângulos, diversidade de famílias com `ensureDistinctFamilies` e validação WCAG com `BrandVisualGuardian`) ocorrem de forma síncrona em milissegundos, sem chamadas extras de IA.
3. **Preservação de Legado no Banco**: A coluna `generation_runs.graph_state` no Supabase foi mantida unicamente para telemetria histórica e compatibilidade de leitura com registros antigos.

> ⛔ **Invariante Mandatória:** É terminantemente proibido reintroduzir máquinas de estado concorrentes, filas assíncronas, juízes paralelos de IA ou grafos multi-roundtrip no caminho crítico de `post.generate`. Qualquer proposta de alteração generativa deve preservar o teto estrito de latência (2 a 4s) e a chamada generativa única.

---

## 14. Comandos de Validação e Deploy

Toda alteração de código deve ser verificada pelo seguinte protocolo antes do deploy:

```bash
# 1. Verificação Estrita de Tipagem TypeScript (0 erros obrigatórios)
pnpm check

# 2. Execução da Bateria Completa de Testes Automatizados (665 testes)
pnpm test

# 3. Compilação de Produção (Vite para frontend + esbuild para api/index.js)
pnpm build

# 4. Verificação de Runtime e Migrações
pnpm run verify:runtime

# 5. Execução do Servidor em Produção
pnpm start
```
