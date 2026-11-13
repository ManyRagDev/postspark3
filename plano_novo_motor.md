# Plano de implementação — Motor de seleção PostSpark

**Sim, é possível.** Os cinco arquivos fecharam as questões arquiteturais. O que falta são *detalhes de implementação* (bytes exatos, métricas de fonte, a função de partição literal) — todos obteníveis durante a execução, nenhum bloqueia o desenho.

---

## 0. Status do conhecimento

| Confirmado nos arquivos | Estimado (verificável depois) |
|---|---|
| 23 assinaturas distintas para 82 designs; 59 em colisão | ~916 bytes/card → 2 lotes (68+14) |
| 49/82 densidade divergente (piso rigoroso: ≥16) | ~483 bytes/card sem `criteria` → 1 lote |
| 6 erros de `imageRole` ↔ `mediaSlots`; 8 slots invisíveis | capacidade em caracteres (falta a fonte) |
| 4 erros de tipografia contra `sourceFontFamilies` | efeito de pontuação conjunta no lote |
| 26 cards com `cover` no agregado vs `["static"]` no perfil interno | |
| `criteria` duplicado por pergunta; ordem por UUID | |
| Penalties inertes sob `suitability_first` | |
| Telemetria da jornada inexistente | |

### Achado novo, e é o mais importante

O código **já contém** uma rubrica consciente de capacidade:

```
"Consider native body/list/data fields, space for explanation, split headline
fragments... A title-led composition is not automatically suitable for a
detailed argument; do not erase essential facts to fit it."
```

Ela está na const `task`. E o ramo `automaticProfiles` (ativo nos 82, porque todos têm `compactAssessment: true`) **nunca a usa** — cai no texto expressivo que diz explicitamente *"No fields, slides or geometry are needed at this stage"*.

> A rubrica certa existe e está sendo desviada. Parte do conserto é parar de desviá-la.

### O que a projeção compacta descarta

O perfil interno tem 5 campos com sinal real. A projeção joga todos fora:

| campo | preenchido em | valor |
|---|---|---|
| `structure.textBlocks` | 82/82 | 1–17 blocos |
| `structure.mediaSlots` | 19/82 | 1–4 slots |
| `structure.listBlocks` | 3/82 | 1–2 |
| `structure.listItemsPerBlock` | 3/82 | até 0–20 |
| `structure.relationships` | 3/82 | `contrast`, `independent_items` |

Os demais campos do perfil interno são **vazios ou errados**: `motifs: []`, `fonts: []`, `editorial.intents: []`, `catalogHash: null` em todos; `availability.roles: ["static"]` em todos, contradizendo 26 cards.

**Consequência direta:** não envie o perfil interno inteiro. Envie o compacto **+ estes 5 campos**. Custa ~150 bytes/card e ainda cabe em 1 lote.

---

## 1. Invariantes

Valem como assertion em código:

1. O render payload nunca participa do matching.
2. Nenhum campo do perfil contradiz o card autorado.
3. Restrição **declarada** não é violada sem aviso explícito.
4. Capacidade é medida, nunca inferida de adjetivo ou de área.
5. Eixo não mobilizado pelo briefing não entra no score.
6. As 3 opções são visualmente distintas ou expõem um trade-off real.
7. Toda rejeição e todo relaxamento são logados com motivo.

---

## 2. Não fazer (evidência já descartou)

| Não fazer | Por quê |
|---|---|
| Enviar o perfil interno completo | `roles` errado em 26; `motifs`/`fonts`/`editorial` vazios em 82 |
| Construir abstração de kit/família | `DesignFamilyRepertoire` já existe com `slides[].variants`, `signature` |
| Vector DB / embeddings como núcleo | 82 itens; e o problema é agregação, não recuperação |
| Tratar `minWords` como mínimo de palavras | vem de `contentFragment.count` = nº de fragmentos |
| Assumir caixas de linha única sistêmicas | só 6/82 têm `h/fs ≈ 1.15` |
| Derivar capacidade de `soma_area_normalizada` | soma caixas com sobreposição, sem união (REF-14: 2.08; CON-23: 2.27) |
| Usar caminho de famílias para carrossel | nenhum dos 82 tem `development`/`closing` → `no_complete_option` |

