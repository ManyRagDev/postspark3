# Editor avançado unificado — 17/11/2026

Release em `/opt/postspark/releases/unified-editor-20261117`. Um painel, abas
Imagem/Texto e alvo ligado à seleção; imagem é confirmada, texto é edição direta.
Núcleo: preto e branco, duotone e sombras/realces. Acabamentos: Quente/Cinema e
granulação. Iris Blur fica desabilitado (`ADVANCED_IMAGE_IRIS_ENABLED=false`).
Duotone/grão: até 2048 px por eixo, anunciado nas capacidades; demais limites e
isolamento abaixo permanecem. O serviço privado é publicado antes da API/web.

`deploy-unified.py` preserva os overrides Compose da instância em execução e só
recria o serviço especificado. O pacote web vem de fonte publicada + overlay
restrito, sem workflows paralelos ou migrações. `verify-unified-processor.mjs`
usa pixels sintéticos; `verify-unified-hosted.mjs` verifica hashes, revisões,
privacidade e recibos na VPS, sem exportar documentos privados.

Gradiente de texto usa `shared/textGradient.ts`: ausência herda, `null` desativa,
objeto estrito aplica duas cores verticalmente. Efeitos em composição V3 usam
`effects[id].gradient`; definições fixadas ficam intactas. **Após salvar os novos
campos, não voltar cegamente à imagem antiga**: desligar os grupos na imagem
nova preserva leitura/renderização; qualquer rollback de UI precisa manter os
leitores aditivos de gradiente e dos novos recibos.

Abaixo, o histórico e as restrições operacionais do pacote inicial.

# Editor avançado — primeiro pacote

Implementado e publicado em 14/11/2026 (release UTC `20261115`). Interface e API
estão disponíveis em `https://postspark.com.br`. O processador privado está
instalado e ensaiado na VPS. Somente a web foi atualizada; o worker, os fluxos
de geração e o trabalho paralelo de identidade visual foram preservados.

## Experiência e escopo

O CanvasLab apresenta “Editor avançado”, com a mensagem “O editor avançado está
evoluindo. Novos recursos serão adicionados.”. A implementação do motor é um
detalhe interno e não aparece nos textos, botões ou erros do produto.

O pacote permite brilho/contraste/saturação, recorte, dimensões, máscara por
polígono com feather, desfoque por região com feather e remoção de margens
transparentes. Há comparação antes/prévia, aplicação/cancelamento, download
PNG/WebP e restauração da imagem original. Ferramentas não aprovadas ficam no
[backlog](../../scripts/photocraft/BACKLOG_EDITOR_AVANCADO.md), sem controles inativos na interface.

Imagens, fundos e logos editáveis do slide são destinos explícitos. Definições
imutáveis de assets do catálogo não são reescritas. A posição, tamanho do
objeto, rotação e geometria do layout são preservados. Crop/trim centralizam o
novo enquadramento no mesmo espaço; resize muda a resolução do arquivo. A
interface explica essa escolha antes de aplicar. Não há alteração de texto,
cores da marca ou cobrança de Sparks.

## Contrato e fluxo

1. O navegador lê uma imagem a que já possui acesso. GET de mídia privada
   continua verificando o proprietário na rota existente. A API de edição não
   aceita URLs arbitrárias para download no servidor.
2. `imageEditor.preview`, protegido pela autenticação do PostSpark, recebe
   `requestId`, pixels em data URI, uma operação permitida e formato PNG/WebP.
   Coordenadas de crop/polígono são normalizadas no espaço da imagem original;
   o SVG usa sua matriz de transformação para eliminar erro de letterboxing.
3. A API encaminha a intenção ao adaptador privado ou usa o CLI local apenas
   em desenvolvimento. O adaptador transforma a intenção em argumentos
   permitidos e chama o binário com `spawn`, sem shell. Não recebe comandos,
   caminhos ou parâmetros livres do usuário.
4. A prévia retorna pixels, dimensões e hashes. Não cria assets de Storage nem
   altera o documento. Cancelar desconecta a requisição, encerra o grupo do
   processo e remove o diretório temporário.
5. Na confirmação, `imageEditor.publish` verifica o recibo e publica entrada e
   resultado pelo armazenamento privado já existente. Os nomes são hashes,
   sem upsert de pixels sobre a origem. O frontend verifica novamente se o
   documento e o alvo capturados ainda são atuais.
6. Somente depois da entrega durável, `handleUpdatePost` confirma o documento
   uma vez. Desfazer/refazer e autosave usam o fluxo existente. Nenhum caminho
   temporário entra no modelo.

`shared/imageEditor.ts` contém schemas estritos. `CanvasPostModel.advancedImageAssets`
é um mapa opcional por URL derivada, com versão 1, original, entrada, resultado,
última operação, dimensões e enquadramento original. Ele faz parte do documento
autoritativo, não é um segundo projeto de edição. O save adapter preserva esse
campo; o normalizador de mídia também verifica a propriedade das referências
de origem e resultado. Posts antigos continuam válidos sem o campo.

