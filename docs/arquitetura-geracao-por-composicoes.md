# Geração por composições completas — V4

Decisão de 2026-10-07: o catálogo define as composições possíveis. A IA decide quais delas atendem ao briefing e escreve dentro de seus campos. A estética nasce da autoria e curadoria do catálogo.

A evolução planejada está no [blueprint da geração orquestrada](./blueprint-geracao-orquestrada.md): grafos por proposta, mídia nas sugestões, contratos, revisão técnica excepcional e entrega independente. Ele descreve o destino proposto; esta página registra o comportamento V4 atual.

## Responsabilidades

| Módulo | Responsabilidade |
| --- | --- |
| `server/designCatalog/completeDesignStore.ts` | Recuperar todos os cartões elegíveis por status, baseline, formato, papéis e marca; não escolher por distância geométrica. |
| `server/ai/completeDesignGeneration.ts` | Selecionar IDs, hidratar e conferir hashes, escrever campos, medir fontes e produzir cenas completas resolvidas. |
| `shared/completeDesignGeneration.ts` | Contrato de entrega, campos nativos e instanciação imutável de cada modelo. |
| `server/designCatalog/arsenalRun.ts` | Comparar cena e manifesto; autorizar assets e persistir por RPC existente, antes do commit de Sparks. |
| `client/src/pages/CanvasLab/lib/completeDesignCompiler.ts` | Carregar fontes e instalar a cena entregue, sem reconstruir a composição. |
| `client/src/pages/CanvasLab/lib/saveAdapter.ts` | Salvar e reabrir o documento autoritativo e sua proveniência em `canvas_model`. |
| `harness/completeDesigns/` | Intake, conversão de specs autoradas, conferência técnica e replay offline; publicação continua explícita no Admin2. |

## Contratos e limites

`post.generate` recebe `designContractVersion:4` e, opcionalmente, `includeDraftDesigns`. A inclusão de drafts exige administrador; usuários comuns recebem somente modelos publicados. O modo `off` bloqueia V4; não devolve uma geração convencional. O alias `assemblyPilot` e os contratos antigos preservam compatibilidade.

A IA seleciona exatamente três opções de um ou mais slides. Cada opção permanece na mesma família e usa variantes autoradas para os papéis do carrossel. O conteúdo extraído de URL e a imagem de referência, quando existentes, continuam alimentando a IA. A etapa de copy conhece as caixas e fontes, recebe apenas os campos dos modelos já escolhidos e não pode substituir IDs. Até um reparo em cada etapa corrige respostas inválidas dentro do mesmo contrato.

O servidor instancia os campos e resolve as relações nativas. Entrega `completeDesignV1` com origem, nome, razão da escolha e cenas `ArsenalComposition` sem issues. O cliente instala essas cenas no `CanvasPostModel`. Alterações manuais posteriores continuam no funil oficial do CanvasLab.

O manifesto `componentAssemblyV1` é um adaptador temporário da fronteira de persistência. A RPC existente confere proprietário, run, componentes/hashes/status e grants; o servidor exige que manifesto e cena apontem para o mesmo modelo, conteúdo, peças e assets. Esse uso não permite recombinação ou adaptação visual.

Não entram neste caminho: `componentAssemblyOrchestrator`, auditoria de intenção de direção de arte, quiet-adaptation, rescue editorial, presets de família ou fallback genérico. Indisponibilidade de modelo, fonte, provedor ou autorização encerra a etapa correspondente. Falhas anteriores ao commit seguem o refund existente. A indisponibilidade de fontes no navegador acontece depois da entrega e cobrança do servidor; não introduzimos um novo protocolo de cobrança ou reembolso automático no cliente.

Slots de foto são entregues na composição original e preenchidos depois no editor. Pequenos elementos opcionais continuam ferramentas de acabamento manual; acréscimos automáticos futuros exigem regras autoradas por modelo.

## Política definida para a evolução: revisão por evidência técnica

Decisão do proprietário em 2026-10-07: correção automática é exceção e exige justificativa técnica de design forte. Beleza, gosto, estilo e avaliações como “parece genérico”, “está feio” ou “não parece premium” ficam a cargo do usuário. Justificativa fraca ou inconclusiva não dispara revisão, regeneração, fallback ou bloqueio da proposta. Esta política orienta a evolução discutida; não representa implantação de LangGraph ou de um crítico visual nesta versão.

Uma revisão deve identificar a regra aplicável, elemento/região, evidência observada, diferença em relação ao esperado e ação localizada. Exemplos admissíveis: perda comprovada de texto obrigatório por overflow/oclusão, mídia obrigatória ausente, asset inválido ou alteração demonstrável de requisito explícito do pedido. Contraste pode fundamentar revisão quando a regra aplicável e a medição sobre a superfície efetiva forem confiáveis; uma estimativa incerta sobre fotografia não basta. Sobreposição, recorte, assimetria e rotação autorados não são defeitos por si mesmos. Nota estética, confiança declarada pela IA ou preferência por outra composição não constituem evidência técnica.

Revisões devem preservar resultados aceitos e atuar somente no elemento responsável, dentro dos limites globais de custo/prazo/tentativas. A aceitação técnica de cada proposta é independente; carrosséis também exigem integridade da sequência. A entrega tecnicamente aceita não deve ser apresentada como certificação de beleza. Preferências do usuário podem orientar a geração e alterações solicitadas, sem converter gosto em veto automático.

## Evidência e pendências

O run anterior `84ef1c6e-6483-4f96-b9c9-fcadf2811945` concluiu com Stroke Impact, Cinematic Depth e Kinetic Type. Os nove preflights registrados estavam sem issues e não havia evento de rescue/adaptação: o trace não comprova fallback no servidor. A recuperação limitada e os processamentos genéricos posteriores foram eliminados do novo caminho; qualidade visual do catálogo continua uma responsabilidade separada.

As regressões cobrem seleção/copy separadas, preservação dos modelos, ausência de mistura/fallback, contrato e hashes, catálogo paginado, autorização atômica, fonte indisponível, roteamento V4 e salvar/reabrir. O replay `harness/completeDesigns/replayGeneration.ts` usa três modelos importados e seus bytes reais de fontes para nove cenas; seleção, copy e originalidade são simuladas. A evidência fica em `artifacts/complete-designs/architecture-v4-offline-2026-10-07/OFFLINE_REPLAY.json`.

O teste real de post único 4:5 de §13.67 do documento-mestre confirmou IA → galeria → editor → salvar → reabrir → exportar, com três propostas e sem fallback. A avaliação humana foi parcial: duas propostas dependem de fotografia e a terceira está completa. Ainda exigem conferência: percurso real de carrosséis/demais formatos, cobrança em plano pago e avaliação visual do restante dos modelos convertidos. Os modelos importados continuam drafts; baseline técnico não equivale a publicação ou aprovação estética. Nenhuma migração, publicação de catálogo ou implantação remota foi realizada nesta alteração.

Para acrescentar referências e converter imagens em JSON, siga [pipeline-designs-completos.md](./pipeline-designs-completos.md).
