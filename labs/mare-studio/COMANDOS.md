# Comandos do assistente nativo do Maré

Em Animação ou Montagem, abra **Assistente do projeto**, descreva a mudança, confira a proposta e aplique. O próprio Maré resolve pedidos conhecidos localmente. O modo de comandos estruturados permite selecionar operações e fornecer os parâmetros do catálogo. O Qwen opcional propõe uma operação por pedido e pede revisão. A aplicação pode preparar um lote com várias operações.

## Contrato do editor

A sessão é exportada como `projectEditor` em [app.js](dist/app.js). Interface e assistente consultam o mesmo projeto, incluindo o rascunho em edição. O arquivo portátil mantém as referências entre composições, clipes e camadas. A revisão identifica o estado da sessão local. Depois de abrir outro projeto, consulte a revisão e os alvos novamente. IDs internos usados pelo navegador para armazenar os bytes de mídia podem mudar na importação.

1. `catalog()` descreve os comandos de edição, as ferramentas de sessão e os trabalhos disponíveis no ambiente. `options()` lista canais, curvas, tipos, transições, modelos de animação e vozes. `controls(compositionId)` descreve os campos do modelo escolhido.
2. `inspect()` devolve a revisão, a seleção, as composições, a montagem, as pistas e referências de mídia. `inspect({compositionId, layerId, time})` inclui propriedades, keyframes, visibilidade temporal e pose avaliada no tempo local da composição. As entradas dos keyframes usam tempo relativo à camada. Na montagem, o início do clipe e o recorte na fonte são campos distintos.
3. `plan(pedido)` produz os comandos e a proposta dos pedidos reconhecidos. Para comandos estruturados, `prepare(revision, commands)` ou `prepareWithAssets(revision, commands)` prepara a edição. A segunda forma carrega as imagens de um modelo quando necessário.
4. Use `proposal.inspect(consulta)` e `await proposal.preview(escopo, tempo)` para conferir o candidato. `proposal.apply()` confirma o lote uma vez. Uma operação inválida ou uma edição manual concorrente impede a confirmação. O histórico segue o ambiente atual. Uma edição local da animação pode ser desfeita no rascunho. Ao aplicar e voltar, a montagem ganha a sua própria entrada.
5. `invoke(id, args, revision)` executa uma ferramenta de sessão ou inicia um trabalho. Para um trabalho, consulte `job(id)` para obter estado, progresso, erro ou resultado e use `release(id)` quando terminar. Transcrição, síntese de voz e render privado aparecem de acordo com a configuração do laboratório. Gerar uma tomada e inseri-la no projeto são operações distintas.

## Matriz de equivalência do laboratório

O inventário parte de duas superfícies independentes. O teste lê os 51 controles permanentes de `index.html` e exige uma correspondência para cada um. Na interface em execução, percorre as opções dinâmicas de modelos, campos, elementos, curvas, layouts e transições. No outro sentido, a suíte de contratos exige um caso com resultado observável para cada um dos 43 comandos que alteram o documento. Consultas, navegação e trabalhos assíncronos têm entradas próprias no catálogo. [Comparações em Chromium](tests/control-parity.browser.mjs) · [Contratos do executor](tests/command-parity.test.mjs)

