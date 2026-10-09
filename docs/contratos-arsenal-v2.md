# Arsenal V2 — contratos fechados para implementação

> 2026-10-01. Complemento normativo do [plano de implementação](./plano-arsenal-pgvector-thevoid.md). O estado implementado e as pendências de aceite estão reconciliados na seção 12 e no [relatório de execução](./relatorio-arsenal-v2.md). Não é uma receita importável no Admin2.
>
> Esta revisão fecha os seis pontos da análise do Sol. Alterações de contrato durante a execução devem ser registradas aqui e no documento-mestre antes de afetar consumidores. Nomes internos de funções podem mudar; semântica, identidade persistida, limites e regras de compatibilidade não podem mudar silenciosamente.

> **Atualização autorizada pelo proprietário:** a seção 13 define conteúdo variável V3 e substitui, para clientes V3 estáticos, título obrigatório e limite global V2 de 12 itens. As seções anteriores continuam normativas para V2 e para elegibilidade/publicação do catálogo.

## 1. Escopo, marcos e ativação

| Marco | Entrega | Condição para avançar |
| --- | --- | --- |
| M1 — editor | Composição de janelas, variante `portrait-5x6-v1`, edição vinculada/livre, upload no slot, salvar/reabrir/exportar. | Percurso completo no CanvasLab oficial, com conferência visual do proprietário. |
| M2 — catálogo | Persistência, assets, importação, publicação protegida, índice exato e perfis. | V1 preservado, integridade e autorização conferidas, versões elegíveis explicitamente aprovadas. |
| M3 — geração administrativa | TheVoid usa cartões, conteúdo V2 e até três candidatos por variação. | Percurso real de geração e materialização com traces, sem truncamento ou cobrança adicional de layout. |
| M4 — ativação geral | Mesmo caminho disponibilizado aos usuários. | Critérios da seção 10 atendidos e evidência registrada. |

M1 corresponde às fases 0–2 do plano. Usar uma fixture local derivada da matriz de janelas aprovada, acessível pelo administrador; não inserir um exemplo automaticamente na galeria de usuários. A origem 4:5 permanece intacta. A nova variante 5:6 usa prancheta lógica **1080×1296**, recebe revisão própria e não herda aprovação visual da origem.

Para M1 funcionar antes do novo storage, fontes da fixture são assets estáticos da aplicação, identificados por hash em manifesto empacotado (`kind: "bundled"`), com procedência/licença preservadas. O resolvedor aceita somente IDs desse manifesto, sem URLs/caminhos arbitrários enviados pelo cliente. Manter esses bytes para reabrir o piloto após M2. Novos imports em M2 passam a usar `kind: "catalog"` no bucket privado. Fotos usam o upload já existente (`kind: "user"`); não duplicar seu serviço de armazenamento.

**Mídia na primeira entrega:** aproveitar upload e ajuste no editor. Não adicionar upload à etapa Criação, nem geração automática de foto para preencher layout. A Criação atual começa com `media.state = "none"`. Uma composição com foto obrigatória pode ser exercitada no M1, mas fica inelegível na seleção automática sem foto real. Uma composição com mídia opcional só participa sem foto se tiver alternativa sem mídia revisada; retângulo vazio ou “synthetic media test” não conta como alternativa pronta.

Configuração de servidor: `DESIGN_ARSENAL_V2_MODE=off|admin|all`, padrão `off`. `admin` verifica o papel da sessão autenticada. A flag governa **novas seleções V2**, não leitura, renderização, edição, assets, reabertura ou exportação de posts já criados. Carrosséis e geração V1 conservam seus contratos. O painel privado de curadoria permanece protegido por `adminProcedure`.

## 2. Conteúdo antes do layout

### 2.1 Ordem obrigatória

```text
Insumo + briefing interpretado + evidências
→ recuperação de cartões compatíveis
→ chamada principal com schema V1 ou V2, escolhido pelo servidor
→ validação semântica / reparo condicional existente
→ DesignContentV2 + userContentHash
→ seleção final e bundle de candidatos
→ compilação no navegador
→ CanvasPostModel
```

O ramo V2 é escolhido para posts estáticos quando a flag permite e há shortlist V2. Nesse ramo, a escolha `none` também conserva conteúdo V2 e usa o fallback descrito abaixo. Sem shortlist V2, manter o ramo atual V1/famílias. Não misturar schemas V1/V2 dentro da mesma resposta da LLM; a chamada continua produzindo as três variações previstas pelo produto.

No ramo V2, **não executar** `applyDeterministicCopyGuards`, `buildComposition`, `composeVisualDiversityPlan`, `createPostVisualSnapshot` ou a validação geométrica V1 como etapas que transformem a copy antes da seleção. Reaproveitar validações semânticas e proteção de marca por adaptadores que não cortem conteúdo nem imponham exatamente três seções. A validação V2 do reparo também deve seguir esse percurso; remover apenas o primeiro corte no orquestrador é insuficiente.

O conteúdo canônico é o resultado editorial validado, antes de qualquer diagramação. Ele não precisa transcrever todo o pedido: `instructionSpans` continuam instruções; `verbatimSpans`, `mustKeep` e `mustInclude` têm cumprimento verificado. A revisão editorial existente pode corrigir conteúdo antes desse ponto, dentro do orçamento atual. Após o hash, fallback geométrico não reescreve, resume, fatia ou completa frases.

### 2.2 Contrato semântico fechado

`DesignContentV2` possui `schemaVersion: 2` e os campos abaixo. As mesmas chaves aparecem na resposta principal e no reparo; objetos são estritos, opcionais semânticos usam `null` e listas vazias usam `[]`. Não gerar chaves arbitrárias a partir da referência.

