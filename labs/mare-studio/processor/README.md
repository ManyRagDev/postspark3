# Processamento privado do Maré

O laboratório atende em `127.0.0.1:18745` na VPS. Para abri-lo nesta máquina, mantenha em outro terminal o comando abaixo e abra [Maré Studio](http://127.0.0.1:18745/).

```sh
ssh -NT -o ExitOnForwardFailure=yes -L 127.0.0.1:18745:127.0.0.1:18745 postspark-vps
```

[Abrir a composição Café 360 pronta](http://127.0.0.1:18745/#cafe-360). Para criá-la do zero, em **Composição inteira**, peça um triângulo que surge no centro, gira e revela o título “Café 360”. Selecione o triângulo, leve o cursor a 1 s e clique no losango ao lado de **Posição** no painel da camada. Um clique no losango vazio grava X e Y juntos. O losango cheio indica uma posição gravada naquele quadro e permite removê-la. Mova o triângulo em outro instante e volte ao primeiro marcador para recuperar a posição. Para atrasar a entrada do título, selecione a camada de texto e peça “atrase a entrada em seis quadros”.

Na primeira visita, **Escolher um modelo** começa um projeto a partir da galeria. **Criar do zero** abre uma composição com acesso ao assistente, à inserção de texto e aos modelos. **Salvar no navegador** guarda o projeto, incluindo composições fora da timeline. O menu de projeto também permite baixar e abrir um `.mare`. O formato atual vincula os clipes às composições da biblioteca e o Maré abre os formatos 1 a 3. Na Animação, selecione um ponto em **Curvas → Posição Y** (ou outro eixo) e escolha **Bézier personalizada**. Arraste as duas alças ou ajuste os quatro campos. As novas curvas são guardadas no arquivo de versão 3.

**Baixar vídeo → Preparar MP4** cria o vídeo vertical em 1080 × 1920 a 30 fps, com tempos explícitos para cada quadro. Esse modo requer um navegador com codificação WebCodecs disponível. **Gravar MP4 em tempo real** usa a reprodução da aba. O empacotamento local usa o Mediabunny 1.66.4, distribuído com a licença MPL-2.0. [Código-fonte da versão incluída](https://registry.npmjs.org/mediabunny/-/mediabunny-1.66.4.tgz). Em **Mais opções → Preparar MP4 no servidor**, **Animação** processa a peça aberta em seu tempo completo e **Montagem** processa o vídeo com os recortes e pistas em uso. A exportação no servidor devolve o quadro do cursor, o MP4 e um ZIP com a sequência do FilmCraft (`edit.fcproj`), as mídias e o `.mare`. Extraia o pacote inteiro para reabrir a sequência.

A exportação na VPS tem 540 × 960 pixels a 30 fps. Cenas compatíveis geram também um projeto do EffectCraft (`scene.ecproj`). Esse modo aceita até doze camadas de formas, símbolos da biblioteca e textos de uma linha em até 15 segundos. A biblioteca inclui importação em lote de PNG, JPEG, WebP e SVG. Cada arquivo entra como uma camada de imagem com transparência, quando presente. O MP4 de composições vinculadas com texto ou imagens usa o renderizador de canvas da prévia. O arquivo Maré preserva as camadas editáveis. Ao reabrir o projeto no EffectCraft, a fonte Inter e a adaptação da revelação para Linear Wipe podem produzir pequenas diferenças.

Em **Animação → Modelos de animação**, escolha um dos vinte exemplos, veja a prévia e clique em **Usar modelo**. A composição entra na biblioteca. **Ajustes do modelo** reúne os campos de conteúdo e aparência. **Editar camadas** abre a edição de propriedades e keyframes. O renderizador de canvas desenha os modelos na VPS para preservar a quebra de texto, os enquadramentos e a malha procedural. [Abrir o catálogo](http://127.0.0.1:18745/#modelos) · [Ver os modelos novos](http://127.0.0.1:18745/#novos-modelos)

**Adicionar à montagem** usa o marcador exibido na Animação. Na Montagem, selecione um clipe de composição e clique em **Editar na Animação**. **Aplicar e voltar** atualiza o mesmo clipe e volta ao marcador da Montagem. Para editar uma ocorrência separadamente, escolha **Duplicar composição** depois de abrir o clipe que receberá a cópia.

## Montagem completa

**Biblioteca de vídeos** abre a coleção da Montagem com busca, filtros e prévias. Ao adicionar um clipe, o Maré baixa o MP4 e o coloca no fim da pista principal ou cria uma montagem se a biblioteca foi aberta pela tela inicial. O arquivo `.mare` inclui a mídia importada para reabrir sem depender da biblioteca. Os créditos e links para as fontes ficam em `dist/assets/video-library/catalog.json` e são exibidos na galeria.

[Abrir Café 360 à beira-mar](http://127.0.0.1:18745/#montagem) carrega um exemplo com quatro clipes e trilha sonora. Na opção **Preparar MP4 no servidor**, a página envia o mesmo arquivo portátil usado para salvar o projeto, incluindo as mídias importadas. A prévia do resultado permite assistir ao MP4 e baixar o vídeo ou o pacote separadamente.

O FilmCraft monta uma sequência vertical de 540 × 960 a 30 fps. V1 recebe as cenas e os vídeos em ordem, A1 recebe o som original e A2 recebe a música com o volume e a repetição definidos pelo Maré. Os cortes usam os limites acumulados da timeline. Para a onda e composições com imagens, o serviço executa o renderizador de canvas do editor com Node e Skia. O pacote inclui as mídias, a sequência FilmCraft e o arquivo `.mare` para retomar a edição das camadas. Extraia o ZIP inteiro antes de abrir a sequência.

O botão **+ Pista** permite acrescentar duas pistas de vídeo ou áudio, até cinco no total. Clique no nome de uma pista adicional para inserir mídia no marcador e no clipe para editar sua posição, entrada e duração. O botão entre dois clipes da pista principal abre o pack de transições. Escolha um efeito, veja a amostra e ajuste sua duração em quadros. O FilmCraft grava o efeito na sequência editável. A demonstração tem nove cortes, incluindo a passagem de uma composição para um vídeo. [Abrir a demonstração](http://127.0.0.1:18745/#transicoes) · [Baixar o projeto Maré](../dist/assets/mare-transicoes.mare)

No laboratório privado, o seletor também oferece quatro queimas de **Filme antigo** e quatro acabamentos de **Papel rasgado**. A troca de clipe coincide com o clarão ou com a cobertura completa do papel. Os efeitos são silenciosos e usam quadros WebP servidos pelo processador. O arquivo `.mare` guarda o efeito e a duração e reabre em instalações do laboratório com a mesma biblioteca. O ZIP da exportação leva os quadros de sobreposição, usados em uma pista própria da sequência FilmCraft, abaixo das pistas adicionais do usuário.

Os limites do laboratório são 60 segundos, 48 clipes e 128 MiB por envio. Os últimos três resultados ficam disponíveis para download por até 20 minutos. O download feito pelo usuário permanece disponível localmente. A duração da renderização depende dos codecs e da complexidade das cenas.

## Narração na Montagem

Com o processador privado configurado, **Gerar narração** abre o roteiro, a voz, o modelo ElevenLabs e a posição de entrada. **Gerar prévia** envia o texto ao OpenRouter e consome saldo a cada geração. Ouça o MP3 e escolha **Inserir narração**. Se a fala ultrapassar 60 s ou não couber na pista, ajuste a posição ou o roteiro. Clique no clipe para ajustar o volume ou escolher **Editar roteiro e voz**. Substituir a tomada usa um passo de desfazer. Salvar e exportar reutilizam o áudio incorporado ao projeto.

O serviço lê `OPENROUTER_API_KEY` do ambiente. Na VPS, o systemd aceita um arquivo opcional em `/etc/postspark/mare-narration.env`, pertencente a root com modo 0600, contendo apenas essa variável. Reinicie `mare-studio-lab.service` após configurá-la. Em instalações sem a chave, projetos narrados continuam reproduzíveis e exportáveis. O saldo utilizado é o da chave do laboratório.

## Vídeo falado

Na **Montagem**, selecione um clipe de vídeo da pista principal e abra **Editar vídeo falado**. **Legendas** gera uma transcrição editável, com estilo clássico ou destaque da palavra em reprodução. A faixa de legendas aparece na timeline e a exportação oferece `.srt` e MP4 com o estilo aplicado.

Em **Cortes**, ajuste a duração mínima das pausas e a margem de fala. Marque os cortes que quer aplicar, selecione trechos pelo texto ou peça uma sugestão de trecho. A prévia permite ouvir as junções. A trilha musical segue contínua. As pistas extras podem acompanhar os cortes. Em **Visual**, detecte a pessoa para trocar ou desfocar o fundo, colocar um título atrás dela e ajustar sua exposição. O campo **Pedir uma edição** aceita pedidos como “Encurte as pausas acima de 1 s e gere legendas”. Aplicar grava todos os ajustes em uma ação que pode ser desfeita.

A análise é executada na VPS para um intervalo de até 60 s do vídeo original. O pacote editável leva os tempos das palavras, os parâmetros visuais, o recorte e a imagem de fundo. A máscara é estimada para uma pessoa em destaque e pode oscilar em cenas com movimento rápido ou mãos e cabelo nas bordas. O ajuste de luz altera a exposição da pessoa isolada. A renderização usa o mesmo desenho de texto e máscara da prévia. No ZIP, a sequência FilmCraft inclui a trilha de legendas editável inicialmente oculta, pois os clipes derivados já incluem o estilo aplicado.


## Operação

`./deploy.sh postspark-vps` usa a chave SSH configurada do operador, baixa os pacotes oficiais com versões e hashes fixos, instala uma release em `/opt/postspark/mare-lab` e reinicia somente `mare-studio-lab.service`. O serviço executa uma análise ou render por vez com usuário dinâmico, diretório temporário privado, limite de 4 GiB e cota de duas CPUs. Os arquivos de vídeo enviados para análise são descartados assim que o processamento termina. Como o servidor é privado e exige mesma origem, as páginas públicas do Maré não acessam essa API.

```sh
systemctl status mare-studio-lab.service
journalctl -u mare-studio-lab.service --since today
```

O deploy monta o runtime isolado de rasterização a partir de Node Linux x64 22.23.4, @napi-rs/canvas 1.0.5 e fontes Liberation da estação de build. Os componentes ficam em `engines/node22.23.4-canvas1.0.5`.

O deploy também empacota `engines/speech-v1` para Python 3.10 no Ubuntu 22.04 x64. O build usa `uv` e `curl`. A transcrição usa [faster-whisper Base](https://huggingface.co/Systran/faster-whisper-base) em CPU INT8 com Silero VAD. O recorte usa o [MediaPipe Selfie Segmenter](https://huggingface.co/litert-community/MediaPipe-ImageSegmenter-Selfie-Square) em LiteRT, com 15 máscaras por segundo. Os pesos são conferidos no build e a execução lê os arquivos locais. `MARE_SPEECH_RUNTIME` pode apontar para um runtime de desenvolvimento com o ABI da máquina local.

## Direção editorial em duas chamadas

Configure no ambiente do processador `OPENROUTER_API_KEY` e `MARE_DIRECTOR_MODEL` com o ID de um modelo que aceite imagens e resposta JSON. O serviço lê essas variáveis no servidor. Na instalação systemd, o arquivo de ambiente já lido é `/etc/postspark/mare-narration.env`. A página servida pelo processador habilita **Assistente do projeto → Criar vídeo a partir do briefing** quando as duas variáveis estão presentes. Para desenvolvimento com essas variáveis exportadas, rode `python3 labs/mare-studio/processor/server.py` e abra a página do processador no loopback.

Em um projeto vazio, escreva o briefing, selecione até 16 materiais e indique a duração entre 1 e 60 segundos. O campo opcional de chamada final exige texto literal, único e editável no último clipe. O botão indica o envio de duas chamadas pelo OpenRouter. O roteiro recebe o briefing, nomes, dimensões, durações, miniaturas JPEG de até 512 px e três amostras temporais por vídeo. A direção recebe o inventário e o roteiro validado. A transcrição, a síntese e o julgamento audiovisual da prévia são recursos distintos.

O Maré confere as referências, quadros e camadas, importa as mídias selecionadas e prepara um único lote. Uma cena que combina composição e gravação recebe o corte especificado pela direção. A direção pode definir o quadro de entrada de cada camada, a duração da animação de entrada e o primeiro quadro em que a camada deixa de aparecer. Isso permite apresentar cards em sequência e sustentar uma frase inteira antes do corte. Nos planos anteriores, a camada continua até o fim da cena. As imagens conservam a proporção e o relatório identifica ajustes de enquadramento. O navegador gera o MP4 vertical em 1080 × 1920 a 30 fps com a mixagem da montagem e empacota a mesma versão em `.mare`. Confira o vídeo antes de aplicar. O botão de aplicação exige a revisão de origem e cria uma entrada no histórico.

Os tempos são medidos no navegador. `preparedMs` marca a preparação do documento, `firstCutMs` marca a conclusão do primeiro MP4 e `totalMs` inclui o empacotamento. Cada chamada registra o modelo, tokens e custo em USD quando o provedor informa o valor. O contador de comandos descreve o lote preparado. Os trabalhos de mídia aparecem separadamente. A jornada de regressão exercita a criação, o desfazer, a reabertura e a alteração do CTA. [Teste editorial](../tests/editorial.browser.mjs)

### Revisão audiovisual opcional

Após conferir o primeiro corte, **Enviar prévia com áudio ao OpenRouter para revisão** solicita uma chamada adicional. O processador aceita o MP4 gerado pelo Maré e o inventário das cenas. O FFmpeg produz uma cópia vertical em 540 × 960 a 15 fps com áudio, para um modelo configurado com suporte a vídeo. O registro distingue tempo de preparação dessa cópia, chamada ao provedor, render final e empacotamento.

Cada correção indica o instante, o motivo e o elemento afetado. O motor aceita ajustes de leitura, enquadramento, estilo, duração dos cortes e volume da trilha. Confere duração total, limites da fonte, chaves de animação e permanência do CTA. A edição mantém o original disponível para download. Um parecer sem correção encerra a revisão com o mesmo corte. [Transporte da prévia](../tests/test_director.py) · [Validação das correções](../tests/editorial-review.test.mjs)

Na comparação cega, o primeiro corte é a base das duas versões. O custo da variante revisada soma a criação e a revisão, enquanto o custo incremental inclui só a revisão. Apresente as cópias com rótulos sorteados e registre, para cada uma, se a pessoa publicaria, o instante de qualquer ajuste e os minutos de edição efetiva até aprovação. Uma versão aceita como está recebe zero minutos. Uma versão ainda sem correção executada fica com tempo pendente. Revele a correspondência depois dos dois pareceres. Uma quarta chamada só entra em outro ensaio quando houver uma alteração editorial relevante.

### Aceite da versão instalada

Com o túnel SSH ativo, defina `MARE_PRIVATE_ORIGIN=http://127.0.0.1:18745` e `CHROMIUM_EXECUTABLE_PATH` e execute `node --test labs/mare-studio/tests/published-acceptance.browser.mjs`. O navegador carrega a página e os módulos servidos pela instalação. A jornada cria um vídeo sintético, edita texto na Animação, volta à Montagem, salva e reabre em outra sessão, altera o CTA, desfaz, refaz e confere o MP4 local e o do processador. Por padrão a criação usa comandos nativos. Com `MARE_ACCEPT_DIRECTOR=1`, a criação usa duas chamadas faturadas com briefing exclusivamente textual. `MARE_ACCEPT_OUTPUT` seleciona a pasta de evidências. O serviço adota Gemini 2.5 Flash como modelo editorial padrão e lê eventuais substituições pelo arquivo de ambiente da VPS.