| Operação manual | Comandos e opções | Resultado verificado |
| --- | --- | --- |
| Começar, renomear, salvar, abrir e continuar | `project.new/animation/fromVideo/example/rename/save/open`, `view.home`, `export.project`, `history.undo/redo` | Novo vídeo por arquivo e nova animação em branco correspondem aos atalhos. O projeto salvo localmente sobrevive a recarregar a página. O anúncio editado sobrevive ao download e à abertura em outro contexto de navegador. |
| Abrir, editar e reutilizar uma composição | `query.templates/controls`, `composition.create/rename/duration/duplicate/insert/apply/background/wave`, `template.set` | Os 20 modelos, os 111 controles atualmente exibidos e os quatro filtros do catálogo foram comparados com a sessão. Prévia do modelo de origem e da composição criada por comando têm os mesmos pixels no instante amostrado. Inclui troca de imagem, cena Onda legada, duplicação de uma ocorrência e retorno à montagem. |
| Criar camadas, editar propriedades, redimensionar e ordenar | `layer.add/image/set/pose/transform/resize/remove/order/layout` | Os 18 tipos oferecidos pelos botões de adicionar camada foram exercitados. Campos de texto, nome, cor, tamanho e tempo, arrasto na tela e ordem na pilha reproduzem os valores do documento. As quatro alças foram comparadas em texto e forma com proporção presa e livre. Os quatro layouts foram aplicados às mesmas três imagens. |
| Gravar, mover e apagar keyframes e ajustar curvas | `key.set/remove/shift`, `view.timeline` | Comparação nos sete canais, nas cinco curvas nomeadas e na Bézier personalizável, além de arrasto do início de camada, de chave na régua e de alça da Bézier. O anúncio original fornece o caso dos três cards e o desfazer de todo o lote. |
| Recortar, dividir, reordenar, duplicar e encurtar um grupo | `clip.set/split/order/remove/duplicate`, `clips.shorten`, `view.group` | Comparação de nome, início, duração, trechos resultantes, ordem e redução proporcional. Em Chromium com viewport móvel e eventos de toque, deslizar a timeline ampliada conserva a ordem e o toque na régua posiciona o marcador. |
| Adicionar pistas, inserir material e escolher a transição | `track.add/remove`, `media.insert`, `transition.set` | Pistas adicionais de vídeo e áudio, inserção antes de um clipe já existente, recorte e exclusão. Na galeria privada foram comparados corte direto e os 17 efeitos com duração padrão e explícita. Os oito efeitos com sobreposição também entraram no MP4 do processador. |
| Buscar e importar mídia | `asset.import/search/stock`, `view.library`, `media.insert`, `layer.image` | Busca, categoria e formato usam a mesma filtragem. A suíte leu a miniatura e abriu as mídias de prévia e final dos 13 vídeos da biblioteca local. A jornada do anúncio confere os bytes das mídias incorporadas ao reabrir. |
| Trilha, volume e narração | `view.sound`, `sound.set`, `narration.generate/place` | Volume e silenciamento foram comparados com o inspetor. A síntese privada produziu uma tomada Eleven Flash de 1,30 s, incorporada como pista de áudio e reaberta com roteiro, modelo e duração. As opções de modelo e voz vêm do mesmo catálogo da interface. |
| Legendas, cortes e aparência do vídeo falado | `speech.analyze/caption/edit/apply` e os seis comandos `montagem.*` de fala | As seis propostas do painel e do executor foram comparadas sobre uma transcrição de teste conhecida. Na VPS, a amostra artificial gerou 14 palavras, três legendas e uma máscara. A correção de texto e estilo pelo painel produziu o mesmo documento que a proposta nativa. A máscara e o estilo foram aplicados, empacotados e reabertos antes do render. |
| Consultar, navegar e entregar | `query.project/options/controls/job`, `view.*`, `preview.frame`, `export.video/project/subtitles/server`, `job.release` | Painéis, seleção, zoom, encaixe, reprodução, marcador e tela cheia exercitados. Gravação em tempo real em 1080 × 1920, MP4 local quadro a quadro, legendas SRT e saída privada com vídeo 540 × 960, quadro PNG e pacote ZIP. |

**Alcance da verificação de 25/11/2026.** As dez linhas acima têm um caminho de edição ou consulta e evidência executável. A paridade mede o efeito no projeto para os controles e opções inventariados. A qualidade da interpretação de pedidos livres será avaliada na frente editorial. O navegador foi Chromium de desktop. A síntese faturada foi exercitada uma vez com Eleven Flash e a voz Yasmin Alves. As demais vozes e modelos tiveram o catálogo conferido. Os testes de toque usaram a emulação do navegador.

A página privada servida pela VPS nessa verificação ainda era anterior ao assistente. O teste carregou os arquivos de interface do checkout na origem do laboratório, manteve as capacidades anunciadas pela instalação e encaminhou as requisições de análise, síntese, sobreposições e render ao serviço real, pelo túnel SSH. A versão com o assistente está no checkout local. [Teste dos serviços privados](tests/private-autonomy.browser.mjs)

