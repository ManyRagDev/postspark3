# Publicação do TheVoid — 15/11/2026

A interface está publicada em https://postspark.com.br/thevoid, na web da VPS.
Esta entrega usou os fontes da imagem em produção como base e um overlay
explícito de dez arquivos. O workspace inteiro não foi empacotado.

Inclui o botão de conteúdo pronto, colagem e divisão de slides, modal de
orientações, restauração desses campos no rascunho e envio por Ctrl/Cmd+Enter.
Enter simples insere nova linha. O formulário de criação usa a organização
desktop/mobile conferida na implementação. A API existente recebe as
orientações em `executionBrief.notes`; seu bundle não foi recompilado.

Imagem ativa: `postspark-web:thevoid-20261115-753e310f62`. O manifesto, hashes,
verificações e digest estão em [release-20261115.json](./release-20261115.json).
Os assets anteriores com hash foram mantidos na imagem para abas já abertas.

Não foram incluídos a implementação de identidade visual, suas migrações,
mudanças no motor de geração nem alterações independentes do workspace.
Worker, processador de imagens e serviços do Garimpa mantiveram imagem e
horário de início. A configuração de ambiente e as redes da web foram
conferidas antes e depois da ativação.

Contexto durável na VPS:
`/opt/postspark/releases/thevoid-20261115-753e310f62/`. Ele contém os fontes
alterados, arquivos públicos, manifesto, logs, recibo anterior e o procedimento
de publicação/retorno. O Compose efetivo combina
`/opt/platform-staging/runtime/compose.yml`, o overlay vigente do editor de
imagens e `compose.thevoid.yaml` deste contexto. Uma próxima publicação deve
partir da imagem em execução e preservar esses overlays/configurações.

Para um retorno autorizado desta versão, executar na VPS:

```sh
python3 /opt/postspark/releases/thevoid-20261115-753e310f62/deploy.py rollback thevoid-20261115-753e310f62
```

O procedimento verifica se esta versão ainda está ativa antes de trocar
somente a web para `postspark-web:before-thevoid-20261115-753e310f62`.

Conferência: 46 testes isolados, TypeScript do frontend, build Vite, smoke da
imagem candidata e igualdade do bundle da API. O HTML/JS/CSS públicos foram
conferidos por hash. Na sessão autenticada de produção, foram verificados o
Enter inserindo nova linha, abertura dos dois modais e divisão de texto em
slides. O rascunho original foi restaurado e não houve geração paga. Ctrl/Cmd+
Enter foi conferido localmente com transporte controlado; não foi usado para
iniciar uma geração de produção.