| Campo | Tipo e cardinalidade | Uso |
| --- | --- | --- |
| `headline` | string não vazia | Uma frase/unidade principal; suas linhas são responsabilidade do layout. |
| `body` | string ou null | Apoio editorial. |
| `eyebrow` | string ou null | Chamada anterior ao título. |
| `sectionLabel` | string ou null | Rótulo de uma lista/bloco. |
| `callToAction` | string ou null | Ação solicitada. |
| `label` | string ou null | Etiqueta curta; não inventar nome, cargo ou selo de certificação. |
| `items` | 0–12 objetos `{ id, text }` | Lista sem cardinalidade fixa de três. IDs únicos no conteúdo. |
| `metric` | null ou `{ value, label, sourceSpanIds }` | Dado explícito do insumo; value é texto, preservando unidade. |
| `attribution` | null ou `{ quote, author, sourceSpanIds }` | Citação/autoria com evidência, sem fabricação. |
| `comparison` | null ou `{ left: { label, text }, right: { label, text } }` | Dois lados semanticamente solicitados/justificados. |
| `caption` | string | Conteúdo da legenda, separado do conteúdo visual. |
| `hashtags` | array de strings | Mantém regras editoriais de hashtags do produto. |

Limites de segurança do transporte: até 4.000 caracteres por string textual, 12.000 no conteúdo inteiro e 12 itens. Eles não são capacidade estética do layout. Excesso gera erro explícito/validação semântica, nunca `slice()`. Na edição, não usar esses limites como `maxlength` dos campos; os limites existentes de tamanho do documento/requisição continuam aplicáveis, com mensagem de salvamento quando excedidos.

Separar validação da resposta LLM e leitura do conteúdo editado: a primeira aplica os limites acima; a segunda preserva strings/itens adicionados pelo usuário dentro do limite global do documento. Não reutilizar o schema limitado de geração para apagar ou recusar silenciosamente conteúdo já editado ao salvar/reabrir.

`sourceSpanIds` referencia evidências numeradas pelo servidor no insumo/briefing. Para dado factual ou atribuição não presente em uma evidência válida, recusar o valor e o candidato dependente. Os IDs não legitimam uma citação diferente do texto comprovado. Nenhuma chamada de pesquisa é adicionada para completar campos.

O schema V2 da variação recebe `content: DesignContentV2` e `designCandidateId: enum[IDs oferecidos, "none"]`. Reutiliza os campos não textuais/editoriais atuais necessários ao pipeline, como tom, imagem sugerida, paleta, formato e ângulo de copy, com as validações existentes. Remove desse schema os campos de copy duplicados e `template/sections` V1. Adaptadores produzem projeções `headline/body/caption/...` de compatibilidade **a partir de `content`**, nunca o contrário depois da composição.

O reparo responde com esse mesmo schema V2, limitado aos slots já permitidos pela rotina existente. Enum, evidências e cardinalidades permanecem iguais. Erro de encaixe não dispara reparo LLM. Se a estrutura semântica continuar inválida, usar o tratamento de erro parcial/falha existente; não aceitar resposta truncada como conteúdo correto.

### 2.3 Bindings e cobertura

Cada campo da definição declara `id`, `kind` (`text|list|media`), `source`, `required`, cardinalidade quando lista e `targetIds`. `source` é um caminho validado nos campos acima ou `media.primary`; não é expressão executável. Uma lista instancia uma peça repetível e conserva IDs dos itens. Uma frase inteira pode ter spans de estilo, mas não vira vários campos independentes de geração.

Toda informação visual não vazia precisa de binding. O catálogo não pode descartar `body`, itens ou CTA para caber. Campos previstos apenas para legenda são definidos **antes da geração** na política do cartão e precisam aparecer na legenda; o compilador não pode mover copy visual para legenda como solução de overflow. Legenda e hashtags não precisam de camadas no canvas.

Alternativas só são elegíveis se cobrirem todos os caminhos visuais presentes, com tipos/cardinalidades compatíveis. Listas não são cortadas no número de caixas da referência. Conteúdo da referência fica no pacote privado de demonstração; bindings publicados não incluem nomes/URLs/textos originais como defaults.

`userContentHash = SHA-256(JSON canônico do DesignContentV2)`; distinto de `definitionHash`, `variantHash` e hashes de arquivo/asset. O compilador verifica igualdade de conteúdo antes/depois. Ao editar, incrementar `contentRevision` e atualizar o hash atual, preservando `generatedContentHash` para detectar edição. Espaços/quebras medidos pelo renderer não reescrevem a string canônica.

## 3. Definição, variante e relações

### 3.1 Identidades

| Identidade | Regra |
| --- | --- |
| `blueprintId` | UUID da família de versões. |
| `versionId`, `version`, `definitionHash` | UUID, inteiro e SHA-256 da definição publicada imutável. |
| `variantKey`, `variantHash`, `aspectRatio` | Chave estável dentro da versão, SHA-256 da variante e um de `1:1|4:5|5:6|9:16` (5:6 histórico). |
| `candidateId` | `${versionId}:${variantKey}`; gerado pelo backend, oferecido em enum. |
| `pieceHash` | Identidade de peça imutável deduplicada. |
| `compilerVersion` | `arsenal-v2.0.0` inicialmente; capacidade reconhecida pelo cliente. |

Uma variante contém prancheta lógica, instâncias de peças, bindings, relações, política de cores/fontes, adaptação, requisitos e versão do compilador. As peças vivem em `design_catalog_pieces`; instâncias referenciam hash e parâmetros. Para o post, resolver esse grafo em snapshot autossuficiente. Não consultar a definição corrente ao reabrir.

