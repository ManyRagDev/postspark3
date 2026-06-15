# 06 - Dados, persistencia e billing

Projetos reais precisam guardar dados e controlar custos.

No PostSpark, isso aparece em duas areas fortes:

- persistencia de usuarios, posts e assets;
- billing por plano e saldo de Sparks.

## Persistencia

Persistencia significa salvar informacoes para elas continuarem existindo depois que a tela fecha.

No PostSpark, a persistencia usa Supabase/Postgres.

Arquivos importantes:

- `server/db.ts`
- `drizzle/schema.ts`
- `drizzle/*.sql`

## Supabase e Drizzle

O projeto possui schema e migracoes em `drizzle/`, mas o runtime atual acessa dados principalmente com `@supabase/supabase-js` em `server/db.ts`.

Isso ensina uma licao importante: a existencia de uma ferramenta no repositorio nao significa que ela seja a camada principal em runtime.

Para entender a verdade, sempre cruze documentacao com codigo executado.

## Tipos compartilhados

O PostSpark usa contratos compartilhados em:

- `shared/postspark.ts`
- `shared/const.ts`
- `shared/types.ts`

Esses arquivos ajudam frontend e backend a falarem a mesma lingua.

## Billing

Billing e a parte de cobranca, planos e saldo.

No PostSpark:

- `server/billing.ts` integra com Stripe;
- paginas como `Pricing` e `Billing` mostram planos e estados para o usuario;
- operacoes caras podem debitar Sparks.

## Por que billing fica no backend

Pagamento e saldo nao podem depender apenas do navegador.

O backend precisa controlar:

- quem e o usuario;
- qual plano ele possui;
- quantos Sparks ele tem;
- se uma operacao pode ser executada;
- como responder a webhooks da Stripe.

## Webhook

Webhook e uma chamada feita por um servico externo para avisar que algo aconteceu.

Exemplo: a Stripe chama `/api/stripe/webhook` para avisar sobre eventos de pagamento.

## Regra mental

Banco guarda estado. Billing protege custo. Tipos compartilhados reduzem erro de comunicacao entre camadas.
