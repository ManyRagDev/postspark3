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

Para converter as receitas históricas existentes, use `pnpm designs:build` sem `--input`. Uma receita existente não comprova fidelidade: compare com a imagem original verificada antes de aprovar a restauração. O preview antigo é uma evidência intermediária separada.

Veja o procedimento completo em [pipeline-designs-completos.md](../docs/pipeline-designs-completos.md).

## Como o design fica disponível para escolha da IA

A ficha de seleção é uma projeção automática do contrato existente, feita por `shared/designSelection.ts`. Não há um segundo JSON para manter. Novos modelos completos passam a receber a mesma ficha quando entram no catálogo elegível.

Ao autorar ou revisar uma composição:

1. Declare os campos de conteúdo, a quantidade de itens, os slots reais de mídia, os papéis de slide e as fontes. Confira a geometria e o encaixe com uma segunda copy. Esses dados alimentam a ficha; texto de exemplo e prompt da foto não são usados para classificar a finalidade do design.
2. Descreva características observáveis nas descrições que o contrato disponibiliza: hierarquia, disposição, contraste, tratamentos, espaços para conteúdo e possibilidades de adaptação verificadas. “Título dominante e corpo curto” informa uma capacidade; “somente para reflexão” cria uma restrição temática indevida.
3. Registre limitações reais e mantenha como desconhecido o que não foi testado. Uma adaptação possível manualmente no editor não equivale a uma capacidade comprovada de geração automática.

As famílias básicas têm o mesmo vocabulário de ficha, extraído de suas definições, com as lacunas explícitas. Isso não as publica nem as torna automaticamente executáveis no fluxo de designs completos. A aprovação visual e as verificações de elegibilidade continuam necessárias.

O pipeline único usa a pré-seleção: Jev avalia as fichas elegíveis em lotes e entrega até 12 famílias para a LLM escolher as três propostas. Para carrosséis, cada família leva seus modelos necessários de capa, desenvolvimento e fechamento. Catálogos com até 12 cards dispensam a chamada ao Jev. O tamanho inicial é uma hipótese para calibração com briefs reais, não uma medida já comprovada de qualidade.


Para verificar o renderer real e uma segunda copy antes da revisão, use `node --env-file=.env --import tsx scripts/verifyGenerationCatalog.ts --repeat` (veja `--ids` e `--output` no script). Isso produz PNGs e hashes sem chamar IA nem publicar. Revisão humana no Admin2 e revisão assistida por agente têm atribuições distintas; evidência técnica isolada não aprova o visual. Publicação exige decisão explícita e todos os gates do catálogo.

## Recuperação do acervo e contrato de autoria

`designGuidance` acompanha a definição imutável e chega às fichas Jev, à seleção, à copy, à mídia e ao revisor. Declare características observáveis, regras de conteúdo, requisitos de cada slot, limites conhecidos e proveniência do original. `requiredTextTargets` lista somente regiões textuais que precisam estar ocupadas por decisão explícita de autoria; não transforme todos os campos opcionais em obrigatórios. O pipeline valida os IDs e a ocupação real, com uma recuperação limitada.

As fichas curadas de 22 referências estão em `harness/componentArsenal/referenceProfiles.ts`. Elas descrevem o que a composição executa e onde a referência ainda é aproximada, sem restringir tema ou função comunicativa. O build incorpora essas fichas e todas as notas históricas; regras grandes demais falham explicitamente, sem truncamento silencioso.

Para papel empilhado e computador retrô, `recovered-assets/` conserva fundos restaurados a partir dos originais, com hashes de proveniência. `restoreVisualAssets.ts` os vincula por `imageAssetId` a uma nova revisão da composição. Textos continuam nativos e editáveis; o PNG não substitui o post inteiro. O carregamento verifica bytes/hash, a exportação aguarda a imagem e o revisor usa o mesmo CanvasPostStage. O modelo aceita substituição manual da mídia, mantendo a origem no histórico. São duas restaurações, não uma certificação de fidelidade de todo o acervo.

O relatório do build distingue original baixado, preview histórico e conversão atual. Proporção sem suporte exige adaptação explícita; sobreposição texto/foto autorada e contraste desconhecido são diagnósticos, não aprovação visual automática. Listas semânticas usam itens em slots nativos, preservando cardinalidade, prefixo e identidade de cada item; containers de linhas de título continuam campos de texto.

A revisão de autoria (`authorshipRevision`) é metadado do catálogo, não uma versão do motor. Uma nova revisão substitui a mesma identidade de origem/variante na seleção, antes da elegibilidade, sem apagar definições antigas usadas por posts salvos. Rascunhos só concorrem na prévia administrativa; publicar permanece uma ação separada.
