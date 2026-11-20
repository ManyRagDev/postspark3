# Plano intermediário do editor avançado de imagens do PostSpark

**Estado:** intermediário, aberto a novas informações e revisão de escopo.  
**Versão:** 0.9.  
**Atualização:** 17/11/2026.

O objetivo é permitir que o usuário gere, trate, componha, modifique e exporte posts estáticos e carrosséis dentro do PostSpark. O primeiro pacote do motor de imagens na VPS já está integrado à experiência do CanvasLab e publicado; o restante será ampliado conforme qualidade e testes.

O desenvolvimento foi organizado em duas entregas sequenciais: estabilizar o CanvasLab e depois preparar/integrar o processamento de imagem. O primeiro pacote já foi publicado. O próximo trabalho segue o plano de implementação do editor unificado ao final deste documento, com três incrementos verificáveis. As fases históricas e o catálogo de oportunidades não autorizam incorporar todas as funcionalidades descobertas.

## Diretrizes estabelecidas

- Executar o PhotoCraft como CLI Linux headless na VPS, orquestrado pelo backend Node.js. Não compilar nem executar o PhotoCraft em WebAssembly no frontend.
- Manter o CanvasLab como editor do post e o `CanvasPostModel` como documento autoritativo. Toda alteração confirmada no post passa por `CanvasLabPage.handleUpdatePost` e pela renderização do `CanvasPostStage`.
- Processar imagens e produzir assets derivados, preservando o original. Máscaras, receitas e documentos auxiliares do PhotoCraft não se tornam um segundo documento autoritativo do post.
- Preservar a auditoria de contraste e legibilidade. Os presets de família visual continuam sem alterar cores; mudanças de cor em imagens serão operações explícitas do editor avançado.
- Preservar os fluxos existentes enquanto o modo avançado é desenvolvido. A introdução desse modo não implica, por si só, uma mudança de plano comercial ou cobrança de Sparks.
- Estabilizar seleção, geometria, camadas e replicação do editor existente antes de conectar novas operações à interface. O trabalho de preparação inclui conferir funcionalidades já oferecidas ao usuário.
- Concluir e validar a entrega do CanvasLab antes de iniciar a entrega do PhotoCraft. As duas entregas terão escopos e critérios de conclusão próprios.

O checkout atual usa React/Vite e Express/tRPC. O pedido inicial citava uma rota Next.js App Router; essa divergência deve ser resolvida antes da PoC de API. O plano considera o backend existente como referência de integração, sem pressupor uma migração de framework.

## Ordem das entregas

### Entrega A CanvasLab estabilizado e validado

Executar a fase 0 em incrementos verificáveis:

1. Corrigir precisão dos controles e padronizar seleção e edição por duplo clique, com regressões para as falhas já reproduzidas.
2. Melhorar controle de camadas e implementar multisseleção coerente entre canvas e painel, respeitando grupos, bloqueios e histórico.
3. Completar a correspondência entre slides e a aplicação das propriedades escolhidas, com confirmação do resultado efetivo.
4. Conferir as jornadas completas no navegador, em desktop e mobile, incluindo desfazer/refazer, persistência, reabertura, exportação e compatibilidade com posts existentes.

Cada incremento recebe validação antes de ampliar o seguinte. A entrega termina quando os problemas prioritários do editor estão corrigidos e as jornadas passam na interface real. Os cenários de dados e componentes isolados continuam como proteção de regressão, acompanhados da verificação de uso.

### Entrega B PhotoCraft no editor avançado

Após a conclusão da entrega A, executar as fases 1 a 7: preparar e medir a VPS, avaliar a qualidade das operações, definir persistência dos assets e receitas, construir o adaptador e a API, integrar a primeira ferramenta e ampliar as capacidades gradualmente.

O comportamento do CanvasLab validado na primeira entrega será a referência para identificar regressões durante a integração. A primeira operação do PhotoCraft deve percorrer edição, confirmação, salvamento, reabertura e exportação antes de introduzir outras ferramentas.

## Ponto de partida

**Conferência de 14/11/2026:** as correções do fluxo de IA são uma frente complementar, com numeração própria. No CanvasLab foram implementadas seleção múltipla compartilhada com camadas (modificadores e alternativa por toque), operações em conjunto com confirmação única no histórico, preservação de medidas fracionárias e aparência efetiva nos controles, correção dos overrides do corpo e replicação por objeto com escolha de propriedades e prévia dos correspondentes. Exportações omitem as guias do editor. A validação local usa a página e o Stage reais, documentos fictícios, save/reopen em JSON e captura de PNG/ZIP em `harness/canvaslabStabilization/`. Ela não estabelece validação do banco hospedado, autenticação ou aparelho móvel físico. Após autorização do usuário, a entrega B avançou da instalação para o primeiro pacote publicado. As fases 2–5 receberam o escopo aprovado e ensaios locais/hospedados; expansões e itens ainda incertos permanecem no backlog, distintos das correções de IA.

| Área | Estado em 14/11/2026 | Consequência para o planejamento |
| --- | --- | --- |
| Instalação Linux | Instalador executado na VPS: release oficial verificada, extraída sem FUSE, diretório versionado e comando global | Binário disponível no host; atualização manual e retorno de versão documentados |
| Motor inspecionado | PhotoCraft CLI 0.23.1, build `45066c482`, com 1.009 comandos registrados | Usar essa versão como base da descoberta; reavaliar mudanças antes de atualizar |
| Validação local | Executável oficial testado em Linux x86_64, sem display e sem GPU | Máscara, alpha, duas execuções concorrentes, ajustes, blur, recorte, dimensões, conversão e reabertura nativa passaram em casos sintéticos |
| CanvasLab existente | Correções implementadas e verificadas localmente conforme a conferência acima | Preservar as regressões e completar homologação hospedada/móvel pertinente ao piloto |
| VPS | Ubuntu 22.04, x86_64/glibc 2.35, 8 CPUs/32 GB; smoke aprovado e 28 execuções medidas até 3840×3840, incluindo pares concorrentes | Fase 1 concluída; avaliação visual e dimensionamento com fotografias reais continuam na fase 2 |
| Integração com o produto | Primeiro pacote publicado em `postspark.com.br`: editor avançado, API autenticada e processador privado; sem expor o fornecedor | Auth/Storage, prévia/aplicar, histórico, salvar/reabrir, original e cancelar conferidos no ambiente hospedado; demais operações ficam no backlog |

Os detalhes estão no [registro da VPS](VPS_OPERACAO.md), no [guia de preparação](README.md), no [instalador Linux](install-linux.sh) e na [verificação headless](verify-headless.py). As medições sintéticas na VPS estabelecem uma referência operacional inicial, não capacidade garantida sob carga de produção.