`variantKey` e ambos os hashes acompanham índice, cartão, seleção, cada tentativa, resultado, evidência e persistência. `content_hash` existente na tabela de versões continua sendo hash da definição; no contrato V2 expô-lo como `definitionHash`, evitando confusão com `userContentHash`. Não renomear campos V1 nem recalcular seus hashes.

### 3.2 Regras de execução

Coordenadas locais em pixels da prancheta declarada; rotação em graus em torno da origem do grupo explicitada. Renderização na tela usa escala de viewport, sem alterar o documento. Peças podem compor grupos; cada elemento tem um único pai e o grafo é acíclico. Ordem visual explícita, com desempate por ID, para todas as primitivas, inclusive mídia.

Relações admitidas na primeira versão: `anchor`, `textFit`, `surfaceFit`, `verticalFlow`, `groupTransform` e `mediaSlot`. Cada relação declara ID, versão 1, entradas, saídas/propriedades que controla, parâmetros e `enabled`. Ordem de solução: árvore local de grupos → medição de texto/largura → superfícies → fluxo/âncoras dependentes → transformação mundial e bounds. Dependências determinam a ordenação topológica; ciclo é erro de definição.

**Ownership:** só uma relação ativa pode escrever cada propriedade de cada elemento. Conflito é rejeitado na autoria/publicação, sem regra implícita de “último vence”. Override manual desativa o vínculo que controla a propriedade alterada e preserva o valor resolvido como nova base. Dependentes ainda ativos acompanham a nova base. Um override de rotação de grupo não apaga a relação de padding do texto interno.

`textFit` declara âncora, largura-base/máxima, quebra por palavras e capacidade vertical. Edição cresce pela âncora, quebra no limite e recalcula dependentes; não reduz fonte automaticamente. Na geração, uma segunda política explicitamente publicada pode reduzir fonte até `minFontSize`, sem ellipsis/corte/escala não uniforme. Tokens indivisíveis largos geram overflow; não inserir hífen nem cortar URL arbitrariamente.

Resolver sempre bases + conteúdo + overrides; jamais somar novamente offsets ao snapshot anterior. Sem código, CSS arbitrário ou shaders executáveis no JSON. Novas capacidades gráficas exigem versão reconhecida, não tentativas ad hoc por arquivo de referência.

## 4. API, candidatos e fallback

### 4.1 Bundle entregue ao navegador

Adicionar `catalogSelectionV2: CatalogBundleV2` à variação/snapshot V2; `catalogSelection` permanece reservado a V1 e não pode coexistir na mesma variação. O bundle é guardado no `generation_runs.output_snapshot` do proprietário.

```ts
type CatalogBundleV2 = {
  schemaVersion: 2;
  traceId: string; runId: string; slot: number;
  content: DesignContentV2; userContentHash: string;
  targetAspectRatio: "1:1" | "4:5" | "5:6" | "9:16";
  selection: "llm" | "ranked_fallback" | "none";
  candidates: PinnedCandidateV2[]; // 0 se none; senão 1–3, em ordem
  pieces: Record<string, PieceDefinitionV2>; // chave = hash; deduplicadas
  assets: AssetManifestEntry[]; // referências duráveis; sem base64
};

type PinnedCandidateV2 = {
  candidateId: string;
  blueprintId: string; versionId: string; version: number;
  definitionHash: string; variantKey: string; variantHash: string;
  compilerVersion: "arsenal-v2.0.0";
  variant: ResolvedVariantDefinitionV2; // bindings, instâncias, relações, políticas
};
```

Esses aliases designam os contratos das seções 2, 3 e 7; não um segundo schema independente. A definição completa pode ter outras variantes, mas o bundle leva somente as escolhidas e todas as peças/assets necessários à compilação delas. Hash da variante e hashes das peças permitem conferência local; `definitionHash` é a identidade atestada pelo backend, não algo recalculável de um subconjunto da definição.

Preferida + até duas alternativas da shortlist oferecida, mesmo formato, cobertura e mídia efetiva. `none` é respeitado: não forçar outra matriz. Alternativas não precisam ser da mesma família, mas não podem inventar dados ou substituir fatos. Limite serializado: 512 KiB por bundle, 1,5 MiB por resposta de três variações para esses bundles. Remover alternativas do fim até caber; se a preferida exceder o limite, usar fallback com `bundle_too_large`.

Não criar resolução remota sob demanda a cada falha. `materializeCatalogVariations` recebe alternativas prontas, compartilhando carregamento de assets. Geração inicial, gerar mais e restauração de run usam o mesmo adaptador. Snapshot já materializado/salvo é reaberto diretamente, sem nova seleção nem nova busca por proximidade.

### 4.2 Tentativas e orçamento

1. Preferida na política normal de crescimento/quebra/fluxo.
2. Alternativas 1 e 2 na política normal, na ordem recebida.
3. Mesma ordem com adaptação adicional publicada, se ainda houver tempo.
4. Fallback convencional com conteúdo integral e motivo.

Máximo seis tentativas V2 por variação. Falha de asset compartilhado elimina todos os candidatos dependentes; não baixa a mesma fonte novamente a cada tentativa. Estados por tentativa: `compatible`, `applied`, `adapted` ou `rejected`, com motivo tipado.

Orçamentos independentes: operações adicionais do catálogo no servidor têm teto agregado de **2 s**, dentro do deadline de geração já existente; materialização no navegador tem **15 s por lote de até três variações**, com até **8 s** para resolução/carga compartilhada de assets. Tempo de interação posterior do usuário não entra nesse orçamento. Usar abort/cancelamento para I/O e conferir deadline entre etapas de CPU. Reserva de 2 s do prazo do navegador para fallback; esgotar antes disso cancela tentativas V2. Não usar um timer do servidor como deadline do navegador.

