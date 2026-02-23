# Plano de Implementação: Design Transfer & Editability

## Estratégia
Implementar o padrão "Theme Ejection" na entrada do Workbench. O tema deixa de ser uma "máscara" imutável e passa a ser o "estado inicial" dos controles de edição.

## Componentes

### 1. `PostCard.tsx`
- Adicionar prop `forceVariationColors` (opcional).
- Atualizar consts `effectiveBg`, `effectiveText`, `effectiveAccent` para respeitar essa prop.

### 2. `WorkbenchRefactored.tsx`
- No `useState` de `variation`:
  ```typescript
  useState<PostVariation>(() => {
    if (initialTheme) {
      return {
        ...initialVariation,
        backgroundColor: initialTheme.colors.bg,
        textColor: initialTheme.colors.text,
        accentColor: initialTheme.colors.accent,
      };
    }
    return initialVariation;
  })
  ```
- Na renderização do `PostCard`: adicionar `forceVariationColors={true}`.

## Validação
1. Validar que Holodeck continua funcionando (não usa `forceVariationColors`, então prioriza Theme = OK).
2. Validar que Workbench abre com as cores do Tema nos Inputs e no Preview.
3. Validar que alterar cor no Input atualiza o Preview instantaneamente.
