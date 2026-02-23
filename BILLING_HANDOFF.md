# PostSpark — Billing Handoff Document
> Gerado em: 2026-02-20 | Atualizado em: 2026-02-20
> Status: Supabase ✅ concluído | Stripe ⏳ aguarda configuração manual

---

## 1. Estado do Supabase

**Projeto:** Brincar / PostSpark
**ID:** `spbuwcwmxlycchuwhfir`
**Região:** `sa-east-1`
**Schema:** `postspark`

### Tabelas existentes (completo)

| Tabela | Status | Observação |
|---|---|---|
| `profiles` | ✅ atualizado | `stripe_customer_id` + plano FOUNDER no enum |
| `spark_transactions` | ✅ sem alteração | DEBIT/CREDIT/REFUND/REFILL |
| `generation_sessions` | ✅ sem alteração | Sessões com regen tracking |
| `rate_limits` | ✅ sem alteração | Rate limit por IP e user |
| `subscriptions` | ✅ criada | Rastreia assinaturas Stripe |
| `trials` | ✅ criada | Anti-abuso por e-mail + IP |
| `topup_packages` | ✅ criada + dados | 3 pacotes inseridos |
| `topup_purchases` | ✅ criada | Histórico de compras avulsas |
| `founders` | ✅ criada | Registro de founders com metadados e desconto de conversão |

### Schema: `profiles` (estado atual)
```sql
id                 uuid        PK, FK → auth.users
email              text
plan               text        CHECK IN ('FREE','LITE','PRO','AGENCY','DEV','FOUNDER')
sparks             integer     DEFAULT 150, CHECK >= 0
sparks_refill_date timestamptz
stripe_customer_id text        UNIQUE
created_at         timestamptz
updated_at         timestamptz
```

### Schema: `subscriptions` (nova)
```sql
id                     uuid        PK
user_id                uuid        FK → profiles
stripe_subscription_id text        UNIQUE
stripe_customer_id     text
plan                   text        CHECK IN ('PRO','AGENCY')
status                 text        CHECK IN ('active','canceled','past_due','trialing','paused')
current_period_start   timestamptz
current_period_end     timestamptz
cancel_at_period_end   boolean     DEFAULT false
billing_cycle          text        CHECK IN ('monthly','annual')
created_at             timestamptz
updated_at             timestamptz (trigger automático)
```

### Schema: `trials` (nova)
```sql
id           uuid     PK
user_id      uuid     FK → profiles (nullable)
email        text     UNIQUE INDEX ← anti-abuso
ip_address   inet     UNIQUE INDEX ← anti-abuso
plan         text     CHECK IN ('PRO','AGENCY')
started_at   timestamptz
ends_at      timestamptz
converted    boolean  DEFAULT false
stripe_subscription_id text
```

### Schema: `topup_packages` (nova, dados inseridos)
```sql
id           text     PK ('starter','power','mega')
name         text
sparks       integer
price_brl    numeric(10,2)
stripe_price_id text  ← PREENCHER após criar no Stripe
active       boolean  DEFAULT true
```

**Dados inseridos:**
| id | name | sparks | price_brl | stripe_price_id |
|---|---|---|---|---|
| starter | Starter Pack | 200 | 19.90 | ⏳ pendente |
| power | Power Pack | 600 | 49.90 | ⏳ pendente |
| mega | Mega Pack | 1500 | 109.90 | ⏳ pendente |

### Schema: `founders` (nova)
```sql
id               uuid        PK
user_id          uuid        UNIQUE FK → profiles
email            text
name             text
granted_by       uuid        FK → profiles (nullable — quem concedeu)
granted_at       timestamptz
revoked_at       timestamptz (nullable)
is_active        boolean     DEFAULT true
notes            text        (ex: "amigo", "beta tester", "influencer")
converted_to_paid boolean    DEFAULT false
discount_pct     integer     DEFAULT 35 (desconto vitalício ao converter)
metadata         jsonb
created_at       timestamptz
updated_at       timestamptz (trigger automático)
```

### Schema: `topup_purchases` (nova)
```sql
id                        uuid        PK
user_id                   uuid        FK → profiles
package_id                text        FK → topup_packages
stripe_payment_intent_id  text        UNIQUE
sparks_credited           integer
price_paid_brl            numeric(10,2)
status                    text        CHECK IN ('pending','completed','failed','refunded')
created_at                timestamptz
```

### Funções (estado atual)