O histórico preserva documentos completos. O mapa limita-se a 64 recibos;
recibos não referenciados pelo documento atual podem ser descartados quando
necessário. A imagem original continua privada e durável. Refazer máscaras
destrutivas após aplicação pode exigir restaurar o original; um editor de
documentos `.pcraft` reabertos não faz parte deste pacote.

## Processador privado na VPS

- Serviço: `postspark-image-pilot-image-editor-1`.
- Contexto: `/opt/postspark/photocraft/processor-pilot-20261114/`.
- Compose: `compose.yaml` neste diretório, copiado para o contexto acima.
- Rede Docker `postspark-image-editor`, **interna**, sem porta publicada.
- Token: `/etc/postspark/image-editor.env`, modo 0600, não incorporado à imagem.
- Base de runtime: imagem PostSpark congelada antes do build; somente o bundle
  do adaptador foi acrescentado. A aplicação web/executor não foi substituída.
- Binário: instalação versionada do host, montada somente para leitura.
- Usuário não root, filesystem somente leitura, capabilities removidas,
  `no-new-privileges`, `/tmp` em tmpfs com `noexec` e sem credenciais de banco,
  Storage ou IA no processo filho.
- Limites: 4 GiB, duas CPUs equivalentes, 128 tarefas, duas requisições/processos
  admitidos e um processamento por ator. O processamento não mantém fila.
- Entrada/saída de até 8 MiB e 3840 por eixo; cabeçalhos/dimensões conferidos
  antes da decodificação. Prazo de operação 90 s; transporte da API 95 s.
- `GET /healthz` é apenas local ao serviço, sem SQL ou chamadas a provedores.

O bundle é gerado sem alterar artefatos da aplicação:

```bash
pnpm exec esbuild server/imageEditing/service.ts --bundle --platform=node \
  --format=esm --packages=external --outfile=/tmp/image-editor/service.mjs
```

Copiar `service.mjs`, `Dockerfile` e `compose.yaml` para um contexto dedicado.
Usar uma tag congelada da imagem de runtime existente como `BASE_IMAGE` e
conferir o manifesto antes de construir/iniciar somente este serviço. O arquivo
de token deve existir antes do `docker compose up`; não exibir seu valor em logs
ou no chat. `smoke.mjs` testa o transporte e o binário real usando apenas uma
imagem sintética, incluindo autenticação e rejeição de comandos não permitidos.

## Publicação coordenada e rollback

A publicação partiu do código da imagem em uso, com overlay explícito de
CanvasLab e das rotas de edição. `prepare-release.py` gera o contexto e o
manifesto de fontes; alterações de IA, identidade visual, migrações e worker
não foram incluídas. O lockfile permaneceu idêntico ao implantado. O build
mantém os assets antigos com hash para abas já abertas.

O manifesto real é `/opt/platform-staging/runtime/compose.yml`, combinado com
`compose.web.yaml` desta entrega. A rede externa `postspark-image-editor` foi
adicionada às redes existentes da web. A configuração de servidor abaixo foi
injetada por `/etc/postspark/image-editor-web.env`, modo 0600:

```dotenv
ADVANCED_IMAGE_EDITOR_ENABLED=true
ADVANCED_IMAGE_PROCESSOR_URL=http://image-editor:9417
# Mesmo token do serviço privado, injetado do arquivo protegido pelo operador:
ADVANCED_IMAGE_PROCESSOR_TOKEN=<segredo de servidor>
```

Não usar prefixos `VITE_`/`NEXT_PUBLIC_`. Não montar o socket Docker na API nem
usar SSH por requisição. Para desenvolvimento sem serviço remoto, a mesma flag
habilita `PHOTOCRAFT_BIN`/`PHOTOCRAFT_WORK_ROOT` no backend local; os limites de
CPU/RAM exigem o isolamento externo do ambiente de execução.

Para habilitar o editor na cópia local Linux, instale a versão validada a partir
da raiz do projeto e use o caminho absoluto que o instalador imprimir.

```bash
PHOTOCRAFT_INSTALL_ROOT="$PWD/.cache/photocraft" PHOTOCRAFT_GLOBAL_LINK= bash scripts/photocraft/install-linux.sh v0.23.1
```

No `.env` local, configure `PHOTOCRAFT_BIN` com esse caminho e
`ADVANCED_IMAGE_EDITOR_ENABLED=true`. As opções `ADVANCED_IMAGE_CORE_ENABLED=true`
e `ADVANCED_IMAGE_FINISHING_ENABLED=true` habilitam também os tratamentos de
cor e acabamento. A API lê essas variáveis ao iniciar.

