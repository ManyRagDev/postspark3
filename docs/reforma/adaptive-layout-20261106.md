# Ajuste de caixas e correção econômica — 6 de novembro de 2026

Implementação disponível no Studio local em `http://localhost:3182/thevoid`, para novas gerações com seleção **Automático**. Worktree: `/home/emanuel/.codex/worktrees/acervo-82/PostSpark 3`; branch `codex/acervo-82`. A branch main não foi alterada. Sem deploy remoto nesta entrega.

## Comportamento implementado

- `adaptive_v2`: depois do ajuste tipográfico existente, permite ampliar minimamente uma caixa de texto quando há espaço livre verificável. Preserva alinhamento, margens, grupos e distância de outros elementos. Considera obstáculos na geometria original e na geometria já resolvida. Não move os vizinhos nem altera o design canônico.
- Caixas rotacionadas, decoração ambígua, relações dependentes não suportadas e geometria manual ficam fora dessa ampliação automática. Superfícies explicitamente vinculadas e suportadas podem acompanhar o texto com seu espaçamento.
- A geometria final fica registrada na composição do CanvasPostModel. Reabertura e exportação reproduzem o resultado sem precisar executar novamente a adaptação.
- Correção textual V2 usa capacidade estimada como orientação, sem limite rígido de caracteres. Envia contexto editorial compacto, fatos pertinentes e apenas os campos a corrigir. A seleção de alternativas considera encaixe real e colisões; evita preferir fragmentos incompletos quando existe alternativa adequada.
- A cobertura de informação não considera outros campos que também serão reescritos. Continuações fixas e a ordem real de aplicação dos patches são consideradas, evitando dependências circulares e colisões com campos já corrigidos.
- Revisão automática V3 restringe combinações inconsistentes no schema e audita normalizações locais específicas. Um defeito visual estabelecido pode exigir correção mesmo com incerteza duplicada na avaliação; isso não transforma incerteza em aprovação. Elogios sem alvo e explicitamente sem necessidade de mudança deixam de abrir reparos desnecessários nas condições cobertas pelo protocolo.
- Configurações e revisões históricas permanecem versionadas. Não foram aumentados os limites de reparo nem adicionadas chamadas de modelo ao fluxo por causa da adaptação geométrica.

## Evidência com os casos anteriores

**Carrossel:** reaplicação da saída original capturada, sem reescrever seu texto. Os dois títulos que antes excediam a caixa passaram a caber. A largura foi de aproximadamente 676 para 937 unidades, com x, y e altura preservados; a fonte pôde permanecer maior que no ajuste antigo. Nenhum bloqueio geométrico restou nas três lâminas.

**Estático:** o design com destaque e decoração não recebeu ampliação insegura. A correção foi verificada com alternativas de texto preparadas manualmente como controle, resultando em “Conheça a Lume”. Isso demonstra o encaixe e a aplicação das alternativas, não a qualidade de uma nova resposta de IA.

Ambos usaram fontes e definições capturadas dos casos reais. O design-base e suas peças permaneceram intactos. Renderizações foram inspecionadas visualmente.

## Jornada no Studio

Documentos de teste 150 (estático) e 151 (carrossel) foram salvos pela API local, abertos no CanvasLab, salvos novamente pela interface e exportados. A composição autoritativa e o modelo normalizado permaneceram iguais; os ajustes de caixas e fontes foram preservados.

- Estático: PNG de 3072 × 3840.
- Carrossel: ZIP com três PNGs de 3072 × 3840.
- Nenhum erro de página ou chamada paga durante essa verificação.

São documentos de teste baseados em respostas anteriores, não novas gerações completas de IA.

## Verificação técnica

- Suíte geral com rede bloqueada: 3088 testes passaram, 11 foram ignorados e quatro testes de captura falharam porque o bloqueador impedia o servidor HTTP local usado pelo próprio teste.
- O arquivo de captura foi executado novamente com o Chromium instalado e acesso ao servidor local: cinco de cinco testes passaram.
- Após os últimos ajustes de integração, oito arquivos diretamente afetados foram executados novamente: 182 de 182 testes passaram.
- TypeScript sem emissão, build do frontend, build do backend e bundle do renderizador passaram.
- `git diff --check` ainda aponta duas linhas CRLF preexistentes em `shared/postspark.ts`, fora desta alteração; elas foram preservadas.

## Disponibilidade e custo

O servidor manual da porta 3182 foi reiniciado com o código atualizado e sem gerações ativas. A sondagem autenticada confirmou geração habilitada, catálogo revisão 6, política `adaptive_v2` e revisão automática versão 3. O arquivo de orçamento e o marcador de admissão existente mantiveram seus hashes.

Nenhuma nova chamada paga foi feita nesta entrega. A frequência real de entrega das três propostas e o comportamento de novas respostas dos modelos ainda precisam ser observados nas próximas gerações; o replay não mede essas taxas.

## Evidências e reprodução

Evidências locais em `artifacts/acervo82/full/sessions/adaptive-layout-20261106/`:

- `results.json`: entradas, hashes, diagnóstico geométrico e composições finais.
- `browser.json`: salvamento, reabertura, igualdade das composições e exportações.
- `review-v3-replay.jsonl`: reaplicação da revisão aos retornos capturados.
- `manual-refresh.json` e `ready.json`: atualização do ambiente e prontidão.

Scripts: `scripts/acervo82/full/adaptiveGeometryReplay.ts`, `adaptiveDeliveryReplay.ts` e `adaptiveDeliveryBrowser.ts`. Os scripts de jornada dependem dos artefatos locais capturados, do renderizador compilado e do Chromium disponível neste ambiente.
