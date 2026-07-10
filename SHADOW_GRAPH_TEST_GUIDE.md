# Guia de Testes do Shadow Graph - Fase 1

## 🎯 Objetivo

Estabelecer baseline de paridade entre o pipeline legado e o shadow graph antes de implementar a Fase 2 (snapshot server-side).

## 📋 Pré-requisitos

1. ✅ Fase 0 completa (duplicatas removidas, código limpo)
2. ✅ Coluna `events` adicionada em `generation_runs`
3. ✅ Shadow graph modificado para persistir eventos
4. ✅ Métricas agregadas implementadas
5. ✅ Endpoint admin disponível

## 🚀 Ativação Local

### 1. Habilitar Shadow Graph

Edite seu arquivo `.env`:

```bash
# Ativar shadow graph para auditoria
AI_GRAPH_SHADOW=true
```

### 2. Reiniciar o Servidor

```bash
pnpm dev
```

### 3. Verificar Logs

No console do servidor, procure por:

```
[Shadow Graph] Starting shadow graph audit...
[Shadow Graph] Shadow graph audit completed without divergence.
[Shadow Graph] Shadow graph audit found divergence.
```

## 📊 Plano de Testes

### Teste 1: Geração Básica (5 posts)

1. Acesse o aplicativo: `http://localhost:3000`
2. Faça login
3. Vá para `/thevoid`
4. Gere 5 posts com diferentes inputs:
   - Texto simples sobre marketing
   - Texto sobre vendas
   - Texto sobre produtividade
   - Texto sobre tecnologia
   - Texto sobre liderança

5. Para cada post, verifique no console:
   - ✅ `startingGenerationTrace`
   - ✅ `runGenerationShadowGraph` iniciando
   - ✅ `generation_graph_shadow` events
   - ✅ Eventos persistidos em `generation_runs`

### Teste 2: Posts Estruturados (5 posts)

1. Gere 5 posts com template estruturado:
   - Template: `feature-grid`
   - Template: `numbered-list`
   - Template: `step-by-step`

2. Verifique se shadow graph detecta:
   - ✅ Validação de 3 seções
   - ✅ Coerência de número (headline X sections)
   - ✅ Comprimento de label/description

### Teste 3: Carrossel (5 posts)

1. Gere 5 posts em modo carrossel:
   - 3 slides, 5 slides, 7 slides (testar validação)

2. Verifique se shadow graph detecta:
   - ✅ Validação de 5 slides
   - ✅ Validação visual por slide

### Teste 4: Posts Problemáticos (3 posts)

1. Tente gerar posts com problemas conhecidos:
   - Headline muito longa (>60 chars)
   - Sem CTA
   - Sem caption
   - Hashtags inválidas

2. Verifique se shadow graph detecta:
   - ✅ `copy_validation` errors
   - ✅ `copy_guards` aplicados
   - ✅ Events registrados

## 📈 Coleta de Métricas

### Endpoint Admin

Acesse o endpoint admin para ver métricas em tempo real:

```bash
curl -X POST http://localhost:3000/api/trpc/admin.getGenerationMetrics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"windowDays": 1}'
```

Ou via tRPC no frontend (se admin):

```typescript
const metrics = await admin.getGenerationMetrics({ windowDays: 1 });
console.log(metrics.shadowGraph);
```

### Métricas Importantes

```typescript
{
  shadowGraph: {
    totalShadowRuns: 15,           // Total de execuções
    shadowCompletedRuns: 12,       // Sem divergência
    shadowRejectedRuns: 3,        // Com divergência
    shadowFailedRuns: 0,          // Com erro
    shadowValidationErrors: 0,    // Erros de schema
    shadowCopyErrors: 2,          // Erros de copy
    shadowSectionsErrors: 1,      // Erros de seções
    shadowVisualFitErrors: 4,     // Erros visuais
    shadowGuardsAppliedRate: 0.2, // 20% tiveram guards
    shadowDivergenceRate: 0.2    // 20% divergência
  }
}
```

## 🎯 Baseline Aceitável

### Critérios de Sucesso

✅ **Shadow graph funciona sem crash**
- Sem erros de execução
- Eventos persistidos corretamente
- Métricas calculadas adequadamente

✅ **Taxa de divergência < 1%**
- Menos de 1 execução com divergência a cada 100
- Divergências explicáveis e documentadas
- Sem regressões silentes

✅ **Cobertura de validação**
- Todos os tipos de erro sendo detectados
- Guards sendo aplicados quando necessário
- Visual fit funcionando

### Critérios de Atenção

⚠️ **Taxa de divergência 1-5%**
- Investigar causas
- Documentar padrões
- Corrigir se necessário

⚠️ **Taxa de divergência > 5%**
- **BLOQUEIA Fase 2**
- Shadow graph precisa ser revisado
- Baseline não estabelecido

## 📝 Relatório de Testes

Após os testes, preencha este relatório:

### Data dos Testes: __/__/____

### Posts Gerados: ____

### Resultados:

- ✅ Total shadow runs: ____
- ✅ Completados sem divergência: ____
- ⚠️ Com divergência: ____
- ❌ Falharam: ____

### Taxa de Divergência: __%

### Observações:

1. __________________________________________________________________
2. __________________________________________________________________
3. __________________________________________________________________

### Problemas Encontrados:

1. __________________________________________________________________
2. __________________________________________________________________
3. __________________________________________________________________

### Decisão:

[ ] Baseline estabelecido - Prosseguir para Fase 2
[ ] Investigar divergências - Mais testes necessários
[ ] Corrigir shadow graph - Problemas encontrados

## 🔍 Troubleshooting

### Problema: Shadow graph não inicia

**Solução:**
```bash
# Verificar se a flag está ativa
curl http://localhost:3000/api/trpc/admin.getAiRollout
# Deve retornar AI_GRAPH_SHADOW: false se não estiver ativo
```

### Problema: Eventos não são persistidos

**Solução:**
```bash
# Verificar se a migration foi aplicada
psql $DATABASE_URL -c "\d postspark.generation_runs"
# Deve mostrar a coluna events
```

### Problema: Métricas vêm zeradas

**Solução:**
```bash
# Verificar se há eventos na tabela
psql $DATABASE_URL -c "SELECT id, jsonb_array_length(events) as event_count FROM postspark.generation_runs ORDER BY created_at DESC LIMIT 5;"
# Deve mostrar event_count > 0 para runs recentes
```

## ✅ Checklist de Validação

Antes de prosseguir para Fase 2:

- [ ] Shadow graph activado sem erros
- [ ] 15+ posts gerados com sucesso
- [ ] Eventos persistidos em todos os runs
- [ ] Taxa de divergência calculada
- [ ] Métricas visíveis no endpoint admin
- [ ] Documentação de padrões encontrados
- [ ] Baseline < 1% OU explicação aceitável
- [ ] Time deleadou revisou e aprovou

---

**Próximo Passo:** Se o baseline estiver estabelecido, você pode prosseguir para **Fase 2 - Snapshot Server-side**.
