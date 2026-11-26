# Operação do pipeline de IA

A geração do Studio entra por `generation.start` e passa pelo coordenador, pelo executor configurado e pelo renderizador CanvasLab. Acompanhe o mesmo identificador de pedido em todas as etapas. O [mapa do motor](./motor-integracao.md) descreve os pontos de entrada.

## Diagnosticar um pedido

1. Confirme o ambiente e o identificador do pedido. A decisão de admissão, revisão do catálogo, estratégia e operações persistidas pertencem àquele pedido.
2. Use `pnpm verify:e2e --id UUID` para verificar evidências persistidas, com `--post-id` se também for preciso conferir um post salvo desse pedido. `pnpm generation:trace --id UUID` reúne as decisões registradas. Ambos são comandos de leitura.
3. Cruze falhas de preparação, seleção, conteúdo, mídia, encaixe, revisão e liquidação com os contratos de [server/routers/generation.ts](../server/routers/generation.ts) e [server/ai/workflows](../server/ai/workflows/). Preserve o pedido e seus recibos.
4. Para métricas agregadas, `admin.getGenerationMetrics` lê a janela configurada no painel de administração. `admin.getAiRollout` informa flags da API que serve o painel. Para entender as decisões de um pedido, consulte seu registro e o executor que o processou.

## Configuração e privacidade

- Os nomes de variáveis vêm de [server/_core/env.ts](../server/_core/env.ts) e do [modelo de ambiente](../.env.example). `GENERATION_ADMISSION_PAUSED`, quando ativada, pausa novas admissões. Consulte o [contrato da VPS](./contrato-integracao-supabase-vps.md) para alterações operacionais.
- `AI_TRACE_STORE_CONTENT` controla a inclusão de conteúdo nos registros de diagnóstico que a consultam. O padrão da configuração é `false`. `AI_UI_DEBUG_ENABLED` controla as superfícies de depuração no servidor. A interface de extração de estilos lê `VITE_AI_UI_DEBUG_ENABLED` no build.
- Prompts e saídas podem conter conteúdo privado. Use identificadores e metadados na triagem e mantenha cópias de evidências em armazenamento privado.
- A [operação local](./local-demand-operations.md) descreve a instrumentação de tráfego e os limites das verificações isoladas.
