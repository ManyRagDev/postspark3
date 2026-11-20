# Track 018 — Validação das propostas selecionadas até a galeria

**Objetivo.** Verificar se a classificação candidata da 017 melhora a peça que o usuário recebe e medir seu efeito no tempo e no custo do pedido.

## Execução

- [ ] Montar, em diagnóstico, os casos em que mudou a família escolhida e casos de controle em que a escolha coincidiu. Usar o mesmo briefing, revisão de design, fontes, modelo de redação, configuração de mídia, política de reparo e política de reservas. Identificar os resultados reproduzidos com recibos e as novas chamadas reais.
- [ ] Inspecionar as peças renderizadas no caminho do TheVoid. Conferir preço, prazo, quantidade e chamada para ação na superfície exigida pelo briefing. No Pátio 13, verificar se é possível atribuir cada preço e benefício ao passe correto. Registrar perdas na arte mesmo quando o fato continua na legenda.
- [ ] Conferir por proposta se o design inicial chegou à revisão, se houve reparo ou troca de família, quantos slides foram entregues e se o resultado aparece e reabre na galeria e no CanvasLab. Incluir os casos conhecidos de índice do REF-08 e de chamada curta do R9-12. O reparo local experimental desses campos pertence a outra intervenção e deve permanecer igual nos dois braços.
- [ ] Comparar por pedido entregas de 3/3, tempo até a galeria, chamadas e USD por etapa, custos sem valor informado e Sparks correspondentes às propostas prontas. Distinguir o tempo do JEV, o cálculo local e o tempo total. Conferir o mesmo débito para o mesmo formato e quantidade de entregas.

## Aceite

Apresentar pares de artes e seus resultados técnicos e editoriais, as diferenças de custo e latência e os casos inconclusivos. Recomendar integração, ajuste ou manutenção da política vigente com base nas peças e nos fatos preservados. Uma distribuição mais uniforme das escolhas, por si só, deixa a hipótese de qualidade em aberto.

**Pontos de partida.** `server/ai/workflows/proposalGraph.ts`, `server/ai/workflows/generationCoordinator.ts`, `server/billing.ts` e `client/src/pages/StudioApp/StudioAppV2BPage.tsx`.