## Dois pedidos de referência

**“Faça os três cards entrarem em sequência e deixe o do meio por último.”** O resolvedor procura a composição com três camadas de card identificadas pelo nome e avalia a posição horizontal no meio da duração, com os três presentes. No anúncio, os centros ficam em 151, 270 e 389 unidades. O card em 270 entra por último. O pedido desloca as chaves da entrada de cada canal necessário, preserva os valores e as curvas existentes e mantém a saída. Uma entrada totalmente estática recebe um fade. Uma posição ambígua ou uma sequência que cruzaria outras chaves exige indicação adicional. O lote tem um único desfazer.

**“Troque ‘Experimente agora’ por ‘Crie seu primeiro post’ e deixe a frase visível por mais um segundo.”** A busca usa o texto da camada e o vínculo com a ocorrência na montagem. Correspondências repetidas exigem um escopo inequívoco. No anúncio original a frase já ocupa o final do filme. O lote mantém o último quadro composto por mais um segundo, inclusive botão e fundo, e estende a composição e seu clipe de 5 para 6 segundos. O filme passa a 27 segundos. Havendo um corte posterior que precisaria ser deslocado, o assistente informa o conflito.

## Reprodução

Em uma instalação de desenvolvimento com Chromium, Playwright, FFmpeg e ffprobe, execute a partir da raiz:

```sh
node labs/mare-studio/tests/command-parity.test.mjs
node labs/mare-studio/tests/editor-session.test.mjs
CHROMIUM_EXECUTABLE_PATH=/caminho/chromium MARE_REFERENCE_AD=/caminho/PostSpark-Anuncio-26s.mare \
  node --test --test-concurrency=1 labs/mare-studio/tests/project-autonomy.browser.mjs labs/mare-studio/tests/export-frames.browser.mjs
```

Com `MARE_REFERENCE_AD`, a jornada carrega o anúncio original, compara o estado de cada composição, os bytes de mídia, os quadros anteriores ao CTA e o áudio decodificado e confere o MP4 final. Sem essa variável roda uma composição sintética de texto. Opcionalmente, `MARE_ARTIFACT_DIR` aponta para uma pasta existente para guardar a cópia de 27 segundos e seu MP4. O fluxo de briefing usa os mesmos comandos da sessão. O [teste editorial](tests/editorial.browser.mjs) compara a montagem, o áudio e os renders antes e depois de reabrir e alterar o CTA. Por padrão usa respostas sintéticas. Com `MARE_EDITORIAL_PACK` e `MARE_EDITORIAL_REPLAY`, lê os materiais do ZIP e duas respostas previamente gravadas. Para executar o experimento com cobrança, `MARE_EDITORIAL_LIVE` aponta para um processador local configurado no lugar de `MARE_EDITORIAL_REPLAY`. A variável `MARE_EDITORIAL_OUTPUT` guarda os resultados.

### Controles e processador privado

Com o túnel do laboratório aberto, o teste de controles usa a galeria completa. A variável de amostra deve apontar para um vídeo autorizado para envio ao laboratório. Na verificação registrada foi usado um vídeo de 3,84 s criado com o avatar de astronauta do pacote GNOME e voz sintética local do FFmpeg.

```sh
export CHROMIUM_EXECUTABLE_PATH=/caminho/chromium
export MARE_PRIVATE_ORIGIN=http://127.0.0.1:18745
node --test labs/mare-studio/tests/control-parity.browser.mjs
MARE_SPEECH_SAMPLE=/caminho/amostra-de-teste.mp4 node --test labs/mare-studio/tests/private-autonomy.browser.mjs
```

A síntese real tem custo por geração. Somente `MARE_VALIDATE_TTS=1` habilita esse teste. Ele usa o texto “Teste de voz do Maré” no modelo Eleven Flash e avalia os bytes de áudio, a duração e a reabertura da tomada.
