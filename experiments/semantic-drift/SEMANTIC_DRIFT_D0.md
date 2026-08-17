# Semantic Drift Score (D₀) — Documento Mestre da Pesquisa

**Versão:** 1.0
**Data:** 2026-08-14
**Autor da hipótese:** Emanuel (conceito originado em conversas com agentes de pesquisa; formalização e experimentação nesta sessão)
**Ambiente experimental:** repositório PostSpark 3 (laboratório pessoal)
**Status:** pesquisa em andamento — resultados preliminares de dois pilotos offline

---

> ⚠️ **AVISO METODOLÓGICO — LEIA ANTES DE QUALQUER CONCLUSÃO**
>
> Todos os resultados quantitativos deste documento provêm de **dois pilotos preliminares e limitados**, executados sobre **um único repositório**, com **~30 checkpoints temporalmente dependentes** de um histórico de desenvolvimento **humano e de ritmo regular**. Nenhum número aqui deve ser lido como validação definitiva da técnica, nem como refutação definitiva. O papel dos pilotos foi: (a) demonstrar que o fenômeno medido existe; (b) expor as fraquezas da formulação atual; (c) calibrar o desenho dos experimentos decisivos, que **ainda não foram executados**. Onde este documento afirma algo com confiança, a confiança está explicitamente delimitada ao regime testado.

---

## Índice