Fallback recebe `DesignContentV2` intacto. Projeta lista/comparação/dado/atribuição em blocos de texto preservando ordem e valores; não passa pelos guards de corte V1. Se a família convencional também não comportar tudo, conservar documento editável com estado **`needs_adjustment`**, aviso e acesso ao texto inteiro. Esse resultado não conta como composição aprovada/pronta. Se nem o documento puder ser criado, usar o fluxo de erro já existente e preservar conteúdo no run. Não cobrar outra geração para tentar geometria nem introduzir nova política de refund/Sparks.

Motivos mínimos: `no_eligible_candidate`, `missing_media`, `content_coverage`, `unsupported_capability`, `asset_unavailable`, `font_unavailable`, `overflow`, `collision`, `contrast`, `bundle_too_large`, `deadline`, `catalog_unavailable`. Falha do armazenamento obrigatório do bundle/permissões de assets recua para fallback; falha de telemetria isolada não impede gerar.

## 5. Canvas, formato e edição

Posts V2 usam `modelVersion: 2` e `slides[].composition.version: 2`. Leitores antigos/sem composição continuam pelo adaptador atual. A composição conserva: identidade de origem, base da variante, conteúdo/hash/revisão, elementos resolvidos, grupos, relações, overrides por propriedade, mídia/crop, assets duráveis, seed, versão do compilador e estado de materialização. Campos textuais legados são projeções; o Stage não desenha duas cópias.

O salvamento guarda apenas a composição escolhida/materializada, não todas as alternativas. O run conserva o bundle para auditoria. Nenhuma reabertura usa `approved` atual para autorizar a existência do desenho. Fonte indisponível mantém modelo e snapshot geométrico, mostra erro e impede exportar como resultado fiel até recuperar a fonte ou o usuário escolher substituição explícita; não trocar silenciosamente e refluír.

### Troca de formato

| Situação | Operação |
| --- | --- |
| Existe variante do mesmo `versionId`, sem override geométrico | Gerar prévia com a variante exata, conteúdo e mídias atuais; aplicar atomicamente com undo. |
| Existe variante, mas há posição/tamanho/rotação livre | Padrão preserva layout manual pela projeção abaixo. Oferecer ação explícita para aplicar variante e substituir os ajustes geométricos. |
| Variante ausente ou não disponível | Preservar layout por projeção; não procurar versão mais nova nem outro design automaticamente. |

Projeção preservadora: escala uniforme `min(novaLargura/larguraAtual, novaAltura/alturaAtual)` do conjunto e centralização na nova prancheta. Sem esticar e sem recortar; áreas restantes recebem a cor-base. Congelar relações dependentes da prancheta que invalidariam essa geometria; manter relações internas no espaço local. O usuário pode ajustar depois. Declarar `layoutOrigin: "manual-projection"`, `sourceVariantKey` original e `effectiveAspectRatio` atual, sem fingir que existe uma variante aprovada para esse formato.

Aplicar variante real declara `layoutOrigin: "catalog-variant"` e a nova identidade completa. Preservar conteúdo, mídia e ponto focal; recalcular crop para a nova caixa. Reset de overrides geométricos só na ação explícita. Fonte/cor manual permanecem e são reavaliadas; se incompatíveis, a prévia avisa. Falha ao preparar prévia não altera proporção, bindings ou snapshot atual parcialmente. Uma operação completa equivale a uma entrada de undo.

A troca explícita pode obter outra variante **da versão já vinculada ao post/run do proprietário**, inclusive arquivada, por resolução autenticada; não é uma nova busca nem o fallback por tentativa da seção 4. Autorizar novos assets dessa variante pelo vínculo comprovado e pelo manifesto imutável. Sem permissão/rede/versão, usar a projeção preservadora. Reabrir o formato já salvo continua independente dessa consulta.

`fitPostToAspectRatio`, presets, duplicação e refinamentos precisam reconhecer esse despacho; alterar somente `aspectRatio` de uma composição não é adaptação válida. Exportar e reabrir preservam exatamente o modo escolhido. Repetir “recriar” sem alteração não acumula escalas/offsets.

## 6. Recuperação e compatibilidade

Perfis iniciais são configuração versionada de servidor `query-profiles-v1`: regras sobre intenção/estrutura, listas de âncoras por identidade completa, prioridade e procedência. Não criar uma UI de perfis nesta entrega. Novos designs publicados entram como vizinhos e pelo ranking de metadados sem exigir novo perfil/deploy; inclusão de uma nova intenção ou âncora de perfil pode exigir alteração dessa configuração.

Usar os 48 eixos/pesos atuais `structural-v1` e projeção `weighted-l1-v1`, com hash dos eixos/pesos. Sem reranking por matrizes N×14 ou estilo nesta primeira ativação. Guardar esses descritores para auditoria/experimentos. Filtros obrigatórios precedem a distância. Até três âncoras, vinte resultados por âncora e cinco cartões. Sem âncora aplicável, ranking por metadados com motivo explícito.

Fixar ordenação: prioridade do perfil; dentro da âncora, distância L1; mesclar por rodadas entre âncoras, deduplicando identidade e limitando inicialmente uma variante por blueprint; desempate por `candidateId`. O ranking por metadados usa as regras atuais reaproveitadas, removendo cortes de caracteres como veto V2; capacidades, mídia e requisitos semânticos continuam vetos. A seleção final e os fallbacks reavaliam cobertura com o conteúdo já gerado.

