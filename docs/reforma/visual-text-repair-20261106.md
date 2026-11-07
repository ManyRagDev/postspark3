# Correção visual de texto — 2026-11-06

Implementado na worktree codex/acervo-82 para novas gerações automáticas, porta3182. O caso de referência é Miolo55cc37f5-afd2-4f6f-b89a-a24c24c0b79b, slot1 REF-19 Papel rasgado.

## Resultado implementado

1. Estouro recuperável aciona correção visual no próprio design, antes da busca de reservas.
2. Mesma operação copy_recovery, com modelo de visão fixado pela configuração de revisão. O agente recebe o rascunho real e somente os slides/campos afetados, medidas de encaixe, CTA/textos congelados e legenda relevante.
3. Três níveis de concisão na mesma resposta; seleção por Fontkit local. Sugestões não viram maxLength rígido.
4. Se nenhuma alternativa cabe, guarda-se a mais concisa produzida pelo agente para busca local de outro design. Não se reutiliza cegamente o original longo.
5. Revisão final permanece ativa. Um texto inválido não é marcado pronto; cancelamento, falta de fontes/assets ou falha de provedor não são ocultados.

Marker visualTextRepairVersion1 somente em novas configurações; histórico, uma compra compartilhada de correção, limite do coordenador e contabilidade preservados. copy_fit_candidate é uma operação local e não uma chamada paga. Renderização antes do journal de compra evita incerteza financeira sem dispatch.

## Verificações

- 141 testes focados de integração/configuração/runtime aprovados em8arquivos; 54 de contrato/copy aprovados; 3 de transporte visual aprovados; lote final de graph/recuperação/PostgreSQL com81testes aprovado. Conjuntos podem se sobrepor; não somar como total único.
- TypeScript completo sem cache aprovado após mudanças finais; renderer reconstruído.
- Fontkit real + CanvasPostStage oficial no REF19: três controles manuais curtos passaram, preservando CTA, legenda, hashtags e catálogo. O original falha objetivamente em título/corpo.
- Workflow com correção/revisor controlados: ready no mesmo design com2chamadas simuladas; reexecução produz bundle/recibos idênticos sem nova chamada.
- Controle com correção inalterada: falha em vez de entregar overflow, sem loop.
- Controle de falha de renderer: zero chamadas e nenhum registro de compra iniciado.

## Limite da evidência e teste pendente

Os textos dos controles são manuais e os pareceres do harness são simulados. Não demonstram adesão real do modelo ao novo prompt. O teste real foi preparado para reutilizar a copy original da Miolo, fazer somente correção visual+revisão final comHaiku viaOpenRouter (máximo2chamadas, teto conservadorUS$0,30), sem nova seleção/imagem ou reescrita da geração histórica.

A revisão automática de aprovação rejeitou a execução por exigir autorização específica para reenviar esse conteúdo privado ao OpenRouter. A autorização geral anterior para testarHaiku/DeepSeek foi apresentada e não foi considerada suficiente. Nenhuma chamada paga desse ensaio foi executada. Aguarda decisão do usuário.

Evidências: artifacts/acervo82/full/sessions/visual-text-repair-20261106/. Não altera o problema independente de rasterização do ornamento CON20, diagnosticado anteriormente.
