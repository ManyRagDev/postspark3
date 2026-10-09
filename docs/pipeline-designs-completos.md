# Catálogo finito de designs completos

Decisão do proprietário em 2026-10-06: personalizar a copy dentro de composições prontas. A geração automática deixa de combinar fundo, conteúdo, tipografia e mídia de origens independentes. Pequenos elementos continuam disponíveis no acabamento manual do CanvasLab; qualquer enriquecimento automático futuro precisa de uma regra autorada e conferida para o modelo.

## Runtime — arquitetura V4

O Studio (`/thevoid` e `/studio`) solicita `designContractVersion:4`. Esse contrato chama `server/ai/completeDesignGeneration.ts`, independente de `componentAssemblyOrchestrator.ts`. `COMPONENT_ARSENAL_MODE=off` bloqueia a geração V4 antes da reserva de Sparks; com `admin` ou `all`, V4 sempre usa composições completas publicadas. Esses dois valores ainda controlam a ativação dos clientes históricos V3. O novo campo `includeDraftDesigns` permite drafts exclusivamente na prévia administrativa; `assemblyPilot` permanece um alias legado. Clientes antigos e documentos já salvos continuam compatíveis.

```mermaid
flowchart LR
  A[Briefing do usuário] --> B[Catálogo completo elegível]
  B --> C[IA seleciona IDs e explica adequação]
  C --> D[Hidratar modelos e assets pelo hash]
  D --> E[IA preenche somente campos nativos]
  E --> F[Resolver cena e medir com fontes reais]
  F --> G[Autorizar assets e persistir entrega]
  G --> H[CanvasLab renderiza a mesma cena]
```

Cada design continua armazenado como um `design_components.kind=content` autossuficiente, com `completeDesign.family`, cena completa, assets e hashes. A recuperação lê cartões compactos paginados e exige `baselineVerified=true`, formato, status e compatibilidade de marca explícita. Oferece todas as famílias elegíveis: foram retirados a classificação geométrica L1 e o limite de oito famílias. Não há embeddings semânticos novos nem crítico estético. Cores/fontes exigidas precisam existir no design; não se recolore nem se troca a fonte da composição calibrada.

A primeira chamada da IA retorna três sequências de IDs do catálogo e suas razões de adequação. Os slides de cada opção pertencem à mesma família autorada e aceitam os papéis solicitados; o modelo pode se repetir. Quando há três famílias elegíveis, as três opções usam famílias diferentes. A seleção é validada e os hashes hidratados antes da escrita. A segunda chamada preenche somente `fieldId/value`, legenda, hashtags e prompts dos slots de mídia próprios da composição. Recebe as caixas e fontes nativas, além da capacidade do modelo. Não recebe autorização para escolher outro design, placements, fontes, fundos ou ornamentos.

Os campos de texto pertencem à composição. Um convite de encerramento pode ocupar seu título ou apoio nativo, sem inventar uma caixa CTA ou reinterpretar o design como um contrato genérico de post. A regra histórica de alias CTA/body de §13.65 não é usada pelo motor V4. Os únicos bindings remapeados são as referências de conteúdo para IDs privados do documento; camadas, peças, grupos, cores, efeitos, assets e relações nativas são preservados. Fotos permanecem em seus slots para preenchimento posterior no editor; esse fluxo não gera nem importa fotografias automaticamente.

Seleção e copy têm, cada uma, até um reparo de contrato. O reparo da copy mantém os IDs já selecionados. Há prazo compartilhado de 150 segundos para seleção, escrita e conferência, além da preparação anterior do briefing e da persistência posterior. A validação exige campos corretos, literais obrigatórios, trechos travados, ausência de termos proibidos e encaixe técnico medido com bytes verificados das fontes, sem redução corretiva. O prompt exige fidelidade aos fatos fornecidos; essas verificações não certificam todas as afirmações da copy nem sua qualidade editorial. Falha terminal segue o refund existente. Não há tentativa de outra composição ou fallback editorial para encobrir incompatibilidades.

O contrato de entrega autoritativo é `completeDesignV1`: contém as cenas já resolvidas, nome/família e razão da escolha, IDs e hashes de origem. `componentAssemblyV1` acompanha a resposta **apenas como manifesto de autorização** para a RPC atômica existente `design_component_deliver_v1`. O servidor compara seus modelos, peças, conteúdo e assets com a cena entregue antes da RPC. Esse adaptador preserva grants/RLS sem migração; não aciona o antigo montador. Manifesto ausente ou divergente e falha na autorização encerram a entrega sem fabricar outro documento.

`client/src/pages/CanvasLab/lib/completeDesignCompiler.ts` prioriza o novo contrato, carrega as fontes e instala a cena do servidor. Não recompõe geometria, não aplica preset/identidade de marca e não chama os compiladores genéricos ou fallback. Fonte indisponível ou prazo de carregamento encerrado retorna erro. O nome e a razão da escolha aparecem na galeria; a preferência visual é obtida da entrega pertencente ao usuário. Salvar/reabrir/exportar continuam usando `CanvasPostModel` e `canvas_model`.

