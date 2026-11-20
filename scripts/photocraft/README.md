# PhotoCraft: preparação da VPS para o futuro modo avançado

Escopo original deste guia: descobrir capacidades, instalar o CLI Linux e validar o motor headless. A preparação descrita aqui não criou rotas ou interface. A etapa seguinte implementou e publicou o [primeiro pacote do editor avançado](../../ops/image-editor/README.md), com frontend/API compatíveis e processador privado. Sem WebAssembly no frontend.

**Atualização de 14/11/2026:** a instalação e a validação no host real foram concluídas. PhotoCraft CLI 0.23.1 está em `/opt/postspark/photocraft/current/photocraft-cli`, com comando global, usuário dedicado e validações limitadas por systemd. Foram medidas 28 execuções sintéticas até 3840×3840 e concorrência de dois processos. O [registro operacional da VPS](VPS_OPERACAO.md) contém resultados, comandos de repetição, limpeza e retorno de versão. Na integração posterior, o binário foi montado somente para leitura no processador privado; a web usa transporte autenticado e não o executa diretamente.

**Avaliação com posts salvos:** uma rodada adicional de 12 execuções em três assets do produto conferiu ajustes, recorte, máscaras, alpha e reabertura. A seleção automática apresentou falhas visuais apesar de sucesso técnico. A [avaliação documentada](AVALIACAO_POSTS_2026-11-14.md) delimita as primeiras operações candidatas e registra uma referência de mídia indisponível, sem alterações nos posts originais.

O [plano intermediário de desenvolvimento](PLANO_INTERMEDIARIO.md) organiza duas entregas sequenciais: primeiro implementar e validar a estabilização do CanvasLab; depois preparar o ambiente e integrar o PhotoCraft gradualmente. Ele registra critérios de conclusão e decisões em aberto. Os scripts e a descoberta abaixo serão aproveitados na segunda entrega. As prioridades de produto desse plano ampliam o primeiro mapa técnico de preparação abaixo.