---

## Fase 0 — Instrumentação *(trilha paralela)*

**Objetivo:** existir sinal de aprendizado. Hoje não existe.

- [ ] Evento `design_impression`: brief_hash, 3 ids, **posição**, scores, penalties, batch_index, profile_hash
- [ ] Evento `design_chosen`: id, posição, latência até escolha
- [ ] Evento `design_edit`: id, campo alterado, tipo (`fill`/`fontSize`/`fontFamily`/`delete`/`geometry`), delta
- [ ] Evento `design_export`: id, formato — **hoje o download no CanvasLab não emite nada**
- [ ] Randomizar a ordem das 3 na galeria e registrar a ordem original
- [ ] Persistir `rankingPolicy` efetivo em cada evento

**Aceite:** uma jornada completa reconstruível por `brief_hash`. Sem isso, F7 não começa.
**Runtime:** sim para deploy; código escrevível offline.

---

## Fase 1 — Reconciliação de dados

**Objetivo:** nenhum campo do perfil contradiz o card. É o pré-requisito de tudo.

- [ ] Script `reconcile-profiles.ts`: para cada um dos 82, compara perfil ↔ card e emite relatório
- [ ] **Regra de precedência:** fato físico do card vence; estética autoral vence sobre derivação; documentar cada escolha
- [ ] `density`: decidir a fonte canônica. Hoje perfil diz `contida` para 20 e o card registra `quiet` em 4 — irreconciliável por tradução
- [ ] `imageRole`: derivar de `mediaSlots > 0`, não de adjetivo. Corrige REF-19 (fotografia sem slot) e REF-11/12/15/18/23 (8 slots invisíveis)
- [ ] `typography`: derivar de `sourceFontFamilies`. Corrige REF-23 (100% Playfair rotulado sem serifa), REF-15, REF-20, REF-07
- [ ] `availability.roles`: derivar do card. Corrige 26
- [ ] Renomear `minWords` → `fragmentCount` em todo o contrato
- [ ] `.strip()` em chaves e valores na ingestão (artefato de export, mas barato de blindar)
- [ ] Recalcular toda feature derivada **após** projeção de formato (o 31.4% obsoleto do Versus histórico)

**Aceite:** 0 divergências nos campos reconciliados; relatório de 82 linhas com valor antigo → novo → fonte.
**Runtime:** não. **Esforço:** 1–2 dias.

---

## Fase 2 — Projeção + rubrica

**Objetivo:** dar ao JEV a evidência que a rubrica exige. Maior razão benefício/custo do plano.

### 2.1 Projeção

```ts
// familyAssessmentProfile — acrescentar structure, omitir o resto
{
  version: 5, kind: "editorial_family", family, description,
  characteristics: identity.essential,
  structure: {
    textBlocks:        p.structure.textBlocks,
    listBlocks:        p.structure.listBlocks,
    listItemsPerBlock: p.structure.listItemsPerBlock,
    mediaSlots:        p.structure.mediaSlots,
    relationships:     p.structure.relationships,
  }
}
```

### 2.2 Rubrica

- [ ] **Anchor 4** — remover a cláusula de capacidade:
  > ~~native editorial capacity supports the essential facts and informative progression~~
  > → "the documented expressive character and editorial function match the brief's stated intent, with specific evidence from the profile"
- [ ] **Anchor 1** — trocar "capabilities not documented" por referência explícita a `structure`
- [ ] Remover `"No fields, slides or geometry are needed at this stage"`
- [ ] Substituir `"Style, media and tone preferences... are not hard eligibility rules"` por:
  > "Preferences marked **declared** are requirements. Preferences marked **inferred** are soft. `mediaSlots` is a fact, not a preference."
