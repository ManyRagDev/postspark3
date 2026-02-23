# Tasks - Fix Positioning Consistency

- [ ] Refatorar `PostCard.tsx` para centralizar lógica de posicionamento absoluto
  - [ ] Criar componente/helper `ArchitectLayer` que encapsula o posicionamento
  - [ ] Garantir que `ArchitectLayer` suporta todas as 9 posições corretamente
- [ ] Aplicar `ArchitectLayer` em todos os layouts:
  - [ ] Story (9:16)
  - [ ] Centered (1:1, 5:6)
  - [ ] Left-Aligned (1:1, 5:6)
  - [ ] Minimal (1:1, 5:6)
  - [ ] Split (1:1, 5:6) - **Adicionar suporte faltante**
- [ ] Verificar consistência visual entre formatos (1:1 vs 5:6 vs 9:16)