RPC `postspark.design_catalog_search_v2`: uma âncora projetada `vector(48)` por chamada, aspecto, capacidades reconhecidas, disponibilidade de mídia, perfil de conteúdo (campos presentes/cardinalidades), versões de descritor/métrica e `limit` 1–20. Até três chamadas dentro do orçamento agregado. Retorno: identidade completa, distância e cartão; sem definição integral/asset bytes. Revogar acesso direto do navegador. Implementar a métrica exata declarada mesmo se não houver operador nativo: usar soma SQL dos 48 termos absolutos projetados como alternativa exata explícita e rastreada; não trocar para L2/cosseno. Atualizar extensão é operação separada conforme ambiente.

`validateCompatibility()` roda no servidor antes do bundle e no cliente antes de cada tentativa: formato, capacidades, relações/ownership, conteúdo, mídia, fonte/política da marca. A LLM escolhe entre cartões; não interpreta milhares de linhas, não recebe vetores crus e não calcula geometria.

## 7. Publicação e assets sem caminhos alternativos inseguros

### Persistência adicional

Além dos três registros da seção 6.2 do plano, criar:

- `design_catalog_version_assets(version_id, asset_id)`: links imutáveis dos assets necessários, PK composta e FKs.
- `design_catalog_asset_grants(user_uuid, asset_id, granted_version_id, created_at)`: PK `(user_uuid, asset_id)`, FKs e acesso exclusivo de backend. Autoriza usar asset compartilhado já entregue a esse usuário. Não armazena foto pessoal.

`user_uuid` usa identidade UUID da autenticação, conferida pelo backend; não o inteiro `users.id`. Resolver FKs segundo schema real antes de executar migration. O bundle e os grants são persistidos antes da resposta de sucesso V2; se não for possível, não entregar um design cujas fontes não possam ser recuperadas. Grants são concedidos para assets verificados de candidatos aprovados entregues pelo servidor ou de outra variante da mesma versão historicamente autorizada, na troca explícita da seção 5. Esse vínculo deve ser comprovado pelo run/registro anterior do post validado no servidor, nunca por IDs enviados livremente em `canvas_model`.

Bucket privado **`design-arsenal`**, key por SHA-256 dos bytes originais. Manifesto com hash, MIME detectado, bytes, dimensões ou família/peso/licença de fonte, `verifiedAt` e resultado da conferência. Tipos iniciais: PNG/JPEG/WebP e fontes WOFF2/TTF/OTF. Limites: 8 MiB por asset, 24 MiB de assets distintos por candidato, 16 fontes e quatro mídias por composição. Rejeitar excesso antes de upload/publicação; validar assinatura e decodificação. Imagens do usuário continuam no storage atual e passam pela autorização existente.

Resolver URLs pelo backend autenticado: administrador pode conferir drafts; usuário precisa de grant do asset. URL assinada expira em 15 min e pode ser renovada, com CORS para carga no Canvas. Não persistir a URL como identidade. Salvar/atualizar posts valida cada asset referenciado contra os grants do proprietário. Grant e bytes são mantidos mesmo após arquivamento da versão/limpeza de histórico; não haverá garbage collector ou exclusão física de assets compartilhados nesta entrega. Exclusão/retenção futura exigirá procedimento próprio. Isso conserva posts sem ampliar o acesso a referências privadas.

### Transação de publicação

1. Upload/verificação e preparação do índice podem ocorrer em etapas; definição salva fica `draft` e é imutável. Correção cria outra versão.
2. Finalização administrativa chama RPC de status, com lock por blueprint e conferência dentro da transação.
3. Para V2, exigir todas as peças/links, hashes, capacidades, assets verificados, documento de busca de **cada variante** na métrica ativa e evidência humana explícita de elegibilidade ligada à mesma variante/hash/política. Índice e evidência não tornam outras variantes implicitamente aprovadas.
4. Só então arquivar versão anterior, promover a nova e gravar evento. Erro desfaz a transação inteira.

Implementar guarda comum no banco **antes de INSERT aprovado e de UPDATE que entre em `approved`** para V2, também alcançada pela RPC antiga `design_catalog_status`. Conferência de metadados presentes no banco, sem rede dentro da transação. Privilégios de escrita continuam restritos; backend não pode publicar V2 pelo caminho legado ignorando os requisitos. V1 mantém seu comportamento. Links/índices/metadata de integridade de uma versão aprovada não podem ser editados ou removidos para invalidá-la; reindexações acrescentam outra versão de métrica, sem substituir a atual em uso.

Evidência técnica e decisão humana são registros distintos e append-only. Preview do navegador é identificado como relato do cliente; a aprovação administrativa confirma a inspeção, não transforma o relato em medição independente de servidor. Arquivar continua permitido e remove somente de novas buscas. Bibliotecas/fontes são verificadas antes do commit; ausência em runtime vira erro de asset, não troca silenciosa.

## 8. Exemplo integrado: janelas

Exemplo de conteúdo completo, criado para instrução; não copia marcas/foto da referência e não foi executado:

```json
{
  "schemaVersion": 2,
  "headline": "SE LIGA AQUI!",
  "body": null,
  "eyebrow": "Produto novo para você",
  "sectionLabel": "Como funciona",
  "callToAction": "Conheça a novidade",
  "label": "Seu próximo projeto",
  "items": [
    { "id": "item-1", "text": "Criar conteúdo" },
    { "id": "item-2", "text": "Preparar a arte" },
    { "id": "item-3", "text": "Publicar na sua mídia" },
    { "id": "item-4", "text": "Acompanhar resultados" }
  ],
  "metric": null,
  "attribution": null,
  "comparison": null,
  "caption": "Uma sequência para organizar seu próximo conteúdo.",
  "hashtags": []
}
```

