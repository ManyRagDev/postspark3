# PostSpark - Backlog Pos-MVP

Este documento concentra iniciativas que nao fazem parte do escopo imediato de lancamento, mas que devem ser revisitadas apos o periodo de MVP.

Objetivo:

- registrar ideias sem perder contexto
- evitar dispersao entre notas soltas
- priorizar evolucoes estruturais do produto
- facilitar transicao do MVP para uma fase de expansao

## Como usar

- adicionar novos itens sempre com contexto curto e objetivo claro
- marcar prioridade com `P1`, `P2` ou `P3`
- usar status para acompanhar maturidade da ideia
- evitar detalhamento tecnico excessivo antes da hora

### Prioridades

- `P1`: importante para a proxima fase do produto
- `P2`: desejavel, mas nao urgente
- `P3`: exploratorio ou opcional

### Status

- `Backlog`
- `Refinar`
- `Planejado`
- `Implementando`
- `Concluido`
- `Descartado`

---

## 1. Billing e Pricing

### 1.1 Agency como plano operacional

- Prioridade: `P1`
- Status: `Backlog`
- Objetivo: transformar `AGENCY` em um plano orientado por operacao, nao apenas por volume de Sparks.
- Escopo esperado:
  - multi-brand workspace
  - gerenciamento de clientes
  - colaboracao em equipe
  - bibliotecas de identidade visual
  - geracao em lote
  - exportacao em massa

### 1.2 Regra formal de rollover e expiracao

- Prioridade: `P1`
- Status: `Backlog`
- Objetivo: consolidar de forma definitiva a regra de expiracao entre `START`, planos pagos e top-ups.
- Observacao: manter a comunicacao comercial simples sem gerar ambiguidade.

### 1.3 Portal de billing mais completo

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: evoluir a area de billing com historico, consumo, recorrencia e clareza de saldo.
- Itens desejados:
  - historico de transacoes de Sparks
  - previsao de consumo mensal
  - comparativo de planos
  - visibilidade clara de top-ups comprados

### 1.4 Limpeza de legado na Stripe

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: revisar produtos e prices legados para manter a conta Stripe organizada.
- Observacao: fazer isso com cuidado por causa de itens antigos ainda potencialmente vinculados.

---

## 2. Produto e Experiencia

### 2.1 Gerar primeiro post sem login

- Prioridade: `P1`
- Status: `Backlog`
- Objetivo: reduzir friccao de entrada e aumentar ativacao no topo do funil.
- Consideracoes:
  - guest session
  - limite por IP/dispositivo
  - salvamento temporario
  - CTA de cadastro apos experiencia inicial

### 2.2 Onboarding orientado a ativacao

- Prioridade: `P1`
- Status: `Backlog`
- Objetivo: aumentar conversao de novos usuarios ate o momento "UAU".
- Possiveis componentes:
  - fluxo guiado de primeiro uso
  - templates iniciais
  - exemplos prontos por nicho
  - CTA contextual para upgrade

### 2.3 Dashboard de uso e performance

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: dar ao usuario visibilidade sobre producao, economia de Sparks e consistencia de uso.

### 2.4 Biblioteca de ativos e identidades

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: permitir reaproveitamento de marcas, estilos, assets e configuracoes visuais.

---

## 3. Criacao e Automacao

### 3.1 Geracao de series completas de posts

- Prioridade: `P1`
- Status: `Backlog`
- Objetivo: gerar conjuntos de posts conectados por tema, objetivo ou campanha.

### 3.2 Planejamento editorial automatizado

- Prioridade: `P1`
- Status: `Backlog`
- Objetivo: transformar o PostSpark em ferramenta de planejamento, nao apenas de execucao.
- Saidas esperadas:
  - calendario editorial
  - sugestao de pautas
  - sequencias de conteudo

### 3.3 Geracao em lote

- Prioridade: `P1`
- Status: `Backlog`
- Objetivo: permitir producao em escala para perfis com necessidade de alto volume.
- Dependencia: deve ser coordenado com o futuro plano `AGENCY`.

### 3.4 Automacao por objetivo de negocio

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: gerar conteudos com foco em metas como captacao, autoridade, engajamento ou venda.

---

## 4. Colaboracao e Operacao

### 4.1 Times e permissao por papel

- Prioridade: `P1`
- Status: `Backlog`
- Objetivo: permitir operacao multiusuario com niveis de acesso.
- Papeis possiveis:
  - owner
  - admin
  - editor
  - viewer

### 4.2 Fluxo de aprovacao

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: criar etapas de revisao e aprovacao antes da exportacao ou publicacao.

### 4.3 Workspace multi-cliente

- Prioridade: `P1`
- Status: `Backlog`
- Objetivo: organizar operacoes por cliente, marca ou unidade de negocio.

### 4.4 Biblioteca compartilhada por workspace

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: compartilhar logos, paletas, templates e referencias entre membros do time.

---

## 5. Dados, Inteligencia e Insights

### 5.1 Analise de consumo de Sparks

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: entender o padrao de uso por perfil e calibrar pricing com dados reais.

### 5.2 Recomendacao automatica de plano

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: sugerir upgrade, top-up ou manutencao de plano com base no comportamento do usuario.

### 5.3 Metricas de ativacao e conversao

- Prioridade: `P1`
- Status: `Backlog`
- Objetivo: medir o funil completo desde primeira geracao ate upgrade pago.

### 5.4 Segmentacao por perfil de uso

- Prioridade: `P3`
- Status: `Backlog`
- Objetivo: identificar clusters como criador casual, profissional recorrente e operacao de agencia.

---

## 6. Operacoes Internas

### 6.1 Revisao periodica de pricing

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: revisar periodicamente custo por Spark, margem e aderencia do modelo a uso real.

### 6.2 Higiene de configuracoes externas

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: manter Stripe, Supabase e demais sistemas externos sem legado desnecessario.

### 6.3 Documentacao viva de produto

- Prioridade: `P2`
- Status: `Backlog`
- Objetivo: consolidar regras de negocio, pricing, trials e billing em documentos unicos e atualizados.

---

## 7. Ideias em Observacao

Use esta secao para registrar ideias ainda pouco maduras.

### Template de item

- Prioridade: `P3`
- Status: `Backlog`
- Objetivo: descrever em uma frase o problema ou oportunidade.
- Observacao: adicionar contexto minimo para lembrar por que a ideia foi registrada.

