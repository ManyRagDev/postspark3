# 📝 Edição de Texto — Specs e Testes

**Status:** Em planejamento
**Metodologia:** Spec-Driven Development

---

## 📁 Estrutura

```
text-editing/
├── README.md                    # Este arquivo
├── 00-audit.md                  # Auditoria técnica atual (score: 58/100)
├── 01-spec-v1.md                # Spec v1: unificação + alinhamento (Fase 1)
├── 02-spec-v2.md                # Spec v2: propriedades avançadas (Fase 2)
├── implementation-plan.md       # Plano de implementação (4 fases, 34 SP + bugs)
├── tests/
│   ├── alignment.md             # Specs: Alinhamento (Fase 1.2, 6 TCs)
│   ├── text-styles.md           # Specs: Estilos de texto (Fase 2, 10 TCs)
│   ├── advanced-text.md         # Specs: Texto avançado (Fase 3, 10 TCs)
│   └── integration.md           # Specs: Integração entre blocos (Fase 1.1, 6 TCs)
```

---

## 🎯 Visão Geral

Módulo de edição de texto do PostSpark — especificações técnicas, casos de teste e plano de implementação baseados em auditoria profunda.

### Status Atual (Auditoria)

| Categoria | Score | Status |
|-----------|-------|--------|
| Tipografia Básica | 85% | ✅ |
| Tipografia Avançada | 20% | ❌ Inacessível |
| Dimensionamento | 75% | ⚠️ |
| Alinhamento Interno | 67% | ⚠️ |
| Posicionamento Canvas | 90% | ✅ |
| Funções Avançadas | 25% | ❌ |

**Score Geral:** 58/100 | **Meta:** 85/100

---

## 🚀 Plano de Implementação

| Fase | Esforço | Prioridade | Foco |
|------|---------|------------|-------|
| **Fase 1** | 8 SP | 🔴 Alta | Unificação (TextStyleBlock) + Alinhamento right |
| **Fase 2** | 13 SP | 🟡 Média | 5 propriedades órfãs + extensão headline/body |
| **Fase 3** | 8 SP | 🟢 Baixa | Letter-spacing, sombras, z-index |
| **Fase 4** | 5 SP | 🟢 Baixa | Refinamento (atalhos, presets, textTransform) |
| **Bugs** | 5 SP | 🔴🟡 | Primeiro clique (3 SP) + freePosition (2 SP) |

**Total:** 39 story points (34 features + 5 bugs)

---

## 📋 Especificações

### 01-spec-v1.md — Unificação + Alinhamento
- **Objetivo:** Criar `TextStyleBlock`, adicionar `right` ao alinhamento, sinalizar edição inline
- **Critérios:** 6 critérios de aceite
- **Cobre:** Fase 1 completa

### 02-spec-v2.md — Propriedades Avançadas
- **Objetivo:** Expor UI para fontWeight, fontStyle, textDecoration, lineHeight, opacity
- **Critérios:** 7 critérios de aceite
- **Cobre:** Fase 2 completa

---

## 🧪 Especificações de Teste

### Alinhamento (`tests/alignment.md`)
- **Fase:** 1.2
- **Casos:** 6 (TC-01 a TC-06)
- **Foco:** Alinhamento right global, por elemento, persistência

### Estilos de Texto (`tests/text-styles.md`)
- **Fase:** 2
- **Casos:** 10 (TC-01 a TC-10)
- **Foco:** fontWeight, fontStyle, textDecoration, lineHeight, opacity

### Texto Avançado (`tests/advanced-text.md`)
- **Fase:** 3
- **Casos:** 10 (TC-01 a TC-10)
- **Foco:** letterSpacing, textShadow, textStroke, zIndex

### Integração (`tests/integration.md`)
- **Fase:** 1.1
- **Casos:** 6 (TC-01 a TC-06)
- **Foco:** Migração FontColorBlock → TextStyleBlock, transições de contexto, regressão

---

## 🔗 Fluxo de Trabalho

```
1. Ler 00-audit.md → Entender estado atual
2. Ler implementation-plan.md → Entender roadmap
3. Para cada fase:
   a. Ler 0X-spec-vN.md correspondente
   b. Ler tests/*.md correspondente
   c. Implementar seguindo casos de teste
   d. Validar critérios de aceite
   e. Atualizar este README com progresso
```

---

## 📊 Progresso

| Fase | Spec | Testes | Implementação | Status |
|------|------|--------|---------------|--------|
| Fase 1.1 (TextStyleBlock) | ✅ | ✅ | ⏳ | 🟡 pronto para codar |
| Fase 1.2 (Alinhamento) | ✅ | ✅ | ⏳ | 🟡 pronto para codar |
| Fase 1.3 (Edição inline) | ✅ | ✅ | ⏳ | 🟡 pronto para codar |
| Fase 2 (Estilos avançados) | ✅ | ✅ | ⏳ | 🟡 pronto para codar |
| Fase 3 (Funcionalidades) | ⏳ | ✅ | ⏳ | 🟡 pronto para codar |
| Fase 4 (Refinamento) | ⏳ | ⏳ | ⏳ | 🔴 Não iniciado |
| Bug: primeiro clique | — | — | ⏳ | 🔴 Não iniciado |
| Bug: freePosition | — | — | ⏳ | 🔴 Não iniciado |

---

## 🧪 Matriz de Rastreabilidade

| Problema | Spec | Teste | Implementação |
|----------|------|-------|---------------|
| Fragmentação dos controles | `01-spec-v1.md` | `integration.md` TC-01 a TC-06 | Fase 1.1 |
| Alinhamento incompleto | `01-spec-v1.md` | `alignment.md` TC-01 a TC-06 | Fase 1.2 |
| Propriedades órfãs | `02-spec-v2.md` | `text-styles.md` TC-01 a TC-10 | Fase 2 |
| Letter-spacing ausente | — | `advanced-text.md` TC-01, TC-02 | Fase 3.1 |
| Sombras/contornos | — | `advanced-text.md` TC-03, TC-04, TC-07 | Fase 3.2 |
| z-index manual | — | `advanced-text.md` TC-05, TC-06 | Fase 3.3 |
| Primeiro clique desloca | `00-audit.md` §8 | — | Sprint 1 (bug) |
| freePosition limpo | `00-audit.md` §5 | — | Sprint 3 (bug) |

---

## 📝 Notas

- Todas as specs seguem o template em `../../template.md`
- Casos de teste escritos antes da implementação (TDD approach)
- Seletores de teste usam `data-layout-id` (atributo real do DOM via DraggableBlock)
- Critérios de aceite mensuráveis e testáveis

---

## 🔗 Relacionados

- [Auditoria completa](../../AUDITORIA_EDICAO_TEXTO.md) — Versão raiz da auditoria
- [Template de specs](../../template.md) — Formato padrão
- [Specs raiz](../README.md) — Metodologia spec-driven