| Binding | Alvo | Relação / requisitos |
| --- | --- | --- |
| `eyebrow` | Texto da barra da janela superior | Âncora à barra; superfície acompanha altura. |
| `headline` | Título da janela superior | Expansão central, quebra até largura útil; janela acompanha altura. |
| `sectionLabel` | Cabeçalho do cartão lateral | Âncora local. |
| `items` | Lista do cartão lateral | Peça repetível, cardinalidade declarada 1–6; fluxo vertical. |
| `callToAction` | Botão inferior do cartão | Superfície + âncora após lista. |
| `label` | Tarja verde frontal | Texto + superfície, sobreposição intencional declarada. |
| `media.primary` | Interior da janela frontal | Cover/ponto focal; obrigatória nesta variante. |

Os IDs desses componentes são estáveis entre variantes; não são chaves especiais no motor. Peças e relações são declaradas pelos contratos anteriores. A região de mídia faz parte da composição; a foto substituída não faz parte do catálogo.

Sequência de aceitação deste exemplo: derivar 5:6 → revisar → abrir fixture administrativa → fornecer texto acima e upload → compilar com `candidateId` da versão/variante → editar título para “Verificar todos os dias” → acompanhar superfície/fluxo → mover um grupo livremente → salvar → reabrir → exportar. O conteúdo cresce por medição, sem `maxlength` herdado da palavra original. Uma lista com sete itens torna esta variante incompatível na geração; não apagar o sétimo. Na edição manual, permitir a lista e sinalizar necessidade de ajustar área/layout.

O caso sem upload deve provar a recusa dessa variante na Criação, e não exibir o placeholder como sucesso. Se for desejada uma composição sem foto, publicar uma variante própria com solução visual revisada.

## 9. Traces e invariantes de conferência

Eventos adicionais: `catalog.offer` (bundle/IDs autorizados, sem copiar definição), `catalog.attempt` (ordinal/política/motivo), `catalog.format` (origem/destino/projeção/overrides) e `catalog.asset` (resolução/falha por ID). Reutilizar eventos de importação, índice, recuperação, seleção, compilação, revisão e feedback do plano.

Todo evento pertinente leva run/trace/slot e identidade completa da variante, `userContentHash`, compiler/policy version, origem `server|client_report`, duração e motivo. No resultado, distinguir solicitado, oferecido e efetivamente materializado. Validar relato do cliente contra **qualquer candidato do bundle persistido** pertencente ao ator, não apenas contra a primeira seleção; `none`/fallback são resultados explícitos. Idempotência por `(run, slot, materializationId, stage, attempt)` e limites atuais de taxa/tamanho ampliados apenas quando necessário. Payload de evento limitado a 8 KiB, sem copy integral, foto, base64 ou tokens de acesso.

`generatedContentHash` e hash do documento materializado inicial permitem diferenciar mudança de conteúdo e mudança visual. Carregamento de fonte/normalização não é edição. Publicação social continua N/D sem evento real. Falha de telemetria é logada e degradável; falha de grant/publicação/persistência obrigatória não é tratada como telemetria opcional.

Invariantes para todos os marcos: zero truncamento silencioso, zero perda de elemento no save/reopen, zero mudança de métrica não versionada, zero publicação sem requisitos, zero acesso indevido a assets e zero nova chamada paga por tentativa geométrica. Uma violação impede ativação até correção.

## 10. Critérios mensuráveis para M3/M4

Metas abaixo são **critérios escolhidos para a futura implementação**, não resultados medidos. Não reduzir metas silenciosamente para aprovar uma execução; se forem inviáveis, registrar causa e propor revisão antes da ativação.

- Corpus fixo de **30 briefings**, cada um com conteúdo esperado, formato, disponibilidade de mídia, composições elegíveis e justificativa humana: 12 títulos/apoios de comprimentos variados, seis listas de 1–6 itens, seis casos com/sem mídia real e seis casos de métrica/atribuição/comparação (incluindo dados ausentes). Distribuir entre os três formatos e registrar casos sem variante elegível como fallback esperado. Três variações por briefing; avaliar completude por variação e relevância por briefing.
- Shortlist: pelo menos um candidato considerado adequado pelo proprietário em **90% dos briefings que têm uma solução elegível no acervo**. Nos demais, recusa/fallback correto, sem fabricar conteúdo. Registrar numerador, denominador e decisões; não extrapolar esse corpus como garantia universal de estética.
- Materialização: **≥95%** dos casos compatíveis produzem resultado tecnicamente válido com candidato preferido/alternativo/adaptado. Fallback convencional inesperado **≤5%** desses casos; recusa correta por ausência de dados/mídia não entra nesse denominador. `needs_adjustment` não conta como sucesso técnico.
- Ranking exato: mesmas distâncias SQL/JS com erro absoluto máximo `1e-5` e mesmos vizinhos fora das faixas de empate nessa tolerância. Registrar empates e manter ordenação estável; não alegar equivalência bit a bit.
- Busca: p95 ≤500 ms por RPC e ≤1 s no agregado de recuperação/seleção sem LLM, teto agregado 2 s. Medir catálogo real e cópias isoladas de 500 e 5.000 variantes sintéticas claramente identificadas. No mínimo 100 consultas por tamanho, com cache/ambiente registrados. HNSW continua fora desta entrega; se exato falhar na meta, apresentar evidência e proposta específica.
- Navegador: materialização de três variações p95 ≤1 s com assets em cache e ≤6 s com carga inicial, teto 15 s. No mínimo 30 lotes por condição em navegador real, registrando hardware/rede/fontes. Fontes/formatos reais do corpus, sem transporte simulado para declarar o fluxo pronto.
- Contratos e persistência: M1 inclui frase curta/longa, acentos, quebra, quatro/seis/sete itens, grupo livre, mudança de formato com/sem variante e overrides, undo/redo, crop e fonte indisponível. Em M2/M3 acrescentar URL expirada, catálogo arquivado, autorização de outra variante da versão e flag `off`. Conferir desktop e mobile, inclusive teclado/IME.
- Banco: recusar aprovação V2 incompleta tanto na RPC nova/adaptada quanto na antiga e INSERT/UPDATE diretos com privilégios de runtime; conferir concorrência/idempotência, status anterior preservado se promoção falhar e reabertura autorizada após arquivamento. Regressão V1 obrigatória.