1. [O problema](#1-o-problema)
2. [A arquitetura híbrida: bússola e lupa](#2-a-arquitetura-híbrida-bússola-e-lupa)
3. [Definição formal do D₀](#3-definição-formal-do-d)
4. [Propriedades matemáticas do D₀](#4-propriedades-matemáticas-do-d)
5. [Princípios de projeto da pesquisa](#5-princípios-de-projeto-da-pesquisa)
6. [Método experimental](#6-método-experimental)
7. [Testes realizados (PRELIMINARES)](#7-testes-realizados-preliminares)
8. [Interpretação honesta dos resultados](#8-interpretação-honesta-dos-resultados)
9. [Descobertas colaterais relevantes](#9-descobertas-colaterais-relevantes)
10. [Arquitetura recomendada para o harness](#10-arquitetura-recomendada-para-o-harness)
11. [O pipeline de query: do prompt do usuário à localização](#11-o-pipeline-de-query-do-prompt-do-usuário-à-localização)
12. [Roteiro de validação futura](#12-roteiro-de-validação-futura)
13. [Evolução prevista da fórmula: D₁ e D₂](#13-evolução-prevista-da-fórmula-d-e-d)
14. [Riscos e ameaças à validade](#14-riscos-e-ameaças-à-validade)
15. [Cenários de desfecho](#15-cenários-de-desfecho)
16. [Artefatos e reprodução](#16-artefatos-e-reprodução)
17. [Glossário](#17-glossário)

---

## 1. O problema

### 1.1 Contexto de origem

Esta pesquisa nasce de uma dor concreta de engenharia: **desenvolvimento assistido por IA em ambiente corporativo onde a LLM, embora seja um modelo grande, é servida com forte limitação de tokens por janela**. Nesse regime, cada turno de conversa com o modelo é um recurso escasso. O agente de código não pode se dar ao luxo de "explorar" o repositório por tentativa e erro — cada grep especulativo, cada leitura de arquivo errado, cada rodada de "será que é aqui?" consome orçamento que deveria estar sendo gasto no raciocínio sobre o patch em si.

A dor operacional específica: **ter que "adivinhar" onde aplicar o patch**. Quando o usuário pede "corrige o cálculo de desconto", o agente precisa primeiro *localizar* o código relevante. Busca textual (grep/glob) exige saber a palavra exata — e o usuário, por definição, descreve *sintomas* em linguagem natural, não identificadores do código. A distância entre "deixa o botão azul" e `ThemeButton.tsx` + `designTokens.colors.primary` é o que a literatura chama de **lexical gap**, e atravessá-la por tentativas de grep custa turnos inteiros de LLM.

### 1.2 A solução de base: RAG como localizador

A resposta natural é indexar o repositório semanticamente (embeddings + busca vetorial). A busca por proximidade de cosseno resolve o lexical gap por construção: a query em linguagem natural e o código relevante caem próximos no espaço vetorial mesmo sem compartilhar uma única palavra. E tem uma propriedade econômica decisiva para o ambiente restrito: **a busca vetorial custa zero tokens de LLM** — é álgebra local, executada fora do modelo.

### 1.3 O problema derivado: o índice envelhece

O código muda continuamente; o índice representa o código *no momento da indexação*. Quanto mais o repositório se afasta desse momento, menos fiel o índice se torna: aponta para arquivos que mudaram (imprecisão), desconhece arquivos que nasceram (cegueira) e sugere arquivos que morreram (alucinação estrutural).

As soluções triviais para decidir quando reindexar são insatisfatórias em teoria:

- **Atualizar a cada alteração**: potencialmente caro (reembedding, latência, cota de API).
- **Atualizar a cada N commits / T minutos**: ignora que alterações têm impactos radicalmente diferentes. Dez commits de typo ≠ um commit que reescreve o núcleo. Um repo pode ficar parado três meses (reindexar por calendário = desperdício) e depois sofrer uma reescrita em uma semana (calendário dorme durante o incêndio).

### 1.4 A hipótese central

> **Hipótese D₀:** é possível calcular, de forma barata e determinística (Git diff + tamanhos de arquivo, sem AST, sem LSP, sem LLM, sem grafo), um escalar normalizado D₀ ∈ [0,1] que mede a distância entre o estado do repositório conhecido pelo índice (S₀) e o estado atual (Sₜ) — e esse escalar possui **relação mensurável com a degradação real do retrieval**, podendo fundamentar uma política adaptativa de refresh: `D₀ ≥ τ → reindexar`.

A pesquisa trata essa hipótese como falseável: o objetivo declarado desde o início não foi confirmá-la, mas **tentar quebrá-la** e descobrir exatamente onde e por que ela falha.

---

## 2. A arquitetura híbrida: bússola e lupa

### 2.1 Divisão de papéis

O RAG **não** é tratado como fonte da verdade nem como gerador de resposta. A arquitetura define uma cadeia de refinamento progressivo de incerteza:

```
        SEMANTIC PRIOR          "provavelmente está neste bairro"
              ↓
      SEARCH LOCALIZATION       grep/glob confirmam ocorrências reais
              ↓
     STRUCTURAL RESOLUTION      LSP/AST resolvem identidade de símbolos (futuro)
              ↓
       LIVE VERIFICATION        leitura do arquivo vivo = verdade
              ↓
            ACTION              patch aplicado sobre o filesystem atual
```

Em metáfora operacional:

- **RAG = bússola.** Recebe uma intenção, aponta regiões prováveis. Pode estar levemente desatualizada sem causar erro, porque nunca é a palavra final.
- **grep/glob/read = lupa.** Opera sobre o código vivo, com precisão total, mas exige saber onde (ou o quê) olhar.
- **Filesystem atual = verdade.** Toda alteração ocorre sobre ele, nunca sobre a representação do índice.

É uma arquitetura quase bayesiana informal: o semantic retrieval fornece `P(localização | intenção)`; as ferramentas vivas transformam probabilidade em localização confirmada; cada estágio reduz incerteza.

### 2.2 Por que a tolerância a staleness é a propriedade-chave

Como a bússola nunca decide sozinha, o sistema tolera um índice moderadamente desatualizado: o custo do envelhecimento não é um erro catastrófico, é **eficiência degradada** (mais rodadas de lupa para compensar apontamentos piores). Isso transforma a pergunta binária "o índice está válido?" na pergunta contínua "**quanto** o desgaste da bússola está custando?" — que é precisamente o que o D₀ tenta medir do lado da causa, e o Retrieval Loss (seção 6) mede do lado do efeito.

### 2.3 A economia de tokens em números

Fluxo com bússola (medido nos pilotos como ordem de grandeza):

```
requisição do usuário
  ├─ embedding da query ............ 0 tokens de LLM (local)
  ├─ busca por cosseno ............. 0 tokens (álgebra local)
  ├─ lista de candidatos no prompt . ~60 tokens
  ├─ leitura do arquivo vivo certo . ~800 tokens (custo real, mas certeiro)
  └─ patch
```

Fluxo sem bússola, no caso de lexical gap: o agente gera hipóteses de vocabulário, greppa, lê arquivos errados, refina — cada rodada é um turno completo (raciocínio + tool call + resultado no contexto), tipicamente milhares de tokens até a localização. A bússola converte N turnos de adivinhação **dentro** da janela limitada em 1 consulta grátis **fora** dela.

---

## 3. Definição formal do D₀

### 3.1 Estados e universo

- **S₀** = estado do repositório no momento em que o índice RAG foi construído (identificado por um SHA de commit Git).
- **Sₜ** = estado atual do repositório em qualquer instante posterior.
- **U = S₀ ∪ Sₜ** = universo de análise: todos os arquivos relevantes presentes em *qualquer um* dos dois estados. Isso inclui necessariamente os quatro destinos possíveis de um arquivo:

```
PERSISTENTE   existia → existe (mudado ou intacto)   [índice: informação velha ou correta]
NOVO          não existia → existe                    [índice: cegueira total]
REMOVIDO      existia → não existe                    [índice: informação fantasma]
RENOMEADO     existia em path A → existe em path B    [índice: endereço errado]
```

### 3.2 A fórmula (V0, congelada)

$$
D_0(S_0, S_t) = \frac{\displaystyle\sum_{i \in U} \Big[ \ln(1 + L_i^{*}) \cdot \delta_i \Big]}{\displaystyle\sum_{i \in U} \ln(1 + L_i^{*})}
$$

onde, para cada arquivo *i*:

**Massa** — quanto o arquivo pesa na estrutura do software:

$$
m_i = \ln(1 + L_i^{*}), \qquad L_i^{*} = \max\big(LOC_i(S_0),\; LOC_i(S_t)\big)
$$

O uso do **máximo** entre os dois estados garante que arquivos novos (LOC em S₀ = 0) e removidos (LOC em Sₜ = 0) tenham massa cheia. O **logaritmo** faz o tamanho importar com retornos decrescentes: um arquivo de 10.000 linhas não vale automaticamente 100× um de 100 linhas, e um monstro isolado não domina a métrica.

**Intensidade de mudança** — quanto o arquivo se afastou de S₀:

$$
\delta_i = \min\!\left(1,\; \frac{\Delta_i^{+} + \Delta_i^{-}}{LOC_i(S_0) + LOC_i(S_t)}\right)
$$

com Δ⁺ = linhas adicionadas e Δ⁻ = linhas removidas, obtidas de `git diff --numstat S₀ Sₜ` **sem detecção de rename** (`-M` desligado — decisão deliberada da V0, ver 3.4).

### 3.3 Casos-limite (todos tratados e verificados na implementação)

| Caso | Comportamento | Mecanismo |
|---|---|---|
| Arquivo intacto | δ = 0; contribui massa apenas no denominador | ausente do numstat |
| Arquivo novo | δ = 1 **naturalmente** (todas as linhas aparecem como adicionadas: δ = Lₜ/(0+Lₜ) = 1) | sem bônus artificial |
| Arquivo removido | δ = 1 **naturalmente** (todas as linhas como removidas) | idem |
| Edição pesada | numstat pode contar linha editada como +1 e −1 simultaneamente, fazendo Δ⁺+Δ⁻ > L⁰+Lᵗ | clip `min(1, ·)` preserva δ ≤ 1 |
| Dois estados vazios | δ = 0 (denominador zero) | guarda explícita |
| Binários | excluídos (numstat reporta `-`); contados à parte como diagnóstico | filtro |
| LOC | nº de `\n` no blob, +1 se o blob não termina em newline e não é vazio | leitura direta do object database, sem checkout |

### 3.4 Renames: fraqueza conhecida e deliberadamente não corrigida na V0

Sem `-M`, um rename conta como remoção total + adição total (δ = 1 nos dois paths). Com `-M`, contaria como quase nada — mas os paths conhecidos pelo índice ficariam errados mesmo assim (deterioração de mapa sem churn). A V0 **registra** renames separadamente (`git diff -M50 --name-status`) como diagnóstico, sem corrigir a fórmula, seguindo o princípio de só adicionar variáveis após falha empírica demonstrada (candidato a termo de *Path Drift* em D₁).

### 3.5 Decomposição diagnóstica (não entra na fórmula — evita dupla contagem)

**Novelty (N)** — fração da massa atual completamente ausente do índice (*cegueira*):

$$
N = \frac{\sum_{i \in \text{Added}} m_i}{\sum_{i \in U} m_i}
$$

**Ghost Mass (G)** — fração da representação do índice apontando para código que não existe mais (*alucinação estrutural potencial*):

$$
G = \frac{\sum_{i \in \text{Deleted}} m_i}{\sum_{i \in U} m_i}
$$

Ambas **já estão contidas** em D₀ (arquivos added/deleted têm δ=1); são expostas separadamente porque são operacionalmente interessantes — a seção 9.2 mostra por quê.

### 3.6 Universo de arquivos (critérios pré-registrados)

Incluídos: extensões `.ts .tsx .js .mjs .cjs .sql` sob `client/ server/ shared/ api/ drizzle/ scripts/ lib/`. Testes (`*.test.ts`) **incluídos** (são código navegável). Excluídos, com justificativa documentada antes de qualquer medição: docs `.md`, assets binários, lockfiles, `dist/`, código morto arquivado, logs, patches — a bússola avaliada é de *navegação de código*, e essas categorias distorceriam a massa (o repo-laboratório tem 119 `.md` e ~145 imagens).

---

## 4. Propriedades matemáticas do D₀

Estas propriedades são o núcleo do valor teórico da formulação — independentemente do desfecho experimental:

**P1. Normalização: 0 ≤ D₀ ≤ 1.** Como 0 ≤ δᵢ ≤ 1 e mᵢ ≥ 0, o numerador nunca excede o denominador. D₀ é uma média ponderada — literalmente "fração da massa semântica ponderada que sofreu drift". Regra de projeto: qualquer componente futuro de δ deve permanecer em [0,1], sob pena de quebrar a propriedade.

**P2. Determinismo.** Mesmos S₀ e Sₜ → mesmo D₀, sempre. Sem LLM, sem amostragem, sem aproximação. O Git é o sensor; a fórmula é aritmética pura.

**P3. Medição de estado, não de atividade (reversibilidade).** D₀ compara estados, não conta eventos. Se o agente faz uma grande alteração e depois a reverte, D₀ **cai de volta** — porque a distância atual ao snapshot diminuiu. Contadores de commits e relógios de calendário só sabem subir. Esta propriedade é especialmente relevante em fluxo agêntico (tentativa → avaliação → revert é um padrão comum).

**P4. Invariância de escala do repositório.** O tamanho do repo entra naturalmente pelo denominador. Um arquivo novo de massa 10 gera drift de 10% num repo de massa 100 e de 0,1% num repo de massa 10.000 — sem nenhum `if repo_size`. Consequência estratégica: **thresholds (τ) são, em princípio, comparáveis entre projetos** — a única das métricas consideradas com essa pretensão (ver 8.3).

**P5. Independência do modelo.** D₀ depende apenas de S₀ e Sₜ. Não depende de modelo de linguagem, janela de contexto, número de interações ou tokens consumidos. Capacidade do modelo poderá modular o τ *tolerável* (um agente com orçamento folgado compensa bússola pior), mas nunca o D₀ em si. Lema da pesquisa: **"D₀ mede o repo, não o modelo."**

**P6. Custo desprezível.** Um `git diff --numstat` + leitura de tamanhos de blob: milissegundos, zero tokens, zero rede. Pode ser recalculado a cada interação sem pesar.

---

## 5. Princípios de projeto da pesquisa

Estes princípios governaram todas as decisões e devem governar as futuras:

**P-A. Anti-Megazord.** Não construir arquitetura sofisticada antecipadamente. A evolução é uma escada onde cada degrau precisa **pagar aluguel empírico**:

```
D₀ (V0): git diff + massa log(LOC). Sem AST, LSP, grafo, LLM, embeddings extras.
D₁: adiciona informação estrutural (símbolos, assinaturas, exports, path drift)
    — SOMENTE para corrigir falhas do D₀ identificadas empiricamente.
D₂: adiciona relações mínimas (grafo de imports, referências, blast radius)
    — SOMENTE se D₁ demonstrar insuficiência.
Regra de corte: se Vₙ₊₁ ≈ Vₙ em poder preditivo, mata-se a complexidade adicional.
```

**P-B. Tentar quebrar, não confirmar.** Buscar deliberadamente os casos adversos: reformatações massivas sem mudança funcional, mudanças de uma linha com grande impacto, renames sem churn, subsistemas novos, grandes deleções, arquivos enormes irrelevantes, arquivos pequenos centrais.

**P-C. Pré-registro e anti p-hacking.** Hipóteses, métrica primária, teste estatístico, α, fórmula e critérios de seleção congelados **antes** de qualquer medição de retrieval. Proibido trocar métrica, ajustar fórmula, remover checkpoints inconvenientes ou mudar teste após ver resultados. Análises adicionais explicitamente marcadas como exploratórias/pós-hoc. Benchmark congelado por hash SHA-256 antes da primeira busca.

**P-D. Ground truth nunca contaminado pelo retrieval.** Fluxo obrigatório: código → query → gabarito verificável → congelar → só então buscar. Jamais construir gabarito olhando resultados da busca.

**P-E. Honestidade de desfecho.** "p ≥ 0,05" reporta-se como "não encontramos evidência suficiente para rejeitar H₀", nunca "provamos H₀". Significância sem tamanho de efeito e sem vantagem sobre baselines triviais não valida a técnica.

---

## 6. Método experimental

### 6.1 Desenho geral: o Git como máquina do tempo

Em vez de fabricar alterações sintéticas, o histórico real do repositório é usado como fonte de estados: escolhe-se um commit histórico como S₀, e commits posteriores como S₁…Sₙ (checkpoints). Para cada checkpoint:

- **RAG(S₀)** permanece congelado → qualidade medida = Q_stale.
- **RAG(Sₜ)** é construído do zero como controle → qualidade = Q_fresh.
- Ambos avaliados com **as mesmas queries e o mesmo gabarito**, válidos naquele estado.

**Retrieval Loss:** `L_t = Q_fresh(t) − Q_stale(t)` — o prejuízo causado exclusivamente pelo envelhecimento do índice (tudo o mais idêntico por construção: mesmo modelo de embedding, mesmo chunking, mesma busca, mesmo top-k; a única variável é o código indexado).

A relação experimental central: **D_t ↔ L_t**.

### 6.2 Protocolo estatístico pré-registrado

```
α                = 0.05
Teste primário   = Spearman unilateral (ρₛ > 0)
Métrica primária = Recall@5 (em nível de ARQUIVO)
H₀: ρₛ(D₀, L) ≤ 0        H₁: ρₛ(D₀, L) > 0
```

Spearman porque não se assume linearidade — apenas monotonicidade (pode existir zona estável seguida de degradação brusca). Secundárias registradas (não decisórias): Recall@1/3/10, MRR, rank do primeiro relevante.

**Ranking em nível de arquivo:** score do arquivo = máximo da similaridade entre seus chunks; top-5 = cinco arquivos distintos de maior score. (A bússola aponta arquivos, não trechos.)

### 6.3 Baselines triviais obrigatórios

Para saber se a fórmula adiciona informação além de contadores burros:

| Baseline | Definição |
|---|---|
| B1 | arquivos alterados / arquivos do universo (união) |
| B2 | (linhas adicionadas + removidas) / (LOC(S₀) + LOC(Sₜ)) |
| B3 | commits desde S₀ (first-parent) |
| B4 | dias corridos desde S₀ |

Compromisso pré-registrado: se um baseline trivial predizer o Retrieval Loss tão bem quanto D₀, **isso deve ser admitido como resultado**, não escondido.

### 6.4 Benchmark de queries

46 queries em pt-BR simulando navegação real de coding agent ("Onde os Sparks são debitados?", "Onde o webhook do Stripe é verificado?"), cobrindo tipologia completa: regiões inalteradas, modificadas, adicionadas (cedo e tarde), deletadas, centrais, periféricas, infra, negócio, config, API, banco, auth, utilitários.

- Cada query possui **âncora verificável** (símbolo real confirmado por `git grep` nos estados históricos) e gabarito por arquivo.
- **Elegibilidade por estado:** query só é avaliada em Sₜ se a âncora existe no commit E ≥1 arquivo relevante existe — nunca se penaliza o índice por não achar um conceito que não existia. Conjunto relevante no estado = arquivos do gabarito existentes naquele commit.
- Congelado com `SHA-256 = a5732f25384ad45ba563d31736b1e1c3d0baa4d47d2c22aabcc567f61146b474` **após revisão e aprovação humana e antes de qualquer busca**. Mínimo de 28 queries elegíveis por estado (piso pré-definido: 15).

### 6.5 Seleção de checkpoints (regra objetiva, fixada antes de olhar D₀ ou retrieval)

Dois pontos de partida (replicação parcial dentro do mesmo repo):

- **S₀-A** = `d5b8462` (2026-02-26) — início estável; step 4 sobre `rev-list --first-parent --reverse` → 15 checkpoints cobrindo 4,5 meses.
- **S₀-B** = `ec3dbfd` (2026-06-15) — véspera de onda de refatoração; step 2 → 16 checkpoints em 3,5 semanas.

Total: 31 observações sobre 23 estados únicos. Regra: índice 1-based, i mod step = 0, + HEAD se ausente; nenhuma exclusão posterior sem justificativa documentada.

### 6.6 Infraestrutura (100% local e não destrutiva)

- Embeddings locais (sentence-transformers), pesos congelados → reprodutibilidade total, custo de API zero.
- Busca por **cosseno exato em força bruta** (NumPy) — sem ANN, eliminando ruído de aproximação que contaminaria L_t.
- Estados lidos **diretamente do object database do Git** (`ls-tree` + `cat-file`), sem nenhum checkout — o working tree jamais é tocado.
- Cache de embeddings por hash SHA-256 do conteúdo do chunk, compartilhado entre estados (ver descoberta 9.1).
- Critérios de parada pré-definidos, incluindo: Recall@5 fresh médio < 0,40 → parar e revisar instrumento antes de interpretar.

---

## 7. Testes realizados (PRELIMINARES)

> ⚠️ **Repetindo o aviso:** dois pilotos, um repositório, n=31 checkpoints dependentes, histórico humano de ritmo regular. Evidência inicial, não validação.

### 7.1 Piloto-1 (instrumento fraco — resultados inválidos por critério de parada)

Instrumento: `intfloat/multilingual-e5-small`, chunks de 60 linhas/overlap 10.

Resultados: ρₛ(D₀,L) = 0,555 (p=0,0006) no pool; baseline A ρ=0,767; **baseline B ρ=−0,236 (n.s.)** — aparente falha do D₀ na janela curta. Baselines triviais: 0,56–0,60.

**O critério de parada pré-registrado disparou:** Recall@5 fresh médio = 0,38 < 0,40 em ambos os baselines. O índice *fresco* já errava demais — parte do "loss" medido era ruído de retrieval fraco. Conforme protocolo, o piloto foi interrompido e o instrumento revisado. **Nenhuma conclusão do piloto-1 é aproveitável isoladamente** — mas ele deixou uma lição valiosa (ver 7.3).

### 7.2 Piloto-2 (instrumento válido)

Mudanças pré-registradas em `config/preregistration_pilot2.txt` **antes** da execução (únicas mudanças: instrumento): modelo `intfloat/multilingual-e5-base`; chunks de 25 linhas/overlap 5. Fórmula, benchmark, checkpoints e estatística idênticos. Artefatos isolados (`results-v2/`), piloto-1 preservado.

**Sanidade do instrumento:** Recall@5 fresh médio = **0,594** (piso 0,40 superado; nenhum critério de parada disparou).

**Teste primário:**

| | ρₛ(·, L) | p |
|---|---|---|
| **D₀ (pool, n=31)** | **0,546** | **0,0007 → rejeita H₀** |
| D₀ baseline A (n=15) | 0,750 | 0,0006 |
| D₀ baseline B (n=16) | 0,700 | 0,0013 |
| B1 arquivos alterados | 0,543 | 0,0008 |
| B2 churn de linhas | 0,603 | 0,0002 |
| B3 commits desde S₀ | 0,704 | <0,0001 |
| **B4 dias desde S₀** | **0,827** | **<0,0001** |

**Curva de desgaste** (exploratória, pós-hoc): taxa de acerto do top-5 do índice *stale* por faixa de D₀:

| D₀ | acerto stale top-5 | n |
|---|---|---|
| 0,00–0,15 | 60,7% | 28 |
| 0,15–0,30 | 58,6% | 353 |
| 0,30–0,45 | 55,5% | 463 |
| 0,45–0,70 | 38,1% | 381 |

**Magnitude do staleness:** baseline A (5 meses de drift, D₀ até 0,65): loss médio de Recall@5 = **0,22** (22 pontos percentuais). Baseline B (3,5 semanas): loss médio = 0,04.

**Atualizar nunca prejudicou no agregado:** zero checkpoints com loss negativo. (Por query, o índice velho venceu em 29,6% dos casos — efeito de *competição*: o índice novo conhece mais código e novos chunks semanticamente próximos disputam o top-5; ruído local, não vantagem sistemática do staleness.)

### 7.3 Os três achados estruturais dos pilotos

**Achado 1 — O fenômeno existe.** Drift observável (D₀) acompanha degradação real do retrieval de forma monotônica, consistente nos dois pontos de partida, com instrumento válido. A premissa fundacional da pesquisa ("existe relação mensurável") sobreviveu.

**Achado 2 — A anomalia do piloto-1 era ruído de instrumento.** A aparente falha do D₀ no baseline B (ρ negativo) desapareceu completamente com o instrumento consertado (−0,24 → +0,70). Lição de método: **sem o critério de parada pré-registrado, uma conclusão errada teria sido publicada** (e um D₁ desnecessário construído para "corrigir" um defeito que não existia). O protocolo se defendeu sozinho.

**Achado 3 — Mesmo D₀, prejuízo 5× diferente (a falha real e diagnóstica da V0).**

| Checkpoint | D₀ | Loss |
|---|---|---|
| A `374597f` (jun/19) | 0,49 | **0,248** |
| B `29a4e15` (jul/07) | 0,43 | 0,045 |
| B `f402518` (jul/10) | 0,45 | 0,055 |

Estados com distância quase idêntica ao respectivo S₀ produziram perdas radicalmente diferentes. Diagnóstico: o índice de fevereiro (A) **desconhece subsistemas inteiros que as queries perguntam** (pipeline de geração, editor novo — nasceram depois); o índice de junho (B) já contém quase tudo que se pergunta, e seu drift é majoritariamente *modificação de arquivos conhecidos*. Confirma a assimetria prevista na concepção original: **modificação causa imprecisão (a bússola ainda acha o bairro); adição causa cegueira (o conceito não existe no espaço vetorial)**. A V0 pesa os dois igualmente; a realidade, não. Este é o "caso X falhou" que o princípio P-A exigia antes de autorizar um D₁.

---

## 8. Interpretação honesta dos resultados

### 8.1 O que está demonstrado (no regime testado)

1. Índice desatualizado degrada mensuravelmente: até −22 p.p. de Recall@5 em 5 meses de drift acumulado.
2. D₀ correlaciona positiva e significativamente com essa degradação (ρₛ ≈ 0,55–0,75).
3. A degradação é monotônica ao longo das faixas de D₀ (curva de desgaste).
4. Atualizar o índice nunca piora o agregado — o "prejuízo de atualizar" é exclusivamente custo (computação/cota/latência), nunca qualidade.

### 8.2 O que está demonstrado CONTRA a hipótese (no regime testado)

1. **Métricas triviais empatam ou superam o D₀ como preditores** — o calendário (B4: ρ=0,83) venceu numericamente. Em repositório de ritmo regular, todos os medidores são "o mesmo medidor": as intercorrelações entre preditores ficaram entre 0,81 e 0,997 (D₀ vs B1 = 0,997 — rank-idênticos neste repo).
2. **A V0 é incompleta:** mesmo D₀ pode significar prejuízos muito diferentes dependendo da *composição* do drift (novelty vs modificação) e da sua sobreposição com a *demanda* (o que se pergunta).

### 8.3 A leitura que reconcilia tudo

O empate com o calendário **não generaliza por construção**: o calendário só funciona enquanto tempo e mudança andam juntos (desenvolvimento humano contínuo). Os regimes-alvo do D₀ — e do fluxo agêntico do harness — são exatamente onde eles se descolam:

- **Repo dormente que acorda:** calendário reindexa à toa na pausa e dorme na reescrita; D₀ fica 0 e depois dispara. Correto por construção.
- **Rajada agêntica:** uma tarde de agente = semanas de churn humano; dias parados em seguida. Calendário cego; D₀ mede.
- **Revert:** agente tenta, desfaz; D₀ cai de volta; contadores só sobem (P3).
- **Transferibilidade:** "reindexe a cada 30 dias" não significa nada entre repos diferentes; "τ = 0,3" sobre uma métrica normalizada em [0,1] tem chance de significar (P4) — única pretensão de threshold transferível entre as métricas consideradas.

**Ponto crítico de honestidade:** tudo isso é hoje **previsão fundamentada, não fato medido**. Os pilotos testaram o D₀ apenas no habitat natural do calendário. O habitat natural do D₀ nunca foi testado — e o histórico usado é pré-agêntico, enquanto o alvo da técnica é o fluxo agêntico. A validação decisiva está na seção 12.

### 8.4 Veredito operacional atual

| Uso do D₀ | Status | Fundamento |
|---|---|---|
| **Termômetro/telemetria** (medir estado do índice) | **Viável hoje** | fenômeno demonstrado; custo ~0; determinístico |
| **Dirty flags por arquivo** (subproduto δᵢ) | **Viável hoje** | não é previsão — é *fato* verificado pelo Git |
| **Gatilho de reindexação** (D₀ ≥ τ) | **Não justificado pelos dados atuais** | regra simples empata no regime testado; regime-alvo não testado |
| **Threshold transferível entre repos** | **Não testado** | exige multi-repo |

---

## 9. Descobertas colaterais relevantes

### 9.1 Reindexação incremental por hash de conteúdo é quase grátis

Ao construir os 24+24 índices dos pilotos com cache de embeddings por SHA-256 do chunk, estados vizinhos reutilizaram ~100% dos vetores (vários checkpoints registraram "0 novos embeddings"). **Evidência empírica de que o custo de refresh incremental é proporcional ao churn, não ao tamanho do repo.** Consequência estratégica: quando os embeddings são locais, a pergunta "quando reindexar?" quase se dissolve — reindexa-se incrementalmente a custo desprezível. O D₀ como gatilho só permanece central onde o reembedding é caro ou bloqueado (ex.: embeddings servidos pelo mesmo endpoint corporativo limitado). **O competidor real da política `D₀ ≥ τ` não é o calendário — é o refresh incremental.**

### 9.2 A assimetria Novelty/Modificação/Ghost tem consequência operacional própria

Os três tipos de drift causam problemas qualitativamente diferentes na bússola:

| Tipo | Efeito no índice | Mitigação sem reindexar |
|---|---|---|
| Modificado | imprecisão (aponta o bairro certo com detalhes velhos) | dirty flag → leitura viva obrigatória |
| Adicionado | **cegueira** (conceito ausente do espaço vetorial) | delta search lexical sobre arquivos novos |
| Removido | fantasma (sugere o que não existe) | ghost flag → candidato suprimido/rebaixado |

### 9.3 O índice maior compete consigo mesmo

29,6% das queries individuais tiveram rank *melhor* no índice velho — porque o índice novo, sabendo mais, tem mais candidatos semanticamente próximos disputando o top-5. "Mais atual" é monotonicamente melhor no agregado, não por query. Relevante para expectativas de UX: refresh não conserta toda busca individual.

### 9.4 Queries em pt-BR contra código em inglês funcionam

Todo o benchmark foi em português contra um codebase em inglês, via embedding multilíngue, atingindo ~60% de top-5 fresh sem nenhum refinamento de query. O lexical gap *inter-línguas* é atravessável — piso relevante para o harness, cujos usuários pensarão em português.

---

## 10. Arquitetura recomendada para o harness

Síntese de tudo: **usar hoje o que é fato; deixar em julgamento o que é previsão; fazer cada componente pagar aluguel no log.**

### 10.1 Camada 1 — Fatos por consulta (implementar já; não depende da ciência pendente)

O mesmo `git diff` que calcula D₀ produz o **mapa de δ por arquivo**. Cada resposta da bússola vem anotada:

```
[bússola] candidatos para "onde debita sparks":
  1. server/billing.ts        sim=0.89  δ=0.00  → LIMPO: confiável
  2. server/ai/pipeline.ts    sim=0.85  δ=0.72  → SUJO: leitura viva obrigatória
  3. server/oauth.ts          sim=0.81  δ=1.00  → FANTASMA: não existe mais
```

Custo: ~0. Não há threshold a calibrar — δ por arquivo é **fato**, não previsão. Com esta camada, o índice velho *para de mentir* muito antes de qualquer refresh, e o custo de staleness despenca — o que, por sua vez, torna a decisão de reindexar não-crítica.

Complementos da mesma camada: **delta search** (busca lexical sobre arquivos novos/sujos, fundida aos candidatos vetoriais — cobre a cegueira de novelty sem reembeddar) e **sinal de confiança global no prompt** (uma linha: `[índice: drift 0.42 | novelty 31% | ghost 6%]` — o agente calibra sozinho quanto confiar na bússola).

### 10.2 Camada 2 — Refresh (mecanismo simples até prova em contrário)

- **Embeddings locais disponíveis:** refresh incremental por hash de chunk (só reembedda o que mudou; custo ∝ churn — ver 9.1) + rebuild completo ocasional por gatilho simples (tempo ou % de massa dirty acumulada).
- **Embeddings caros/bloqueados (cenário corporativo):** gatilho simples por ora; promoção do D₀ a gatilho **condicionada aos logs** (camada 3).
- Após cada refresh: o estado atual vira o novo S₀ (novo SHA gravado), D₀ zera, ciclo recomeça — formalmente, uma sequência de snapshots S₀, S₁, …, Sₖ com Dₖ(t) = d(Sₖ, Sₜ).

### 10.3 Camada 3 — Telemetria longitudinal (o experimento decisivo embutido no uso)

Cada interação grava uma linha:

```json
{
  "ts": "...", "d0": 0.31, "novelty": 0.22, "ghost": 0.04,
  "dias_desde_s0": 12, "commits_desde_s0": 9,
  "rag_top5": ["..."], "alvo_real": "...",
  "rag_acertou_top5": true, "recuperado_por_grep": false,
  "search_calls": 3, "tokens_tarefa": 8400, "tarefa_ok": true
}
```

Note que grava **D₀ e os concorrentes triviais lado a lado**: a disputa "calendário × D₀" se re-executa continuamente, de graça, no regime certo (agêntico), com queries reais e a métrica que importa (tokens). Se emergir um joelho na curva acerto × D₀, o τ empírico nasce daqui — e o D₀ é *promovido* a gatilho por mérito medido, não por fé.

---

## 11. O pipeline de query: do prompt do usuário à localização

A qualidade da bússola depende tanto do índice quanto da **query** — e o usuário, por definição, descreve sintomas, não arquitetura. Esperar prompt bom é terceirizar engenharia para quem não tem o mapa. Cascata recomendada, em ordem de custo:

```
prompt do usuário
   │
   ├─ 1. EXTRAÇÃO BARATA (regex): identificadores, paths, trechos em crase
   │       achou termo de código? → grep direto (lupa sem bússola) ... 0 tokens
   │
   ├─ 2. ARRUMADOR DE QUERY: modelo pequeno LOCAL + mapa barato do repo
   │       (árvore de diretórios + 1 linha por módulo, cacheada, atualizada
   │        pelo mesmo git diff do D₀) reescreve a query no VOCABULÁRIO DO REPO
   │       ......................................... ~500 tokens locais (não-corporativos)
   │
   ├─ 3. EMBEDDA CRUA + ARRUMADA, funde candidatos (max-pool) ... 0 tokens
   │       [cinto de segurança: se o arrumador distorcer a intenção,
   │        a query crua segura o fallback — nunca fica pior]
   │
   ├─ 4. ANOTA candidatos com dirty/ghost flags ... 0 tokens (subproduto do D₀)
   │
   └─ 5. INJETA lista compacta no 1º call corporativo ... ~60 tokens
           + expõe a busca como ferramenta (pull) para o agente refinar
```

Decisões de projeto embutidas:

- **Critério de roteamento é vocabulário, não comprimento:** prompt com identificador exato → lupa direto; prompt puramente conceitual → bússola. Comprimento é proxy ruim.
- **O arrumador sem contexto do repo é meio-arrumador:** um modelo genérico melhora "botão azul" para "estilização de componente de botão" — ainda genérico. Com o mapa do repo, melhora para "ThemeButton, designTokens.colors.primary" — vocabulário *do código*. (Variante a testar: HyDE — o modelo pequeno escreve o *código hipotético* que resolveria o pedido e embedda-se isso; similaridade código-código supera NL-código.)
- **Push + pull em camadas:** empurra lista barata no 1º call (economiza o turno de localização no caso comum) e mantém a busca como ferramenta puxável (caso difícil).
- **Objetos que jamais entram no contexto da LLM:** vetores (nunca — são números sem significado para o modelo) e chunks velhos de arquivos sujos (entra o *apontamento* + leitura viva). Chunk de arquivo **limpo** (δ=0) pode entrar diretamente como otimização de segunda geração — é idêntico ao código vivo por definição.
- **Cada componente paga aluguel:** logar `acertou_com_query_crua` vs `acertou_com_query_arrumada` lado a lado (as duas buscas já rodam pela fusão). O log decide se o arrumador fica.

O padrão econômico unificador de toda a arquitetura: **gastar computação local ilimitada (cossenos, git diff, regex, modelo pequeno) para proteger cada token do recurso escasso (a janela corporativa).**

---

## 12. Roteiro de validação futura

Três testes, em ordem de custo, com critérios de decisão explícitos:

### Teste 1 — Assimetria da composição (minutos; dados já em disco)

Decompor o D₀ dos pilotos em componente-novelty e componente-modificação e correlacionar cada um com o loss separadamente. Se a massa nova dominar a predição (como o Achado 3 sugere), a direção do D₁ está confirmada quantitativamente antes de qualquer implementação.

### Teste 2 — O terreno certo (algumas horas; bateria já pronta)

Rodar a mesma bateria congelada em 2–3 repositórios open-source com histórico **irregular** de verdade: projeto que hibernou e voltou; projeto com big-bang refactor; projeto com rajadas. Critério de decisão objetivo:

- D₀ prevê o loss e o calendário não → **D₀ viável como gatilho**, com nicho demonstrado.
- Calendário empata mesmo lá → **D₀ morre como gatilho** (e permanece como telemetria); adota-se a solução simples com consciência limpa.

Limitação conhecida: ainda é histórico humano. Por isso:

### Teste 3 — Longitudinal no harness (decisivo; semanas/meses de uso real)

A telemetria da camada 3 (seção 10.3) acumulando observações do **regime agêntico real**, com queries reais e custo em tokens real. Único teste capaz de julgar a disputa no habitat para o qual o D₀ foi desenhado. Requisitos de rigor: definir *antes* o que conta como "bússola falhou"; logar baselines lado a lado; n na casa das centenas antes de qualquer corte de τ.

Hipótese de escopo registrada (a ser testada na fase agent-level): **o valor do D₀ cresce com a restrição de orçamento** — com janela folgada, grep compensa bússola ruim e o gatilho perde importância; com janela bloqueada, cada erro de bússola custa caro e o τ ótimo cai. Corolário: a técnica interessa mais a LLMs pequenas e a LLMs grandes servidas com bloqueio de janela — exatamente o ambiente-alvo.

---

## 13. Evolução prevista da fórmula: D₁ e D₂

Autorizada pelo Achado 3 (falha empírica documentada), a agenda do D₁ — cada item entra **individualmente** e só fica se melhorar a predição:

1. **Assimetria added/modified:** peso maior para massa nova (cegueira) que para massa modificada (imprecisão). Candidato: δ_added = 1 mantido, δ_modified escalado por fator < 1 calibrado, ou termo N com peso próprio validado contra dupla contagem.
2. **Ponderação por demanda:** drift restrito às regiões que a distribuição de queries efetivamente toca (a divergência A×B do Achado 3 é, no fundo, sobreposição entre drift e demanda). Aproximação barata: centralidade por referências — `m*ᵢ = mᵢ(1 + λ·log(1 + referencesᵢ))`.
3. **Path Drift:** termo pequeno para renames/moves (deterioração de endereço sem churn) — a fraqueza conhecida da V0, não estressada no repo-laboratório (0 renames no histórico).
4. **Símbolos (AST/tree-sitter):** δ informado por assinaturas alteradas, exports mudados, símbolos públicos removidos — a escada V1 da concepção original.

D₂ (grafo mínimo de imports/referências, blast radius) permanece **bloqueado** até que D₁ demonstre insuficiência específica. Regra de corte permanente: se Vₙ₊₁ ≈ Vₙ, mata-se a complexidade.

---

## 14. Riscos e ameaças à validade

**Dos resultados atuais:**

1. **Um único repositório** — nenhuma variação de linguagem, escala, domínio ou cultura de commit.
2. **Checkpoints dependentes** — S₂ compartilha código com S₁; n=31 não são 31 observações independentes; Spearman usado exploratoriamente; sem correção formal de dependência.
3. **Histórico pré-agêntico de ritmo regular** — o empate com o calendário pode ser artefato do regime; e o regime-alvo (agêntico) nunca foi testado.
4. **Ground truth autoral** — as 46 queries e gabaritos foram construídos por um LLM (com âncoras verificáveis e revisão humana antes do congelamento, mas ainda uma fonte de viés de seleção).
5. **Pooling de dois baselines** — parte da vantagem do B4 no pool decorre de o tempo separar perfeitamente os clusters A (velho e cego) e B (recente e míope); dentro de cada baseline, a diferença entre preditores é menor.
6. **Instrumento ainda modesto** — Recall@5 fresh de 0,59 deixa ruído; embeddings melhores estreitariam os intervalos.

**Do projeto como um todo:**

7. **Risco "dá na mesma":** empilhar componentes espertos (arrumador + bússola + flags + D₀) e empatar com "grep + reindexa toda sexta". Mitigação: princípio do aluguel — todo componente é logado contra sua ausência e cortado se não mover número.
8. **Risco de dissolução do problema:** se o refresh incremental local cobrir todos os cenários relevantes, o D₀-gatilho perde objeto (restando o D₀-telemetria). Isso seria um *bom* desfecho de engenharia, embora modesto como pesquisa.
9. **Risco de sofisticação prematura (Megazord):** a concepção original já flertou com pesos multi-termo, grafos e blast radius antes de qualquer medição. O protocolo de escada existe para conter exatamente isso.

---

## 15. Cenários de desfecho

| Cenário | Evidência necessária | Consequência |
|---|---|---|
| **Otimista** | Testes 2 e 3 mostram D₀ (ou D₁) prevendo onde calendário falha, com τ transferível entre repos | Técnica com nome próprio: política adaptativa de refresh publicável + componente central do harness; levar ao corporativo |
| **Intermediário** | D₀ empata como gatilho, mas telemetria/flags demonstram economia de tokens no longitudinal | Sem "inovação de fórmula", mas arquitetura drift-aware superior à prática comum; valor de engenharia real; possível publicação do resultado negativo honesto + arquitetura |
| **Pessimista** | Mesmo em regime irregular e agêntico, regras simples + incremental empatam | D₀ morre como gatilho; sobrevive como observabilidade barata; a pesquisa documenta *por que* não vale — que é conhecimento igualmente exportável |

Em todos os cenários, os subprodutos já garantidos: metodologia de avaliação stale/fresh reproduzível, dirty flags como mecanismo de confiança, evidência do custo real de staleness (−22 p.p./5 meses no regime testado) e a economia quantificada da bússola em ambiente restrito.

---

## 16. Artefatos e reprodução

```
experiments/semantic-drift/
├── SEMANTIC_DRIFT_D0.md              ← este documento
├── config/
│   ├── experiment.json               # config piloto-1 (universo, baselines, chunking, modelo)
│   ├── experiment_v2.json            # config piloto-2 (só instrumento difere)
│   ├── preregistration.txt           # protocolo congelado do piloto-1 + hash do benchmark
│   ├── preregistration_pilot2.txt    # mudanças de instrumento + compromissos adicionais
│   └── checkpoints.json              # 31 checkpoints selecionados pela regra objetiva
├── benchmark/
│   ├── queries.json                  # 46 queries congeladas (SHA-256 a5732f25…)
│   └── eligibility.json              # matriz query × estado (âncora + existência)
├── scripts/                          # Python 3.12, stdlib para D0; venv p/ retrieval
│   ├── gitutil.py                    # plumbing Git (ls-tree, cat-file, numstat) sem checkout
│   ├── select_checkpoints.py         # regra de seleção pré-registrada
│   ├── compute_d0.py                 # D0 + N + G + B1–B4  ← MOTOR TRANSPLANTÁVEL P/ O HARNESS
│   ├── validate_benchmark.py         # elegibilidade por estado
│   ├── build_index.py                # índices por estado, cache de embedding por hash de chunk
│   ├── run_retrieval.py              # stale × fresh, ranking por arquivo, métricas por query
│   └── analyze.py                    # Spearman pré-registrado + baselines + exploratórios
├── results/                          # piloto-1 (preservado intacto)
│   ├── checkpoints_d0.csv
│   ├── per_query.csv                 # 1.225 observações por query
│   └── final_dataset.csv
└── results-v2/                       # piloto-2 (mesmos formatos)
```

Reprodução: `python select_checkpoints.py && python compute_d0.py` (stdlib puro); retrieval requer o venv (`sentence-transformers`, `numpy`, `scipy`) e `EXP_CONFIG=experiment_v2.json` para o piloto-2. Baselines: S₀-A = `d5b84620…`, S₀-B = `ec3dbfd2…`, HEAD = `f4025186…`. Embeddings 100% locais; nenhuma chamada de API; o working tree jamais é tocado (leitura via object database).

**Nota de transplante:** `compute_d0.py` + `gitutil.py` são o motor do D₀ para o harness de produção — Git puro, sem dependências externas, milissegundos por cálculo.

---

## 17. Glossário

| Termo | Definição |
|---|---|
| **S₀ / Sₜ / Sₖ** | Estado do repo na indexação / estado atual / k-ésimo snapshot após refreshes sucessivos |
| **D₀ (SDS-v0)** | Semantic Drift Score, versão 0: média da intensidade de mudança ponderada por massa log(LOC), via Git diff |
| **Massa (mᵢ)** | Peso do arquivo na estrutura: ln(1 + max(LOC₀, LOCₜ)) |
| **δᵢ** | Intensidade de mudança do arquivo entre estados, em [0,1] |
| **Novelty (N)** | Fração da massa atual ausente do índice — *cegueira* |
| **Ghost Mass (G)** | Fração do índice apontando para código extinto — *fantasma* |
| **Retrieval Loss (L)** | Q_fresh − Q_stale: prejuízo causado exclusivamente pelo envelhecimento |
| **Stale / Fresh** | Índice congelado em S₀ / índice reconstruído em Sₜ (controle) |
| **Bússola / Lupa** | RAG (localização aproximada, 0 tokens) / grep+read (precisão sobre código vivo) |
| **Dirty flag** | Anotação por arquivo (δ > 0) que obriga leitura viva — fato, não previsão |
| **Delta search** | Busca lexical sobre arquivos novos/sujos, fundida aos candidatos vetoriais |
| **H_rag** | Retrieval Health: saúde da bússola medida pelo uso real (acertos/falhas logados) |
| **τ (tau)** | Threshold de refresh — deliberadamente não fixado; deve emergir de dados |
| **Lexical gap** | Distância de vocabulário entre a linguagem do usuário e a do código |
| **Arrumador** | Modelo pequeno local que reescreve a query do usuário no vocabulário do repo |
| **HyDE** | Reescrita da query como código hipotético, embedado no lugar da pergunta |
| **Anti-Megazord** | Princípio: complexidade só entra após falha empírica documentada da versão simples |
| **Aluguel empírico** | Regra: componente que não melhora número medido é removido |

---

*Documento vivo. Próxima revisão prevista após o Teste 1 (assimetria) ou o início da coleta longitudinal no harness — o que ocorrer primeiro. Histórico de decisões e resultados intermediários preservados nos pré-registros e CSVs referenciados, que este documento resume mas não substitui.*