| Função | Status | O que faz |
|---|---|---|
| `handle_new_user()` | ✅ corrigida | Cria profile com 150✦ (era 50) |
| `refill_monthly_sparks()` | ✅ corrigida | ACUMULA sparks (não reseta). Pro=+1500, Agency=+4500 |
| `credit_sparks()` | ✅ sem alteração | Soma sparks + registra transação CREDIT |
| `debit_sparks()` | ✅ atualizada | Bypass total para FOUNDER e DEV — débito simbólico sem consumo real |
| `use_regeneration()` | ✅ sem alteração | Controla regen por sessão |
| `cleanup_expired_sessions()` | ✅ sem alteração | Expira sessões antigas |
| `get_user_profile()` | ✅ sem alteração | Retorna perfil por UUID |
| `get_user_transactions()` | ✅ sem alteração | Retorna histórico de transações |
| `start_trial()` | ✅ criada | Inicia trial 7 dias, anti-abuso e-mail+IP, credita sparks |
| `process_topup()` | ✅ criada | Credita sparks após confirmação Stripe (idempotente) |
| `grant_founder_access(email, granted_by?, notes?, discount?)` | ✅ criada | Concede plano FOUNDER por e-mail, credita 99.999✦ simbólicos |
| `revoke_founder_access(email)` | ✅ criada | Revoga acesso Founder, downgrade para FREE com 150✦ |
| `list_founders()` | ✅ criada | Lista todos os founders (ativos e inativos) |

---

## 2. Stripe — Configuração Manual Necessária

> O Stripe Dashboard não pode ser automatizado por segurança.
> Siga os passos abaixo na ordem indicada.

### Passo 1 — Criar Produto: PostSpark Pro

