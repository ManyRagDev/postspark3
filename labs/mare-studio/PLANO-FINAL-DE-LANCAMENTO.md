# Plano final de lançamento do PostSpark com o Maré Studio

**25 de novembro de 2026.** A versão estará pronta quando uma pessoa conseguir criar um carrossel misto, editar a mídia no Maré, fechar e reabrir o design e baixar um vídeo que reproduza com som e texto no aparelho de destino. Essa jornada precisa funcionar em desktop, iPhone e Android, com cobrança verificável e um caminho de recuperação para cada trabalho aceito.

**O trabalho autorizado agora é local.** Estabilização, compatibilidade do MP4, responsividade do PostSpark e protótipo móvel do Maré podem avançar em paralelo. A equipe comercial pode preparar a medição usando os recibos existentes. A homologação em infraestrutura separada, o piloto com clientes e a abertura pública dependem de autorização posterior.

**Situação após a implementação local.** Os exportadores, as correções móveis, a apresentação Contextual, o extrato e a apuração de custos estão disponíveis no workspace. O aceite externo permanece aberto para dispositivos físicos, participantes, infraestrutura, direitos de uso do acervo e aprovação comercial. As evidências da candidata estão no [roteiro operacional](./OPERACAO-POSTSPARK.md#verificações-locais-da-candidata-de-2511) e na [matriz móvel do PostSpark](./ACEITE-MOVEL-POSTSPARK.md).

## Ponto de partida

| Já demonstrado | O que ainda precisa de evidência |
| --- | --- |
| O CanvasLab exportou `01.png`, `02.mp4` e `03.png`. Duas abas do Chromium permitiram editar e devolver a composição ao segundo slide. O ensaio usou Express, as migrações em PGlite, identidade de teste e Storage em memória. | Autenticação e arquivos privados persistentes entre sessões e aparelhos reais, retomada de upload e retorno ao design sob concorrência. |
| O arquivo de demonstração corrigido reproduziu até o fim no Chromium. Ele tem um segundo e é silencioso. Um render separado do servidor produziu H.264 com áudio AAC. | Compatibilidade do arquivo entregue por **cada** exportador, reprodução nativa, busca no tempo e sincronismo audível em iPhone e Android. |
| As seis falhas da rodada inicial foram reproduzidas e corrigidas. Os quatro arquivos que as reproduziam passaram com 50 testes. Outros nove testes verificaram billing e portfólio em PostgreSQL local. | Repetir o aceite sobre o pacote que seguirá para a homologação. A cobertura opcional e os resultados integrais constam do roteiro operacional. |
| O Hydrogen gerou e revisou material em português. O ensaio *Café Intervalo* registrou US$ 0,080484 nas quatro chamadas. | Qualidade, latência e custo por operação em uma amostra representativa. O custo observado de um projeto serve como referência para a medição. |

O histórico, os limites dos ensaios e os recibos estão no [roteiro operacional](./OPERACAO-POSTSPARK.md) e no [estudo de planos e Sparks](./PLANOS-E-SPARKS.md).

## 1. Estabilizar a versão candidata · Backend e QA

| Item da etapa 1 | Resultado local |
| --- | --- |
| Geração de imagem, três falhas | O teste de rota isola o RPC `claim_studio_image_dispatch`. No banco de teste, a reposição mensal, a reserva de 25 Sparks, a tentativa duplicada de despacho, a confirmação da entrega e o estorno respeitaram o saldo esperado. [Testes de geração](../../server/post.test.ts) |
| Assinatura da configuração de revisão | Os trabalhos persistidos reabrem com as instruções correspondentes à assinatura salva. O teste cobre o digest anterior e o da revisão editorial adotada nas novas admissões. [Teste do contrato](../../server/ai/workflows/artDirectionGuidance.test.ts) |
| Reparo de colisão no texto | O medidor da fonte do design reproduziu a sobreposição entre título e apoio. A política `adaptive_v2` escolheu a alternativa curta. A política `subpixel_v1` descartou a correção, registrou a colisão e conservou o achado factual da peça anterior. [Teste de reparo](../../server/ai/workflows/compactProposalCopy.test.ts) |
| Seleção de design | Duas instâncias de texto com o mesmo vínculo foram avaliadas como alvos inteiros. Ao dividir esse vínculo em dois fragmentos nativos, o seletor passou a sinalizar a partição por palavras. [Teste de seleção](../../shared/designSelection.test.ts) |

**Aceite local em 25/11/2026.** TypeScript, build candidato e suíte integral passaram. A suíte teve 3.949 aprovações e três casos condicionais. Dois deles passaram em uma rodada separada sobre o bundle de release, restando o replay de uma revisão privada com arquivos históricos ausentes. A peça de um slide foi salva em PostgreSQL e exportada em PNG depois de reaberta por uma segunda sessão do navegador. [Ambiente, revisão e limites do ensaio](./OPERACAO-POSTSPARK.md#resultado-da-rodada-local)

## 2. Tornar o MP4 reproduzível em todos os caminhos · Mídia e QA

- Adotar um perfil de entrega HD comum para o CanvasLab, as exportações precisa e em tempo real do Maré e o worker. O CanvasLab já solicita `avc1.42E028`. Os dois exportadores do Maré ainda admitem VP9 ou Opus no MP4. Usar como alvo H.264/`avc1` Baseline compatível com as dimensões e taxa de quadros oferecidas, `yuv420p`, AAC-LC quando existir áudio audível e metadados de início rápido. Preservar WebM com alfa como intermediário da composição transparente. [CanvasLab](../../client/src/pages/CanvasLab/lib/temporalExport.js) · [Maré preciso](./dist/precise-export.js) · [Maré em tempo real](./dist/engine.js) · [Worker](../../server/mareRender.ts)
- Quando o navegador não conseguir entregar o perfil, usar o render assistido nos fluxos habilitados, mostrando franquia ou cotação antes de aceitar. Cobrir também o Maré aberto avulso e o usuário elegível apenas ao vídeo do CanvasLab. Se a conta estiver sem capacidade de render, preservar a edição e explicar como concluir a exportação.
- Preparar um carrossel com capa, vídeo de vários segundos com fala e marca de sincronismo, texto estático sobreposto e encerramento. Repetir com vídeo silencioso, MOV de celular rotacionado e fonte com taxa de quadros variável. Conferir orientação, cores, duração e faixas com `ffprobe`. Guardar o MP4 avulso e o ZIP ordenado. Na rodada física, reproduzir o vídeo avulso e o extraído do ZIP, avançar para o meio e assistir até o fim no Safari/iOS, Chrome/Android e players nativos. Conferir a ordem e a prévia do carrossel no rascunho de uma conta social de teste autorizada. Registrar aparelho, sistema e caminho de exportação.

## 3. Corrigir a navegação móvel do PostSpark · Produto, frontend e QA

Inventariar rotas ativas, menus e estados por papel. Registrar, para cada problema, aparelho ou largura, ação bloqueada e gravação curta. Corrigir primeiro os componentes de navegação compartilhados e as jornadas de criar, recuperar e pagar. Usar o formulário e os cartões móveis existentes no Studio e as ações rápidas e gavetas do CanvasLab. [Rotas](../../client/src/App.tsx) · [Formulário móvel](../../client/src/pages/StudioApp/components/v2/StudioMobileCreationForm.tsx) · [Gaveta do CanvasLab](../../client/src/pages/CanvasLab/components/CanvasMobileDrawer.tsx)

| Superfície | Jornada a concluir por toque |
| --- | --- |
| Entrada, autenticação, TheVoid e galeria | Entrar, escrever com o teclado aberto, escolher formato, voltar ao briefing com o rascunho e abrir uma variação. |
| CanvasLab, Salvos e Histórico | Adicionar e reordenar slides, selecionar texto sobre o vídeo, ajustar mídia, salvar, reencontrar a peça e baixar. |
| Agência | Abrir o projeto correto, editar ou revisar conforme o papel, reconhecer o estado de aprovação e voltar à lista. |
| Planos, saldo e confirmação de compra | Ler franquia e preço, confirmar ou cancelar, retornar ao produto e consultar o saldo e o extrato. Usar pagamento de teste. |
| Demais páginas ativas | Verificar navegação global, catálogo de famílias, criação pelas entradas alternativas, privacidade, páginas públicas e painéis administrativos com o papel correspondente. Registrar redirecionamentos e testar cada destino uma vez. |

**Aceite de interface.** Emular larguras de 360, 390, 430 e 768 px e repetir a jornada principal em desktop. Concluir por toque em retrato e paisagem, com teclado aberto, zoom e áreas seguras do aparelho. Eliminar rolagem horizontal involuntária da página. Usar 44 × 44 px CSS como alvo de projeto para ações principais. Manter confirmação, preço e fechar/voltar alcançáveis, com foco previsível e nomes lidos por VoiceOver e TalkBack. Medir primeira prévia e tempo de resposta na edição em um aparelho intermediário. Guardar os resultados físicos junto aos de desktop.

## 4. Testar um Maré móvel com ferramentas por seleção · Maré, design de produto e QA

**Hipótese.** Quem monta um vídeo pelo celular termina mais facilmente quando vê a prévia e as ferramentas do elemento selecionado. Hoje, em telas de até 760 px, abrir biblioteca ou propriedades substitui a prévia. Prototipar a nova apresentação sob um controle reversível próprio, independente das permissões e dos planos. [Layout atual](./dist/style.css)

- **Ao abrir**, manter prévia, reprodução, desfazer, salvar e o retorno ao PostSpark quando houver design âncora. **Ao tocar no clipe**, mostrar recorte, divisão e volume. **Ao tocar no texto**, mostrar edição, estilo e animações prontas. Oferecer **Edição avançada** à vista para abrir camadas, trilhas, keyframes e ajustes finos em Montagem e Animação.
- Reutilizar comandos, histórico e formato `.mare`. Criar uma peça complexa no desktop, alterar só uma palavra no celular, salvar e reabrir no desktop. Comparar a mudança esperada e os valores de camadas, efeitos, fontes, áudio e keyframes. Alternar as duas interfaces com um projeto já aberto.
- Comparar a interface atual e a variante com iniciantes e editores experientes. Alternar a ordem das interfaces e usar peças equivalentes. Pedir duas tarefas sem ajuda, montar e devolver um clipe com texto e ajustar com precisão o tempo de uma animação. Registrar conclusão, tempo, toques errados e descoberta da edição avançada por grupo.

**Decisão de produto.** Adotar a variante se mais iniciantes concluírem a tarefa, ou se a concluírem mais rápido com a mesma taxa de sucesso, e os experientes mantiverem a conclusão e a precisão do ajuste avançado. Registrar quantas pessoas tentaram e concluíram cada tarefa. Se o resultado for inconclusivo, corrigir os obstáculos e repetir a comparação. A apresentação escolhida precisa passar pelo mesmo aceite móvel. Perda de conteúdo ou impossibilidade de devolver uma peça vinculada bloqueia a liberação daquela versão.

**Marco de entrega local.** QA reúne na mesma revisão a suíte integral, os arquivos de mídia, a matriz de telas com as correções e a comparação do projeto antes e depois da edição móvel. Identifica quais jornadas ainda exigem telefone físico, identidade real ou infraestrutura dedicada. A homologação usa exatamente essa revisão.

## 5. Homologar o fluxo completo · Operação, API e QA

Preparar localmente os casos abaixo. A execução externa depende de uma homologação separada e autorizada. Na leitura registrada em 25/11, cinco tabelas do Maré não estavam visíveis pelo PostgREST do Supabase oficial e o bucket `postspark-mare` retornou “Bucket not found”. Confirmar o estado físico, os privilégios e o cache antes de decidir quais migrações aplicar. [Contrato da VPS](../../docs/contrato-integracao-supabase-vps.md) · [Controle de acesso da Data API](https://supabase.com/docs/guides/api/securing-your-api)

| Ordem | Execução e evidência exigida |
| --- | --- |
| 1. Dados e serviços | Restaurar backup de banco **e arquivos** em cópia isolada. Ensaiar `0084` a `0089` em ordem, medir o bloqueio da tabela de posts, conferir schema `postspark`, RLS, funções e bucket privado. Implantar interface, API, worker e processador da mesma revisão, com as entradas desligadas. Conferir Chromium, FFmpeg, fontes, ingestão e disponibilidade dos motores de fala. [Operação e migrações](./OPERACAO-POSTSPARK.md) · [Compose](../../ops/hostinger/compose.yml) |
| 2. Mídia e sessões | Com contas de teste reais, interromper e retomar upload por rede móvel. Reabrir em outro aparelho. Conferir URLs assinadas, expiração e leitura parcial por HTTP. Validar conta pessoal, conta sem acesso e papéis de Agência. Repetir o aceite do MP4 em aparelhos físicos. |
| 3. Ida e volta | Abrir **Enviar ao Maré Studio** no slide certo, editar em Montagem e Animação e usar **Enviar ao PostSpark** com a aba do design aberta e fechada. Conferir destino, texto nativo ainda editável, fonte do Maré reeditável e composição transparente. Alterar a revisão, remover o slide e expirar a sessão em ensaios distintos. Recuperar a edição sem sobrescrever outra revisão. Abrir o Maré avulso e verificar a ausência do botão de envio ao PostSpark. |
| 4. Persistência e recuperação | Reabrir peças antigas, design pessoal e de Agência. Conferir `CanvasPostModel` e `canvas_model` após salvar, duplicar e restaurar a seleção original. Impedir gravação incompatível por cliente antigo. Reiniciar o worker com pedido em andamento e conciliar trabalho, arquivo e cobrança. [Teste de retorno](./tests/postspark-return.browser.mjs) |
| 5. Capacidade | Concorrer render, ingestão, fala e geração normal de posts. Medir espera de fila, tempo até entrega por duração, falhas, CPU, memória, disco e tráfego. Fixar concorrência, limites de admissão e alertas a partir dessas medidas. Vincular cada evidência à revisão, ao aparelho e ao identificador do pedido. |

## 6. Fechar custos, Sparks e planos · Produto, financeiro e operação

| Tratamento proposto | Como decidir antes de cobrar |
| --- | --- |
| Incluído no editor | Edição manual, animações prontas, reprodução, ida e volta, reutilização e novo download da mesma revisão custam zero Sparks. Confirmar o extrato após repetir essas ações. |
| Processamento e armazenamento | Separar exportação no aparelho de render e transcodificação na VPS. Medir também minutos de fala, máscaras, armazenamento e **bytes efetivamente transferidos**, inclusive via URLs assinadas. Apurar mediana e p95 por duração e resolução. Definir franquia e eventual excedente com base no custo observado. |
| APIs pagas | Medir primeiro corte, edição e revisão com `google/gemini-4-hydrogen`, e voz por caracteres e modelo. Incluir falhas e tentativas repetidas no custo interno. Confrontar recibos do provedor com o pedido e o extrato. Expor cotação, pagador e tarifa versionada. Testar falta de saldo, cancelamento, duplo clique e falha após reserva. Cada ação paga entregue deve gerar um único débito pelo valor aceito. |
| Oferta mensal | Iniciar com PRO e o catálogo existente. Projetar margem por plano com receita líquida, uso típico e intenso. Levar vídeo próprio ao SOLO e franquias diferenciadas a PRO+/Agência conforme a capacidade medida. Atribuir consumo de Agência ao responsável financeiro. Reavaliar após dois ciclos se o uso recorrente justifica expandir franquias ou oferecer adicional de vídeo. Considerar plano Maré avulso se houver demanda por criação independente. [Matriz comercial](./PLANOS-E-SPARKS.md) |

**Aceite comercial.** Produto e financeiro aprovam tabela, margem mínima, franquias e texto mostrado na confirmação. Operação reconcilia entrega, débito ou estorno e custo externo por pedido. Conferir qualidade do Hydrogen com múltiplas cenas, fala em português, CTA e reabertura editável. Conferir licenças de uso comercial de fontes, clipes, músicas e modelos oferecidos. A coorte pode testar edição manual enquanto as ações pagas aguardam aprovação.

## 7. Liberar por etapas e ensaiar a reversão · Produto, QA e operação

1. **Antes do primeiro convite.** Ensaiar a reversão abaixo em homologação e designar quem acompanha fila, incidentes e extrato durante o piloto. Registrar a versão liberada, as capacidades habilitadas e os limites de operação aprovados.
2. **Piloto PRO autorizado.** Após o aceite técnico e físico, preencher `POSTSPARK_MARE_PILOT_USERS` com os IDs e conferir uma conta incluída e outra de fora. **Uma lista vazia estende a regra aos planos elegíveis.** Abrir vídeo no CanvasLab, depois a integração com o Maré. Liberar render e fala conforme capacidade e IA paga após o aceite comercial. Reunir dados de uso, margem e feedback da comparação móvel. [Controles de acesso](../../server/mareCapabilities.ts) · [Configuração](../../.env.example)
3. **Abertura pública.** Produto, QA e operação aprovam juntos reprodução nos dois sistemas, navegação móvel, integridade dos designs, isolamento entre contas, cobrança e capacidade dentro dos limites acordados. Corrigir e repetir qualquer jornada bloqueadora. **Por último**, ativar `POSTSPARK_MARE_PUBLIC_ENTRY`. Em `/thevoid` e `/studio`, **Vídeo ↗** deve anunciar a nova aba, preservar o briefing na primeira e abrir o Maré avulso, sem criar âncora.
4. **Reversão.** Ensaiar antes do piloto. Se houver perda de trabalho, acesso indevido, cobrança duplicada, vídeo ilegível ou fila acima do limite acordado, operação fecha a entrada pública e a admissão afetada. Preservar leitores compatíveis, fontes, originais e trabalhos já aceitos. Drenar a fila ou reconciliar reservas e estornos. Reabrir um design salvo, conferir o saldo e repetir a jornada que falhou antes de reativar. Se o problema for exclusivo da apresentação móvel, reverter a variante pelo controle próprio.