Contexto publicado: `/opt/postspark/photocraft/web-release-20261115/`.
Imagem: `postspark-web:advanced-editor-20261115`, digest
`sha256:09f296eaf2b336ec0a94814592418e09a246794b41dd3756cf09468fccf4db6e`.
`deploy-web.py prepare <sha256>` valida o pacote, congela a imagem anterior,
confere que somente três variáveis novas mudaram e constrói a imagem.
`activate` recria somente `postspark-web`, após conferir que não houve outra
publicação concorrente. `rollback` volta a imagem da web para
`postspark-web:before-advanced-20261115`; a rede e configuração novas ficam
inertes nessa imagem anterior. Executar essas etapas somente em publicação
autorizada e copiar o script para a VPS antes de executá-lo.

Recarregar abas antigas para consumir o novo campo de recibos. A ativação não
introduz regra nova de plano ou Sparks.

## Verificação realizada

458 testes em 74 arquivos, TypeScript e builds Vite/backend aprovados na conferência.
Incluem autenticação, propriedade dos assets, schemas, timeout/cancelamento,
limite de concorrência, limpeza, alvos obsoletos, isolamento entre instâncias,
logo/fundo/composição, histórico e preservação do original no save adapter.

Na VPS, o smoke real exercitou os seis comandos de produto e PNG/WebP sob os
limites acima, confirmou alpha e dimensões, negou falta de token e operação
fora da whitelist. Zero diretórios temporários remanescentes; web/worker
existentes continuaram saudáveis. Recibo: `verification.json` no contexto.

No navegador, o [harness](../../harness/advancedImageEditor/README.md) usou
CanvasLab, API e CLI reais, com identidade e mídia persistida em arquivos de
teste. Foram conferidos prévia, confirmação, um undo/redo, cancelamento sem
mutação, original após reabertura, máscara no mobile, precisão dos pontos com
letterboxing e exportação PNG 3840×3840. Esse ensaio não usou Auth/Storage
hospedados; essa fronteira foi conferida separadamente abaixo.

## Homologação hospedada

Com a sessão real do usuário, foram conferidos prévia de ajuste em PNG,
aplicação, um desfazer/refazer, salvamento automático, reabertura pela biblioteca,
restauração do original após reabrir e prévia de resize 220×50 cancelada.
O cancelamento manteve a revisão 6. A exportação exibiu o sucesso de PNG 4K;
a captura automática do arquivo de download pelo navegador não retornou,
portanto os bytes desse download não foram inspecionados nesta rodada.

Foram criadas duas cópias de conferência (138 e 139); a cópia 139 contém a
edição. Dos cinco slides, somente o índice 4 mudou. Os 82 posts originais
mantiveram revisão e hash do documento. Bucket privado, hashes dos objetos
originais/derivados e resposta 401 para leitura anônima foram verificados.
Web, worker e processador terminaram saudáveis e sem temporários. O contêiner
candidato foi removido. Recibo: [release-verification-20261115.json](release-verification-20261115.json).
O script `verify-hosted.mjs` documenta as asserções deste ensaio específico.
Teste em aparelho móvel físico permanece no backlog de homologação.

## Atualização de 17/11/2026

O aviso “Edição direta na prancheta — Em breve” foi publicado. Não altera o
pacote atual. O catálogo foi conferido, mas os candidatos não foram liberados.
O bundle da API permaneceu idêntico. TypeScript e build passaram.
`publish-roadmap-note.py` preserva todos os overrides anteriores; a imagem
ativa não deve voltar à versão antiga ignorando esses overrides.
Recibo: [roadmap-release.json](roadmap-release.json).


## Correção de feedback e escalas — 17/11/2026

`publish-feedback-controls.py` publica somente cinco arquivos de frontend e os
assets construídos sobre a fonte já publicada. Confere o hash do bundle de API
antes/depois e preserva integralmente ambiente/Compose. Release:
`/opt/postspark/releases/editor-feedback-20261117`.

Sliders usam uma escala de produto: brilho ±100 → ±150 no motor; contraste
−100 → −50 / +100 → +100; sombras/realces 100% → 50/40. Grão vai de 0% sem
tratamento (ajuste neutro) até a intensidade discreta 3 já certificada. Nada
amplia os schemas/limites da VPS. Suavização/desfoque mantêm pixels explícitos.
A prévia passa pelo CLI ao concluir o gesto, aparece no Stage e permanece
transitória. O documento original é sempre o argumento autoritativo; uma
projeção de pixels não confirmados é usada só para renderizar. Save, mutações
no Stage e exportação não confirmam essa projeção. Cancelar limpa o resultado;
Aplicar persiste pelo caminho existente. Antes/Prévia e Detalhe 100% permitem
comparar efeitos sutis. Recorte agora mostra a proporção real da saída.