## Escopo de produto proposto

As prioridades indicam uma ordem inicial de construção e validação. Todos os grupos continuam sujeitos à revisão conforme o objetivo do produto, os testes de qualidade e o custo de oferecer uma interação fluida.

| Grupo | Capacidades | Resultado esperado para o usuário |
| --- | --- | --- |
| Base de edição | Recorte, redimensionamento, rotação, margens e tratamento de transparência | Preparar a imagem para a composição sem uma conversão externa |
| Seleção e máscaras | Seleção automática, por objeto, pincel, polígono e cor; refinamento e correção manual | Isolar pessoas, produtos e regiões, incluindo um caminho para corrigir a seleção |
| Cor e qualidade | Exposição, níveis, curvas, saturação, vibrance, balanço de cor, sombras, realces, nitidez e redução de ruído | Corrigir fotos e controlar sua aparência |
| Limpeza e retoque | Remoção de objetos por pincel, preenchimento, correção de manchas e clonagem | Corrigir distrações e pequenos defeitos na própria peça |
| Acabamento de recortes | Contorno, sombra, brilho e correção de halos | Criar elementos e stickers com acabamento reutilizável |
| Edição localizada | Troca de cor, iluminação, blur e ajustes limitados por uma região ou máscara | Alterar uma parte da foto com controle sobre a área afetada |
| Montagens | Múltiplas imagens, máscaras, sobreposições, modos de mistura e harmonização de cor | Combinar pessoa, produto, cenário e elementos gráficos |
| Identidade visual | Duotone, LUTs, curvas e tratamentos salvos com intensidade ajustável | Reaplicar um visual consistente às imagens de uma campanha |
| Acabamentos gráficos | Granulação, retícula, padrões e texturas | Produzir variações visuais adequadas a posts sociais |
| Reaproveitamento e lote | Biblioteca de recortes, receitas salvas e aplicação a imagens ou slides selecionados | Reduzir trabalho repetitivo e manter consistência no carrossel |
| Exportação | PNG, WebP e JPEG, saída por slide e eventual PDF multipágina | Entregar a peça no formato necessário sem etapas de conversão manuais |

Limpeza por pincel, acabamento de recortes e tratamentos reutilizáveis ganham prioridade em relação ao primeiro mapa técnico, por seu valor direto na produção de posts. A biblioteca, a escolha de slides e a experiência de aplicação em lote são funcionalidades do PostSpark a construir sobre as operações do motor.

### Capacidades que precisam de avaliação própria

- **Perspectiva e mockups simples:** corrigir fotografias e encaixar uma arte em uma superfície, com revisão de fidelidade nos cenários oferecidos.
- **Texto decorativo:** títulos em arco, onda e outras deformações, preservando conteúdo, fonte e parâmetros para edição posterior. Exige resolver disponibilidade de fontes no servidor e reprodução do resultado.
- **Extensão de fundos simples:** avaliar o preenchimento clássico ao mudar o enquadramento ou abrir espaço para um título.
- **Novos formatos de entrada:** avaliar HEIC e aproveitamento de imagens ou camadas de PSD, sem assumir intercâmbio profissional fiel.
- **Exportação PDF:** definir se a composição das páginas aproveita o PhotoCraft ou o caminho de exportação do próprio PostSpark. A origem dos slides continua sendo o modelo do post.

Impressão profissional, fluxos CMYK/RAW/HDR, vídeo, animação e recursos especializados sem relação direta com posts ficam fora do foco inicial.

### Lacunas de inteligência artificial

