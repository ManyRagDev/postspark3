# PostSpark — Billing Handoff Document
> Gerado em: 2026-02-20 | Atualizado em: 2026-02-23
> Status: Supabase ✅ concluído | Stripe ✅ concluído

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
| starter | Starter Pack | 200 | 19.90 | price_1T47BXE9QJm1ioJLjhIVRtpe |
| power | Power Pack | 600 | 49.90 | price_1T47BZE9QJm1ioJLLmdQZNdU |
| mega | Mega Pack | 1500 | 109.90 | price_1T47BaE9QJm1ioJLQcS0seHl |

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

## 2. Stripe — ✅ Configuração Concluída

Todos os produtos e preços foram criados via API em 2026-02-23.

### Produtos criados

| Produto | Stripe Product ID |
|---|---|
| PostSpark Pro | `prod_U2BQfqpZL2oobH` |
| PostSpark Agency | `prod_U2BXGhAP3fXBRr` |
| Sparks Top-up | `prod_U2BQutuAri50Cp` |

### Webhook

| Campo | Valor |
|---|---|
| ID | `we_1T4748E9QJm1ioJLZy2gN4cM` |
| URL atual | `https://seudominio.com/api/stripe/webhook` ← atualizar no deploy |
| Eventos | checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed, payment_intent.succeeded |

> ⚠️ Lembrete: atualizar a URL do webhook no Stripe Dashboard após o deploy com o domínio real.

---

## 3. Variáveis de Ambiente

Adicione ao `.env` do projeto (e ao ambiente de produção):

```env
# ─── Supabase ───────────────────────────────
SUPABASE_URL=https://spbuwcwmxlycchuwhfir.supabase.co
SUPABASE_SERVICE_ROLE_KEY=          # Supabase → Settings → API → service_role key

# ─── Stripe ─────────────────────────────────
STRIPE_SECRET_KEY=                  # Stripe → Developers → API Keys → Secret key
STRIPE_WEBHOOK_SECRET=whsec_nrdNurrqfF6gG8UoaoacUJ3VrI6gTVvq

# Preços de assinatura
STRIPE_PRICE_PRO_MONTHLY=price_1T473zE9QJm1ioJLJZxhNqJu
STRIPE_PRICE_PRO_ANNUAL=price_1T4740E9QJm1ioJL6GgU0CuO
STRIPE_PRICE_AGENCY_MONTHLY=price_1T47BVE9QJm1ioJLQUldzvxS
STRIPE_PRICE_AGENCY_ANNUAL=price_1T47BWE9QJm1ioJLPdDQTrN7

# Preços de top-up
STRIPE_PRICE_TOPUP_STARTER=price_1T47BXE9QJm1ioJLjhIVRtpe
STRIPE_PRICE_TOPUP_POWER=price_1T47BZE9QJm1ioJLLmdQZNdU
STRIPE_PRICE_TOPUP_MEGA=price_1T47BaE9QJm1ioJLQcS0seHl
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