1. Acesse [dashboard.stripe.com/products](https://dashboard.stripe.com/products)
2. Clique em **+ Add product**
3. Preencha:
   - **Name:** `PostSpark Pro`
   - **Description:** `Plano profissional com 1.500 Sparks mensais acumulativos`
4. Em **Pricing**, adicione o primeiro preço:
   - **Pricing model:** Standard pricing
   - **Price:** `147,00`
   - **Currency:** `BRL`
   - **Billing period:** Monthly
   - **Trial period:** 7 days
   - Salve e anote o `price_id` → ex: `price_XXXXXXXXXXXXXXXX` → este é o **STRIPE_PRICE_PRO_MONTHLY**
5. Adicione um segundo preço no mesmo produto:
   - **Price:** `1.404,00` (= 12 × 117)
   - **Currency:** `BRL`
   - **Billing period:** Every 12 months (annual)
   - **Trial period:** 7 days
   - Anote o `price_id` → **STRIPE_PRICE_PRO_ANNUAL**

### Passo 2 — Criar Produto: PostSpark Agency

1. Clique em **+ Add product**
2. Preencha:
   - **Name:** `PostSpark Agency`
   - **Description:** `Plano agência com 4.500 Sparks mensais acumulativos`
3. Adicione preço mensal:
   - **Price:** `297,00` BRL / Monthly / Trial 7 days
   - Anote → **STRIPE_PRICE_AGENCY_MONTHLY**
4. Adicione preço anual:
   - **Price:** `2.844,00` BRL / Every 12 months / Trial 7 days
   - Anote → **STRIPE_PRICE_AGENCY_ANNUAL**

> ⚠️ Este produto existe mas será exibido como "Em breve" no app.
> Não é necessário arquivá-lo no Stripe — apenas não colocar na tela de pricing ainda.

### Passo 3 — Criar Produto: Sparks Top-up

1. Clique em **+ Add product**
2. Preencha:
   - **Name:** `Sparks Top-up`
   - **Description:** `Pacotes avulsos de Sparks`
3. Adicione **3 preços** (one-time, não recorrentes):

   **Starter Pack:**
   - **Price:** `19,90` BRL / One time
   - **Nickname:** `Starter Pack — 200 Sparks`
   - Anote → **STRIPE_PRICE_TOPUP_STARTER**

   **Power Pack:**
   - **Price:** `49,90` BRL / One time
   - **Nickname:** `Power Pack — 600 Sparks`
   - Anote → **STRIPE_PRICE_TOPUP_POWER**

   **Mega Pack:**
   - **Price:** `109,90` BRL / One time
   - **Nickname:** `Mega Pack — 1.500 Sparks`
   - Anote → **STRIPE_PRICE_TOPUP_MEGA**

### Passo 4 — Configurar Webhook

1. Vá em **Developers → Webhooks**
2. Clique em **+ Add endpoint**
3. **Endpoint URL:** `https://seudominio.com/api/stripe/webhook`
4. **Events to listen:**
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
5. Salve e anote o **Signing secret** → **STRIPE_WEBHOOK_SECRET**

### Passo 5 — Atualizar banco com Price IDs dos top-ups

Após criar os produtos, rode este SQL no Supabase (SQL Editor):

```sql
UPDATE postspark.topup_packages SET stripe_price_id = 'price_SEU_ID_AQUI' WHERE id = 'starter';
UPDATE postspark.topup_packages SET stripe_price_id = 'price_SEU_ID_AQUI' WHERE id = 'power';
UPDATE postspark.topup_packages SET stripe_price_id = 'price_SEU_ID_AQUI' WHERE id = 'mega';
```

---

## 3. Variáveis de Ambiente

Adicione ao `.env` do projeto (e ao ambiente de produção):

```env
# ─── Supabase ───────────────────────────────
SUPABASE_URL=https://spbuwcwmxlycchuwhfir.supabase.co
SUPABASE_SERVICE_ROLE_KEY=          # Supabase → Settings → API → service_role

# ─── Stripe ─────────────────────────────────
STRIPE_SECRET_KEY=sk_live_...       # Stripe → Developers → API Keys
STRIPE_WEBHOOK_SECRET=whsec_...     # Stripe → Developers → Webhooks → Signing secret

# Preços de assinatura
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_AGENCY_MONTHLY=price_...
STRIPE_PRICE_AGENCY_ANNUAL=price_...

# Preços de top-up
STRIPE_PRICE_TOPUP_STARTER=price_...
STRIPE_PRICE_TOPUP_POWER=price_...
STRIPE_PRICE_TOPUP_MEGA=price_...
```

---

## 4. Custo em Sparks por Ação (referência para o middleware)

| Ação | Custo | Constante sugerida |
|---|---|---|
| Gerar texto (3 variações) | 10 ✦ | `SPARK_COST_GENERATE_TEXT` |
| Gerar imagem IA | 25 ✦ | `SPARK_COST_GENERATE_IMAGE` |
| Regenerar imagem (mesma sessão) | 10 ✦ | `SPARK_COST_REGEN_IMAGE` |
| ChameleonProtocol | 15 ✦ | `SPARK_COST_CHAMELEON` |
| Carrossel completo (texto + imagem) | 40 ✦ | `SPARK_COST_CAROUSEL` |
| Exportar HD / Editar | 0 ✦ | — |

---

## 5. Regras de Negócio (referência para o código)

### Planos e Sparks
| Plano | Sparks | Recarga mensal | Rollover | Trial | Cobrança |
|---|---|---|---|---|---|
| FREE | 150✦ (fixo) | Não | Não | Não | Gratuito |
| PRO | 150✦ + 1.500✦ trial | +1.500✦/mês | ✅ acumula | 7 dias sem cartão | R$147/mês |
| AGENCY | 150✦ + 4.500✦ trial | +4.500✦/mês | ✅ acumula | 7 dias sem cartão | R$297/mês |
| **FOUNDER** | **99.999✦ simbólicos** | **Ilimitado (bypass)** | **N/A** | **N/A** | **Gratuito (manual)** |

### Pacotes Top-up
| Pacote | Sparks | Preço |
|---|---|---|
| Starter Pack | 200✦ | R$ 19,90 |
| Power Pack | 600✦ | R$ 49,90 |
| Mega Pack | 1.500✦ | R$ 109,90 |

### Founder — Como Usar (SQL Editor do Supabase)

**Conceder acesso:**
```sql
SELECT postspark.grant_founder_access(
  'email@amigo.com',   -- e-mail do usuário (precisa já ter conta)
  null,                -- granted_by (seu UUID, opcional)
  'Beta tester — amigo próximo',  -- notes
  35                   -- desconto % ao converter para Pro (padrão 35%)
);
```

**Revogar acesso:**
```sql
SELECT postspark.revoke_founder_access('email@amigo.com');
```

**Listar todos os founders:**
```sql
SELECT * FROM postspark.list_founders();
```

**⚠️ Importante:** O usuário precisa ter conta criada antes de receber acesso Founder.
Se ainda não tiver conta, peça para ele se cadastrar primeiro.

### Anti-abuso Trial
- 1 trial por e-mail (verificado na tabela `trials`)
- 1 trial por IP (verificado na tabela `trials`)
- Trial expira automaticamente após 7 dias (`ends_at`)
- Ao expirar sem converter: downgrade para FREE via job agendado ou webhook Stripe

---

## 6. O que Falta Implementar no Código

### Prioridade Alta (necessário para funcionar)
- [ ] Instalar SDK Stripe: `pnpm add stripe`
- [ ] Instalar SDK Supabase: `pnpm add @supabase/supabase-js`
- [ ] `server/_core/env.ts` → adicionar variáveis Stripe + Supabase
- [ ] `server/billing.ts` → módulo com cliente Stripe e funções helpers
- [ ] `server/routers.ts` → novos procedures tRPC:
  - `billing.getProfile` — retorna plano, sparks e saldo do usuário
  - `billing.startTrial` — chama `postspark.start_trial()`
  - `billing.createCheckout` — cria Stripe Checkout Session
  - `billing.getTopupPackages` — lista pacotes ativos
  - `billing.createTopupCheckout` — checkout para top-up avulso
- [ ] `server/_core/index.ts` → rota `POST /api/stripe/webhook` (Express puro, `express.raw()`)
- [ ] Middleware tRPC de débito de Sparks antes de cada geração em `routers.ts`:
  - Chamar `postspark.debit_sparks()` antes de `post.generate`, `post.generateImage`, `post.extractStyles`

### Prioridade Média (UX de billing)
- [ ] `client/src/components/SparkBalance.tsx` — badge de saldo sempre visível
- [ ] `client/src/pages/Pricing.tsx` — tela de planos com CTA
- [ ] `client/src/components/UpgradePrompt.tsx` — modal quando sparks < 20%
- [ ] `client/src/pages/Billing.tsx` — portal (plano atual, histórico, top-up)

### Prioridade Baixa (qualidade de vida)
- [ ] Job para expirar trials (cron ou Supabase Edge Function)
- [ ] Job para chamar `refill_monthly_sparks()` mensalmente
- [ ] E-mail de aviso de saldo baixo
- [ ] E-mail de renovação anual (30 dias antes)

---

## 7. Fluxo de Cobrança (referência)

```
NOVO USUÁRIO
    │
    ▼
auth.users criado → trigger handle_new_user()
    → profiles criado com plan='FREE', sparks=150
    │
    ├── Usa o app → debit_sparks() a cada ação
    │
    ▼
INICIA TRIAL (7 dias)
    │
    ├── start_trial() verifica e-mail + IP
    ├── plan → 'PRO', sparks += 1.500
    └── trials registro criado
    │
    ▼
TRIAL EXPIRA (7 dias)
    │
    ├── Converte → Stripe Checkout → subscription criada
    │       → webhook: subscriptions INSERT + credit_sparks mensal
    │
    └── Não converte → job/webhook → plan → 'FREE'
    │
    ▼
ASSINANTE PRO/AGENCY
    │
    ├── Renovação mensal → invoice.paid → refill_monthly_sparks()
    ├── Top-up avulso → payment_intent.succeeded → process_topup()
    ├── Cancelamento → subscription.deleted → plan → 'FREE' (sparks mantidos)
    └── Past due → invoice.payment_failed → status → 'past_due'
```

---

## 8. Migrations Aplicadas (histórico)

| # | Nome | Data | Status |
|---|---|---|---|
| 1 | `fix_handle_new_user_150_sparks` | 2026-02-20 | ✅ |
| 2 | `create_subscriptions_table` | 2026-02-20 | ✅ |
| 3 | `create_trials_table` | 2026-02-20 | ✅ |
| 4 | `create_topup_tables` | 2026-02-20 | ✅ |
| 5 | `add_stripe_customer_id_to_profiles` | 2026-02-20 | ✅ |
| 6 | `create_trial_and_topup_functions` | 2026-02-20 | ✅ |
| 7 | `fix_refill_monthly_sparks_rollover` | 2026-02-20 | ✅ |
| 8 | `add_founder_plan_to_enum` | 2026-02-20 | ✅ |
| 9 | `create_founders_table` | 2026-02-20 | ✅ |
| 10 | `create_founder_functions` | 2026-02-20 | ✅ |
| 11 | `update_debit_sparks_founder_bypass` | 2026-02-20 | ✅ |
