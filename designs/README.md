# Referências para designs completos

Salve imagens PNG, JPEG ou WebP em `designs/inbox/`, ou indique outra pasta no chat. Peça a conversão em designs completos do PostSpark. O agente inspeciona as imagens e usa o pipeline abaixo. A pasta de entrada não publica arquivos nem dispara chamadas de IA automaticamente.

```bash
pnpm designs:intake designs/inbox
```

O comando imprime a pasta do lote, inventaria dimensões/hash/caminho e cria `specs/` e `authoring/`. A partir das imagens, o agente escreve cada composição com o `CompactSpec` de `harness/designBatch/builder.ts`, declara os campos semânticos e os papéis permitidos e executa:

```bash
pnpm designs:build --input artifacts/complete-designs/intake-RODADA
```

A saída nova contém receitas importáveis no Admin2, modelos completos, fontes verificadas, renders e `REVIEW.html`. A copy de demonstração ajuda a conferir o visual; a geração usa campos tipados personalizados. Rejeições e limites aparecem no inventário. Confira o PNG e uma segunda copy antes de publicar.

Para converter as receitas históricas existentes, use `pnpm designs:build` sem `--input`. Não é necessário analisar novamente as imagens que já possuem receitas.

Veja o procedimento completo em [pipeline-designs-completos.md](../docs/pipeline-designs-completos.md).

## Como o design fica disponível para escolha da IA

A ficha de seleção é uma projeção automática do contrato existente, feita por `shared/designSelection.ts`. Não há um segundo JSON para manter. Novos modelos completos passam a receber a mesma ficha quando entram no catálogo elegível.

Ao autorar ou revisar uma composição:

1. Declare os campos de conteúdo, a quantidade de itens, os slots reais de mídia, os papéis de slide e as fontes. Confira a geometria e o encaixe com uma segunda copy. Esses dados alimentam a ficha; texto de exemplo e prompt da foto não são usados para classificar a finalidade do design.
2. Descreva características observáveis nas descrições que o contrato disponibiliza: hierarquia, disposição, contraste, tratamentos, espaços para conteúdo e possibilidades de adaptação verificadas. “Título dominante e corpo curto” informa uma capacidade; “somente para reflexão” cria uma restrição temática indevida.
3. Registre limitações reais e mantenha como desconhecido o que não foi testado. Uma adaptação possível manualmente no editor não equivale a uma capacidade comprovada de geração automática.

As famílias básicas têm o mesmo vocabulário de ficha, extraído de suas definições, com as lacunas explícitas. Isso não as publica nem as torna automaticamente executáveis no fluxo de designs completos. A aprovação visual e as verificações de elegibilidade continuam necessárias.

V4 e V5 usam a mesma pré-seleção: Jev avalia as fichas elegíveis em lotes e entrega até 12 famílias para a LLM escolher as três propostas. Para carrosséis, cada família leva seus modelos necessários de capa, desenvolvimento e fechamento. Catálogos com até 12 cards dispensam a chamada ao Jev. O tamanho inicial é uma hipótese para calibração com briefs reais, não uma medida já comprovada de qualidade.
