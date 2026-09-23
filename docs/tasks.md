# Tarefas - Experiência Inteligente PostSpark

## Etapa 4 — Briefing persistente e inteligência de marca
- [x] Criar o contrato e schemas Zod `CreationBrief` (versionado) em `shared/postsparkSchemas.ts`.
- [x] Separar a tela de input bruto da tela de revisão da interpretação (Progressive Disclosure) em `StudioAppV2BPage`.
- [x] Adicionar lógica para persistir duravelmente (Storage / DB local ou remoto) o rascunho do briefing.
- [x] Recuperar rascunho após refresh na aba/perda de sessão.
- [x] Implementar a detecção de URLs embutidas no meio do texto e extrair referências.
- [x] Carregar a síntese de Brand Kit antes da geração.
- [x] Testes: Validação de refresh recuperando draft, URLs extraídas e alteração da interpretação do briefing.

## Etapa 6 — Fundo, crop e mídia
- [x] Estender tipagem do `CanvasPostModel` para suportar `BackgroundPlacement` (fitMode: cover | contain | original | custom, focalPoint, crop).
- [x] Criar controles de UI para enquadramento na Sidebar (desktop) e Drawer (mobile).
- [x] Refatorar manipulação de imagens no `CanvasPostStage.tsx` para preservar o asset original (URL/Storage) e aplicar manipulações visualmente, evitando uso abusivo de base64 no schema json.
- [x] Garantir que o export em formato ZIP/PNG offscreen respeite o crop não destrutivo.
- [x] Testes: Comprovar modos cover/contain, isolamento de crop por slide, exportação determinística.

## Etapa 7 — Paridade de textos e imagens livres
- [x] Tornar `onTransformEnd` persistente (salvar escala e translação no `CanvasPostModel` evitando o acúmulo infinito de transformações do Konva).
- [x] Implementar controles de ordem de camada (z-index/bring to front) e rotação/opacidade para elementos livres.
- [x] Corrigir rotina de duplicação para gerar UUIDs reais/novos, impedindo referência duplicada e crash visual.
- [x] Assegurar paridade das funções (documentCommands.ts) para Mobile.
- [x] Testes: `onTransformEnd` perene pós-save, duplicação não destrutiva.

## Etapa 8 — Editor assistido e produtividade
- [x] Implementar Autosave: debouncer configurado, estado visual (`dirty`, `saving`, `saved`, `error`), e controle de concorrência com `updatedAt`.
- [x] Implementar sistema de Undo/Redo baseado no `CanvasPostModel` centralizado (historico de patches em memória).
- [x] Implementar reordenação drag-and-drop de slides preservando a Capa.
- [x] Testes: Concorrência de AutoSave não gerando duplicação e undo/redo consistentes.

## Etapa 9 — Hardening, rollout e documentação
- [x] Auditoria final: revisão estrutural do `DOCUMENTO_MESTRE.md` e limpeza de artefatos temporários.
- [x] Escrita da matriz de testes E2E finais.
