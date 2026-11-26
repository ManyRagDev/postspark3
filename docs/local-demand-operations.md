# Operação da geração local sob demanda

O Studio chama `generation.start` nas rotas `/thevoid` e `/studio`. A API registra o pedido e a reserva de Sparks no PostgreSQL. O ambiente e o modo de execução determinam quem processa o pedido.

## Escolher o executor de desenvolvimento

- **Local sob demanda.** Configure `NODE_ENV=development`, `GENERATION_WORKER_MODE=local-demand` e `GENERATION_LOCAL_DEMAND_ENABLED=true`. `pnpm dev` prepara o renderer e inicia a API. No boot, o supervisor recupera pedidos associados ao identificador da instalação em `.postspark-local/executor-id`. Depois do commit de um pedido, o supervisor inicia um processo filho. Preservar o identificador possibilita retomar pedidos desta instalação.
- **Worker da VPS.** Com `POSTSPARK_DEV_VPS_TUNNEL=true`, `pnpm dev` usa `external` e abre um túnel privado para o endpoint de prontidão. O alias SSH, o container e a rede são configurados em [scripts/dev.mjs](../scripts/dev.mjs). API e worker precisam usar a mesma instalação do Supabase.
- **Executor externo.** `pnpm generation:worker` é o ponto de entrada do processo separado. O worker usa `GENERATION_DATABASE_SESSION_URL` para o listener do PostgreSQL. Para produção, use o [contrato da VPS](./contrato-integracao-supabase-vps.md) e seu Compose.

No modo local, o progresso pode usar SSE. O Studio consulta o resultado durável para recuperar a execução. Pedidos locais continuam vinculados ao seu executor se o ambiente passar para `external`. O [mapa do motor](./motor-integracao.md) descreve o contrato do pedido, catálogo e persistência.

## Catálogo e prontidão

1. Para o executor externo, `pnpm motor:preflight` confere a configuração local. A opção `--online` verifica a instalação configurada.
2. Confira a revisão no pedido admitido. `generation.capabilities` expõe prontidão e também informa a revisão no modo local ou no ensaio restrito. As revisões do catálogo são imutáveis. Uma publicação afeta novas admissões.
3. Se precisar validar o snapshot de catálogo que está em preparação, o [operador de catálogo](../scripts/publishCatalogRevision.ts) aceita `--check` com `--expected-host=HOST[:PORTA]` igual ao host e à porta do `SUPABASE_URL` escolhido. A opção de publicação é `--publish` e altera a revisão ativa. O contrato da VPS descreve separadamente a importação congelada.

## Diagnóstico local

- `pnpm verify:e2e --id UUID` verifica evidências persistidas de um pedido existente. Para acompanhar decisões e handoffs, use `pnpm generation:trace --id UUID`. Os dois comandos usam o ambiente Supabase configurado.
- `pnpm diagnose:calibrate` exercita a instrumentação com servidores locais. Com a API de desenvolvimento em loopback, `pnpm diagnose:start`, `pnpm diagnose:stop` e `pnpm diagnose:report` iniciam, encerram e tabulam uma janela de captura.
- `pnpm test:local-demand` exercita a matriz isolada. Os resultados de testes locais cobrem os contratos e as falhas simuladas. A evidência de um pedido real vem do pedido, da interface e dos recibos do ambiente em uso.

As medições locais de tráfego registram origem, operação, contagens e bytes observáveis. Trate bytes desconhecidos como ausência de medição. A política de diagnóstico da IA está em [Operação do pipeline](./AI_OPERATIONS.md).
