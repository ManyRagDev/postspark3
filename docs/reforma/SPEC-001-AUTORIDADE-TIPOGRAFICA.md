# SPEC-001 — autoridade tipográfica única

**Status:** 🟡 parcial — reaberta pela conferência global de 2026-08-12. O perfil `baseline` citado anteriormente mede sem julgar; `e2` e `e3` reprovam. O renderer não consome integralmente `ResolvedTextBlock` e a edição no browser pode retornar a autofit/clamp. Correções CR-001, CR-002 e CR-003 em [`CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md`](./CONFERENCIA-GLOBAL-E-CORRECOES-2026-08-12.md).
**Prioridade:** primeira entrega da reforma
**Dor:** textos podem ser recalculados e truncados depois de o snapshot ter sido criado

**Próxima entrega:** [`SPEC-002 — resolvedor visual e cor`](./SPEC-002-RESOLVEDOR-VISUAL-E-COR.md)
**Ritual do executor:** [`EXECUCAO-AUTONOMA.md`](./EXECUCAO-AUTONOMA.md)

## Resultado

Todo título e corpo é medido com a fonte real, resolvido uma vez e persistido no `PostVisualSnapshot`. HoloDeck, Workbench, exportação, salvamento e reabertura exibem essa mesma decisão. O renderer deixa de usar contagem de caracteres, multiplicadores tardios e line-clamp como mecanismos de layout.

## Estado confirmado

1. `shared/variationSnapshot.ts` cria `PostVisualSnapshot` v3 e aplica um fallback estimado.
2. `PostCardV2.tsx` chama `useTextAutoFit`, aplica fator de família e esconde excesso com clamp.
3. `useTextAutoFit.ts` não mede glifos da fonte utilizada.
4. `harness/fit.ts` e `harness/measure/fontkitMeasurer.ts` já implementam medição e busca determinísticas fora do runtime.
5. O resolvedor do Next traz soluções adicionais de empilhamento, safe area, paleta e carrossel.
6. O harness atual reprova por cobertura parcial: sete fontes ausentes, zero itens reais e 306 casos pulados.

## Decisão arquitetural

O resolvedor canônico viverá em código compartilhado executável no servidor. Ele usará arquivos de fonte versionados e medição Fontkit para transformar intenção visual e copy em geometria resolvida.

O cliente renderizará os valores resolvidos. Medidas do DOM poderão detectar divergência em teste ou telemetria, mas não substituirão silenciosamente o documento autoritativo.

O código do harness e o resolvedor do Next são candidatos, não duas novas camadas. A implementação começa comparando ambos e termina com um único núcleo promovido para runtime; o harness passa a consumir esse mesmo núcleo.

## Contrato v4 proposto

O incremento para `snapshotVersion: 4` é obrigatório porque o snapshot passa a persistir uma decisão visual nova. O contrato deve incluir, para cada bloco de texto resolvido:

```ts
interface ResolvedTextBlock {
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSizePx: number;
  lineHeight: number;
  lines: string[];
  box: { x: number; y: number; width: number; height: number };
  textTransform?: "none" | "uppercase" | "lowercase";
}

interface ResolvedTypography {
  engineVersion: string;
  headline: ResolvedTextBlock;
  body?: ResolvedTextBlock;
}
```

`PostVisualSnapshot` v4 terá `resolvedTypography`. Em carrosséis, cada slide guardará sua própria resolução junto de seu `editorState`; a resolução do slide atual não poderá vazar para os campos-base.

Antes da primeira edição de código, esse esboço deve ser reconciliado com `AdvancedLayoutSettings` e o schema de slides. Se os campos existentes já expressarem a mesma informação, devem ser reutilizados; não se criará um segundo modelo equivalente.

Snapshots v1–v3 continuam legíveis. Eles são promovidos para v4 pelo normalizador canônico quando entram em edição ou persistência nova. Renderização de legado não cria uma segunda autoridade permanente.

## Sequência de implementação

1. **Fechar o contrato:** localizar todos os produtores/consumidores de `PostVisualSnapshot`, slides e `editorState`; definir os campos v4 sem casts de compatibilidade.
2. **Escolher o núcleo:** comparar `harness/fit.ts` com `postspark-next/packages/design-system/src/measure.ts` e `resolve.ts`; promover uma única implementação para `shared/` ou módulo canônico equivalente.
3. **Completar fontes:** versionar as sete fontes requeridas, validar nomes/eixos e impedir fallback silencioso.
4. **Resolver na geração:** produzir `resolvedTypography` antes do snapshot sair de `post.generate`, cobrindo post estático e cada slide de carrossel.
5. **Resolver edições:** toda mudança de copy, família, proporção ou caixa invalida e recalcula a resolução antes do próximo render; a atualização do snapshot é atômica.
6. **Simplificar o renderer:** remover `useTextAutoFit`, multiplicação tardia de tamanho e clamp como decisões de layout em snapshots v4.
7. **Unificar consumidores:** HoloDeck, Workbench, exportação, posts salvos e histórico usam os mesmos valores.
8. **Migrar o harness:** fazê-lo importar o resolvedor canônico; adicionar corpus real versionado e manter casos sintéticos/adversariais.
9. **Remover substituídos:** apagar ou restringir exclusivamente à leitura legada `useTextAutoFit` e `applyVisualFitFallback`; nenhum deles pode atuar sobre v4.
10. **Atualizar documentação:** registrar o contrato final e o mecanismo removido na baseline e no documento-mestre.

## Critérios de aceitação

