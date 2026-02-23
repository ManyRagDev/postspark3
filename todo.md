# PostSpark V2 - TODO

- [x] Tema Thermal Electric (cores, tipografia, glassmorphism, glow effects)
- [x] Schema DB para posts, variações e histórico
- [x] Estado 1 - The Void: input inteligente central com detecção de tipo
- [x] Estado 1 - Fagulhas flutuantes animadas com Framer Motion
- [x] Estado 1 - Feedback visual (laranja para texto, ciano para URL, roxo para imagem)
- [x] Backend - Rota tRPC para geração de conteúdo via LLM
- [x] Backend - Scraping de URL (extração de título, descrição, imagem)
- [x] Backend - Geração de imagens via API
- [x] Backend - Persistência de posts no banco de dados
- [x] Backend - Upload e armazenamento S3
- [x] Estado 2 - HoloDeck: stack 3D de cards com variações geradas
- [x] Estado 2 - Navegação por swipe/gestos touch
- [x] Estado 2 - Transições fluidas entre cards
- [x] Estado 3 - Workbench: editor completo com preview em tempo real
- [x] Estado 3 - Controles de customização (texto, cores, fontes, layout)
- [x] Estado 3 - Templates multi-plataforma (Instagram, Twitter, LinkedIn, Facebook)
- [x] Estado 3 - Exportação de posts finalizados
- [x] Autenticação Manus OAuth integrada
- [x] Animações Framer Motion entre estados (fade, scale, blur)
- [x] Design responsivo mobile-first com gestos touch
- [x] Testes Vitest para rotas backend

## Responsividade Mobile/Desktop

- [x] Layout mobile para The Void (input grande, sugestões em grid vertical)
- [x] Layout desktop para The Void (input central, sugestões em linha)
- [x] Layout mobile para HoloDeck (cards full-width com swipe, controles embaixo)
- [x] Layout desktop para HoloDeck (cards 3D com stack, navegação lateral)
- [x] Layout mobile para Workbench (preview full-width, SuperDock como drawer/modal)
- [x] Layout desktop para Workbench (layout split: preview esquerda, SuperDock direita)
- [x] Testar responsividade em múltiplos breakpoints (320px, 768px, 1024px, 1440px)

## ThemeEngine & ChameleonProtocol

- [x] Instalar Google Fonts (Playfair Display, Space Mono, Anton, Nunito, Quicksand, Garamond)
- [x] Criar lib/themes.ts com interface ThemeConfig e 8 presets visuais
- [x] Implementar ChameleonProtocol: scraping de URL com extração de cores e logo
- [x] Implementar lógica de detecção de categoria de fonte (serif/sans/display)
- [x] Implementar 3 Cartas: Brand Match, Remix Seguro, Remix Disruptivo
- [x] Criar ThemeRenderer component com efeitos (glitch, glow, noise, grid)
- [x] Integrar ThemeEngine ao PostCard para renderizar temas
- [x] Testes Vitest para ThemeEngine e ChameleonProtocol (18 testes passando)
- [x] Remover sugestões de The Void para manter experiência minimalista e mágica
- [x] Configurar input do The Void para manter sempre 1 linha com scroll horizontal

## Fluxograma Completo - Implementação

- [x] Análise de sentimento no Caminho A (Texto) - sentiment.ts
- [x] Seleção de 3 presets antes de gerar (Caminho A) - PresetSelector.tsx
- [x] Modo Diretor vs Modo Deus com toggle - WorkbenchModeToggle.tsx
- [x] Grid Visual 3x3 na aba Layout - LayoutGrid.tsx
- [x] Controle de Ratio Img/Txt (30-70%) - ImageTextRatioSlider.tsx
- [ ] Inline Toolbar para edição de texto/imagem
- [ ] Focus Lift (navegação por teclado)
- [x] Painel de Layers (Modo Deus) - LayersPanel.tsx
- [x] Magnet ON/OFF para alinhamento automático - MagnetToggle.tsx
- [x] Entrada de Hex Codes (Modo Deus) - HexColorInput.tsx
- [x] Testes Vitest para sentiment analysis (29 testes passando)


## Melhorias de UX - Cards 3D Stacked

- [x] Efeito 3D stacked cards no HoloDeck (offset, perspectiva, reveal, drop-shadow)
- [ ] Separar estrutura de post: headline | corpo | CTA | hashtags (metadata)
- [ ] Seletor de layouts pré-prontos ("Escolher um dos nossos layouts")
- [ ] Detecção de estilo visual da URL (neubrutalist, minimalista, neon, etc.)
- [ ] Reorganizar botões do card: Gerar Imagem | Editar | Escolher Layout


## Melhorias de UX - Visualização e Estilos

- [x] Ajustar visualização dos cards empilhados para mostrar cards de trás parcialmente (offset aumentado)
- [x] Adicionar botão "Outros estilos" para selecionar entre os 8 presets do ThemeEngine
- [x] Aplicar tipografia, tamanhos e alinhamentos únicos para cada preset (PostCard + StyleSelector)
- [x] Encurtar textos gerados: remover hashtags do corpo do post (LLM prompt atualizado)
- [x] Criar headlines curtos e práticos para redes sociais (máx 80 caracteres)
- [x] Separar hashtags como metadata (campo separado no JSON)
