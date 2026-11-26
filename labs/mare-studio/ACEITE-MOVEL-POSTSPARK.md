# Aceite móvel do PostSpark

O Studio e o CanvasLab abriram e editaram um carrossel misto por toque no Chromium. O teste usou um MP4 local com três segundos, texto sobreposto, um slide estático e uma sessão fictícia. Ao reabrir a peça pela biblioteca, o trecho começava em 0,25 s e o volume continuava em 0,4. A mesma peça permitiu baixar um PNG do slide estático.

## Matriz de navegação

A matriz usa 360 × 740, 390 × 844, 430 × 932, 768 × 1024, 844 × 390 em paisagem e 1280 × 800 em desktop. Cobre 25 combinações de rota e papel por tela, mais 16 redirecionamentos históricos a 390 px. As 150 combinações mantiveram a largura de rolagem do documento dentro do viewport. As seis jornadas passaram pelas 18 etapas de interação por tela, totalizando 108 verificações por toque. A seleção de carrossel preservou o texto digitado. Voltar da galeria restaurou o briefing. Em zoom de 150%, o link dos planos permaneceu acionável.

| Papel de teste | Destinos |
| --- | --- |
| Visitante | Entrada, criação pública, privacidade, termos, cookies, 404 e retorno do Google sem sessão |
| PRO | TheVoid, duas entradas Studio, salvos, histórico, planos, cobrança, privacidade da conta, catálogo e retornos de assinatura e recarga |
| START | Abertura da peça START |
| Proprietário, editor, revisor | Projetos e peças da equipe |
| Administrador | Painel de administração e laboratórios Admin2 e TheVoid |

O arquivo de rotas registra a página carregada, o papel e a largura medida. O de jornadas testa a digitação com redução da altura disponível, menu, galeria, filme real no Konva, seleção de texto sobre vídeo, ajuste, reordenação, confirmação de gravação, reabertura e download. Na Agência, proprietário e editor abrem a edição e enviam para revisão. O revisor visualiza a peça e aprova. Em planos e cobrança, o navegador cancela uma compra fictícia, confirma outra, retorna ao produto e consulta uma recarga e o extrato. Ao fechar a autenticação na página de planos, o foco volta ao botão da oferta escolhida.

## Falhas reproduzidas

| Tela e ação | Observação anterior | Resultado corrigido |
| --- | --- | --- |
| Agência a 360 px, escolher equipe com nome comprido | A largura do seletor estendia a página até 443 px | A equipe e suas ações cabem nos 360 px para os três papéis |
| Privacidade a 360 px, escolher uma seção | As abas em linha levavam a página a 366 px | As quatro seções usam duas linhas com controles de 44 px |
| Famílias a 360 px, comparar a arte pelo catálogo | O cartão de largura fixa levava a página a 385 px, e os filtros aderentes ocupavam grande parte da altura | A arte se adapta à coluna. Os filtros rolam com a página no celular |
| Admin a 360 px, mudar de seção | O cabeçalho e as abas levavam a página a 378 px | Cabeçalho e ações quebram linha. As tabelas mantêm sua própria rolagem |
| Planos, fechar o login após digitar com pouca altura | O foco se perdia enquanto o botão de compra era desabilitado na verificação da sessão | O formulário permite rolagem interna, fecha por Escape e recupera o foco na oferta de origem |
| CanvasLab a 430 × 932, tocar em atualizar ao abrir a confirmação | O teste de toque detectou a opção ainda visível depois da tentativa de salvar | A confirmação mantém os botões na mesma posição durante a abertura. O teste agora verifica a resposta da atualização e reabre a peça |

## Reprodução local

Com as dependências do projeto, FFmpeg e o Chromium do Playwright instalados, execute na raiz. Os testes interceptam o tráfego e servem os arquivos do bundle pelo próprio navegador. Identidade, catálogo de compra, pagamentos e gravações HTTP são de teste. O navegador não chama um provedor de pagamento ou IA.

```sh
export POSTSPARK_TEST_BUILD="$(mktemp -d)"
VITE_SUPABASE_URL=https://fixture.invalid \
VITE_SUPABASE_ANON_KEY=public-fixture-placeholder \
pnpm exec vite build --outDir "$POSTSPARK_TEST_BUILD"
node scripts/testing/mobile-routes.browser.cjs
node scripts/testing/mobile-navigation.browser.cjs
pnpm exec vitest run server/sparkStatement.postgres.test.ts server/sparkStatement.router.test.ts
```

A URL e a chave públicas acima são fictícias e precisam estar presentes **na compilação do Vite**. Elas inicializam o SDK que a Agência e o checkout usam para ler a sessão local de teste. O domínio `fixture.invalid` corresponde ao nome da sessão que o teste injeta no navegador. Um bundle compilado sem essas variáveis desativa o SDK. Exportá-las depois da compilação não altera o bundle. A candidata limpa recompilada com esses valores passou nas 18 etapas a 430 × 932 px, incluindo o checkout simulado e os três papéis da Agência.

`POSTSPARK_TEST_BUILD` seleciona outro diretório de build. `PLAYWRIGHT_BROWSERS_PATH` e `CHROMIUM_EXECUTABLE_PATH` selecionam a instalação do navegador. `POSTSPARK_MOBILE_ARTIFACTS` define o destino das capturas de regressão e da gravação em 360 px. O teste de rotas também guarda imagens das quatro superfícies corrigidas. O teste financeiro usa PostgreSQL local via PGlite, aplica a migração do extrato e confere débitos, créditos, rollback e isolamento entre pagadores.

## Condições para o aceite físico

O ensaio de navegador usa resolução e toque emulados. O teclado é simulado reduzindo a altura disponível. O tempo de primeira prévia e a latência de edição precisam de medição em aparelho intermediário. Também restam a validação em aparelhos com recorte e teclado nativo, Safari/iOS, VoiceOver e TalkBack, a autenticação real de homologação e o retorno do checkout de um provedor em modo de testes.