Responsabilidades e validações estão detalhadas em [arquitetura-geracao-por-composicoes.md](./arquitetura-geracao-por-composicoes.md). O arquivo histórico `componentAssemblyOrchestrator.ts` e seus contratos permanecem para compatibilidade e testes, fora do caminho V4.

## Como os JSONs anteriores foram produzidos

Há dois percursos distintos. `server/designRecreation.ts` é o decodificador multimodal do Admin2, sujeito ao modelo configurado e a custo externo. Os lotes de autoria assistida usam `harness/designBatch/builder.ts`: o agente observa a imagem, escreve uma especificação compacta, resolve fontes reais, declara camadas/grupos/campos/mídia e materializa uma receita Admin2 V3. Não há treinamento de modelo nem extração estética infalível.

`harness/designBatch/native.ts` permite renderização local; Admin2/CanvasPostStage permitem a conferência no motor oficial. `authoring.ts` conserva o mapeamento semântico conhecido das referências antigas. `extractRecipeComponents(...,true)` converte a cena inteira antes da separação histórica de fragmentos. Texto fragmentado, grupos, fontes, extrusão e slots permanecem vinculados. Fontes com peso corrigido e projeções 5:6→4:5 precisam de conferência própria; texto em arco sem capacidade suportada é bloqueado explicitamente. Fotos de demonstração não são publicadas como assets reutilizáveis.

## Novas referências por pasta

1. Coloque PNG/JPEG/WebP em `designs/inbox/` ou indique outra pasta. Execute `pnpm designs:intake CAMINHO`. O comando cria uma pasta nova e inventário com bytes SHA-256 e dimensões; não analisa a composição nem chama uma API.
2. Inspecione cada imagem com a ferramenta de visualização. Registre hierarquia, fontes, efeitos, grupos, slots e limitações. Escreva `specs/<id>.json` segundo `CompactSpec`, com coordenadas absolutas. Não use a imagem inteira para disfarçar elementos faltantes.
3. Escreva `authoring/<id>.json` com papéis semânticos e papéis de slide efetivamente autorizados. Nenhum campo pode ser omitido ou atribuído duas vezes. Exemplo:

```json
{
  "family": "janela-editorial-v1",
  "units": [
    { "role": "headline", "fields": ["titulo"] },
    { "role": "body", "fields": ["apoio"] }
  ],
  "roles": ["static", "cover", "development", "closing"]
}
```

4. Execute `pnpm designs:build --input PASTA_DO_LOTE`. O builder confere novamente a imagem, incorpora fontes locais verificadas, gera receitas V3, converte modelos completos, mede a copy de exemplo e cria renders, `inventory.json`, `CONTACT.png` e `REVIEW.html`. Não sobrescreve uma pasta de saída existente. Use `--output NOVA_PASTA` para nomear a entrega.
5. Compare referência e render. Confira outra copy curta/média e o conteúdo literal necessário. Um check técnico válido não certifica estética, fidelidade da imagem ou todo conteúdo futuro. Corrija a spec e gere outra revisão. Preserve originais e relatórios anteriores.
6. Importe o pacote como draft usando o fluxo existente:

```bash
node --env-file=.env --import tsx harness/componentArsenal/import.ts PASTA_DO_PACOTE ADMIN_UUID --missing-only
```

7. Revise no Admin2 e publique o hash concreto. Importação, verificação técnica, aprovação humana e publicação continuam eventos diferentes. O arquivo JSON individual de receita pode ser importado no laboratório; o pacote `packages/` é destinado ao catálogo. Assets precisam estar verificados antes da definição.

A autoria assistida usa o modelo ativo da conversa. Ter usado Astra anteriormente não configura automaticamente Astra no decodificador de API. Uma futura solicitação por pasta permite ao agente fazer a análise e conversão com esses contratos, sem exigir que o proprietário escreva as specs.

## Acervo recuperado nesta mudança

`artifacts/complete-designs/whole-catalog-final-2026-10-06-r2` contém 93 entradas preservadas: 91 receitas de composição convertidas em 112 variantes e duas referências especiais retidas. Quinze assets de fonte foram verificados. A medição da copy de demonstração passou em 59 variantes; 53 conservam problemas de overflow, fonte, contraste ou colisão. Todos os 112 registros foram importados como drafts, sem arquivamento ou publicação. Somente os 59 com baseline válido podem entrar na prévia administrativa, ainda sujeitos à validação da copy atual.

`REVIEW.html` e `inventory.json` mostram cada resultado e impedimento. A primeira contact sheet foi inspecionada visualmente; isso não equivale a aprovação de todos os modelos. A consulta conectada anterior confirmou os 112 hashes importados. O limite histórico de oito famílias foi retirado na V4. O replay offline da nova arquitetura oferece os 29 modelos 4:5 tecnicamente elegíveis do pacote e monta nove slides com três composições e bytes reais das fontes; usa respostas sintéticas e não certifica seleção/copy reais ou estética. Execute `node --import tsx harness/completeDesigns/replayGeneration.ts [PASTA_DO_PACOTE] [PASTA_DE_SAÍDA]`. Nenhuma nova chamada paga, publicação ou escrita no banco ocorreu nessa validação.
