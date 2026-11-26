# Track 015 — Controle e briefings pareados

**Objetivo.** Criar uma referência reproduzível para saber se a escolha de design responde à intenção do pedido. Esta é a primeira track da sequência.

## Execução

- [x] Reunir os recibos das dez rodadas do TheVoid, com quatro pedidos estáticos e seis carrosséis de cinco páginas. Usar como índice os artefatos da auditoria `dez-rodadas/rodadas.json`, `frequencias.csv` e `ref08-mapa-das-chamadas.json`. Identificar cada caso pelo ID do pedido. O comparativo do Pátio 13 tem ID `df9ca816-c031-40d1-acc3-5e538ebdbbd9`.
- [x] Congelar por pedido a revisão do catálogo, formato, regras de mídia, candidatos, notas e confiança do JEV, semente, histórico disponível naquele instante, política do worker e escolhas por proposta e slide. Registrar diferenças entre o worker da rodada e o código local, inclusive quais recursos de `capability_v1` e versões de ficha já existem.
- [x] Reproduzir as escolhas com os recibos em memória. Conferir o percurso de cada família por elegibilidade, avaliação, escolha inicial, uso como reserva e entrega. Validar que habilitar a observação ou falhar ao gravar o diagnóstico produz as mesmas escolhas.
- [x] Preparar briefings pareados mantendo fatos, mídia, formato e quantidade de slides. Para o Pátio 13, variar entre comparar passes lado a lado, contar um dia no coworking e responder dúvidas de quem chega. Incluir um pedido aberto em que uma solução versátil seja adequada.
- [x] Antes de ver as novas notas, registrar quais composições seriam defensáveis em cada caso, a evidência visual esperada e quais fatos precisam aparecer na arte. Reservar briefings para verificação posterior à calibração.

## Aceite

A reprodução coincide com as famílias e componentes dos três lugares de cada pedido histórico. O relatório identifica o controle de 24 entregas em 30 propostas e 123 chamadas. Os casos novos têm expectativas registradas e identificadores próprios. Outro operador consegue repetir a comparação a partir dos recibos, sem nova geração.

**Pontos de partida.** `server/ai/workflows/generationPlanning.ts`, `server/designFrequency.ts` e `server/plannedDesignElectionEvidence.ts`.

[Relatório e reprodução](resultado.md) · [Critérios registrados antes das notas](pares.json)