Verificado em 13/11/2026: a release estável mais recente encontrada na API oficial é [v0.23.1](https://github.com/storytold/photocraft/releases/tag/v0.23.1), publicada em 12/11/2026. O AppImage Linux x86_64 tem 132.164.088 bytes, aproximadamente 126 MiB; o aarch64 tem 126.708.232 bytes. O instalador consulta a release atual em cada execução, mas publica um diretório versionado e preserva versões anteriores. Não há atualização automática em runtime.

## Descoberta e prioridades

O PhotoCraft tem uma aplicação gráfica e um CLI realmente headless. Os subcomandos documentados são `run`, `convert`, `info`, `commands`, `batch`, `droplet`, `serve` e `mcp`. `run` recebe comandos do motor com `--cmd ID --params JSON`; `serve` oferece uma sessão persistente via JSON Lines. Para o primeiro ambiente, priorizar processos `run` independentes. Uma sessão persistente compartilhada exigiria tratar o isolamento entre documentos e usuários antes de adotá-la.

Fonte: [guia oficial do CLI na v0.23.1](https://github.com/storytold/photocraft/blob/v0.23.1/book/src/automation/cli.md), [argumentos efetivos do executável](https://github.com/storytold/photocraft/blob/v0.23.1/apps/photocraft-cli/src/args.rs).

| Prioridade | Capacidade proposta | Comandos reais do motor / CLI | Uso futuro no modo avançado |
| --- | --- | --- | --- |
| Inicial, experimental | Seleção automática e recorte do assunto | `select.subject` → `select.refineEdge` com `output: "layerMask"` → `run --out resultado.png` | Remover o fundo de um asset; validar qualidade em fotos reais antes de oferecer como remoção confiável |
| Inicial | Seleção assistida e máscaras | `select.object`, `select.quick`, `select.lasso`, `select.colorRange`; `select.refineEdge`; `layer.layerMask.revealSelection`, `layer.layerMask.hideSelection`, `layer.layerMask.edit`, `layer.layerMask.apply` | Região por caixa/ponto, pincel ou polígono; suavização e refinamento de borda; aplicação final no asset |
| Inicial | Ajustes de cor | `image.adjustments.brightnessContrast`, `.exposure`, `.levels`, `.curves`, `.hueSaturation`, `.vibrance`, `.colorBalance`, `.blackWhite` | Corrigir ou padronizar a foto, com parâmetros limitados e presets aprovados |
| Inicial | Recorte e dimensões | `image.crop`, `image.imageSize`, `image.canvasSize`, `image.trim` | Recortar pixels, criar margem transparente, redimensionar e eliminar sobras transparentes quando solicitado |
| Inicial | Filtros localizados | `filter.blur.gaussianBlur`, `filter.sharpen.unsharpMask`, `filter.sharpen.smartSharpen` | Desfocar partes da foto e melhorar nitidez; seleção/máscara delimita a região |
| Inicial | Inspeção e exportação | `info --compact`; `run --out`; `convert`; `--format`; `--quality` para JPEG/WebP | PNG com alpha para recortes; WebP para assets; JPEG para resultado opaco; inspeção do documento |
| Posterior | Remoção de halos | `layer.matting.defringe`, `layer.matting.colorDecontaminate`; `select.refineEdge` com `decontaminate` | Melhorar contornos em cabelo, roupa e produtos; depende da seleção inicial |
| Posterior | Ajustes e filtros em camadas | `layer.newAdjustmentLayer.*`, `layer.setAdjustment`, `layer.smartObjects.*`, `layer.layerStyle.blendingOptions` | Receitas mais complexas e efeitos de assets; requer definir como reabrir esses ajustes no futuro editor avançado |
| Posterior | Lote | `batch --actions ... --in ... --out ...` | Aplicar um tratamento a uma coleção ou a assets de carrossel, após medir limites de CPU/RAM |

Os pontos na coluna de ajustes abreviam o prefixo `image.adjustments`; não representam um comando literal. A presença no registro é descoberta de capacidade, não garantia de qualidade. O arquivo `commands.json` gerado no servidor contém os IDs e a documentação de parâmetros da versão realmente instalada.

Fontes de implementação: [seleção e refinamento](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/cmd/smartselect_cmds.rs), [seleção por cor e polígono](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/cmd/selection_cmds.rs), [máscaras e ajustes](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/cmd.rs), [propriedades de máscara](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/cmd/layer_mask_props_cmds.rs), [recorte e tamanho](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/cmd/image_cmds.rs), [filtros](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/filters.rs).

### Limitação central: remoção de fundo

`select.subject` é uma heurística de saliência com superpixels e GrabCut, sem modelos treinados. O próprio código registra que pode não encontrar nada em fotos complexas. A resposta pode conter `selected: false` e `changed: false`; o futuro backend deve tratar isso como insucesso, nunca devolver a imagem original como se tivesse removido o fundo. Selecionar o assunto sozinho não altera o alpha: é preciso criar a máscara e exportar.

`select.refineEdge` aceita `radius`, `smartRadius`, `smooth`, `feather`, `contrast`, `shiftEdge`, `refineStrokes` e edições de pincel/polígono. Seus outputs incluem `selection`, `layerMask`, `newLayer`, `newLayerWithMask`, `newDocument` e `newDocumentWithMask`. Esses recursos refinam uma seleção existente; não tornam a segmentação semântica. `layer.matting.removeWhiteMatte` e `removeBlackMatte` corrigem halos e não são removedores de fundo branco/preto.

Fontes: [algoritmos efetivos](https://github.com/storytold/photocraft/blob/v0.23.1/crates/algo/src/segment.rs), [comandos e respostas](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/cmd/smartselect_cmds.rs), [matting](https://github.com/storytold/photocraft/blob/v0.23.1/crates/engine/src/cmd/layer_menu_cmds.rs). O projeto [se declara alpha](https://github.com/storytold/photocraft/blob/v0.23.1/README.md); os testes sintéticos abaixo não substituem revisão de retratos, cabelo, objetos transparentes e fundos complexos.

### Fora do escopo inicial

- Texto, layout do post, vetores e composição editorial: continuam sob responsabilidade do CanvasLab. Não transportar o documento inteiro para outro motor.
- Fluxos de impressão, CMYK, pré-impressão, RAW/HDR, astronomia, vídeo e formatos profissionais: pouco valor para o primeiro conjunto de operações de assets sociais.
- Importação/exportação PSD como promessa de fidelidade de posts: exige uma jornada própria e não corresponde ao modelo autoritativo do PostSpark.
- Generative Fill/Expand, Neural Filters e remoção de fundo com qualidade de um modelo de IA: não assumir que esses recursos existem pelo nome das ferramentas. Consultar a [avaliação oficial de paridade](https://github.com/storytold/photocraft/blob/v0.23.1/docs/target-app-parity.md).
- Desktop, control channel gráfico, MCP público e instalação Flatpak: não são necessários para os processos CLI independentes desta etapa.

## Instalação Linux

Pré-requisitos: Linux com glibc compatível, arquitetura x86_64 ou aarch64, Bash, Python 3, curl, certificados TLS, coreutils e util-linux (`flock`). O empacotamento oficial usa Ubuntu 22.04/glibc 2.35 como base; a execução de `--version` no host confirma dependências reais. Alpine/musl não está coberto por este instalador. Reservar espaço para o download, extração e versões preservadas; o tamanho do download não é o consumo de disco ou RAM em operação.

Em Debian/Ubuntu, caso faltem os pré-requisitos:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl python3 coreutils util-linux
```

Copiar `scripts/photocraft/` para a VPS. Dentro do diretório copiado:

```bash
# Resolve a release estável mais recente no momento desta execução.
sudo bash install-linux.sh latest

# Para repetir a versão usada na descoberta:
# sudo bash install-linux.sh v0.23.1

photocraft-cli --version
python3 verify-headless.py --bin /opt/postspark/photocraft/current/photocraft-cli
```

O instalador baixa o AppImage oficial, verifica SHA-256 contra o digest da API do GitHub antes de executá-lo e extrai uma vez, sem FUSE. Isso verifica integridade contra o metadado recebido por HTTPS; não é verificação independente de assinatura GPG. O executável é publicado em `/opt/postspark/photocraft/releases/<tag>-<arch>/`, com symlink `current` e comando global `/usr/local/bin/photocraft-cli`. Um comando global existente que não pertença a esta instalação é preservado e causa erro explícito. Uma segunda instalação simultânea é recusada por lock.

O wrapper seleciona `AppRun --cli`, evita integração desktop e encontra a versão correta mesmo chamado por symlink. A instalação não abre portas, não cria serviço residente, não compila Rust e não modifica variáveis de ambiente do aplicativo. As versões anteriores ficam disponíveis para rollback manual de `current`.

Para instalar sem privilégios, escolher dois caminhos graváveis absolutos:

```bash
PHOTOCRAFT_INSTALL_ROOT=/caminho/gravavel/photocraft \
PHOTOCRAFT_GLOBAL_LINK= \
bash install-linux.sh v0.23.1
```

O caminho reservado para uma integração futura é:

```dotenv
PHOTOCRAFT_BIN=/opt/postspark/photocraft/current/photocraft-cli
```

É uma variável apenas de servidor. Não usar prefixos `NEXT_PUBLIC_`/`VITE_`, nem depender do `PATH` de uma sessão SSH para serviços geridos por systemd/PM2. Nenhum `.env` é alterado nesta preparação.

Fontes: [AppRun oficial](https://github.com/storytold/photocraft/blob/v0.23.1/packaging/linux/AppRun), [empacotamento e glibc](https://github.com/storytold/photocraft/blob/v0.23.1/packaging/linux/package.sh), [instalação e localização do CLI](https://github.com/storytold/photocraft/blob/v0.23.1/docs/mcp.md).

## Validação headless e concorrência

`verify-headless.py` executa o binário real, retira `DISPLAY`/`WAYLAND_DISPLAY` do ambiente dos processos, desliga GPU e cria imagens sintéticas temporárias. Verifica:

- registro de comandos e ajuda do executável;
- máscara poligonal, exportação com alpha e dois processos concorrentes em diretórios separados;
- ajuste de cor, blur, recorte e redimensionamento;
- salvamento `.pcraft` e reabertura com os mesmos pixels renderizados na máscara sintética;
- conversão e reabertura WebP/JPEG;
- seleção automática do assunto, máscara e PNG com cantos transparentes e centro preservado no caso sintético simples.
- imagem uniforme sem assunto: seleção ausente, pipeline de máscara recusado e nenhum resultado exportado.

Os temporários são removidos ao sair do teste, inclusive em falhas usuais. Um kill forçado do processo Python ou uma queda do host pode deixar diretórios temporários; `/tmp` precisa da política de limpeza normal do servidor. Timeout por subprocesso: 60 segundos; concorrência do teste: 2. Isso não dimensiona a concorrência de produção nem certifica qualidade de segmentação de fotos reais. Não utiliza imagens de usuários nem inicia a aplicação PostSpark.

Validação inicial de 13/11: instalação local isolada em `/tmp` no Linux x86_64, Ubuntu 24.04/glibc 2.39, com `photocraft-cli 0.23.1 (45066c482, 2026-11-12)` e 1.009 comandos. Em 14/11, os mesmos casos funcionais passaram na VPS Ubuntu 22.04/glibc 2.35, como usuário sem privilégios, sem display/GPU/FUSE. A medição e os limites das evidências estão no [registro operacional](VPS_OPERACAO.md); os testes sintéticos não certificam a qualidade de fotografias reais nem a integração com a aplicação.

Para experimentar manualmente, com imagens de teste e diretório privado:

```bash
photocraft-cli commands --json --filter select
photocraft-cli run entrada.png --no-gpu \
  --cmd select.subject --params '{"sampleAllLayers":false,"mode":"replace"}' \
  --cmd select.refineEdge --params '{"output":"layerMask","radius":1,"smartRadius":true}' \
  --out resultado.png
```

`run` interrompe a lista quando um comando falha. Se a seleção automática não existir, o refinamento não deve ser tratado como uma remoção concluída. `image.trim` fica fora dessa receita para preservar dimensões e posição do asset.

## Limites para a integração futura

Este checkout é React/Vite + Express/tRPC (`server/_core/index.ts`); não contém uma aplicação Next.js App Router. A PoC de rota Next.js e a integração com o PostSpark ficam para a etapa posterior. O ambiente preparado atende qualquer orquestrador Node com acesso ao executável e a um disco temporário local; não há migração de framework nesta entrega.

A integração futura deve restringir comandos e parâmetros no servidor, usar `execFile`/`spawn` sem shell, diretórios privados por requisição, timeout/encerramento e limpeza, e limitar bytes, pixels, CPU/RAM e processos simultâneos. `run` usa caminhos comuns do sistema operacional: o CLI não fornece isolamento de tenant por si só. `serve`/`mcp` têm raízes de automação próprias, mas não são necessários agora.

O `CanvasPostModel` permanece o documento autoritativo do PostSpark. O resultado de uma operação deve ser um novo asset; original e resultado precisam de armazenamento durável antes da referência entrar no modelo por `CanvasLabPage.handleUpdatePost` e ser salva em `canvas_model`. Não persistir caminhos de `/tmp` nem substituir o modelo pelo documento PhotoCraft. A edição de pixels pode ser destrutiva no asset derivado, preservando o original para desfazer/reabrir. Autorização, acesso ao modo avançado e eventual regra de Sparks serão definidos na etapa de integração; esta preparação não cria regra de cobrança.