Select Subject usa saliência e GrabCut, sem modelo treinado. A qualidade em cabelo, transparências, objetos de baixo contraste e fundos complexos precisa ser avaliada. O atalho `layer.removeBackground` usa essa mesma base e não muda sua capacidade de segmentação. [Algoritmos de seleção](https://github.com/storytold/photocraft/blob/v0.23.1/crates/algo/src/segment.rs).

Expansão generativa, reconstrução complexa, segmentação por IA e super-resolução por IA poderão exigir outro motor interno ao PostSpark. Essa escolha fica aberta; a experiência deve continuar dentro do produto. A existência de preenchimento clássico ou redimensionamento não será apresentada como geração ou recuperação de detalhes por IA. [Limitações declaradas pelo PhotoCraft](https://github.com/storytold/photocraft/blob/v0.23.1/docs/target-app-parity.md).

## Sequência de desenvolvimento proposta

### Fase 0 Auditar e estabilizar o CanvasLab existente

Inventariar as ferramentas que já aparecem no fluxo ativo do Studio e confrontar cada controle com sua alteração no modelo, seu resultado no canvas e sua persistência. A lista de problemas lembrados pelo usuário inicia a revisão; a auditoria deve procurar outras falhas relevantes nas mesmas jornadas, incluindo diferenças entre elementos nativos, composições do catálogo e elementos adicionados pelo usuário.

Esta fase constitui a entrega A e antecede o trabalho futuro com o PhotoCraft. A implementação das correções deve preservar o trabalho local existente e manter as alterações do documento no funil oficial do CanvasLab. Os experimentos anteriores do CLI permanecem como referência para a entrega B.

| Frente | Trabalho previsto | Critério de validação |
| --- | --- | --- |
| Seleção e edição | Separar seleção, movimentação e edição de texto; padronizar clique simples, duplo clique, Enter, Escape e a alternativa por toque | Clique simples seleciona e permite mover; outro clique simples espaçado mantém a seleção; duplo clique inicia a edição; seleção de palavras e conclusão/cancelamento continuam coerentes |
| Multisseleção | Definir e implementar adição e remoção de elementos com Ctrl/Cmd e Shift, seleção na lista de camadas e eventual retângulo de seleção; prever alternativa no mobile | O conjunto selecionado é o mesmo no canvas e no painel; transformações e ações afetam apenas o conjunto; elementos bloqueados e grupos têm comportamento explícito; cada gesto forma uma operação coerente de histórico |
| Medidas e controles | Conferir coordenadas, dimensões, escala, giro, tipografia, porcentagens e limites; explicitar unidades e diferenciar coordenadas locais, da prancheta e da tela | Digitar, arrastar e redimensionar produzem valores coerentes no painel, no modelo e na exportação; mudar zoom não muda o documento; focar e sair de um campo sem editar não altera o valor |
| Camadas e sobreposição | Conferir ordem de desenho e de seleção, grupos, filhos, elementos sobrepostos, ocultos, bloqueados e seleção pelo painel | É possível alcançar o alvo desejado de forma previsível; seleção e realce acompanham a camada; bloquear, ocultar, reordenar e trocar de slide não transferem a ação para outro elemento |
| Correspondência entre slides | Inventariar IDs, bindings, papéis e relações já existentes; definir correspondências para os elementos relevantes, inclusive grupos e camadas autorais | A operação identifica quais destinos têm correspondência, quais são ambíguos e quais não possuem alvo; a identidade é preservada após duplicação, edição e reabertura |
| Aplicar em todos | Conferir cada propriedade oferecida, lendo a aparência efetiva do elemento de origem e aplicando-a aos destinos correspondentes | Fonte, tamanho, cor, alinhamento e efeitos escolhidos mudam de fato; conteúdo e exceções são preservados conforme o escopo; a confirmação informa resultados efetivos e casos não aplicados |
| Histórico e retomada | Exercitar as ações anteriores com desfazer/refazer, troca de slide, salvamento, fechamento e reabertura | A seleção não aponta para alvos removidos ou de outro slide; a alteração persiste e a exportação corresponde ao documento reaberto |

Os detalhes dos modificadores precisam ser coerentes por superfície: por exemplo, adicionar elementos no canvas e selecionar um intervalo na árvore de camadas podem usar Shift com comportamentos distintos e documentados. A multisseleção será estado transitório da interface ligado ao slide; não cria um segundo documento do post.

O reconhecimento entre slides deve aproveitar o mapeamento semântico já existente. Identificadores de origem, bindings, papéis e relações entre camadas devem orientar a correspondência; aparência e geometria podem ajudar a resolver candidatos. Destinos ambíguos precisam aparecer na prévia para escolha ou exclusão do escopo. Copiar estilo, conteúdo, posição ou estrutura são intenções diferentes e devem ter resultados distinguíveis.

Revisar em desktop e mobile, com diferentes proporções, níveis de zoom, fontes e composições. Priorizar sequências reais: selecionar → ajustar → mudar de ferramenta → replicar → trocar de slide → desfazer → salvar → reabrir → exportar. A matriz de cenários deve crescer a partir das falhas encontradas, sem exigir o produto cartesiano de todas as ferramentas.

**Condição de conclusão:** os problemas prioritários estão reproduzidos, corrigidos e conferidos na interface real, com testes de regressão nos pontos de falha. O resultado de cada ação relevante corresponde ao modelo, à exportação e à reabertura. Os casos restantes têm impacto e prioridade registrados; a aprovação de testes isolados não substitui essa verificação.

#### Evidências preliminares de 13 de novembro de 2026

| Ponto | Evidência e alcance | Situação |
| --- | --- | --- |
| Clique em texto selecionado | `handleTextClick` inicia edição quando o alvo já está selecionado. Existe também `handleTextDoubleClick`; o problema não é simplesmente a ausência de um handler de duplo clique | Comportamento confirmado na implementação; padronização de gestos pendente |
| Seleção múltipla | A página mantém um único `selectedElementTarget`, o Stage mantém um `selectedId` e o Transformer recebe um único nó. A lista de camadas também recebe um único `selectedId` | Lacuna confirmada no fluxo principal |
| Aparência do corpo entre slides | Uma chamada às funções reais, com composições de teste, aceitou replicar `body`, mas os valores efetivos do destino permaneceram iguais aos anteriores | Defeito reproduzido no processamento do documento; correção e jornada no navegador pendentes |
| Coordenada fracionária no inspetor técnico | No componente real isolado em Happy DOM, X = `10.75` apareceu como `11`; foco e perda de foco sem digitação chamaram a atualização com X = `11`. O campo usa `Math.round` na apresentação e grava o conteúdo no `onBlur` | Defeito reproduzido no componente; revisar outros medidores e validar na interface real |
| Controle de camadas | Já existem árvore, expansão, ocultação, bloqueio e reordenação. A dificuldade relatada exige testar alcance de alvos, sobreposição e sincronia com o canvas | Relato de usabilidade mantido para reprodução; causa geral ainda não estabelecida |

Na reprodução de `body`, a origem tinha `fontSize = 49`, `lineHeight = 1.7`, cor `#123456` e alinhamento `right`. O destino manteve `25.056`, `1`, `#111111` e `left`, respectivamente, embora `validateReplication` retornasse `ok: true` e a função produzisse outro objeto de documento. A confirmação atual da página usa o número de destinos solicitado; a auditoria precisa distinguir esse número da quantidade de elementos e propriedades efetivamente alterados.

Os 45 testes existentes executados em cinco arquivos de seleção/controlador e replicação passaram. O experimento separado com o inspetor confirmou o defeito descrito; seu resultado positivo significa que a falha foi reproduzida, não que o controle esteja correto. A revisão até aqui foi de código e de execuções locais isoladas. A aba de produção inspecionada não estava com o CanvasLab aberto, e os gestos de edição não foram exercitados nela. Ainda falta a verificação completa em navegador com uma peça de teste, incluindo persistência real e reabertura.

Referências: [eventos de texto e Transformer](../../client/src/pages/CanvasLab/components/CanvasPostStage.tsx), [seleção e confirmação da replicação](../../client/src/pages/CanvasLab/CanvasLabPage.tsx), [replicação entre slides](../../client/src/pages/CanvasLab/lib/slideReplication.ts), [inspetor técnico](../../client/src/pages/CanvasLab/components/ArsenalCompositionInspector.tsx) e [painel de camadas](../../client/src/pages/CanvasLab/components/CanvasEditorPanel.tsx).

### Fase 1 Preparar e validar a VPS

**Concluída em 14/11/2026 no host.** Instalação oficial, identidade dedicada, smoke sem display/GPU/FUSE, medição limitada de CPU/RAM/concorrência, limpeza e procedimento operacional estão em [VPS_OPERACAO.md](VPS_OPERACAO.md). O backend em contêiner não recebeu o binário nem configuração de integração. A avaliação com fotos reais pertence à fase 2.

Confirmar sistema operacional, arquitetura, glibc, recursos disponíveis e forma de execução do backend. Executar o instalador e a verificação headless no host real, usando uma identidade de serviço com acesso apenas aos diretórios necessários. Registrar versão, caminho do binário, uso de disco e procedimento de retorno à versão anterior.

Medir tempo, memória e comportamento concorrente com imagens de tamanhos representativos. Definir limites de arquivo, pixels, duração e processos simultâneos com base nessas medições. Preparar diretórios de trabalho e política de limpeza, inclusive para resíduos após encerramento forçado ou queda do host.

**Condição de conclusão:** o CLI funciona no ambiente real sem display, GPU ou FUSE; o procedimento de atualização e retorno de versão está documentado; existem limites operacionais medidos para os primeiros casos de uso. Não é necessária integração com o PostSpark nesta fase.

### Fase 2 Validar qualidade e selecionar as primeiras operações

**Rodada inicial concluída em 14/11/2026:** três assets de posts salvos (duas cenas/ilustrações e um logo), com 12 execuções medidas: nove receitas e três conferências de formato/reabertura. Ajustes de cor, recorte/dimensões, máscaras manuais e blur com feather são candidatos ao piloto. A seleção automática falhou visualmente no gráfico e recortou apenas parte da faixa na cena de mercado; continua experimental. Posts originais permaneceram idênticos, com zero escritas no banco. Houve conferência de duas cópias JSON, sem renderização ou persistência hospedada. Resultado, limitações e referência indisponível do post 132: [avaliação com posts salvos](AVALIACAO_POSTS_2026-11-14.md). A rodada permite delimitar o contrato inicial da fase 3, mas não homologa retratos, cabelo ou todo o escopo proposto.

Montar um conjunto de imagens de avaliação que inclua produtos, retratos, cabelo, fundos complexos, transparências, texto e logos, fotos escuras e JPEGs comprimidos. Comparar resultado visual e custo operacional das ferramentas prioritárias, incluindo suas falhas.

Classificar cada operação como pronta para um piloto, experimental com restrições, dependente de outro motor ou adiada. Definir quando oferecer correção manual e como comunicar falha. Seleção ausente, saída totalmente transparente ou imagem original sem a alteração pedida não serão contabilizadas como resultado bem-sucedido.

**Condição de conclusão:** cada operação da primeira entrega tem exemplos aprovados, limitações conhecidas, resultado de falha definido e orçamento operacional inicial. O registro de um comando no CLI, sozinho, não atende a esse critério.

### Fase 3 Definir dados e comportamento de edição

**Contrato inicial implementado em 14/11/2026:** schemas estritos de seis operações, prévia sem escrita de Storage e confirmação com entrada/derivado privados. Recibos opcionais em `CanvasPostModel.advancedImageAssets` preservam o original, a última operação e dimensões. O alvo e a revisão do documento são capturados, e uma resposta obsoleta não confirma uma mutação. Coordenadas são normalizadas no asset. Detalhes e limites: [contrato/implementação do pacote inicial](../../ops/image-editor/README.md).

Definir como o post referencia o original, o resultado derivado, a máscara, a receita de edição e sua versão. Avaliar o uso de `.pcraft` como artefato auxiliar vinculado ao asset, incluindo custos e fidelidade de reabertura. A estrutura exata ainda será desenhada; a extensão do modelo deve preservar a leitura de posts existentes.

Mapear imagem de fundo, imagem independente e elementos de primeiro plano necessários para montagens. Definir escopo da ação por imagem, slide ou conjunto selecionado, além de dimensões, enquadramento e coordenadas das máscaras após recortes e transformações.

Estabelecer o comportamento de prévia, aplicar, cancelar, desfazer e refazer. Associar cada processamento ao alvo e à revisão que o originaram, para impedir que uma resposta atrasada sobrescreva uma edição mais recente. As referências confirmadas no modelo devem apontar para armazenamento durável, com acesso vinculado ao proprietário do post.

**Condição de conclusão:** o contrato de dados e os cenários de validação descrevem como salvar, fechar, reabrir e continuar a edição, descartar prévias e recusar resultados antigos. As referências duráveis e o comportamento de compatibilidade estão definidos para implementação nas fases seguintes.

### Fase 4 Construir a camada de processamento e a PoC de API

**Pacote inicial publicado e processador privado ensaiado na VPS.** Router tRPC autenticado, adaptador Node/CLI, whitelist, limites, cancelamento e limpeza foram verificados. O processador Node roda em contêiner privado e isolado, usando o binário do host somente para leitura. A web/API recebeu as rotas e a configuração novas pela publicação isolada de 14/11/2026 (release UTC `20261115`). Não há migração de framework, worker de fila ou integração de cobrança.

Criar um adaptador Node reutilizável para o CLI e conectá-lo ao backend escolhido. Usar operações permitidas e parâmetros validados, `execFile` ou `spawn` sem shell, diretório privado por execução, timeout, cancelamento e limpeza. O cliente envia uma intenção de edição; caminhos do sistema e comandos arbitrários não fazem parte da interface pública.

Começar com uma operação de ponta a ponta. A remoção de fundo continua candidata, condicionada à qualidade da fase anterior; uma operação determinística, como máscara poligonal ou ajuste de cor, pode complementar a validação da infraestrutura.

Preservar a autenticação e verificar propriedade dos assets antes de ler ou publicar resultados. Tratar tipo real do arquivo, orientação, cor, tamanho, pixels e política de metadados. Separar a saída temporária da publicação durável e identificar tentativas repetidas para evitar processamento ou efeitos comerciais duplicados.

**Condição de conclusão:** a PoC recebe uma imagem, executa a operação, valida o resultado e devolve uma saída utilizável. Concorrência, entrada inválida, timeout, cancelamento e falha do CLI têm comportamento e limpeza verificados. Uma eventual amostra App Router fica isolada se o backend de produção continuar em Express/tRPC.

### Fase 5 Entregar a primeira experiência no CanvasLab

**Interface publicada e jornadas local/hospedada conferidas em 14/11/2026.** Acesso “Editor avançado” com mensagem de evolução, somente ferramentas aprovadas, prévia/confirmar/cancelar, original, histórico e save/reopen. O [harness](../../harness/advancedImageEditor/README.md) usa API e CLI reais com identidade/armazenamento de teste e exportou PNG 4K. A publicação hospedada conferiu Auth/Storage, edição em cópia de post, isolamento por slide e restauração após reabrir. PNG 4K mostrou sucesso na interface; a captura do arquivo de download não retornou. Aparelho físico permanece para homologação. Evidências e rollback em [ops/image-editor/README.md](../../ops/image-editor/README.md). Recursos duvidosos ou não ensaiados foram movidos para o [backlog](BACKLOG_EDITOR_AVANCADO.md).

Criar o acesso ao modo avançado e ferramentas organizadas por tarefa, com foco no elemento selecionado. Oferecer seleção e máscara, recorte, ajustes essenciais, comparação antes/depois e aplicação ou cancelamento da operação.

O desenho de seleções e pincéis deve responder no CanvasLab. Avaliar prévias reduzidas e processamento ao terminar um gesto para obter fluidez com o motor remoto. O comportamento em dispositivos móveis precisa considerar zoom, deslocamento e precisão sem conflito entre gestos.

Integrar os resultados confirmados ao funil de atualização do post, ao histórico e à persistência. Reavaliar contraste quando a imagem mudar a legibilidade da composição. Definir uma forma de ativação gradual sem assumir uma mudança comercial.

**Condição de conclusão:** o usuário edita uma imagem no contexto da peça, confirma ou cancela, desfaz, salva e reabre com fidelidade. A jornada do modo simples e a abertura de posts antigos continuam funcionando.

### Fase 6 Ampliar criação e reaproveitamento

Adicionar limpeza e retoque, acabamento de recortes, ajustes locais, harmonização de montagens, looks salvos e efeitos gráficos conforme as operações aprovadas. Ampliar a biblioteca de assets reutilizáveis e a aplicação a múltiplas imagens ou slides.

Na aplicação em lote, definir alvo, progresso, cancelamento e tratamento de falha parcial. Uma imagem que falha não pode ser apresentada como concluída nem alterar silenciosamente o conjunto aplicado. Máscaras específicas de uma foto não serão reaplicadas como se fossem um tratamento de cor genérico.

Avaliar perspectiva, texto decorativo, novos formatos e preenchimento de fundos em entregas próprias, respeitando seus critérios de fidelidade. Ações por linguagem natural podem orquestrar operações aprovadas, com prévia e alvo claros; essa camada pertence ao PostSpark e depende da capacidade real dos motores envolvidos.

**Condição de conclusão:** as jornadas criativas e de carrossel definidas abaixo podem ser concluídas e retomadas dentro do produto, com indicação correta de resultados parciais.

### Fase 7 Validar o piloto e preparar disponibilização

Executar as jornadas completas em ambiente equivalente ao de uso, incluindo persistência, reabertura, exportação, falhas e concorrência. Medir latência, memória, sucesso técnico e aceitação visual por operação, sem registrar imagens ou Base64 em logs operacionais.

Consolidar os limites de disponibilidade, o suporte a falhas, o retorno de versão e a retenção de arquivos temporários e duráveis. Definir acesso ao modo avançado e qualquer política de Sparks antes de ativar efeitos de cobrança. A introdução de fila, worker dedicado ou sessão persistente compartilhada só entra no desenho se as medições justificarem essa necessidade.

**Condição de conclusão:** as jornadas passam no ambiente alvo; os limites estão claros para operação e produto; a disponibilidade pode ser ampliada gradualmente com recuperação conhecida em caso de problema.

## Jornadas de validação do produto

| Jornada | Percurso esperado | Evidência de conclusão |
| --- | --- | --- |
| Seleção e medidas | Selecionar → mover → editar por duplo clique → ajustar numericamente → mudar zoom → exportar | Gesto, valores, posição e dimensões coerentes; foco sem edição não muda o documento |
| Multisseleção e camadas | Selecionar vários alvos → operar → bloquear ou ocultar → trocar de seleção → desfazer | Canvas e painel refletem os mesmos alvos, com respeito à hierarquia e ao bloqueio |
| Replicação do editor atual | Editar uma propriedade efetiva → pré-visualizar correspondências → aplicar aos destinos → reabrir | Destinos correspondentes recebem a alteração; ausências e ambiguidades são visíveis; confirmação reflete o resultado real |
| Post de produto | Enviar foto → limpar defeitos → recortar → compor com cenário e sombra → adicionar oferta → exportar | Produto com recorte aprovado, texto editável e resultado coerente após reabertura |
| Retrato com composição | Enviar retrato → corrigir máscara → ajustar iluminação → posicionar na composição → salvar | Máscara e enquadramento preservados, com possibilidade de continuar a edição |
| Imagem gerada por IA | Gerar imagem → corrigir um elemento indesejado → aplicar tratamento → concluir o post | Correção inspecionável e post final editável no fluxo existente |
| Campanha ou carrossel | Selecionar imagens/slides → aplicar look → ajustar exceções → exportar o conjunto | Consistência visual, escopo correto e falhas parciais identificadas |
| Retomada da edição | Editar → salvar → fechar → reabrir → mudar um ajuste → desfazer e refazer | Original, parâmetros, máscara e resultado permanecem coerentes |
| Falha ou abandono | Iniciar processamento → cancelar, perder a conexão ou receber erro | Último estado confirmado preservado, sem resultado falso e com limpeza verificada |
| Compatibilidade | Abrir e editar um post anterior à introdução do modo avançado | Persistência e exportação continuam coerentes com o documento existente |

## Decisões abertas para a próxima revisão

| Tema | Informação ou decisão necessária |
| --- | --- |
| Auditoria do editor atual | Completar a reprodução dos relatos, ampliar os cenários de falha e ordenar as correções antes da integração na interface |
| Seleção e correspondência | Detalhar modificadores, gestos móveis, seleção de grupos, identidade entre slides e resolução de ambiguidades |
| Ambiente real | Host identificado e preparado; definir como disponibilizar o CLI ao processo Node nos contêineres existentes |
| Backend e API | Confirmar Express/tRPC como destino da integração ou fornecer o contexto de uma aplicação Next.js separada |
| Primeira entrega | Escolher operações e limites a partir da avaliação visual e operacional |
| Interface | Definir entrada do modo avançado, organização das ferramentas, comportamento móvel e tratamento de prévias |
| Montagens | Definir o suporte necessário a imagens independentes, primeiro plano, máscaras e mistura de elementos |
| Persistência | Decidir entre receitas, máscaras e documentos auxiliares, com política de retenção, reabertura e limpeza de derivados sem referência |
| Desempenho | Fixar limites de pixels, duração, concorrência e metas de resposta após medição no host real |
| Inteligência artificial | Determinar quais lacunas serão atendidas por outro motor e como validar sua qualidade |
| Fontes e formatos | Definir fontes disponíveis, formatos de entrada/saída e garantias de fidelidade de texto decorativo ou importações |
| Acesso e cobrança | Definir acesso ao modo avançado e regras para prévias, aplicação final, cancelamentos, falhas e repetições |
| Cronograma | Estimar esforço e responsáveis quando ambiente, primeira entrega e contratos de dados estiverem suficientemente definidos |

Novas informações devem atualizar a fase ou decisão correspondente. A versão definitiva deverá consolidar escopo de entrega, contratos, capacidade, critérios de qualidade, regras comerciais e estimativas; o plano intermediário mantém esses pontos visíveis enquanto evoluem.

## Referências de implementação e descoberta

- [CanvasLabPage e funil de atualização](../../client/src/pages/CanvasLab/CanvasLabPage.tsx).
- [CanvasPostModel](../../client/src/pages/CanvasLab/components/types.ts).
- [Persistência e reabertura do CanvasLab](../../client/src/pages/CanvasLab/lib/saveAdapter.ts).
- [Backend Express e tRPC](../../server/_core/index.ts).
- [Guia do CLI PhotoCraft](https://github.com/storytold/photocraft/blob/v0.23.1/book/src/automation/cli.md).
- [Seleções e refinamento](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/cmd/smartselect_cmds.rs).
- [Retoque](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/cmd/retouch_cmds.rs).
- [Estilos de camada](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/layer_style.rs).
- [Smart Filters e persistência nativa](https://github.com/storytold/photocraft/blob/v0.23.1/docs/smart-filters.md).

## Plano de implementação do editor unificado

Decisão de produto consolidada em 17/11/2026. Um único acesso **Editor avançado**
abre um painel do CanvasLab com abas **Imagem** e **Texto** e seletor do elemento
em edição. Os tratamentos de imagem usam a VPS; os acabamentos de texto deste
pacote são renderizados pelo Konva e permanecem editáveis. O fornecedor não
aparece na interface. Esta seção é o plano de execução do próximo pacote;
não significa que os novos tratamentos já foram incorporados.

### Escopo e ordem das entregas

| Incremento | Capacidade entregue | Condição para avançar |
| --- | --- | --- |
| 1 — Painel único | Abas, alvos, migração dos controles atuais de imagem para o painel, efeitos de texto já existentes e aviso de edição direta “Em breve” | Operações atuais funcionam no desktop/mobile, sem regressão de seleção, histórico, cancelamento, salvar/reabrir e exportação |
| 2 — Tratamentos de imagem | Núcleo: preto e branco, duotone e sombras/realces. Depois: poucos looks, Iris Blur e granulação discreta | Cada grupo tem contrato estrito, resultado visual aceitável e jornada hospedada completa; grupo com falha permanece desligado sem bloquear os outros |
| 3 — Acabamentos de texto | Contorno/sombra/realces consolidados, gradiente simples editável e pequenas combinações de estilo | Texto nativo, texto extra e texto de composição preservam aparência e edição após salvar/reabrir e exportar |

Executar os incrementos nessa ordem. A estrutura do incremento 1 já inclui a
aba Texto, usando os efeitos atuais; o incremento 3 amplia essa aba. Cada
incremento deve ficar revisável antes de começar o seguinte.

### Regras de UX

- Há somente uma entrada e um painel avançado. Preservar os controles básicos
  em seus locais atuais e reutilizar a mesma lógica de atualização.
- Quando o avançado estiver aberto, selecionar uma imagem ou texto muda a aba
  e o alvo. Selecionar um objeto com o painel fechado não deve abrir o avançado
  nem roubar foco de outra ferramenta. Preservar a interação de seleção e
  duplo clique para editar texto.
- O seletor “Editando” lista elementos do slide atual por identidade estável;
  não depender de índice visual. Contemplar imagens, fundos, logos e os tipos
  de texto realmente editáveis. Elementos bloqueados não recebem mutação.
- Uma aba sem alvo mostra orientação para selecionar/adicionar o tipo correto.
  Seleção múltipla mostra orientação para escolher um alvo individual nesta
  versão; não aplicar um processamento silenciosamente em todos os elementos.
- Ao trocar alvo, aba, slide ou fechar com uma prévia de imagem pendente,
  pedir no próprio painel para aplicar ou descartar. Descartar/cancelar aborta
  a requisição e invalida respostas atrasadas. Se o documento mudar por outra
  origem, a prévia fica obsoleta e não pode ser aplicada.
- Imagem: comparação Antes/Prévia dentro do painel, com Gerar prévia,
  Aplicar, Cancelar e Restaurar original. O documento muda somente após
  Aplicar ou Restaurar. Não chamar o servidor a cada movimento de controle.
- Texto: reutilizar as atualizações nativas e a coalescência do histórico por
  gesto/campo. Identificar os controles como edição direta; não mostrar um
  botão Aplicar global que também pareça confirmar um texto já alterado.
- O aviso **“Edição direta na prancheta — Em breve”** refere-se aos novos
  gestos sobre o canvas principal. Máscaras/recortes já disponíveis continuam
  funcionando na prévia do asset, sem desenvolver novos gestos nesta entrega.
- No mobile, usar o drawer/painel existente, com rolagem e ações alcançáveis;
  conferir teclado, foco, toque e ausência de overflow.

### Etapa 1 Preparar alvos e seleção do painel

1. Mapear seleção, produtores dos eventos e comandos do editor atual. Reusar
   `editorSelection`/`editorController`; não criar uma segunda seleção independente.
2. Modelar somente o estado transitório do painel: aba, alvo capturado,
   parâmetros, requisição, prévia e erro. Ele não é documento persistido.
3. Usar `postId`, `slideId`, `elementId`/`slotId` e revisão capturada para
   identificar o alvo. Preservar checagens de URL/documento existentes na imagem.
4. Centralizar a troca de alvo e a resolução de prévia pendente para que os
   acessos por canvas, camadas e seletor tenham o mesmo comportamento.

Pontos principais: `CanvasLabPage.tsx`, `CanvasEditorChrome.tsx`,
`lib/editorSelection.ts`, `lib/editorController.ts`, `lib/advancedImageEditing.ts`.

**Aceite:** mudar seleção troca a aba correta apenas com o painel aberto;
trocar slide, remover/bloquear o alvo e receber resposta antiga não altera o
objeto errado. Os caminhos de seleção por canvas e camadas permanecem iguais.

### Etapa 2 Migrar a experiência atual sem acrescentar tratamentos

1. Extrair de `AdvancedImageEditor.tsx` o conteúdo e o ciclo de processamento
   independentes do wrapper `Dialog`; montar esse conteúdo no painel unificado.
2. Remover a dependência do modal no fluxo avançado depois de conferir paridade.
   Acesso “Editar imagem” passa a abrir a mesma aba e o mesmo alvo.
3. Preservar os seis comandos atuais, antes/depois, PNG/WebP, mensagens de
   enquadramento, cancelamento e restauração do original.
4. Na aba Texto, expor os efeitos efetivamente suportados por cada alvo usando
   os comandos existentes. Não editar definições imutáveis do catálogo para
   acrescentar acabamento a uma instância.
5. Não introduzir gestos no canvas principal, prévia remota em tempo real,
   renderizador adicional ou segundo documento de edição.

**Aceite:** executar no painel a jornada atual de uma imagem e de um texto,
incluindo desfazer/refazer, salvar/reabrir e PNG. A posição, tamanho, rotação e
os outros slides/instâncias permanecem preservados.

### Etapa 3 Acrescentar o núcleo de tratamentos de imagem

Ampliar `shared/imageEditor.ts` de forma aditiva e estrita; preservar as seis
operações atuais. Novos pedidos são intenções tipadas, nunca comandos JSON
livres, caminhos ou nomes de filtro enviados pelo cliente.

| Intenção de produto | Execução permitida no servidor | Limite inicial |
| --- | --- | --- |
| Preto e branco | `image.adjustments.blackWhite` | Preset fixo; não expor painel de seis canais |
| Duotone | `image.adjustments.gradientMap` | Duas cores hex escolhidas explicitamente, com opção de usar a paleta atual |
| Sombras e realces | `image.adjustments.shadowsHighlights` | Valores moderados e limitados; fixar parâmetros auxiliares no servidor |

Atualizar parser de operação, whitelist do processador, metadados/capabilities,
formulários e recibos. Validar MIME, hashes e dimensões, com novos tratamentos
mantendo a resolução da origem. Não mudar as cores de textos, formas ou marca
do post ao tratar uma foto.

Manter limites de 8 MiB/3840 por eixo, duas execuções admitidas e uma por ator,
sem fila; CPU explícita, timeout, isolamento e limpeza existentes. Se o novo
filtro exigir um limite menor para qualidade/tempo, anunciar esse limite por
capacidade em vez de alterar silenciosamente a imagem.

**Aceite:** schemas recusam valores fora da faixa e operações arbitrárias;
prévia não grava Storage nem documento; Aplicar publica o resultado privado
antes de uma única mutação no funil `handleUpdatePost`. Reabrir preserva o
original e a última operação, sem prometer reedição não destrutiva de toda a
cadeia de filtros.

### Etapa 4 Acrescentar acabamentos de imagem em grupo independente

- **Looks:** começar com até dois presets curados, com IDs mantidos pelo
  servidor. Sem upload de LUT ou caminho livre nesta versão. Não oferecer
  controle de intensidade que o comando escolhido não implemente; uma mistura
  com o original seria uma capacidade própria a validar.
- **Iris Blur:** preset com centro nítido, parâmetros normalizados e limites
  moderados. Não anunciar reconhecimento de assunto ou profundidade. Não
  exigir desenho no canvas; começar com centro e formato predefinidos.
- **Granulação:** efeito discreto com intensidade limitada e seed estável;
  pode aparecer como acabamento de look, sem uma nova área de ferramentas.

Cada receita de múltiplos passos é uma intenção/preset permitido, executado em
uma chamada controlada; não abrir a API para listas arbitrárias de comandos.
O original e os recibos atuais continuam válidos. Mostrar que o look altera
cores para o usuário decidir, especialmente em fotos de produtos.

**Aceite:** revisar retrato, produto/alimento, cena e imagem gráfica conforme o
efeito; conferir bordas, alpha quando pertinente e perda de detalhe, além da
jornada de persistência. Falha ou resultado visual insatisfatório mantém apenas
esse grupo desativado; os tratamentos do núcleo não ficam bloqueados.

### Etapa 5 Implementar o gradiente de texto editável

O código já contém `textGradient` em elementos de composição e suporte em
`RichTextRenderer`, mas não há um contrato geral de controle do usuário para
todos os alvos. Reaproveitar esse suporte, preservando os gradientes autorais.

1. Definir uma representação compartilhada e estrita para gradiente simples
   de duas cores. Distinguir herdar, desativar explicitamente e aplicar
   gradiente; não confundir ausência de override com remoção do estilo original.
2. Cobrir título/corpo nativos, textos extras e instâncias de composição,
   usando o campo de override apropriado a cada modelo. Não mudar definições
   fixadas nem relaxar schemas para admitir um objeto genérico.
3. Encaminhar a mutação por `editorController` e `handleUpdatePost` e estender
   normalização/save adapter, duplicação e cópia de aparência pertinentes.
4. Renderizar no Konva em `CanvasPostStage`, `ArsenalCompositionContents` e
   `RichTextRenderer`. Preservar fonte, métricas, edição inline, rotação e tamanho.
   O gradiente deve atravessar o objeto inteiro, sem reiniciar por linha/run.
5. Definir precedência de gradiente e cores explícitas de texto rico. Não
   apagar formatação individual sem intenção explícita do usuário; sinalizar
   quando aplicar o preenchimento do objeto substituir essa aparência.
6. Estender as verificações de contraste para o preenchimento em gradiente;
   avaliar suas regiões de menor contraste. Não declarar legibilidade apenas
   pela primeira cor nem substituir o gradiente silenciosamente por cor sólida.
7. Conferir alteração de conteúdo, fonte, largura e tamanho após salvar/reabrir.
   Nenhuma rasterização de texto no servidor faz parte desta etapa.

**Aceite:** gradiente e texto editável coincidem no canvas, na reabertura e na
exportação. Posts anteriores sem os novos campos continuam funcionando. Se
essa paridade ou o comportamento de contraste falhar, a interface de gradiente
permanece desligada sem bloquear os efeitos já existentes.

### Etapa 6 Consolidar acabamentos e presets de texto

Reunir contorno, sombra, faixas, caixas e etiquetas realmente disponíveis nos
alvos suportados. Presets como Editorial, Oferta e Impacto são combinações
pequenas desses acabamentos, não mudanças de conteúdo, família de layout ou
paleta completa. Aplicar somente ao texto escolhido, com uma confirmação no
histórico e opção de remover acabamento preservando conteúdo e geometria.

Os controles básicos e o avançado devem consumir a mesma projeção dos valores
efetivos. Não criar propriedades concorrentes. Destinos que não suportem um
acabamento devem receber orientação honesta, sem conversão silenciosa para PNG.

**Aceite:** preset e remoção, desfazer/refazer e reabertura funcionam nos tipos
de texto suportados. Escolher um estilo não muda fonte, cores ou layout além
das propriedades explicitamente anunciadas por aquele estilo.

### Etapa 7 Verificar o conjunto

Usar testes direcionados das regras e uma rodada enxuta de jornadas reais.
Mocks não substituem o ensaio do processador; sucesso do CLI não certifica o
fluxo hospedado.

| Jornada | Evidência necessária |
| --- | --- |
| Seleção por canvas, camadas e seletor | Mesmo alvo; aba correta; painel fechado não abre sozinho; bloqueios respeitados |
| Troca de alvo/slide durante prévia | Aplicar/descartar claro; resultado antigo nunca altera outro elemento |
| Imagem em duas instâncias e carrossel | Apenas o alvo escolhido muda; geometria e demais slides intactos |
| Prévia, aplicar, cancelar e erro | Sem gravação na prévia; cancelamento sem mutação; original recuperável; falha preserva o último documento confirmado |
| Texto nativo, extra, composição e texto rico | Acentos, formatação, herança, gradiente e edição posteriores preservados |
| Salvar, fechar e reabrir | Recibos de imagem e acabamento do texto continuam no `canvas_model` correto |
| PNG do slide e ZIP do carrossel | Aparência corresponde ao documento, com fontes/assets prontos e sem guias de edição |
| Desktop e mobile | Controles acessíveis, foco/teclado coerentes e ausência de overflow; distinguir viewport simulado de aparelho físico |
| Post antigo e recurso desligado | Leitura, edição e exportação preservadas; controles indisponíveis não prometem processamento |

Conferir TypeScript, build e a suíte afetada do CanvasLab, processador, router
e mídia. Ampliar testes somente para falhas ou dúvidas encontradas. Antes de
habilitar filtros novos com 3840 px, medir operações representativas nesse teto
e com duas chamadas concorrentes; os ensaios anteriores dessas receitas usaram
imagens pequenas. Não usar o tamanho do arquivo como único indicador de custo.

### Etapa 8 Publicar por incremento

1. Preparar release isolado a partir da imagem/código realmente publicados;
   preservar mudanças paralelas do repositório e todos os overrides Compose.
2. Para novos tratamentos, publicar primeiro o processador privado que aceita
   as intenções novas, depois a API e a interface compatíveis. Capabilities só
   anunciam o grupo cuja execução está habilitada e conferida.
3. Usar ativação separada para painel unificado, novos grupos de imagem e
   gradiente de texto. Reutilizar o padrão de flags do projeto; evitar criar
   infraestrutura externa só para este rollout.
4. Homologar Auth/Storage reais, histórico, reabertura e arquivos PNG/ZIP em
   cópias de conferência. Preservar posts originais e não alterar Sparks/planos.
5. Preservar imagem anterior e registrar artefatos/recibo. Desativar uma
   capacidade não deve retirar a leitura e a renderização de dados já gravados.
   Não fazer rollback para um leitor que descarte os campos novos de texto.
6. Após estabilizar, atualizar a documentação operacional e o Documento Mestre
   com o comportamento efetivamente publicado.

Não há migração de banco prevista: os metadados pertencem ao JSON do documento
e aos recibos existentes. Confirmar os leitores/validadores reais antes de
assumir que um novo campo é preservado em toda a jornada. Não alterar contratos
hash de revisão, journal/operação de geração, autenticação ou cobrança.

### Backlog mantido fora deste pacote

- Gestos de máscaras/recortes no canvas principal, pincéis e prévia remota
  contínua, sinalizados somente pelo aviso já aprovado de “Em breve”.
- Remoção automática de fundo, stickers e profundidade dependentes de recorte.
- Auto Color e promessa de melhoria automática por Auto Tone/Auto Contrast.
- Nitidez/redução de ruído como recurso de produção antes de amostras adequadas;
  Vibrance e texturas como ferramentas independentes sem ganho demonstrado.
- Neon, relevo/chanfro e sombra interna de texto processados no servidor;
  testes positivos do motor não entregam edição integrada ao CanvasLab.
- Mockups, deformações, importador universal/PSD editável e novos formatos.
- Tratamento em lote de vários assets/slides, com progresso/falhas parciais.
- Histórico paramétrico integral de filtros, edição de `.pcraft` e mudança da
  política de retenção de assets. O original preservado não equivale a reabrir
  uma pilha completa de filtros não destrutivos.

Esta execução termina com painel único de imagem/texto, pacote delimitado de
tratamentos, texto editável, persistência fiel e publicação verificável.


### Execução do editor unificado — 17/11/2026

Os três incrementos foram implementados no código e publicados na VPS. O painel
único tem abas Imagem/Texto, seleção por identidade, bloqueios e proteção de
prévia ao trocar alvo, aba, slide ou entrar na edição de texto. O fluxo ativo não
abre modal de imagem. As operações anteriores permanecem na prévia do asset.

Liberados: preto e branco, duotone de duas cores (inclui paleta do post), sombras
até 50/realces até 40, looks Quente/Cinema e granulação discreta de 0,5 a 3.
Duotone e granulação têm teto explícito de 2048 px por eixo; o restante mantém
3840 px/8 MiB. Não há redução automática. O teste real de Iris Blur deixou uma
transição visível demais; a intenção está implementada, mas desabilitada e em
estudo. Não faz parte do grupo aprovado para uso.

Texto mantém edição nativa: efeitos existentes, presets pequenos e gradiente
vertical de duas cores. Ausência herda, `null` desativa; cores de trechos ricos
continuam guardadas. Gradientes de instância residem em `composition.effects`
(V3), sem alterar peças fixadas. Título/corpo usam estilo do slide e textos extras
usam seu próprio campo. Save/reopen, duplicação e cópia de aparência preservam
os campos. Contraste percorre as cores intermediárias e alerta sem trocar o
preenchimento escolhido. Fotos e superfícies compostas exigem revisão visual.

Flags independentes da API e do processador:
`ADVANCED_IMAGE_CORE_ENABLED=true`, `ADVANCED_IMAGE_FINISHING_ENABLED=true` e
`ADVANCED_IMAGE_IRIS_ENABLED=false`. Capabilities cruza a configuração da API com
a do serviço privado, sem anunciar tratamentos ausentes no processador.

Validação: suíte afetada com 468 testes; TypeScript sem erros; build isolado;
execuções reais em retrato/alimento/cena, alpha sintético preservado e dez
chamadas na VPS, inclusive duas de sombras/realces em 3840 px simultâneas
(~15 s no teto de duas CPUs/4 GiB). Isso não certifica carga prolongada. O harness
usa API/CLI reais e mídia/identidade de teste: salvamento/reabertura e PNG 4K
foram conferidos visualmente. Mobile foi viewport simulado, não aparelho físico.
Os recibos de publicação ficam em `/opt/postspark/releases/unified-editor-20261117`.

Conferência hospedada final: cópia de teste 139, revisão 10; só o quinto slide
alterado; 86 outros posts intactos por revisão/hash; cinco referências de assets
privados verificadas. Após recarregar a biblioteca e reabrir, gradiente/contorno
e imagem permanecem. O ZIP do harness contém dois PNGs de 3840×3840; o primeiro
coincide pixel a pixel com o PNG individual. Recibos sanitizados:
`EDITOR_UNIFICADO_2026-11-17.json`, `EDITOR_UNIFICADO_VPS_2026-11-17.json` e
`EDITOR_UNIFICADO_HOSPEDADO_2026-11-17.json`. Não foram exportados documentos
privados. A aferição é funcional e limitada, sem certificação de carga contínua.
