# [Nome do Módulo/Feature] — Spec v[N]

**Data:** [AAAA-MM-DD]
**Status:** Draft | In Review | Approved | Implemented | Deprecated
**Issue:** #[issue-number]
**PR:** #[pr-number]

---

## 📋 Contexto

[Descrição do problema ou oportunidade. Por que esta spec existe?]

---

## 🎯 Objetivos

[O que esta spec deve entregar. Lista de objetivos claros e mensuráveis.]

---

## 📐 Contrato de Interface

### Input

```typescript
// Tipo de entrada
interface Input {
  // campos
}
```

### Output

```typescript
// Tipo de saída
interface Output {
  // campos
}
```

### Comportamento

| Input | Output | Notas |
|-------|--------|-------|
| [caso 1] | [resultado esperado] | [edge cases] |
| [caso 2] | [resultado esperado] | [edge cases] |

---

## ✅ Critérios de Aceite

- [ ] Critério 1
- [ ] Critério 2
- [ ] Critério 3

---

## 🧪 Casos de Teste

### Cenário 1: [Nome]

**Dado:** [Pré-condições]
**Quando:** [Ação executada]
**Então:** [Resultado esperado]

```typescript
// Exemplo de teste
test('nome do teste', () => {
  // Arrange
  const input = {};

  // Act
  const result = execute(input);

  // Assert
  expect(result).toEqual({});
});
```

---

## 🔗 Dependências

- [Spec/Feature A] — Como esta spec depende de outra
- [Biblioteca X] — Versão mínima requerida
- [API Y] — Contrato externo

---

## 📝 Notas de Implementação

[Considerações técnicas para implementação. Restrições, trade-offs, etc.]

---

## 📊 Histórico de Revisões

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| v1 | [data] | [autor] | Criação |
| v1.1 | [data] | [autor] | Correção X |