Conferências locais/nativas não substituem a conferência no navegador; chamadas pagas e aplicação remota dependem do escopo autorizado na tarefa de execução. Um bloqueio ambiental deve ser relatado com a etapa exata, sem marcar M3/M4 como concluídos por inspeção estática.

## 11. O que fica aberto somente à execução

O implementador precisa descobrir estado remoto/migrations, versão/schema da extensão, credenciais disponíveis, resultados de latência e qualidade, e diferenças entre código observado e checkout no início do trabalho. São verificações de ambiente/evidência, não decisões de produto delegadas silenciosamente.

Estão decididos: conteúdo e reparo V2, cardinalidades/bindings, alternativas na API, budgets separados, identidade/troca de variante, mídia inicial no editor, guarda de publicação, retenção/autorização de assets, primeiro marco e critérios de rollout. Não iniciar implementação ampliando esses recortes por conveniência.

## 12. Reconciliação com a implementação de 2026-10-01

Complemento remoto: `0023` adiciona as colunas do trace de geração, evitando perder oferta/recuperação no registro mínimo. `verify:runtime` confirma o Arsenal e ainda falha pelos quatro requisitos de billing preexistentes (`spark_reservations` e três RPCs usadas pelo gerador); as RPCs `next_*` têm outro contrato e não foram substituídas. O bypass DEV/FOUNDER existente permite o piloto administrativo após aprovação, mas não prova billing de planos com saldo nem autoriza rollout `all`.

Este registro não reduz os critérios da seção 10 e não constitui aceite M3/M4. Estado, medidas e procedimentos: `relatorio-arsenal-v2.md` e `DOCUMENTO_MESTRE.md` §13.36.

- Migrações `0019`–`0023` aplicadas ao projeto `spbuwcwmxlycchuwhfir`; pgvector 0.8.0 em `extensions`. Publicação V2 é protegida também na RPC histórica e no INSERT/UPDATE direto. Campos obrigatórios usam testes explícitos de presença/tipo, evitando bypass por SQL NULL. Evidência humana requer PNG e briefing hash.
- A métrica vigente continua `structural-weighted-l1-v1`, pesos/hash compartilhados e 48 eixos. O identificador do algoritmo de busca é `sql-exact-l1-pgvector-v1`: usa `<+>` nativo sobre vetores já pesados, sem ANN. A expressão anterior de soma de 48 componentes foi substituída depois de p95 528 ms para 5.000 linhas no benchmark isolado; o operador nativo ficou em 47,754 ms no mesmo tipo de ambiente. Não houve mudança matemática silenciosa.
- Recuperação recebe cobertura semântica e cardinalidade do briefing; bindings factuais ausentes são excluídos, sem usar números de instruções como fatos quando há interpretação de conteúdo confiável. Estas pistas não substituem validação literal da copy. Não há chamada LLM adicional para seleção de perfil/geometria.
- Recuperação, hidratação e entrega de grants consomem o mesmo orçamento acumulado de 2 s. Fontes/assets do navegador seguem 8 s e lote 15 s, no máximo seis tentativas. Tempo da LLM e gravação de fallback funcional têm tratamento próprio. Telemetria durável degradável não substitui gravação funcional.
- Política de marca é executável por papéis explícitos; catálogo sem contrato compatível recusa a seleção com motivo rastreável. O importador não infere autorização de mudança de cores a partir de uma receita antiga. Fontes autorizadas podem ser um conjunto heading/body, conservando verificação de bytes/família/peso.
- Revisão administrativa mede/exporta com Stage oficial, normal/adapt e conteúdo conservado. PNG/hash e decisão humana permanecem distintos da evidência técnica. A auditoria de caixas não prova ausência de oclusão por todos os elementos decorativos; o aceite humano continua obrigatório.
- Não foi realizada promoção automática: 10 versões draft/18 variantes/4 fontes, zero aprovadas/elegíveis, flag off. O corpus de 30 briefings foi preparado, não executado/avaliado. Benchmarks de um conteúdo em três formatos não são a taxa de qualidade/relevância do corpus. O teste real por prompt e o percurso salvar/reabrir/exportar aguardam aprovação humana das variantes propostas.

## 13. Conteúdo variável V3 — alteração autorizada de contrato

O TheVoid solicita `designContractVersion: 3` em gerações estáticas. O conteúdo canônico passa a `{schemaVersion:3, blocks, caption, hashtags}`. Blocos possuem IDs únicos e tipos `text` (papel), `list` (itens com IDs únicos), `metric` (valor/descrição/evidências), `quote` (texto/autor opcional/evidências) ou `comparison` (dois lados). Não existe título/corpo obrigatório. Envelope do bundle/composição permanece V2; posts V2 não precisam ser migrados, e carrosséis mantêm o contrato anterior.

