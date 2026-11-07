# Correção de roteamento — 6 de novembro de 2026

Disponível em localhost:3182, branch codex/acervo-82, para novos pedidos Automático. Nenhuma alteração remota ou na porta3000.

Novos pedidos usam taskRouting v2: DeepSeek prefere deepinfra, permite alternativas do mesmo modelo, exige parâmetros/JSON nativo, reasoning desativado, data_collection deny e preserva teto prompt0.1414/completion0.4242 por milhão. Haiku permanece inalterado. V1 e recibos históricos são preservados.

A recusa específica HTTP404 No allowed providers, quando comprovada por resposta completa e metadata coerente com provider.only, recebe recibo terminal versionado e mensagem provider_route_unavailable. Não gera replay pago automático. A interface permite nova submissão explícita. Não se generaliza para outros404,503 ou timeout. A chamada741cded0 não foi reconciliada por inferência: o registro histórico está truncado.

0060 aplicada apenas ao Supabase local; readiness V1/V2 confirmada, 49requests e49runs/billing preservados por hash. Servidor3182 reiniciado sem gerações ativas, orçamento preservado; API autenticada confirmou ready e routing2.

Testes de configuração/provedor/compatibilidade, contratosSQL, runtime eUI passaram; TypeScript passou. Integração adicional do root:67testes. Uma chamada real passou com HTTP200,12tokens de entrada e6de saída,US$0.0000042. A DeepInfra atendeu essa chamada: não houve failover remoto observado. Política enviada e fallback foram verificados por contrato/testes; não houve uma nova geração completa de três posts nesta validação.

O problema separado de encaixe no REF05 continua pendente. Esta alteração corrige a dependência exclusiva do provedor e o tratamento da recusa comprovada.

Evidências: artifacts/acervo82/full/sessions/provider-routing-v2-20261106/{live-probe.json,local-migration.json,integration-tests.log,manual-refresh.json,ready.json}.