- [ ] Reincorporar as frases úteis de `task` (não apagar fatos essenciais para caber)
- [ ] Manter a defesa contra injeção e `"Missing information is uncertainty"`
- [ ] Remover dependência de `"Do not reward genericness"` — vira estrutura, não instrução

**Aceite:** `structure` presente nos 82; bytes/card ≤ 700; anchor 4 não cita capacidade.
**Runtime:** não. **Esforço:** 1 dia.

---

## Fase 3 — Transporte e ordenação

### 3.1 `criteria` para `state`

- [ ] Mover o array de 5 critérios de cada `question` para `state`
- [ ] Medir com `batches()` real → confirmar 1 lote
- [ ] **Se não couber em 1:** balancear em 2 lotes de ~41 em vez de 68+14
- [ ] Ordenar por hash de conteúdo, não por UUID (composição determinística e auditável)
- [ ] ⚠️ **Trade-off:** `validateAnswers` exige conjunto exato de ids. Um lote único de 82 aumenta o raio de falha. Mitigar com retry por pergunta antes de descartar o lote

### 3.2 Ordenação

```ts
while (options.length && selected.length < DESIGN_SHORTLIST_SIZE) {
  const scored = options.map(o => {
    const p = penalties(o);
    return { o, p, key: (o.effectiveScore ?? o.score) - p.similarityPenalty - p.recencyPenalty };
  });
  scored.sort((a, b) =>
    b.key - a.key || b.o.score - a.o.score ||
    a.o.family.localeCompare(b.o.family) ||
    (offers ? a.o.cards[0].id.localeCompare(b.o.cards[0].id) : 0));
  const chosen = scored[0].o;
  options.splice(options.indexOf(chosen), 1);
  if (offers) rankings.push({ id: chosen.cards[0].id, score: chosen.score,
    ...penalties(chosen), shortlistPosition: selected.length + 1 });
  selected.push(chosen);
}
```

- [ ] `adjustedScore` como chave primária única (penalties deixam de ser código morto)
- [ ] `effectiveScore` usado nos **dois** modos (hoje `diversified` ignora `confidence`)
- [ ] atrás de flag `rankingV2` para A/B contra o comportamento atual

**Aceite:** teste unitário onde dois candidatos com Δscore = 0.01 e Δsimilaridade = 0.7 invertem a ordem.
**Runtime:** não para escrever; sim para medir. **Esforço:** 1 dia.

---

## Fase 4 — Contrato de capacidade

**Objetivo:** capacidade medida, não estimada. Substitui `geometry_estimate_not_measurement`.

- [ ] Medir advances reais com fontTools nos `.woff2` do Arsenal (Inter 700 e demais)
- [ ] `lineHeight` por peça, não constante global (o Versus histórico usa 1.15; os 82 variam de 0.88 a 1.625)
- [ ] Contrato por campo: `{ blocos, fragmentos, chars_nominal, chars_minFont, palavras_min, palavras_max }`
- [ ] **Duas dimensões:** a partição é por *tokens de palavra* com `floor(N·pesos/total)`; a capacidade é em *caracteres*. Ambas precisam constar
- [ ] Modo de falha explícito: fragmento vazio (possível no caminho histórico) e `preserve_occupancy`
- [ ] `geometry_fit(brief, card)` penalizando overflow **e** subocupação
- [ ] Simetria para `relationships: contrast` — `|len(a) − len(b)|` pequeno (R9-03, CON-05)

**Aceite:** erro < 10% entre capacidade prevista e renderizada em amostra de 20 campos.
**Runtime:** sim. **Busca:** `fragmentContentText.ts`, `designMechanics.ts`, os `.woff2`.

---

## Fase 5 — Parser + portão determinístico

- [ ] Parser de briefing com structured output, `t=0`, produzindo:
  - `requisitos` com **proveniência por campo**: `declared` | `inferred` | `physical`
  - `payload`: headline, body, bullets(n), CTA, métrica, mídia disponível