- [x] Existe exatamente um resolvedor tipográfico no caminho de snapshots v4 (`shared/typography/resolve.ts`; `PostCardV2` só usa `useTextAutoFit` quando `resolvedTypography` está ausente).
- [x] Todas as fontes usadas pelas 12 famílias estão disponíveis ao resolvedor e ao renderer. Ressalva: 3 das 7 baixadas (Anton, Archivo Black, Space Mono) só existem como estáticas no Google Fonts — não há versão variável publicada, ao contrário do que o registro presumia.
- [ ] **Parcial.** Nenhum caso do harness é pulado (era 306/612, agora 0/2664). A âncora de corpus real existe (23 títulos reais) mas **não é versionada nem anonimizada** — `pullCorpus.ts` grava fora do git por design (headlines reais de usuário). O texto literal do critério está em tensão com essa decisão de privacidade; recomendo corrigir o critério, não o código.
- [ ] **Parcial.** O resolvedor nunca corta texto — falhas (`TypographyResolutionError`) são sempre estruturadas. Mas `post.generate` **não aborta nem retenta** quando uma variação falha: grava `typographyResolutionError` no snapshot e segue; essa variação especifica renderiza pelo caminho legado (autofit + clamp) até ser resolvida numa entrega futura. Decisão de escopo explícita — retry/rewrite de copy é `SPEC-003` ("encurtar geração"), fora desta spec.
- [ ] **Parcial.** Verdadeiro apenas quando a resolução teve sucesso. No corpus medido, 77,1% dos casos encaixam acima do piso — os outros ~23% caem no fallback legado (clamp) descrito acima.
- [ ] **Parcial.** 10 das 12 famílias têm geometria explícita (headline+body). `versus` e `mosaic-grid` (template `feature-grid`, seções estruturadas) ficam fora por decisão documentada — resolver texto dentro de seções não é escopo desta spec. Carrossel: a resolução por slide nunca vaza para a base (verificado em código), mas só é computada sob demanda em `projectSnapshotForSlide`, não persistida no momento da geração — `server/routers.ts` não foi alterado para gravar `slide.editorState.resolvedTypography` na criação do carrossel.
- [x] HoloDeck → Workbench → exportação (mesmo componente `PostCardV2`, exportação é screenshot do DOM) → posts salvos/histórico (`createPostVisualSnapshot` sempre roda o resolvedor) usam o mesmo valor. Verificado por leitura de código e testes; **não** por comparação visual renderizada real (sem harness de screenshot-diff no repositório).
- [ ] **Parcial.** Slides preservam resolução independente por construção (`projectSnapshotForSlide` nunca escreve na base) — sem teste automatizado dedicado a isso.
- [x] Snapshots v1–v3 continuam abrindo e são promovidos para v4 de forma determinística (`snapshotMigration.ts`, `editorStore`'s `frozenShape` gating).
- [x] `variationSnapshot.test.ts`, testes do editorStore, `shared/typography/resolve.test.ts`, `npm run check`, `npm test` (375 testes) e o harness (`npm run harness -- --aspect 1:1,5:6,9:16`, 2664 casos, 0 pulados) passam.
- [ ] Pendente — é o objeto deste pedido de conferência.

## Falhas explícitas

O resolvedor não deve esconder estes casos:

- [x] arquivo ou eixo de fonte ausente — `TypographyResolutionError("missing-font")`.
- [x] palavra indivisível que não cabe no piso — `TypographyResolutionError("unbreakable-word")`.
- [ ] caixa menor que a área segura mínima — não há checagem separada; hoje cai dentro de `below-floor` quando a caixa é pequena demais para qualquer corpo legível, mas não distingue "caixa geometricamente impossível" de "copy longo demais".
- [x] copy que não cabe sem violar legibilidade — `TypographyResolutionError("below-floor")`.
- [ ] divergência entre fonte medida e fonte carregada no browser — **não implementado nesta entrega**. O resolvedor mede com Fontkit no servidor/shared; não há verificação client-side de que a fonte carregada no `<canvas>`/DOM bate com a medição. Risco real se a fonte falhar ao carregar no browser (fallback silencioso do CSS `font-family`).
- [ ] snapshot v4 sem resolução coerente para todos os slides — parcial, ver critério de carrossel acima.
- [x] posição simbólica sem geometria explícita — `TypographyResolutionError("missing-geometry")` (caso novo, não previsto no texto original da spec; adicionado porque `versus`/`mosaic-grid` e qualquer família futura sem `freePosition`/`height` caem aqui).

Cada caso produz um erro estruturado e observável (`typographyResolutionError` no snapshot). Rewrite por IA, redução de copy ou troca de família como correção automática **não foi implementado** — hoje a falha só é registrada; a variação afetada renderiza pelo caminho legado (autofit) até uma entrega futura (SPEC-003) fechar o loop de correção.

## Fora de escopo

- consolidar toda a lógica de cor e contraste;
- redesenhar as 12 famílias;
- substituir toda a geração por LangGraph;
- reduzir as chamadas de LLM;
- auditar o Supabase hospedado;
- fazer limpeza geral de módulos órfãos.

Esses temas continuam no plano, mas não bloqueiam a eliminação da autoridade tipográfica concorrente.

## Evidência a anexar no encerramento

1. diff do contrato v4 e da leitura v1–v3;
2. tabela de consumidores atualizados;
3. resultado completo do harness, sem casos pulados;
4. testes de ida e volta de persistência;
5. amostra visual comparável das 12 famílias nas proporções suportadas;
6. busca que prove a retirada de auto-fit/clamp do caminho v4;
7. parecer da conferência independente.