O servidor deriva do briefing original um `VariableContentContract` com mínimo/máximo de blocos, tipos/papéis permitidos/obrigatórios e **total de itens de todas as listas**. “Uma frase” exige um único texto; “15 elementos/blocos” exige 15 blocos semânticos; “15 itens” exige 15 entradas totais. “Apenas uma lista” restringe a um bloco de lista. Decoração e partes internas de métrica/comparação não contam como novos blocos semânticos. Faixas explícitas são preservadas. Contradições e quantidades fora do orçamento são recusadas antes da reserva de Sparks, sem truncamento.

Orçamento técnico de geração: até 32 blocos, 64 itens totais, 4.000 caracteres/campo, 12.000 no conteúdo, 30 hashtags de até 100 caracteres. Novas gerações usam `VariableContentContract.version: 2`: `blocks: null`/`listItems: null` representam quantidade livre. Apenas limites explicitamente solicitados viram cardinalidades editoriais; os defaults 8/4/15 foram removidos. Contratos versão 1 persistidos conservam seus limites e hashes, sem migração. Extração determinística cobre as formas documentadas em português, não toda ambiguidade possível de linguagem natural. Metadados são separados dos blocos visuais. Limites de geração não passam a limitar edições/reabertura.

O prompt V3 orienta positivamente a organização do conteúdo conforme o briefing e não serializa o contrato inteiro. Arrays livres no schema da LLM têm mínimo estrutural de 1 e nenhum `maxItems`; limites explícitos recebem as cardinalidades solicitadas. O servidor aplica sempre o orçamento técnico, inclusive total de itens entre listas. Reparo conserva o mesmo schema e descreve as correções esperadas. IDs, evidências, caracteres e hashtags continuam com seus limites estruturais no schema. O perfil do catálogo recebe número de itens somente quando explicitamente exato.

O mesmo schema dinâmico por variação rege principal e reparo único. O servidor confere também restrições cruzadas (total de itens, IDs únicos, tipos/papéis obrigatórios, texto vazio, total de caracteres) e literalidade/evidência. Envelope inválido ou violação persistente resulta em rejeição. O contrato e seu hash ficam no bundle/trace; copy literal não é forçada a mudar entre direções visuais.

Bindings `block:<tipo-ou-papel>:<ordinal>:<parte>` exigem compiler V3. Cobertura deve alcançar cada bloco; aliases V2 alcançam somente o primeiro bloco correspondente. Seletores com IDs concretos `content:<id>:<parte>` são exclusivos de fallback privado. A definição continua independente do conteúdo gerado. Import/publicação V3 exigem binding textual/lista válido e preservam todas as evidências/autorizações; não herdam aprovação V2 por trocar compiler.

Conteúdo V3 é gerado mesmo quando o catálogo está off/vazio. Um catálogo incompatível não determina redução de conteúdo: há alternativa ou fallback editorial que materializa todos os campos/itens. Overflow preserva texto e produz `needs_adjustment`. O editor oferece blocos/listas variáveis com IDs estáveis; o fallback recompõe sua estrutura em adicionar/excluir/reordenar e mantém ajustes de IDs sobreviventes. Definições publicadas continuam fixas e sinalizam conteúdo adicional sem cobertura.

Aceite automatizado inclui 1/15 blocos, 15 itens (inclusive distribuídos entre listas), limites exatos/faixas, conflitos/negações, ausência de título/CTA quando proibidos, evidências inventadas, principal/reparo, cobertura completa, mutações do painel, formato, hashes, salvar/reabrir/arquivo portátil e regressão V2. Probe isolado SQL confere V3 sem título e privilégio de serviço. Teste com provedor real confere canonicalização de uma frase e 15 dicas. Conferência visual no navegador e percurso HTTP/billing real continuam pendentes nesta sessão; isso não é aceite M4 nem autorização de publicação automática. Detalhes em `DOCUMENTO_MESTRE.md` §13.37 e `relatorio-arsenal-v2.md`.

Aceite adicional do contrato versão 2: lista/post livres sem tetos 8/4/15, ausência de `maxItems` em arrays livres enviados à LLM, 20 itens/20 blocos preservados, 64 itens totais aceitos e 65 recusados, 33 blocos recusados, reparo com schema idêntico, bundles antigos com limites/hashes preservados e salvar/reabrir/portátil após edição de lista livre. A rodada completa passou com 986 testes; quatro pedidos no provedor real passaram sem reparo, incluindo post/lista livres. Evidência e limites em `DOCUMENTO_MESTRE.md` §13.38 e no relatório.


## 14. Formato retrato atual — 4:5

Novas gerações e seletores oferecem `1:1`, `4:5` e `9:16`. Retrato atual é 1080×1350; 5:6 permanece somente nos contratos de leitura histórica, com 1080×1296. Os exemplos M1 em 5:6 acima documentam a derivação anterior; não definem o formato das novas gerações. Principal/reparo da LLM usam enum atual, com validação independente no servidor.

Canvas lógico 360×450, galeria, reflow, geração de fundos e exportação mantêm 4:5. A exportação pixelRatio 4 resulta em 1440×1800. Troca manual de um documento 5:6 usa projeção uniforme; não modifica sua variante/origem/hash histórico. Um design nativo 4:5 requer nova variante/versão imutável e revisão própria. Minimal Air versão 2 `8ed8a6f1-dd4d-4878-83be-534404e1b2fd` está draft com 4:5; evidência técnica e PNG local não constituem aceite humano ou publicação. Detalhes e limites em `DOCUMENTO_MESTRE.md` §13.40.