- [ ] Portão duro **antes** de `shortlistCompleteDesigns`: formato, mídia, nº de itens contrastáveis, overflow acima do tolerável
- [ ] Log de motivo de rejeição por card → auditoria de escassez falsa
- [ ] Escada de relaxamento explícita: re-vestir → relaxar geometria → trocar formato → perguntar → **nunca** degradar em silêncio
- [ ] Fallback quando o conjunto viável é vazio (não retornar o mais próximo com score alto)

**Aceite:** satisfação de restrição declarada > 95%; 0 sessões sem solução viável.
**Runtime:** sim. **Depende:** F1, F2, F4.

---

## Fase 6 — Pele e alcançabilidade

- [ ] `palette_flex` calculado: ΔL vs ΔH por par de elementos semanticamente distintos
- [ ] `polaridade` (dark/light) como campo — inverter exige trocar cor de texto, não é remapeamento de matiz
- [ ] Skin tokens restritos ao whitelist real: `fill` em texto/shapes/fundo, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`
- [ ] Adapter preservando relações de luminância + checagem de contraste mínimo
- [ ] Filtro por **alcançabilidade** ("consegue ser sóbrio?"), não por identidade

**Aceite:** nenhum design quebrado após re-vestimento em amostra de 30.
**Busca:** `editor-allowed-properties.ts`, `editorController.ts`, PNGs.

---

## Fase 7 — Aprendizado

**Só depois de F0 acumular dados.**

- [ ] Golden set: 80–120 briefings com julgamento par-a-par
- [ ] Calibração por vantagem relativa: `S(t,q) − média_q'[S(t,q')]` sobre ~300 briefings de referência
- [ ] Pesos condicionais ao briefing + média de potência (p ≈ −1 a −2) + vetos
- [ ] LTR mantendo o efeito principal do template no treino e **descartando na inferência** — ranquear só pela interação
- [ ] Thompson sampling + piso de exposição; correção de posição por IPS
- [ ] Mapa de cobertura `formato × função × densidade × tom` → fila de novas artes

---

## Anexo A — buscar durante a execução

| Item | Fase | Bloqueia? |
|---|---|---|
| `jev-requests-modelo-placeholder.json` | 3 | não — só confirma os bytes |
| `fragmentContentText.ts` + `designMechanics.ts` | 4 | sim para F4 |
| `.woff2` do Arsenal + `fonte-e-line-height.json` | 4 | sim para F4 |
| `editor-allowed-properties.ts` | 6 | sim para F6 |
| `designVisualSimilarity` (escala/saturação) | 3 | não — mas sanidade necessária |
| Filtro upstream que produz o conjunto de candidatos | 5 | não — inserção é antes de `shortlistCompleteDesigns` |

---

## Anexo B — testes de regressão

- [ ] **Colisão:** os 7 designs `(cartaz, contida, sem serifa, grafismo)` — trocar descrições de R9-11 ↔ R9-09 e re-rodar. Se os scores seguirem a prosa, a descrição é o único sinal
- [ ] **Solo vs lote:** mesmo design sozinho e em lote de ~68. Score diferente ⇒ pontuação conjunta
- [ ] **Adequação:** 10–15 briefings ultra-específicos com template sabidamente perfeito. Assert top-1
- [ ] **Diversidade:** Δscore pequeno + Δsimilaridade grande ⇒ ordem inverte
- [ ] **Capacidade:** capacidade prevista vs renderizada

---

## Anexo C — métricas

| Métrica | Alvo |
|---|---|
| Divergências perfil ↔ card | 0 |
| Lotes por chamada | 1 (ou 2 balanceados) |
| Satisfação de restrição declarada | > 95% |
| Concentração do top-1 | < 8% |
| Cobertura do top-3 | ↑ |
| nDCG@3 no golden set | ↑ |
| Sessões sem solução viável | ≈ 0 |

---

