# DOCUMENTO_MESTRE — PostSpark 3

> **Status do Documento:** Documento-Mestre Canônico e Fonte Primária da Verdade (Single Source of Truth).  
> **Revisão:** 2026-09-14 — Roteamento multimodelo por responsabilidade implementado sem reintroduzir grafo.
> **Pendência registrada (2026-09-08):** Plano da integração local "PostSpark Bridge" aprovado — [`docs/plano-postspark-bridge.md`](./docs/plano-postspark-bridge.md). Cada fase concluída vira nova seção §13.x neste documento.  
> **Plano em execução (2026-09-12):** Qualidade editorial da IA — [`docs/plano-qualidade-editorial-ia.md`](./docs/plano-qualidade-editorial-ia.md). A Fase 0C de roteamento multimodelo foi implementada; contrato semântico e avaliação humana seguem pendentes.
> **Regra Mandatória (AGENTS.md):** Todo agente ou desenvolvedor deve consultar este documento antes de alterações e atualizá-lo sempre que houver mudanças arquiteturais, estruturais, de contratos ou de rotas.

---

## 1. Propósito e Filosofia do Sistema

O **PostSpark 3** é uma plataforma full stack de alta performance para direção de arte, geração generativa, edição visual direta e exportação em alta fidelidade de posts e carrosséis para redes sociais.

O sistema combina inteligência semântica de marca (**Brand DNA**), diagramação determinística de design editorial (**14 Famílias Visuais Oficiais**) e uma prancheta vetorial nativa em 2D (**Konva Canvas**).

### O que o PostSpark É:
- Uma aplicação full stack coesa: frontend React 19/Vite (`client/`), backend Express/tRPC (`server/`) e contratos compartilhados estritos (`shared/`).
- Uma máquina de geração com **latência ultrabaixa (2 a 4s)** em chamada generativa única.
- Um estúdio de acabamento visual tátil com prancheta interativa, texturas nobres e exportação em 4K.
- Um sistema seguro com persistência transacional direta no PostgreSQL via Supabase e billing por Stripe.

### O que o PostSpark NÃO É (Invariantes de Arquitetura):
- **NÃO é um wrapper genérico de ChatGPT**: não expõe telas de chat nem formulários de prompt cru; a geração é guiada por teses de copywriting, arquétipos visuais e regras de direção de arte.
- **NÃO usa filas assíncronas, cron jobs ou workers dedicados**: todo o fluxo de geração e edição opera de forma síncrona e determinística.
- **NÃO usa Drizzle ORM em runtime**: `drizzle/` existe apenas como histórico declarativo de migrações SQL. Em runtime, todas as operações de banco utilizam o cliente oficial `@supabase/supabase-js` em `server/db.ts`.
- **NÃO possui múltiplos normalizadores visuais**: há apenas uma fonte da verdade após a geração (`PostVisualSnapshot` no fluxo legado; `CanvasPostModel` no editor oficial — ver §3).

---

## 2. Arquitetura Técnica e Stack Real

| Camada | Tecnologia Principal | Papel no Sistema |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite, TailwindCSS, Framer Motion, GSAP | Interface reativa, animações físicas e navegação |
| **Motor Gráfico** | Konva 2D (`react-konva`, `konva`) | Prancheta gráfica vetorial, manipulação direta de camadas, guias magnéticas e renderização 4K |
| **Animação & 3D** | GSAP (`gsap@3.14.2`), Ticker 120 FPS | Palco 3D cilíndrico côncavo com inércia por scroll (`/stage-3d`) |
| **Tipografia & Métrica**| `fontkit`, Google Fonts | Medição idêntica de caixas de texto entre servidor e prancheta (`ResolvedTextBlock`) |
| **Estado Global** | Zustand (`editorStore.ts`), React Query | Estado autoritativo do editor e cache de chamadas tRPC |
| **Backend & API** | Node.js, Express, tRPC (`@trpc/server`) | Procedures com tipagem estrita de ponta a ponta |
| **Orquestrador de IA** | `server/_core/llm.ts`, `generationOrchestrator.ts` | Cascata resiliente de LLMs (OpenRouter ➔ Groq ➔ Gemini) |
| **Persistência Runtime**| Supabase Client (`@supabase/supabase-js`) | Acesso direto ao PostgreSQL e Storage de assets |
| **Autenticação** | Supabase Auth + Cookie Bridge HTTP-only | Sessão segura sincronizada entre cliente e servidor |
| **Billing & Planos** | Stripe SDK & Webhooks | Gestão de assinaturas Pro/Agency e recargas de `Sparks` |
| **Deploy & Serverless** | `api/index.js` (esbuild bundle) | Entrypoint serverless compatível com Vercel e Railway |

---

## 3. Fonte Única da Verdade: `PostVisualSnapshot` (legado) e `CanvasPostModel` (editor oficial)

### 3.1 Fluxo legado (`PostVisualSnapshot`) — INATIVO EM ROTA
Após o procedimento `post.generate` (fluxo legado Home/HoloDeck/WorkbenchV2, hoje **sem rota montada**), cada variação atravessa o normalizador canônico em `client/src/lib/variationSnapshot.ts` e torna-se um **`PostVisualSnapshot`**. Regras:
1. **Consumo Unificado**: HoloDeck, Workbench, exportação, salvamento, histórico e banco de dados consomem o **mesmo** snapshot.
2. **Proibição de Recálculos Locais**: Renderers **não podem** remover `designTokens`, recalcular prioridades de cor, inventar layouts arbitrários ou reconstruir fundos.
3. **Zustand como Guardião**: `visualSnapshot` é documento autoritativo; edições atualizam-no atomicamente.
4. **Isolamento de Carrossel**: overrides de slides residem exclusivamente em `slides[].editorState`.
5. **Versionamento**: alterações estruturais exigem incremento de `snapshotVersion` + migração via `client/src/lib/snapshotMigration.ts`.

### 3.2 Editor oficial CanvasLab (`CanvasPostModel`) — ATIVO
⚠️ **Decisão do dono (2026-09-05):** o fluxo **Home → HoloDeck → WorkbenchV2 é legado órfão** (não há rota montando `Home.tsx`). O editor oficial é o **CanvasLab** (`client/src/pages/CanvasLab/`), motor Konva (`CanvasPostStage.tsx`), acessado em `/thevoid` → `StudioAppV2BPage` (`create → gallery → editor`). O termo "workbench" é histórico; "HoloDeck" corresponde hoje a `StudioGalleryView` (desktop) / `StudioMobileFlashcards` (mobile). O guia de referência técnica do motor reside em [`konva.md`](./konva.md) e na skill `.agent/skills/konva-engine-guide/`.

Regras mandatórias do editor oficial:
1. **`CanvasPostModel` é o documento autoritativo** do editor (`client/src/pages/CanvasLab/components/types.ts`). Toda mutação passa pelo funil `CanvasLabPage.handleUpdatePost`.
2. **Guardião de Contraste (`lib/contrast.ts`)**: regra mandatória de usabilidade — fundo escuro ⇄ texto claro e vice-versa, **incluindo as metades do brutal-split** (título contra `background`, corpo contra `accent`). Executa em mudança de fundo, acento ou família (`patchTouchesContrast`). Escolhas manuais do usuário (flags `manualHeadlineColor`/`manualSubtextColor`) são preservadas e apenas sinalizadas com selo "contraste baixo".
3. **Estilos pré-definidos nunca alteram cores**: `applyFamilyPreset` (`lib/familyPreset.ts`) aplica família alterando APENAS tipografia/composição; `background` e `accent` são preservados; `surface` só entra como fallback. Usar este helper (nunca reimplementar a lógica nos componentes).
4. **Estabilidade de layout e resize previsível**: `CanvasPostStage` adota distribuição harmônica e centrada somente para o posicionamento inicial. A partir da primeira edição direta ou transformação, as posições efetivas de título, corpo e barra são congeladas no slide. A largura controla exclusivamente o word wrap; o motor não reduz a fonte implicitamente durante digitação ou resize. O subtítulo do split nasce no mínimo na linha de corte de 50%, e o usuário mantém controle total via drag-and-drop livre.
5. **Persistência**: salvamento via `post.save`/`post.update` com o modelo completo na coluna `canvas_model` (drizzle/0016) — reabertura com fidelidade total via `savedPostToCanvasModel`.
6. **Efeitos de Legibilidade Tipográfica (10 Estilos Oficiais)**: Para fotos e fundos com textura ou detalhes ricos (onde o cálculo de cor sólida é insuficiente para garantir leitura), o editor disponibiliza 10 estilos de realce aplicáveis livremente ao Título, Corpo ou Ambos (`headlineEffect`, `subtextEffect`):
   - *Básicos*: `none` (Normal), `shadow` (Sombra suave projetada com blur 12), `outline` (Contorno/stroke nítido com `fillAfterStrokeEnabled`).
   - *Caixas & Formas*: `box-card` (Cartão com cantos arredondados e preenchimento suave), `box-pill` (Pílula cápsula 999px), `box-glass` (Vidro fosco glassmorphism translúcido), `box-accent` (Caixa na cor primária da marca com texto contrastante automático), `box-brutal` (Tarja neobrutal com cantos vivos e sombra preta sólida de 3px).
   - *Atmosféricos & Dinâmicos*: `scrim` (Gradiente/vinheta suave sem bordas geométricas duras), `strip-line` (Tarjas ajustadas por linha de texto estilo Stories).
7. **Edição Direta On-Canvas (Konva autoritativo)**:
   - Duplo clique no Desktop ou duplo toque no Mobile sobre Título, Subtítulo, Badge ou Texto Extra inicia a edição sem ocultar nem substituir o nó visual do Konva.
   - Um `<textarea>` de 1×1, invisível e fora da área visual, existe apenas como ponte nativa de teclado, clipboard e IME. Ele não desenha uma segunda cópia do texto.
   - Texto, word wrap, seleção e caret são desenhados no próprio Konva a partir da mesma geometria de `lib/richTextLayout.ts`; a caixa não muda de forma ou posição ao entrar/sair do modo de edição.
   - A seleção no palco alimenta a barra flutuante de cor, tamanho, negrito, itálico e limpeza; o feedback aparece imediatamente no texto Konva. `Concluir`, `Ctrl/Cmd+Enter` ou clique fora persistem; `Esc`/`Cancelar` descartam o rascunho.
   - Texto e chunks ricos são persistidos em uma única mutação de `CanvasPostModel`, produzindo uma única entrada de Undo/Redo e de autosave.

8. **Progresso Realista de Geração (`ProductionOverlay`)**:
   - Eliminação do temporizador linear artificial de 2,6s que congelava em 96%.
   - Implementação de curva assintótica suave multi-fase baseada no tempo real (`elapsedSeconds`): 0s-3s (12%→32%), 3s-8s (32%→62%), 8s-16s (62%→84%), 16s-28s (84%→94%) e 28s+ (desaceleração contínua até 98% sem nunca congelar).
   - Esteira de 6 mensagens de status contextualizadas sincronizadas com a geração real de copies, arquétipos e síntese visual, preservando o tutorial rotativo (`LoadingTutorial`) e os chips de sugestão.

9. **Menu do Usuário e Saldo de Sparks Persistente (`UserTopMenu`)**:
   - O menu de conta, saldo de Sparks em tempo real (`billing.getProfile`), plano, perfil, posts salvos (`/saved-posts`), histórico (`/history`) e logout é persistente e acessível em todas as telas da aplicação.
   - Na tela de criação do Studio (`StudioCreateViewV2B`), fica ancorado no canto superior direito (`fixed top-3.5 right-4 md:right-6`).
   - Na galeria de direções (`StudioGalleryView` e `StudioMobileFlashcards`), é embutido diretamente no header superior ao lado do seletor de formatos.
   - No editor do CanvasLab (`CanvasTopBar`), é embutido no canto direito da barra superior, depois das ações globais de edição e salvamento.
   - Em todas as demais páginas do sistema (`/saved-posts`, `/history`, `/billing`, `/pricing`, etc.), o menu flutuante global permanece permanentemente ativo e ancorado no topo (`top-3.5 right-4 md:right-6`).

10. **Seletor de Cor da Sombra e Fundo das Letras (`headlineEffectColor`, `subtextEffectColor`)**:
   - No menu Tipografia & Cores (`TypographyColorControls.tsx`), quando qualquer efeito de legibilidade ativo (sombra, contorno, caixas, tarjas, pílula, etc.) estiver selecionado, é exibida a paleta "Cor da Sombra / Fundo".
   - Oferece 7 presets rápidos de alta fidelidade (Preto, Branco, Cor de Acento, Grafite, Dourado, Vermelho e Ciano) e seletor nativo hexadecimal HTML5 `<input type="color">`.
   - Persistido atomicamente no `CanvasPostModel` (`headlineEffectColor`, `subtextEffectColor`) e consumido diretamente pelo renderizador Konva (`CanvasPostStage.tsx`) tanto nos efeitos de fundo (`box-card`, `box-pill`, `box-glass`, `box-accent`, `box-brutal`, `strip-line`) quanto de texto (`shadowColor` na sombra suave e `stroke` no contorno/outline).

11. **Garantia de Contraste na Variação Cinemática (`cinematic-depth`)**:
   - Resolução do problema crônico de texto escuro sobre fundo escuro na variação central:
   - `CanvasPostStage` respeita `post.palette.background` dinâmico em vez de forçar `#08080A` hardcoded ignorando a paleta.
   - `resolveGuardedPalette` (`lib/contrast.ts`) audita a família `cinematic-depth`: se o backend ou o modelo gerou fundo claro, normaliza para `#08080A` cinemático e projeta texto de alto contraste (`#FFFFFF`/`#F3F4F6`), garantindo índice WCAG > 15:1.
   - O adaptador `variationToCanvasModel` executa `applyContrastGuard` imediatamente na ingestão de cada variação.

12. **Motor de Diversidade Visual das Variações (`ensureDistinctFamilies`)**:
   - Resolução da repetição das 3 famílias estáticas (*Stroke Impact*, *Pôster de Cinema*, *Brutal Split*):
   - Alinhamento de contrato: a função agora lê corretamente tanto `variation.familyId` quanto `variation.creativeDirection?.familyId` gerado pelo backend tRPC.
   - Mapeamento bidirecional de aliases legados (`glitch-signal` ➔ `cyber-glitch`).
   - Algoritmo de rotação dinâmica com seed hash do prompt: caso haja famílias duplicadas ou indefinidas, os fallbacks são selecionados rotativamente a partir do hash do prompt entre todas as 14 famílias oficiais, eliminando o determinismo estático do array `[0, 1, 2]`.

13. **Variações e Seletor de Cor da Camada de Sobreposição (`overlayColor`, `overlayMode`)**:
   - Desacoplamento da cor do overlay do `post.palette.background`:
   - Permite 4 variações/estilos de sobreposição (`overlayMode`):
     - `gradient-bottom` (padrão editorial: suave no topo, denso na base para destacar textos inferiores);
     - `gradient-top` (denso no topo, suave na base para títulos no topo);
     - `solid` (escurecimento/clareamento uniforme em 100% da imagem como filtro ND);
     - `radial` (vinheta cinematográfica com centro límpido e bordas escuras).
   - Seletor de cor do overlay (`overlayColor`) com 5 presets de alta conversão (Preto `#000000`, Cor do Post `background`, Cor de Destaque `accent`, Branco `#FFFFFF` e Azul Noite `#0F172A`) e input nativo hexadecimal.
   - Persistido no `CanvasPostModel`, sanitizado em `saveAdapter.ts` e renderizado diretamente no Konva (`CanvasPostStage.tsx`).

14. **Caixas de Texto Livres Adicionais (`extraTexts` / `CanvasCustomText`)**:
   - Permite adicionar novas caixas de texto livremente no canvas além dos campos padrão (Headline e Subtexto).
   - Modelo de dados: `CanvasCustomText` (`id`, `text`, `x`, `y`, `width`, `fontSize`, `fontFamily`, `color`, `align`, `effect`, `rotation`, `sizeScale`).
   - As caixas extras herdam o mesmo modelo tátil e funcional das caixas nativas: arrasto com guias magnéticas (snap), rotação e redimensionamento via `Transformer` do Konva, e edição inline ao dar duplo clique/toque (com barra flutuante "Concluir / Cancelar" e atalhos de teclado).
   - Controles integrados no desktop (`CanvasSidebar`) e no mobile (`CanvasMobileDrawer`): adição, exclusão, edição de texto, seleção de alinhamento (`left`, `center`, `right`), controle numérico de tamanho e seletor de cor.
   - Persistência e normalização com suporte a carrosséis (`slides[].extraTexts` e `post.extraTexts`) em `saveAdapter.ts`.

15. **Seletor Visual de Tipografia com Pré-Visualização Direta (`FontPickerDropdown`)**:
   - Substituição do `<select>` HTML nativo (que achatava todas as opções na fonte do sistema operacional devido a limitações de tags `<option>`) por um seletor visual moderno com preview real estilo Canva/Figma.
   - Cada opção do catálogo é renderizada diretamente na sua respectiva família tipográfica (`style={{ fontFamily: font.name }}`), com o nome estilizado e um espécime de caracteres (`Ag 123`).
   - Pré-carregamento dinâmico em lote (`loadCatalogFonts` em `client/src/lib/fonts.ts`) que injeta os links consolidados do Google Fonts no `<head>`, eliminando atrasos e saltos de renderização (FOUC).
   - Inclui as fontes padrão oficiais que faltavam no catálogo (`Cinzel` e `Archivo Black`).
   - Campo de busca instantânea e abas de categorias táteis (*Todas*, *Serifadas*, *Display*, *Sans-Serif*, *Mono*, *Próprias*).
   - Suporte a fontes próprias carregadas via upload de arquivo ou URL do Google Fonts.
   - Aplicado uniformemente no painel desktop (`CanvasSidebar.tsx`) e na gaveta móvel (`CanvasMobileDrawer.tsx`).

16. **Elementos Opcionais de Marcação (Badge & Indicador de Slide)**:
   - Resolução de badges vazios/fantasmas e remoção da exibição forçada de "SLIDE 01 // CAPA" em posts estáticos de imagem única.
   - Em posts estáticos (`slides.length <= 1`), o indicador de etapa é oculto por definição.
   - Tanto o Badge/Tag Superior (`showBadge`) quanto o Indicador de Slide (`showStep`) passam a ser opcionais no `CanvasPostModel`, inicializados como `false` por padrão em novas gerações e fallbacks.
   - Controles visuais com checkboxes e campos de texto opcionais adicionados ao desktop (`CanvasSidebar.tsx`) e mobile (`CanvasMobileDrawer.tsx`).
   - No Konva (`CanvasPostStage.tsx`), o Badge só é desenhado se `post.showBadge && post.badgeText?.trim()` for verdadeiro. Em carrosséis com `showStep: true`, exibe o marcador do slide atual (`currentSlide.step`); se ambos estiverem ativos simultaneamente no carrossel, o Badge principal é renderizado na posição de topo e um chip numérico secundário discreto é desenhado no canto oposto.
   - A persistência e normalização em `saveAdapter.ts` preservam atomicamente `showBadge` e `showStep`.

17. **Inserção e Redimensionamento Livre de Fotos e Imagens (`extraImages` / `CanvasCustomImage`)**:
   - Permite aos usuários fazer upload e inserir livremente fotos, imagens e adesivos em qualquer slide do post.
   - Modelo de dados: `CanvasCustomImage` (`id`, `url`, `x`, `y`, `width`, `height`, `rotation`, `opacity`, `cornerRadius`).
   - Renderização e Manipulação Konva (`CanvasPostStage.tsx`):
     - Componente dedicado `CanvasCustomImageNode` com carregamento assíncrono e `img.crossOrigin = "Anonymous"` para prevenir contaminação do canvas (*canvas tainted*) e viabilizar exportações em alta resolução (4K Ultra-HD) sem restrições CORS.
     - Alocação no layer principal do palco, respeitando o teto de memória e performance gráfica em navegadores mobile (iOS Safari).
     - Suporte completo a drag-and-drop livre dentro dos limites do post com guias magnéticas (snap).
     - Suporte a seleção tátil e foco via `Transformer` Konva com redimensionamento proporcional (`keepRatio={true}`) e rotação com snap de 90° (`[0, 90, 180, 270]`).
     - Respeito estrito ao invariante Konva no `onTransformEnd`: calcula nova largura/altura multiplicando a escala (`width * scaleX`, `height * scaleY`) e imediatamente reseta `node.scaleX(1)` e `node.scaleY(1)` para prevenir distorções acumuladas.
     - Seleção e desseleção integradas no palco: `handleStagePointerDown` verifica descendência de `extraImageRefs` impedindo cancelamentos indevidos de foco ao clicar sobre a imagem.
   - Interface e Controles:
     - Botão de ação rápida `+ Imagem` na barra de ferramentas superior (`CanvasTopBar.tsx`), na barra lateral desktop (`CanvasSidebar.tsx`) e no rodapé móvel (`CanvasMobileDrawer.tsx`).
     - Listagem gerenciável de imagens por slide com miniaturas, badges de dimensões reais em pixels, sliders de opacidade (10% a 100%), sliders de arredondamento de bordas (`cornerRadius` de 0 a 60px) e botão de exclusão imediata.
     - Opção adicional na aba Mídia no mobile para inserir fotos adicionais sobrepostas como camada.
   - Persistência e Retrocompatibilidade:
     - Preservado no array de cada slide (`slides[].extraImages`) e na raiz do `CanvasPostModel`.
     - Normalizado e sanitizado em `saveAdapter.ts` (`normalizeCanvasModel`), garantindo reabertura idêntica e sem regressões para posts legados.

18. **Distribuição do Fundo no Brutal Split (`splitBgPosition`)**:
   - No estilo *Brutal Split*, resolve a limitação em que fotos de fundo cobriam 100% da arte, ofuscando a composição cromática das duas metades sólidas.
   - Modelo de dados: `splitBgPosition?: "bottom" | "top" | "full"` (com default em `"bottom"`).
   - Renderização e Recorte no Konva (`CanvasPostStage.tsx`):
     - Quando `splitBgPosition` for `"bottom"` (padrão editorial/clássico): a imagem e o overlay de contraste são agrupados em `<Group clip={{ x: 0, y: baseHeight * 0.5, width: baseWidth, height: baseHeight * 0.5 }}>`, exibindo a foto exclusivamente na metade inferior com cover crop recalculado para essa área. A metade superior permanece com o bloco sólido puro de alta legibilidade (`palette.background`), permitindo que a Headline se destaque com 100% de contraste.
     - Quando `splitBgPosition` for `"top"`: o recorte inverte para os 50% superiores (`y: 0`, `height: baseHeight * 0.5`), mantendo a base sólida com `palette.accent`.
     - Quando `splitBgPosition` for `"full"`: a foto cobre os 100% do post como plano de fundo completo.
     - A linha divisória preta do split (`Line` a 50%) é renderizada sobre a junção dos fundos, assegurando separação nítida em qualquer modo.
   - Interface do Usuário:
     - Seletor tátil de 3 botões na aba Mídia tanto no desktop (`CanvasSidebar.tsx`) quanto no mobile (`CanvasMobileDrawer.tsx`): `[ Metade Inferior (Clássico) ]`, `[ Metade Superior ]` e `[ Fundo Todo ]`.
   - Persistência:
     - Normalizado em `saveAdapter.ts` para cada slide e na raiz do `CanvasPostModel`.

---

## 4. Pipeline Completo de Geração de Posts (`post.generate`)

```
   [Insumo do Usuário] ──► (Texto / Tese / URL de Site / Imagem)
                                  │
                                  ▼
   [Brand DNA & Site Intel] ──► Extração de Paleta, Tipografia e Tom de Voz (se URL)
                                  │
                                  ▼
   [Estratégia de Conteúdo] ──► prepareGenerationPlan() (Seleção Semântica de Ângulos)
                                  │
                                  ▼
   [Orquestrador Único LLM] ──► invokeLLM() (OpenRouter -> Groq -> Gemini; latência depende de reparo/avaliação)
                                  │
                                  ▼
   [BrandVisualGuardian]    ──► Validação Determinística: Paleta Oficial + Contraste WCAG >= 4.5:1
                                  │
                                  ▼
   [Diversidade Forçada]    ──► ensureDistinctFamilies() (< 0.1ms em memória, 0 repetições)
                                  │
                                  ▼
   [Imagem de Fundo (IA)]   ──► OpenRouter com Fallback Pollinations.ai HD (Retorno em DataURI)
                                  │
                                  ▼
   [Normalizador Canônico]  ──► createPostVisualSnapshot() ──► PostVisualSnapshot Pronto
```

### Detalhes das Fases do Pipeline:
1. **Resolução de Insumo**: O usuário pode fornecer texto livre, link de website ou arquivo. Se for URL, o motor ativa a análise de inteligência de site.
2. **Diretrizes de Copywriting Super Premium (Autoridade Magnética & Manchetes Autorais)**:
   - **Regra de Ouro do Headline (Manchete de Capa)**: É terminantemente proibido replicar o texto do prompt ou do tópico no headline. O headline atua como a manchete de capa do post (concisa, máx 60 caracteres, sem ponto final, alta curiosidade e impacto visual). Cada variação adota um ângulo e gancho verbal totalmente diferente.
   - **Desacoplamento de Âncoras e Schema Condicional**: Em inputs de texto livre, os campos `anchorUsed` e `proprietaryTerms` são omitidos do JSON Schema e da lista `required`, evitando alucinações ou rejeições em posts sem website de apoio. Quando o input for uma URL catalogada com âncoras reais, os campos tornam-se estritamente obrigatórios.
   - **Regra de Ordem Direta**: Eliminação total da antítese forçada e clichê de IA (*"Não é X, é Y"*, *"o segredo não é o produto, é o processo"*). As ideias são declaradas na ordem direta positiva (Sujeito ➔ Verbo ➔ Impacto).
   - **Teste da Substituição Universal**: Proibição de copy vazia ou genérica. Toda variação obrigatoriamente inclui detalhes táteis, sintomas do mundo real, erros operacionais práticos, unidades de medida ou critérios técnicos do nicho.
   - **3 Matrizes Cognitivas Obrigatórias**:
     - *Variação 1 ➔ O Choque de Realidade / Sintoma Oculto*: revela causa-raiz invisível por trás de hábitos ou processos que parecem inocentes.
     - *Variação 2 ➔ O Critério Técnico / Régua de Decisão*: entrega a régua prática de corte ou regra de avaliação que especialistas seniores usam nos bastidores.
     - *Variação 3 ➔ A Relação Causa-Efeito Contraintuitiva*: demonstra onde o esforço comum é desperdiçado e qual ajuste de fundamentos gera alavancagem.
   - **Autoridade Magnética (Zero Clichês Sintéticos)**: Proibição de pontos de exclamação (!), entusiasmo artificial, tom de assistente/chatbot (*"Espero ter ajudado"*, *"conte comigo"*), suspense sintético (*"e isso muda tudo"*, *"o pulo do gato"*) e vazamento de termos de estratégia no texto (`— objeção comum`, `[dor]`).
   - **Síntese Defensiva de Seções (`studioGeneration.ts`)**: Quando o modelo estruturar listas numeradas em `v.sections`, o gerador sintetiza defensivamente os tópicos dentro de `subtext` (`1. Label: desc • 2. ...`), garantindo que nenhum insight do usuário seja perdido silenciosamente.
    - **Blindagem do Fallback (`studioGeneration.ts`)**: Em caso de falha de conexão de rede externa, o fallback local formula manchetes dinâmicas por ângulo (*"O Custo Oculto em..."*, *"O Critério de Ouro em..."*, *"A Verdade Contraintuitiva de..."*), prevenindo qualquer repetição crua do prompt.
    - **Disponibilidade real do modo `execution` (confirmada em 2026-09-12)**: o contrato ainda existe no backend (`post.generate`) e em `Home.tsx`, mas `Home.tsx` é legado órfão. A rota oficial `/thevoid` monta `StudioAppV2BPage`, que não expõe nem envia `creationMode: "execution"` ou `executionBrief`; portanto, todo uso normal do Studio passa por `ideation`. HoloDeck e WorkbenchV2 também não fazem parte do fluxo montado.
3. **Cascata de LLMs Resiliente (`server/_core/llm.ts`)**:
   - Primário: OpenRouter (`openai/gpt-5-mini`);
   - Fallback 1: Groq;
   - Fallback 2: Gemini Direct;
   - Retries com backoff exponencial para erros transitórios (429, 503).
4. **BrandVisualGuardian (`server/ai/brandVisualGuardian.ts`)**:
   - Pure function síncrona que substitui juízes lentos de IA;
   - Força `backgroundColor` e `accentColor` na paleta da marca e garante contraste mínimo de 4.5:1 (WCAG AA).
5. **Limite atual de qualidade de copy (auditoria de 2026-09-12)**:
    - A avaliação determinística é usada para selecionar reparos. Desde 2026-09-14, violações objetivas de fato obrigatório ou autoridade sem fonte também bloqueiam a entrega após reparo; outras notas `accepted=false` permanecem graduais até calibração.
    - O juiz editorial LLM e a detecção de vícios só são acionados se `AI_LLM_JUDGE_ENABLED=true`; o padrão é `false` e, portanto, `judgeCalls=0` no caminho usual.
    - Em três execuções reais de auditoria textual, com 1 chamada principal + 1 reparo cada, a latência observada foi de 29,6–36,8s. A meta histórica de 2–4s não representa esse caminho quando há reparo.
    - A leitura retrospectiva de 35 `generation_runs` confirmou o padrão: 33/35 tiveram reparo, com 1,1 candidato aceito de 3 e latência média de 49,8s. Todos eram `text` + `ideation`; `output_snapshot` estava vazio em todos, inviabilizando auditoria da copy por slot. Ver `docs/AUDITORIA_IA_HISTORICO_2026-09-12.md`.
    - Validação manual do Studio oficial confirmou que os contratos fixos de *Sintoma Oculto*, *Régua de Decisão* e *Causa-Efeito Contraintuitiva* vazam para a copy mesmo diante de insumo factual. Em texto livre, facts como percentual e janela operacional não são guardados por anchors; o resultado pode preservar o tema e perder o mecanismo.
    - Reavaliação editorial de 2026-09-13: o problema inclui clareza pragmática baixa — frases gramaticais, mas com referente indefinido, causalidade elíptica ou metáfora não ancorada, que transferem ao leitor a reconstrução do significado. Foi descartada a proposta inicial de três novos enquadramentos obrigatórios. O plano atual cria primeiro uma proposição literal sustentada, calcula um orçamento de 1–3 variações semânticas conforme a riqueza do insumo e permite que três direções visuais compartilhem copy. O contrato governa significado/evidência; forma, tom e concisão continuam flexíveis.
    - Benchmark editorial isolado (`server/benchmarks/editorialModels/`, 2026-09-13): corpus sintético de 10 briefs, ficha cega, interrupção imediata em 429, timeout por chamada e relatório rederivável. A primeira bateria completou 40 tentativas por US$ 0,0635: Gemini 3.8 Flash 10/10 respostas estruturalmente válidas (3,4s médios), GPT-5 Mini 9/10 (7,0s), Qwen 3.6 Flash 7/10 (6,6s) e DeepSeek V3.2 5/10 (27,9s). GLM 4.7 foi excluído após três timeouts no smoke. Esses números não constituem decisão editorial; a avaliação humana cega permanece pendente e o modelo de produção não mudou.
    - Eliminatória de versões atuais (2026-09-13): 5 briefs × 5 modelos, com 25/25 respostas válidas, 100% de cobertura factual automática e nenhum 429. Latências médias: Gemini 3.8 Flash 3,7s; GPT-5.4 Mini 5,1s; GLM 5.3 Flash 7,8s; DeepSeek V4.1 Flash 10,5s; Qwen 3.8 Flash 13,7s. Custo retido no artefato final: US$ 0,0414. O modelo de produção permanece `openai/gpt-5-mini`; a escolha editorial depende da avaliação cega. Evidências e ressalvas: [`BENCHMARK_EDITORIAL_RESULTADOS_2026-09-13.md`](./BENCHMARK_EDITORIAL_RESULTADOS_2026-09-13.md).
6. **Geração de Imagens (`server/imageGenerateBackground.ts`)**:
   - Serviço primário: OpenRouter (`google/gemini-3.1-flash-image-preview`);
   - Serviço secundário automático: Pollinations.ai em alta definição;
   - Imagens são sempre entregues em formato DataURI validado, impedindo quebras de renderização por bloqueios de CORS ou links mortos.

---

## 5. Motor de Brand DNA & Site Intelligence

O PostSpark possui tecnologia própria para clonagem de identidade visual de qualquer site corporativo ou landing page.

### Mecânica de Extração:
1. **Coleta de Conteúdo (`server/siteContent.ts`)**:
   - Tenta coleta via HTTP direto com sanitização e parsing HTML (`cheerio`);
   - Se bloqueado por CDN/Cloudflare, aciona o microsserviço Railway configurado em `RAILWAY_SCREENSHOT_SERVICE_URL`.
2. **Extração de Estilos Visuais (`server/styleExtractor.ts` & `server/brandDNA.ts`)**:
   - Mapeia paleta cromática dominante a partir do CSS e tags de cor;
   - Identifica fontes Google Fonts e CSS `@import`;
   - Localiza favicons e URLs de logotipos em alta definição.
3. **Síntese Semântica de Negócio (`server/siteIntelligence.ts`)**:
   - Executa análise via LLM para extrair: proposta de valor única, dores do público-alvo, esteira de produtos/serviços e tom de voz editorial;
   - Possui `fallbackSynthesis` determinístico, assegurando que o pipeline **nunca trava** se o site tiver bloqueio agressivo de robôs.
4. **Endpoints Ativos**:
   - REST: `POST /api/brand-dna`
   - tRPC: `brand.extractDna` e integração automática em `post.generate`.

---

## 6. Catálogo das 14 Direções de Arte Oficiais

Todas as artes do PostSpark seguem rigorosamente as definições geométricas e tipográficas estabelecidas em `shared/creative/familyGeometry.ts` e `OFFICIAL_FAMILIES_META`:

### 🌟 Categoria 1: Tendências & Instagram (Novos Arquétipos)
1. **🔲 Stroke Impact (`stroke-impact`)**: Tipografia massiva em Bebas Neue com contorno vazado (*stroke outline*) intercalado com preenchimento sólido.
2. **🎬 Pôster de Cinema (`cinematic-depth`)**: Enquadramento cinematográfico, tipografia monumental e rodapé de créditos estilo cartaz de filme.
3. **⚡ Brutal Split (`brutal-split`)**: Divisão visual 50/50 em duas metades com blocos de contraste cromático forte (@design.deb) e tipografia em Syne.
4. **✨ Glass Veil (`glass-veil`)**: Cartão translúcido flutuante de vidro fosco (*glassmorphism*) com bordas iluminadas e badge em pílula de luxo.
5. **🤖 Cyber & Glitch (`cyber-glitch`)**: Miras táticas (+), scanlines vetoriais, código monospace e estética de terminal de alta tecnologia.

### 📰 Categoria 2: Editorial & Clássico
6. **📰 Editorial de Luxo (`editorial-poster`)**: Playfair Display itálica, aspas decorativas translúcidas gigantes e divisórias em tons nobres de ouro.
7. **💥 Minimalismo Brutal (`chromatic-block`)**: Anton massiva all-caps, bloco monocromático saturado de alto impacto e sticker rotacionado (-3°).
8. **🎨 Duotone Wash (`duotone-wash`)**: Gradiente linear diagonal a 135° combinando duas cores complementares com atmosfera elegante.
9. **💬 Citação de Autoridade (`quote-authority`)**: Tipografia Cinzel serifada para sentenças de grande peso moral, autoridade e liderança.
10. **🍃 Minimalismo Arejado (`minimal-air`)**: Espaço negativo generoso, equilíbrio zen e clareza visual absoluta.

### 📊 Categoria 3: Métricas & Conversão
11. **⚔️ Comparação Versus (`versus`)**: Estrutura em duas colunas contrastando "Antes vs Depois" ou "Certo vs Errado".
12. **📊 Data Punch (`data-punch`)**: Números monumentais e métricas quantitativas de retenção em destaque com fonte Space Grotesk.
13. **⚡ Tipografia Cinética (`kinetic-type`)**: Tipografia dinâmica em Syne Bold com ritmo visual e quebras de linha expressivas.
14. **🧱 Mosaico & Grade (`mosaic-grid`)**: Organização modular em blocos e passos sequenciais estruturados.

---

## 7. Estúdio de Edição Oficial: CanvasLab (PostSpark Studio)

O editor visual oficial do PostSpark (`CanvasLabPage`, rota `/thevoid`) foi construído sobre o motor **Konva 2D** (`CanvasPostStage.tsx`), substituindo o motor legado DOM + html2canvas (WorkbenchV2 — órfão, sem rota).

### Estrutura e Fluxo:
- **Máquina de estados** (`StudioAppV2BPage`): `create` (StudioCreateViewV2B) → `gallery` (StudioGalleryView desktop / StudioMobileFlashcards mobile — "HoloDeck" histórico) → `editor` (CanvasLabPage).
- **Galeria**: clique/toque no card seleciona a direção e abre o editor (além do botão "Personalizar Post").
- **Editor CanvasLab**: `CanvasTopBar` concentra identidade Studio, Desfazer/Refazer, salvamento, exportação e menu de ações; `CanvasToolRail` reúne formato, ímã e zoom à direita apenas em desktop largo; `CanvasSidebar` (desktop) / `CanvasMobileDrawer` (mobile) preservam as abas **Texto · Estilo · Mídia · Logo**; `CanvasPostStage` desenha a prancheta Konva e `CarouselFilmstrip` controla os slides. Em larguras menores, as ferramentas da rail ficam no menu da barra superior.

### Abas do editor (desktop e mobile em paridade):
- **Texto**: título/subtítulo/etapa/badge, alinhamento, **cores por elemento** (Título/Corpo, com selo de contraste baixo e botão Limpar), **multiplicadores de tamanho** (`headlineSizeScale`/`subtextSizeScale`, 60–160%) e legenda estratégica do Instagram.
- **Estilo**: 14 famílias visuais (via `applyFamilyPreset` — nunca altera cores), tipografia/upload de fonte/Google Fonts e paleta cromática (fundo/destaque/texto).
- **Mídia**: geração de fundo por IA, biblioteca de texturas (110+ assets), upload local, download direto da imagem, ajuste de enquadramento estilo Canva e overlay.
- **Logo**: upload de logo (PNG transparente, paridade desktop/mobile), posição inicial em 4 quadrantes (`logoPosition`, arraste no palco prevalece) e badge/tag.

### Sistema de Dicas (item 9):
- `useStudioTipsStore` (zustand persist) com checkbox global **"Mostrar dicas"** (rodapé da sidebar/drawer) e dicas contextuais dispensáveis (`TipCallout`) por aba.

### Salvamento e biblioteca (item 7):
- Botão **Salvar** (top bar) → diálogo **"Salvar como novo" × "Atualizar o post salvo"** com checkbox **"Memorizar esta decisão"** (`localStorage postspark.savePreference`).
- Payload construído por `canvasModelToSavePayload`/`canvasModelToUpdatePayload` (`lib/saveAdapter.ts`); modelo completo persistido em `posts.canvas_model`.
- **Guardião de Compressão de Imagens (`server/lib/imageCompress.ts`)**: para impedir inchaço no PostgreSQL (que causava `canceling statement due to statement timeout` ao carregar a biblioteca quando payloads base64 acumulavam dezenas de megabytes), `post.save` e `post.update` comprimem e redimensionam deterministicamente qualquer imagem raw em base64 (>50KB) para JPEG max 600px antes de persistir no banco.
- Toast pós-save com ação **"Ver salvos"** → `/saved-posts`; cards em `/saved-posts` usam fallback para `canvas_model` (aspectRatio, paleta e fundo) na ausência de `variation_snapshot`. **"Abrir"** em `/saved-posts` reconstrói o modelo (`savedPostToCanvasModel`) e entra direto no editor via sessionStorage `postspark.open_canvas_post` → `/thevoid`. Possui tratamento de erro explícito com botão de tentar novamente em vez de falso "nenhum post salvo".

### Exportação Multiformato e 4K:
- Formatos nativos com legendas oficiais (**1:1 Feed**, **5:6 Feed**, **9:16 Stories** — mapa único `ASPECT_RATIO_CAPTIONS` em `types.ts`);
- Renderização direta em PNG 4K (`exportPng4K`) e carrossel completo em `.zip` 4K (`exportZip4K`).

### Tutorial no loading (item 11):
- `ProductionOverlay` exibe, junto ao % e às microetapas, o mini-tutorial ilustrado `LoadingTutorial` (4 passos SVG inline, rotação 3.5s, swipe no mobile, respeita `prefers-reduced-motion`).

### Legado preservado (referência histórica):
- O **Estúdio de Texturas** (6 materiais nobres) e o **Dial Orbital Polar** seguem disponíveis via `RadialTextureSelector`/`BackgroundsDrawer` dentro do CanvasLab.
- `Home.tsx`, `HoloDeck.tsx`, `WorkbenchV2/` e `CanvasLab` experimental redirecionado: **legado órfão** — não rotear sem decisão explícita do dono.

---

## 8. Autenticação, Sessões & Cookie Bridge

O sistema de autenticação utiliza o Supabase Auth integrado por uma ponte segura de cookies HTTP-only:

1. **Tokens de Sessão**:
   - `sb-access-token`: JWT de acesso com validade curta;
   - `sb-refresh-token`: token de renovação transparente;
   - `app_session_id`: identificador de sessão interna do PostSpark.
2. **Fluxo Google OAuth**:
   - O usuário clica em login Google ➔ redirecionamento para o provedor OAuth;
   - Retorno para `/auth/google-callback#access_token=...`;
   - O cliente captura o token e chama `POST /api/auth/supabase-session`;
   - O backend valida a credencial no Supabase, emite os cookies de sessão e redireciona para o estúdio oficial (`/thevoid`).
3. **Controle de Acesso**:
   - `ProtectedRoute`: assegura redirecionamento para `/` se não autenticado;
   - `AdminRoute`: restringe áreas de gestão (`/admin`) exclusivamente a usuários com role `admin`.

---

## 9. Billing, Sparks & Planos de Assinatura

O PostSpark adota um modelo híbrido de assinaturas com saldo de créditos consumíveis (**Sparks**):

### Estrutura de Consumo:
- **Geração de Posts**: Cada conjunto de variações consome Sparks do saldo do usuário.
- **Geração de Imagens por IA**: Débito específico por imagem gerada em alta definição.
- **Proteção de Saldo**: O backend verifica o saldo antes de iniciar qualquer chamada generativa externa; se insuficiente, instrui o cliente a exibir o modal de recarga ou upgrade.

### Planos e Integração Stripe:
- **Planos Recorrentes**:
  - *Free*: degustação com saldo inicial de Sparks;
  - *Pro* (Mensal/Anual): cota ampliada de Sparks e acesso a exportação 4K;
  - *Agency* (Mensal/Anual): alta capacidade, suporte prioritário e recursos corporativos.
- **Recargas Avulsas (Top-ups)**: Pacotes *Starter*, *Power* e *Mega* para compra imediata de Sparks.
- **Webhooks do Stripe**: Endpoint `POST /api/stripe/webhook` gerencia eventos de checkout concluído, renovação de ciclo, cancelamento e falha de pagamento com sincronização imediata no Supabase.

---

## 10. Mapa Oficial de Rotas Consolidadas

| Rota | Acesso | Componente de Página | Finalidade Principal |
| :--- | :--- | :--- | :--- |
| Rota | Acesso | Componente de Página | Finalidade Principal |
| :--- | :--- | :--- | :--- |
| **`/`** | Pública | [`InspiracaoShowcasePage`](file:///client/src/pages/InspiracaoShowcase/InspiracaoShowcasePage.tsx) | **Home Oficial de Não Logados (Definitiva)**: Vitrine imersiva definitiva com palco 3D coverflow no desktop (matemática pura nativa sem GSAP), stories dinâmicos no mobile, typewriter reverso com acionamento por card e fundo cósmico TheVoid com 6 posts canônicos. Redireciona imediatamente para `/thevoid` assim que autenticado. |
| **`/criar`** | Pública | [`PreviewHomePage`](file:///client/src/pages/PreviewHome/PreviewHomePage.tsx) | **Landing Page Oficial de Tráfego / Anúncios (Dark Studio Editorial)**: Página de alta conversão para tráfego pago reformulada no padrão TheVoid (`oklch(0.04 0.06 280)`). Apresenta Hero com Live Sandbox tonal e backgrounds artísticos canônicos, Atelier de Brand DNA por URL (sem clichês de Mac dots), Galeria dos 6 espécimes canônicos em proporções 1:1, 4:5 e 9:16, e Estúdio de Texturas táteis interativo. Todos os CTAs e links de ação da página redirecionam diretamente para a rota `/` (Showcase de Insumo e Captura), maximizando conversão e retenção sem barreiras mecânicas de modal. |
| **`/thevoid`**, **`/studio`** | Protegida | [`StudioAppV2BPage`](file:///client/src/pages/StudioApp/StudioAppV2BPage.tsx) | **Estúdio Oficial Logado**: máquina `create → gallery → editor` (StudioCreateViewV2B → StudioGalleryView/StudioMobileFlashcards → **CanvasLabPage**, o editor oficial Konva). Também lê `sessionStorage("postspark.open_canvas_post")` para reabrir posts salvos com fidelidade total. (*Alias: `/studio-v2b`*). |
| **`/pricing`** | Pública | `Pricing.tsx` | Tabela oficial de planos Pro, Agency e pacotes de recarga de Sparks. |
| **`/billing`** | Protegida | `Billing.tsx` | Painel de gestão de assinatura, histórico de faturas e saldo de Sparks. |
| **`/history`** | Protegida | `History.tsx` | Histórico cronológico de gerações realizadas pelo usuário. |
| **`/saved-posts`** | Protegida | `SavedPosts.tsx` | Galeria de posts salvos e finalizados. |
| **`/admin`** | Admin | `Admin.tsx` | Painel interno de telemetria, custos de tokens e gestão de usuários. |
| **`/familias`** | Pública | `FamilyCatalog.tsx` | Catálogo visual de referência das 14 famílias criativas oficiais. |
| **Rotas Redirecionadas ➔ `/criar`** | N/A | `RedirectToRoute` | `/criar-new` (canvas experimental), `/p`, `/preview-home`, `/crie-posts-incriveis`, `/landing`, `/landing2`, `/landing3`. |
| **Rotas Redirecionadas ➔ `/`** | N/A | `RedirectToRoute` | `/stage-3d` e `/3d-home` (palco 3D experimental descontinuado), `/studio-home` (landing legada), `/inspiracao`, `/showcase-stage`, `/thevoid2`. |
| **Rotas Redirecionadas ➔ `/thevoid`** | N/A | `RedirectToRoute` | `/canvas-lab` (laboratório experimental de prancheta), `/thevoid-clean`, `/studio-v2`. |

---

## 11. Modelo de Dados e Tabelas no Supabase (`server/db.ts`)

As operações em runtime ocorrem diretamente via cliente Supabase sobre as seguintes tabelas no PostgreSQL:

- **`posts`**: armazena os posts gerados e editados, contendo `id`, `user_uuid`, `platform`, `headline`, `body`, `slides` (JSON), `layoutSettings` (JSON), `imageSettings` (JSON), `variation_snapshot` (JSON canônico do fluxo legado), **`canvas_model` (JSON — modelo completo do editor oficial CanvasLab, drizzle/0016)** e status de exportação.
- **`generation_runs`**: registro de telemetria de IA contendo tokens de prompt/conclusão, latência em milissegundos, modelos utilizados na cascata, custos em USD e eventos de depuração. Contém a coluna `graph_state` mantida exclusivamente para replay e auditoria histórica de execuções passadas.
- **`site_intelligence`**: cache de identidades de marca extraídas de sites, contendo URL normalizada, fingerprint de conteúdo e o snapshot estruturado do Brand DNA.
- **`background_assets`**: registro de imagens geradas por IA ou carregadas pelo usuário, armazenadas como DataURI ou no bucket de storage.
- **`content_fingerprints`**: armazenamento de hashes e embeddings vetoriais para garantia de originalidade semântica e prevenção de plágio.
- **`brand_kits`**: configurações salvas de identidade visual dos usuários (paletas cromáticas personalizadas, logos e preferências tipográficas).
- **`users`**: dados do perfil, e-mail, role (`user` ou `admin`), saldo atual de Sparks e vínculo com o customer do Stripe.

---

## 12. Variáveis de Ambiente e Configuração (`server/_core/env.ts`)

| Variável | Padrão | Obrigatória? | Finalidade |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development` | Sim | Define ambiente de execução (`production` ou `development`) |
| `SUPABASE_URL` | - | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY`| - | Sim | Chave de serviço (backend only) com permissões administrativas |
| `OPENROUTER_API_KEY` | - | Recomendada | Chave do OpenRouter (provedor primário de texto e imagem) |
| `OPENROUTER_TEXT_MODEL` | `openai/gpt-5-mini` | Não | Modelo de linguagem primário para geração de copywriting |
| `OPENROUTER_STATIC_MODEL` | `google/gemini-3.8-flash`* | Não | Geração principal de posts estáticos; recua para `OPENROUTER_TEXT_MODEL` quando ausente |
| `OPENROUTER_CAROUSEL_MODEL` | `google/gemini-3.8-flash`* | Não | Geração principal de carrosséis; recua para `OPENROUTER_TEXT_MODEL` quando ausente |
| `OPENROUTER_QUALITY_REVISION_MODEL` | `openai/gpt-5.4-mini`* | Não | Única chamada condicional de reparo; recua para `OPENROUTER_TEXT_MODEL` quando ausente |
| `OPENROUTER_CONTENT_STRATEGY_MODEL` | `z-ai/glm-5.3-flash`* | Não | Síntese semântica de Site Intelligence; recua para `OPENROUTER_TEXT_MODEL` quando ausente |
| `OPENROUTER_EVALUATION_MODEL` | `z-ai/glm-5.3-flash`* | Não | Juiz opcional, desligado por padrão; recua para `OPENROUTER_TEXT_MODEL` quando ausente |
| `OPENROUTER_VISION_MODEL` | `google/gemini-3.8-flash` | Não | Análise multimodal e identidade visual |
| `OPENROUTER_IMAGE_MODEL`| `google/gemini-3.1-flash-image-preview` | Não | Modelo de geração de imagens |
| `GROQ_API_KEY` | - | Recomendada | Chave da Groq para fallback rápido de LLM |
| `GEMINI_API_KEY` | - | Recomendada | Chave do Google Gemini para fallback de contingência |
| `STRIPE_SECRET_KEY` | - | Em Prod | Chave secreta da API do Stripe para billing |
| `STRIPE_WEBHOOK_SECRET` | - | Em Prod | Assinatura de validação de webhooks do Stripe |
| `RAILWAY_SCREENSHOT_SERVICE_URL` | - | Não | URL do microsserviço no Railway para captura e bypass de Cloudflare |
| `AI_LLM_JUDGE_ENABLED` | `false` | Não | Mantido em `false` para preservar a geração única em 2 a 4s |
| `AI_SITE_INTELLIGENCE_ENABLED` | `true` | Não | Habilita a extração automática de Brand DNA por URL |

\* A variável específica tem precedência sobre `OPENROUTER_TEXT_MODEL`. Quando ausente, a rota recua para o override global; remover as variáveis específicas restaura imediatamente o comportamento anterior.

---

## 13. Registro de Decisão Arquitetural (ADR): A Arquitetura em Grafos e a Transição para o Orquestrador Único

### 📜 Contexto Histórico:
Em versões anteriores do PostSpark (fases pré-SPEC-003), a geração de posts foi modelada e experimentada como uma **arquitetura orientada a grafos** (`shared/graphEngine.ts`, `shared/generationGraph.ts`, com nós para brief, workers paralelos, shadow graph e pipeline multi-etapas). 

### ⚠️ Por que a Arquitetura em Grafos foi Descontinuada no Runtime?
Durante os testes de carga e validação da **Reforma SPEC-003 / SPEC-005**, foram constatados gargalos severos no modelo em grafo:
1. **Latência Inviável**: A execução de múltiplos nós intermediários de LLM e avaliação causava tempos de espera entre **25 e 45 segundos**, quebrando a experiência interativa em tempo real desejada para o produto.
2. **Multiplicação de Custos e Timeouts**: Múltiplas etapas encadeadas quadruplicavam o consumo de tokens e multiplicavam a probabilidade de falhas de rede (erros 429, 503 e abortos de contexto em modelos como Gemini e OpenRouter).
3. **Divergência de Contratos**: Cada nó do grafo operava com pequenos deltas de tipagem, dificultando a garantia da invariante de normalização canônica.

### 🎯 A Decisão e a Arquitetura Atual (Consolidada na SPEC-003/SPEC-005):
1. **Orquestrador Único (`generationOrchestrator.ts`)**: Todo o pipeline produtivo foi simplificado para uma chamada generativa rica e única, que entrega as variações completas em **2 a 4 segundos**.
2. **Planejamento Determinístico em Memória**: Decisões que não exigem raciocínio generativo aberto (seleção de ângulos, diversidade de famílias com `ensureDistinctFamilies` e validação WCAG com `BrandVisualGuardian`) ocorrem de forma síncrona em milissegundos, sem chamadas extras de IA.
3. **Preservação de Legado no Banco**: A coluna `generation_runs.graph_state` no Supabase foi mantida unicamente para telemetria histórica e compatibilidade de leitura com registros antigos.

> ⛔ **Invariante Mandatória:** É terminantemente proibido reintroduzir máquinas de estado concorrentes, filas assíncronas, juízes paralelos de IA ou grafos multi-roundtrip no caminho crítico de `post.generate`. Qualquer proposta de alteração generativa deve preservar o teto estrito de latência (2 a 4s) e a chamada generativa única.

---

## 13.1 ADR — Correções de Usabilidade do Estúdio (2026-09-05)

Onze correções derivadas de testes de usabilidade na edição de posts já criados, todas concentradas no fluxo oficial CanvasLab:

1. **Guardião de Contraste** (`lib/contrast.ts`): fundo escuro ⇄ texto claro sempre, por metade no split; modo "corrigir + permitir re-override" com selo de contraste baixo; funil único em `CanvasLabPage.handleUpdatePost`.
2. **Cores e tamanhos de texto na edição**: aba Texto (desktop/mobile) com cores por elemento e sliders 60–160% (`TypographyColorControls`).
3. **Estilos não alteram cores**: `applyFamilyPreset` único para desktop e mobile.
4. **Anti-sobreposição**: split com linha de corte 50% unificada (cor e texto), subtítulo âncora abaixo do título, auto-shrink de fonte (3 passos).
5. **Aba "Logo"** (antes "Marca"): upload no mobile, 4 posições válidas, `logoPosition` ligado ao estágio.
6. **Botão Recomeçar** com confirmação → limpa sessão e volta à criação.
7. **Salvar + Salvos**: diálogo novo/atualizar memorizável, coluna `canvas_model` (migration 0016, aplicada), reabertura `/saved-posts` → `/thevoid` → editor (fluxo antigo via Home estava quebrado — Home é órfão).
8. **Legendas de formato**: `ASPECT_RATIO_CAPTIONS` (1:1 Feed, 5:6 Feed, 9:16 Stories) em todos os seletores.
9. **Sistema de dicas**: `useStudioTipsStore` + `TipCallout` por aba + checkbox "Mostrar dicas".
10. **Clique/toque no card da galeria** abre o editor (guardado contra drag no mobile).
11. **Tutorial ilustrado no loading** (`LoadingTutorial` dentro do `ProductionOverlay`).

---

## 13.2 ADR — Unificação do Motor Konva.js e Interações no CanvasLab (2026-09-05)

Consolidação definitiva do motor gráfico e ciclo de eventos no CanvasLab:

1. **Eliminação do "Segundo Motor" Heurístico:**
   - Heurísticas ad-hoc anteriores (`charCount * 0.55 * fontSize / width` e `avgCharWidth = fontSize * 0.52`) calculavam estimativas incorretas de quebras de linha em fontes condensadas (como *Anton*, *Impact*, *Bebas Neue*). O texto cabia em 1 linha no Konva, mas a fórmula achava que precisava de 2 linhas, desenhando uma segunda tarja vazia fantasma (`strip-line`) e dobrando a altura do `box-card` e do `Transformer`.
   - Substituição pelo módulo canônico `getKonvaTextMetrics` (`client/src/pages/CanvasLab/components/textMetrics.ts`), que instancia um nó `Konva.Text` de medição com Canvas 2D nativo. Todas as quebras de linha (`textArr`), alturas (`height()`) e limites do `Transformer` passam a compartilhar 100% da mesma medição.
2. **Correção do Sequestro de Duplo-Clique pelo Transformer:**
   - O componente `<Transformer>` do Konva se posiciona no topo da camada ao selecionar um texto, engolindo cliques duplos.
   - Adicionados handlers de `onDblClick` e `onDblTap` diretamente no `<Transformer>`, delegando a abertura do editor inline ao elemento selecionado (`selectedId`). Handlers também adicionados aos nós `<Text>` para edição direta.
3. **Desseleção Confiável no Stage (Click Outside):**
   - Substituída a verificação frágil `e.target === stageRef.current` por um listener canônico que utiliza o helper de hierarquia `isDescendantOf`. Cliques em retângulos de cor de fundo, gradientes, imagens ou áreas neutras do palco disparam a desseleção (`setSelectedId(null)`) e salvam edições abertas (`handleCommitText()`). Formas de fundo foram identificadas com `name="canvas-bg"`.
4. **Skills Especializadas Registradas em `.agent/skills/`:**
   - `.agent/skills/konva-canvas-architecture/SKILL.md`: padrão canônico de medição tipográfica do Konva, pass-through de duplo clique no Transformer e desseleção no Stage.
   - `.agent/skills/image-pipeline-resilience/SKILL.md`: cadeia de fallback resiliente (OpenRouter → Pollinations → Unsplash), validação de assinatura binária e manipulação no Canvas estilo Canva (`getCoverCrop`, `bgTransform`).
   - `.agent/skills/contrast-color-guardian/SKILL.md`: regras WCAG 2.1, contraste assimétrico no Brutal Split e políticas de cores e badges de baixo contraste.
   - `.agent/skills/post-visual-snapshot/SKILL.md`: a invariante mandatória da fonte única da verdade dos posts (`variationSnapshot.ts`), versionamento e isolamento de slides sem cross-talk.
   - `.agent/skills/canvas-export-4k/SKILL.md`: renderização offscreen em resolução 4K Ultra-HD (`pixelRatio: 4`), empacotamento assíncrono em ZIP via `JSZip` e preloading de fontes dinâmicas.

---

## 13.3 ADR — Reorganização e Segregação Estrita de Responsabilidades no CanvasLab (2026-09-05)

Revisão estrutural de separação de responsabilidades nas abas de controle do CanvasLab (`CanvasSidebar.tsx` e `CanvasMobileDrawer.tsx`):

1. **Aba "Texto" (Exclusividade Tipográfica e Conteúdo):**
   - **Textos e Alinhamentos:** Título e Subtítulo com controles táteis de alinhamento (`left`, `center`, `right`) no desktop e mobile.
   - **Metadados Textuais:** Badge / Tag de categoria (`post.badgeText`) movido da aba "Logo" para cá; campo de Etapa / Slide (`currentSlide.step`) para carrosséis.
   - **Posicionamento de Texto:** Botão "Redefinir Posição Livre do Texto" para restaurar o layout padronizado da família quando o usuário tiver arrastado livremente o título ou subtítulo no palco Konva.
   - **Tipografia e Fontes:** Catálogo de fontes categorizado (`FONT_CATALOG`: Serifadas, Sans-Serif, Display, Monoespaçadas), upload de fontes locais (.ttf, .otf, .woff2) e importação via URL do Google Fonts — todos migrados da aba "Estilo" para cá.
   - **Cores, Tamanhos e Efeitos:** `TypographyColorControls` com cores por elemento, guardião de contraste WCAG, badges de alerta de contraste, sliders de escala (0.6x a 1.6x) e 10 efeitos visuais de legibilidade.
   - **Legenda Estratégica:** Textarea da legenda para redes sociais com quebras de linha e botão de cópia com 1 clique.

2. **Aba "Estilo" (Direção de Arte e Paleta Base):**
   - **14 Famílias Visuais Oficiais:** Seleção de direção de arte agrupada em Tendências & Instagram, Editorial & Clássico e Métricas & Conversão.
   - **Paleta Cromática Base:** Cores globais restritas a **Fundo** (`palette.background`) e **Destaque** (`palette.accent`). O seletor genérico de "Texto" foi removido daqui para evitar concorrência e sobrescrita com os controles específicos de título/subtexto da aba Texto.

3. **Aba "Mídia" (Fundo, Fotos e Texturas):**
   - Card do slide ativo com mini-preview, botão de enquadramento estilo Canva e download em alta resolução da imagem original.
   - Gerador de imagens com IA (OpenRouter/Pollinations HD).
   - Biblioteca de 110+ texturas oficiais.
   - Upload de foto local / galeria do celular.
   - Botão para fundo sólido sem foto.
   - Slider de escurecimento (Overlay / Scrim).
   - Chave para aplicar fundo a todos os slides em carrossel.

4. **Aba "Logo" (Identidade e Marca):**
   - Upload do logo em PNG transparente com visualização e botão de remoção.
   - Seletor de posicionamento em 4 quadrantes (`top-left`, `top-right`, `bottom-left`, `bottom-right`) com 100% de paridade entre Desktop e Mobile.

---

## 13.4 ADR — Resiliência de Persistência, Sanitização de Imagens Base64 e Resgate de Posts Salvos (2026-09-08)

> **Documentação Completa de Engenharia:** [`docs/mecanismo-resiliencia-persistencia.md`](./docs/mecanismo-resiliencia-persistencia.md)

### 📜 Contexto do Problema:
Na página de posts salvos (`/saved-posts`), a chamada `trpc.post.list` falhava com o erro do PostgreSQL:
`57014: canceling statement due to statement timeout` (tempo limite de ~8 a 10 segundos excedido no Supabase).
Como consequência, a interface React renderizava silenciosamente a mensagem falsa de `"Nenhum post salvo ainda"`, ocultando todos os posts previamente salvos pelo usuário (tanto criações históricas quanto as novas).

### 🔍 Causa-Raiz Diagnosticada:
1. **Acúmulo de Dados Base64 Raw em JSONB**: 12 posts históricos continham strings base64 brutas de imagens PNG (`data:image/png;base64,...`) embutidas diretamente em colunas JSON (`bg_value`, `variation_snapshot`, `slides[].editorState.bgValue.url`, `imageUrl` e `canvas_model`).
2. **Payload Gigante no PostgreSQL**: O volume total das 29 linhas ultrapassava **64 Megabytes** no banco (um único post, o #18, acumulava 21.8 MB de base64).
3. **Estouro de Timeout no PostgREST**: A leitura via `db.from("posts").select("*")` precisava transferir 64MB de tabelas TOAST compactadas, levando mais de 11 segundos e sofrendo aborto pelo timeout de instrução do PostgreSQL.

### 🎯 Soluções Arquiteturais Implementadas:
1. **Sanitização de Dados no PostgreSQL**:
   - As 12 linhas com inchaço de dados foram sanitizadas via pipeline com `@napi-rs/canvas`, redimensionando e convertendo as imagens base64 para JPEG otimizado (max 600px).
   - O volume total do banco foi reduzido em **mais de 50 Megabytes** (o Post #18 caiu de 21.8 MB para 1.4 MB; outros posts caíram de 2-4 MB para ~150-250 KB).
   - O tempo de resposta da consulta `post.list` caiu de >11s (timeout) para **1.4 segundo** para todas as 29 publicações.
2. **Guardião de Compressão no Backend (`server/lib/imageCompress.ts`)**:
   - Criada a rotina pura `compressPostPayload` integrada aos procedimentos `post.save` e `post.update` em `server/routers.ts`.
   - Toda imagem base64 raw maior que 50 KB enviada para persistência é automaticamente comprimida e redimensionada antes do `insert`/`update` no Supabase, garantindo que o banco nunca mais acumule megabytes em JSONB.
3. **Resiliência e Fidelidade Visual na Interface (`client/src/pages/SavedPosts.tsx`)**:
   - **Fallback para `canvas_model`**: O helper `savedPostToVariation` agora inspeciona a coluna `canvas_model` caso `variation_snapshot` não esteja presente, garantindo que posts salvos via CanvasLab renderizem seus cards com a proporção exata (`aspectRatio`), paleta cromática e fundo corretos.
   - **Tratamento Explícito de Erro**: Adicionado bloco visual de erro com botão "Tentar novamente" (`refetch`), eliminando a confusão de exibir "Nenhum post salvo" em caso de falhas de rede ou timeout.

---

## 13.5 ADR — Roteamento multimodelo sem novas rodadas (2026-09-14)

> **Status:** implementado e verificado localmente; ativação em ambiente publicado e avaliação editorial humana permanecem pendentes.

1. `server/ai/modelRouter.ts` passou a resolver modelos por responsabilidade: Gemini 3.8 Flash para geração estática/carrossel e visão, GPT-5.4 Mini para reparo e GLM 5.3 Flash para síntese semântica/juiz opcional.
2. O roteamento não cria ensemble nem nova chamada. Cada `taskRoute` escolhe apenas o modelo da chamada que já existia.
3. O reparo do `generationOrchestrator` agora usa a rota real `quality_revision`; permanece limitado a uma única chamada condicional.
4. `OPENROUTER_TEXT_MODEL` continua como rollback global. Variáveis específicas podem ser removidas para restaurar o modelo anterior sem alteração de código.
5. O adapter converte o JSON Schema do Gemini 3.8 via OpenRouter para `json_object` com schema no prompt, modo que apresentou resposta válida no benchmark; a validação local do contrato permanece obrigatória.
6. `AI_LLM_JUDGE_ENABLED` continua `false` por padrão. Flags obsoletas de grafo foram removidas do `.env.example`.
7. Verificação em 2026-09-14: `tsc --noEmit`, build de produção e 708/708 testes aprovados. Nenhuma chamada externa foi feita nesta entrega; o smoke E2E do schema completo de produção ainda é pendente.

---

## 13.6 ADR — Núcleo semântico e gate editorial (2026-09-14)

> **Status:** implementado localmente; conferência de saídas reais pendente.

1. `contentStrategy.ts` não usa mais perfis fixos de Sintoma Oculto, Critério Técnico ou Causa Contraintuitiva. Ele deriva um `EditorialMeaningPlan` determinístico e limita o número de proposições independentes ao material disponível.
2. As três opções são direções visuais e podem compartilhar a mesma proposição. A posição central não tem papel editorial especial.
3. O prompt principal deixou de pedir voz de especialista, régua de veteranos e três ganchos semanticamente distintos. A redação continua flexível, mas precisa manter referentes e nexo recuperáveis.
4. `checkEditorialGrounding` bloqueia perda de fatos marcados como obrigatórios e atribuição de autoridade sem fonte. Após o único reparo, a persistência dessas violações objetivas rejeita o conjunto; o handler existente executa refund da reserva de Sparks.
5. `evaluation.accepted=false` por outras heurísticas antigas ainda orienta reparo, mas não é bloqueio terminal nesta etapa. O gate não usa uma lista extensa de metáforas proibidas; clareza pragmática será calibrada por amostras reais antes de novos bloqueios.

---

## 13.7 ADR — Taxonomia de falhas e trace degradável (Etapa 1, 2026-09-22)

> **Status:** código, contratos, migração idempotente e testes concluídos localmente; aplicação de migrations no banco remoto aguarda autorização do dono.

1. **Taxonomia compartilhada** em `shared/`: `GenerationFailureReason` (11 causas), `GenerationFailureMetadata` e `GenerationProvenance`, com funções puras em `shared/generationFailure.ts` (`classifyGenerationError`, `toFailureMetadata`, `isRetryable`, `userMessageFor`). Uma reprovação editorial (`quality_rejected`) nunca é classificada como falha de rede.
2. **Erro estruturado na borda**: `GenerationFailureError` (tRPC) transporta `failure` metadata e o `errorFormatter` em `server/_core/trpc.ts` serializa `shape.data.generationFailure`, permitindo que o frontend leia `reason` e `generationRunId` sem depender da mensagem textual. Stack traces são omitidos em produção.
3. **Persistência degradável do trace**: `finishGenerationTrace` tenta o upsert completo e, em incompatibilidade de schema, grava `GENERATION_TRACE_SCHEMA_INCOMPATIBLE` no log operacional e re-tenta com `createGenerationRunMinimal` (colunas da migration 0006). Em qualquer caso registra `GENERATION_TRACE_PERSIST_FAILED`/`GENERATION_TRACE_MINIMAL_PERSISTED` — nunca silencia com `console.warn`.
4. **Coluna `generation_runs.failure_reason`** (migration `0017_add_generation_failure_reason.sql`, idempotente) persiste o motivo normalizado, exposto também no `runtimeManifest` (não-crítico) e no `generationRunRecord`.
5. **`verify:runtime`** continua detectando explicitamente os 6 requisitos críticos ausentes no banco remoto (`spark_reservations`, `generation_runs.events`, `events_version` e as RPCs `reserve_/commit_/refund_spark_reservation`), cuja aplicação requer autorização do dono.

---

## 13.8 ADR — Integridade de slides, save e exportação no CanvasLab (Etapa 2, 2026-09-22)

> **Status:** implementado localmente; checkpoint manual de carrossel (salvar→reabrir→exportar) pendente de validação em navegador.

1. **Comandos canônicos do documento** em `client/src/pages/CanvasLab/lib/documentCommands.ts` (funções puras e imutáveis): `applyPatchToCurrentSlide`, `applyPatchToAllSlides`, `updateSlideById`, `setCurrentSlideBackground`, `duplicateSlide`, `removeSlide`, `reorderSlides` e `resolveCoverSlide`. Regra mandatória: ação "slide atual" nunca escreve no root global.
2. **Projeção pela capa** corrigida em `saveAdapter.ts`: `canvasModelToSavePayload` projeta `headline`, `body` e `imageUrl` a partir do **primeiro slide** (capa), nunca do slide ativo no instante do save. `canvas_model` continua autoritativo.
3. **Duplicação com IDs novos**: `duplicateSlide` regenera IDs de slide e de `extraTexts`/`extraImages` aninhados, sem compartilhar referências mutáveis; `CanvasLabPage` limpa a seleção transitória após duplicar/excluir.
4. **Isolamento de fundo**: `handleUpdateBgTransform` grava `bgTransform` apenas no slide atual (before: escrevia também no root global, causando vazamento entre slides).
5. **ZIP offscreen determinístico** em `CanvasPostStage.exportZip4K`: um único motor (`exportSlideIndex` override) renderiza cada slide explicitamente, aguarda fonts.ready e imagens carregadas, e empacota um PNG por slide na ordem correta — eliminando o bug de repetir o slide visível.
6. **Restore do histórico no Studio ativo** (contrato versionado `postspark.restore_generation` ↔ `StudioAppV2BPage`), eliminando a dependência das chaves legadas `restoredGeneration` que nenhum fluxo oficial consumia.
7. Testes adicionados: `documentCommands.test.ts` (isolamento, IDs, reordenação, capa) e `saveAdapter.test.ts` (projeção pela capa e round-trip save→reopen).

---

## 13.9 ADR — Gates de geração: formato, cópia literal e fallback (Etapa 3, 2026-09-22)

> **Status:** conclusão de UI implementada e testada localmente (confirmação de formato e fallback opt-in); checkout funcional em navegador pendente.

1. **Detector de intenção de formato** em `shared/formatIntent.ts` (`detectFormatIntent` → `detectedFormat`/`confidence`/`evidence`, `hasFormatMismatch`). Regra determinística, sem chamada externa.
2. **Gate de similaridade com o input** em `shared/sourceCopyGate.ts` (`evaluateSourceCopyGate`, `ngramOverlap`, `stripRequiredTerms`): bloqueia copy literal/não autorizada e preserva termos obrigatórios (`mustKeep`) como exceção explícita.
3. **`post.generate` revalida formato antes de reservar Sparks** (`format_mismatch` sem chamada generativa) e roda o gate de similaridade após `approved` — reprovação vira `quality_rejected` com `validationIssues` e refund.
4. **Confirmação de divergência de formato na UI**: `FormatConfirmModal` em `client/src/pages/StudioApp/components/v2/CreationGuards.tsx` interrompe a criação quando `hasFormatMismatch(prompt, mode)` e oferece "Alterar para {detectado}" ou "Manter {selecionado}", sem consumir Sparks antes da decisão.
5. **Fallback explícito opt-in**: `GenerationFailureModal` mostra a causa real (`reason`/`userMessage` da taxonomia), oferece "Tentar novamente" e "Revisar briefing"; sugestões locais só aparecem após escolha explícita e nascem com proveniência `local_fallback` permanente (nunca toast de sucesso de IA). `StudioAppV2BPage` aplica o mesmo tratamento ao "Gerar mais".
6. **Proveniência persistente**: `CanvasPostModel.provenance` + `saveAdapter.normalizeCanvasModel` preservam o campo no save/reopen; `studioGeneration.ts` ganhou `aiGenerationProvenance`/`localFallbackProvenance` e os builders passam a receber `reason`.
7. Testes: `shared/formatIntent.test.ts`, `shared/sourceCopyGate.test.ts`, `studioGeneration.test.ts` (proveniência e fallback) e `saveAdapter.test.ts` (proveniência no round-trip).

---

## 13.10 ADR — Fidelidade tipada entre geração e CanvasLab (Etapa 5, 2026-09-22)

> **Status:** implementado e testado localmente (typed adapter + preservação de campos + versionamento); checkout funcional em navegador pendente.

1. **Adaptador tipado**: `variationToCanvasModel` deixou de receber `any` e passou a consumir `GeneratedVariationInput` (em `client/src/pages/StudioApp/lib/studioGeneration.ts`); o contrato `CarouselSlide`/`ContentSection` vem de `@shared/postspark`.
2. **Campos preservados sem descarte**: `callToAction`, `hashtags`, `sections` (mesmo quando `body` também existe) e `copyAngle` agora viajam do `PostVariation` para o `CanvasPostModel`. `sections` também continuam sintetizadas em `subtext` por legibilidade, sem perder a estrutura original.
3. **Versionamento do modelo**: `CanvasPostModel.modelVersion` (constante `CANVAS_MODEL_VERSION = 2`) — modelos legados sem o campo são lidos com defaults seguros pelo `normalizeCanvasModel`.
4. **Proveniência na fidelidade**: `saveAdapter.normalizeCanvasModel` preserva `provenance`, `callToAction`, `hashtags`, `sections` e `copyAngle` no save/reopen (coluna autoritativa `canvas_model`).
5. Testes: `studioGeneration.test.ts` (round-trip `PostVariation → CanvasPostModel` sem perda) e `saveAdapter.test.ts` (round-trip save→reopen dos campos enriquecidos).

---

## 13.11 ADR — Briefing persistente e inteligência de marca (Etapa 4, 2026-09-23)

> **Status:** implementado e testado localmente (contrato versionado + parsing de URLs + Progressive Disclosure + draft storage + Brand Kit integration).

1. **Contrato versionado `CreationBrief`**: definido em `shared/postsparkSchemas.ts` (`CREATION_BRIEF_VERSION = 1`) com validação estrita via Zod e reexportado em `shared/postspark.ts`.
2. **Parsing e inteligência pura**: `shared/creationBrief.ts` implementa `extractUrlsFromText` (extrai URLs embutidas no meio do texto, limpando pontuações e normalizando), `interpretRawBriefing` (separa entrada bruta de interpretação estruturada, identifica formato, contagem de slides, CTAs e incorpora Brand Kit) e `creationBriefToExecutionBrief` (integração direta com o backend `post.generate`).
3. **Persistência durável de rascunho**: `client/src/pages/StudioApp/lib/briefDraftStorage.ts` persiste o rascunho de criação no `localStorage` de forma resiliente a falhas e corrupção de schema, garantindo recuperação instantânea pós-refresh da aba.
4. **Progressive Disclosure no Studio**: `BriefReviewModal.tsx` exibe a interpretação estruturada antes do gasto de Sparks, permitindo validar e remover fontes/URLs identificadas, ver o Brand Kit ativo e editar opções avançadas de direcionamento editorial.
5. **Integração de Brand Kit**: exposto endpoint tRPC `brandKit.get` em `server/routers.ts` consultando `getBrandKitByUser` e consumido pelo `StudioAppV2BPage` para enriquecer a geração com tom de voz e termos de marca.
6. Testes adicionados: `shared/creationBrief.test.ts` (7 testes cobrindo extração de links, enriquecimento e parsing) e `client/src/pages/StudioApp/lib/briefDraftStorage.test.ts` (4 testes cobrindo round-trip, limpeza e tolerância a corrupção).

---

## 13.12 ADR — Fundo, enquadramento e crop não destrutivo (Etapa 6, 2026-09-23)

> **Status:** implementado e testado localmente (modelo de enquadramento + motor geométrico puro + paridade desktop/mobile + exportação determinística).

1. **Modelo de Enquadramento (`BackgroundPlacement`)**: `client/src/pages/CanvasLab/components/types.ts` ganha `FitMode` (`"cover" | "contain" | "original" | "custom"`) e `BackgroundPlacement` (`fitMode`, `focalPoint`, `crop`, `transform`), suportado em `CarouselSlideItem` e `CanvasPostModel`.
2. **Motor Geométrico Puro**: `client/src/pages/CanvasLab/lib/backgroundPlacement.ts` implementa `computeBackgroundGeometry` e `computeCoverCrop`, garantindo que uploads e imagens de IA preservem o asset original (URL/Storage) de forma não destrutiva, evitando incorporar base64 pesado ao JSON.
3. **Renderização Konva & Exportação 4K**: `CanvasPostStage.tsx` consome `computeBackgroundGeometry` tanto no preview interativo quanto na exportação offscreen em lote (`exportZip4K`), garantindo fidelidade pixel-a-pixel entre o que o usuário vê e os arquivos PNG gerados.
4. **Controles com Paridade Desktop e Mobile**:
   - `CanvasSidebar.tsx` (Desktop) e `CanvasMobileDrawer.tsx` (Mobile) ganham seletores de enquadramento com botões rápidos: Preencher (`cover`), Mostrar Inteira (`contain`), Tamanho Original (`original`) e Restaurar.
5. **Isolamento por Slide e Persistência**: `documentCommands.ts` ganhou `setCurrentSlideBackgroundPlacement` e `saveAdapter.ts` normaliza e preserva `bgPlacement` no round-trip de salvamento e reabertura.
6. Testes adicionados: `client/src/pages/CanvasLab/lib/backgroundPlacement.test.ts` (9 testes cobrindo todos os modos de fit, ponto focal, brutal split, isolamento por slide e persistência).

### 13.13. Etapa 7: Paridade de Textos e Imagens Livres, Normalização de Transformação e Empilhamento

Implementada a arquitetura canônica e paritária de elementos livres (`CanvasCustomText` e `CanvasCustomImage`):
1. **Normalização do `onTransformEnd`**:
   - No `CanvasPostStage.tsx`, o manipulador do Transformer do Konva agora calcula deterministicamente a nova largura `width = Math.max(40, Math.round(itemWidth * scaleX))`, normaliza translação `(x, y)` e rotação `rotation`, e **reseta imediatamente as escalas locais do nó Konva para 1** (`node.scaleX(1); node.scaleY(1)`).
   - Esse padrão impede o acúmulo infinito de distorções matriciais do Konva ao redimensionar elementos repetidas vezes.
2. **Identidade e Duplicação com UUID v4 Real**:
   - `freshUUID()` e `freshId()` em `documentCommands.ts` agora empregam `crypto.randomUUID()` (com fallback RFC4122 v4) em substituição a hashes baseados em timestamp.
   - `duplicateExtraElement` gera IDs verdadeiramente únicos, eliminando conflitos de referências, clonagens corrompidas e crashes visuais.
3. **Controles de Empilhamento (z-index) e Transformação**:
   - Funções puras em `documentCommands.ts`: `duplicateExtraElement`, `removeExtraElement`, `reorderExtraElement` (`front` / `back`), `updateExtraElement`, `setExtraElementOpacity` e `setExtraElementRotation`.
   - Adicionados controles completos na `CanvasSidebar.tsx` (Desktop) e `CanvasMobileDrawer.tsx` (Mobile): slider de opacidade (10% a 100%), slider de giro (-180° a 180°), botões rápidos de camada ("Frente" / "Trás") e botão "Duplicar".
4. **Testes Unitários**:
   - `client/src/pages/CanvasLab/lib/documentCommands.extraElements.test.ts` (9 testes cobrindo conformidade RFC4122/UUID-v4, duplicação não destrutiva, empilhamento Konva, clamps de opacidade/rotação e prevenção de acúmulo de matriz no `onTransformEnd`).

### 13.14. Etapa 8: Editor Assistido, Autosave Resiliente, Undo/Redo e Reordenação de Slides

Implementado o sistema de produtividade e resiliência de edição no CanvasLab:
1. **Autosave com Debounce e Mutex Concorrente**:
   - Módulo `client/src/pages/CanvasLab/lib/autoSaveManager.ts` implementa o `AutoSaveManager` com debounce de 1000ms e controle estrito de concorrência.
   - Enquanto uma requisição de salvamento estiver em voo (`isSaving === true`), mutações subsequentes são enfileiradas (`queuedDoc`) e processadas sequencialmente assim que o save atual terminar.
   - Isso impede condições de corrida, saves concorrentes desordenados e duplicação acidental de posts na biblioteca do Supabase.
   - Estados suportados: `"idle" | "dirty" | "saving" | "saved" | "error"`.
   - Indicador visual no `CanvasTopBar.tsx` exibe o status em tempo real (spinner "Salvando...", check "Salvo", badge âmbar "Não salvo" e alerta vermelho "Erro ao salvar").
2. **Histórico Centralizado de Undo/Redo**:
   - Módulo `client/src/pages/CanvasLab/lib/canvasHistory.ts` implementa operações imutáveis (`createHistory`, `pushHistory`, `undoHistory`, `redoHistory`, `canUndo`, `canRedo`) com limite máximo de profundidade (30 snapshots) para preservar memória.
   - Atalhos de teclado canônicos mapeados: `Ctrl+Z` / `Cmd+Z` (Desfazer), `Ctrl+Shift+Z` / `Cmd+Shift+Z` ou `Ctrl+Y` (Refazer), ignorados quando o foco está em inputs/textareas para não quebrar o histórico nativo de formulários.
   - Botões com estado habilitado/desabilitado integrados ao `CanvasTopBar.tsx`.
3. **Reordenação Drag-and-Drop de Slides Preservando a Capa**:
   - Em `CarouselFilmstrip.tsx`, os cartões de slides agora suportam HTML5 Drag-and-Drop nativo e botões direcionais (setas esquerda/direita).
   - O primeiro slide exibe o badge exclusivo `CAPA`, mantendo a regra canônica de que `resolveCoverSlide(post)` sempre consome deterministicamente o slide 0 como capa autoritativa.
   - Reordenação orquestrada pelo comando canônico `reorderSlides` em `documentCommands.ts`.
4. **Testes Unitários**:
   - `client/src/pages/CanvasLab/lib/canvasHistory.test.ts` (6 testes cobrindo push, undo, redo, descarte de futuro em novos branches e limite de pilha).
   - `client/src/pages/CanvasLab/lib/autoSaveManager.test.ts` (4 testes cobrindo agrupamento de debounce, proteção contra requisições concorrentes, salvamento da versão mais recente da fila, flushNow e tratamento de falha).

### 13.15. Etapa 9: Hardening, Rollout e Matriz de Testes E2E Finais

Conclusão e validação integrada do ciclo Studio V2 / CanvasLab:
1. **Matriz de Testes de Integração Ponta a Ponta**:
   - Desenvolvida a suíte em `client/src/pages/StudioApp/lib/studioFlowIntegration.test.ts` (5 testes integrados) validando a jornada completa sem gaps de contrato:
     - *Cenário 1*: Briefing completo com Brand Kit e URLs externas (`interpretRawBriefing`), persistência de rascunho em storage (`saveBriefDraft`/`loadBriefDraft`), e exportação limpa para o formulário do modal.
     - *Cenário 2*: Transição determinística da galeria do Studio para o CanvasLab com hidratação autoritativa do `CanvasPostModel` e integridade de slides.
     - *Cenário 3*: Manipulação de elementos extras livres (duplicação UUID-v4, opacidade, rotação, empilhamento z-index `front`/`back` e remoção limpa).
     - *Cenário 4*: Edição assistida no CanvasLab combinando histórico imutável (`pushHistory`, `undoHistory`, `redoHistory`), salvamento concorrente com mutex/debounce (`AutoSaveManager`) e reordenação drag-and-drop de carrossel mantendo a regra canônica do slide 0 como capa.
     - *Cenário 5*: Proteção contra regressões nos normalizadores de transformação do Konva Stage: elementos livres continuam consolidando escala na dimensão final; headline e subtítulo usam uma sessão geométrica imutável, sem realimentar cada frame com a caixa visual recalculada pelo word wrap.
2. **Auditoria de Integridade**:
   - Nenhuma migração destrutiva aplicada no Supabase.
   - Todos os arquivos essenciais e pré-modificados preservados intactos.
   - Paridade rigorosa entre as interfaces de desktop (`CanvasSidebar`) e mobile (`CanvasMobileDrawer`).

---

## 13.13 ADR — Word Wrap e Nova Física da Caixa de Texto no CanvasLab (2026-09-23)

Implementada a Etapa 1 da refatoração de redimensionamento de texto para o editor oficial:

1. **Redimensionamento Natural (Word Wrap Vivo)**: A deformação anamórfica de arrastar textos com escala livre foi removida. O componente `<Transformer>` do Konva agora oculta alças verticais para textos (`enabledAnchors`). Ajustar pelas alças laterais altera ativamente a propriedade `width` das caixas (`onTransform`), acionando o word wrap em tempo real sem esticar as letras.
2. **Geometria estável**: Headline e subtítulo expõem somente as alças laterais. Um frame geométrico transparente e dedicado, irmão do grupo visual, é o único alvo do `Transformer`; fundos de legibilidade, sombras e alterações de altura causadas pelo word wrap ficam fora do cálculo do bounding box. A escala Konva volta imediatamente a 1, sem distorcer os glifos.
3. **Persistência de Propriedades por Slide**: `CanvasPostModel.CarouselSlideItem` rastreia individualmente `headlineWidth`, `subtextWidth`, `headlineScale` e `subtextScale`. O normalizador de `saveAdapter.ts` preserva e valida essas propriedades ao reabrir o post.

## 13.14 ADR — Inspetor Contextual Universal no CanvasLab (2026-09-23)

Implementada a Etapa 2 da refatoração de UX do editor oficial:

1. **Property Inspector (UX Universal)**: O CanvasLab agora possui o módulo `PropertyInspector.tsx` responsável por substituir os painéis inteiros da Barra Lateral (`CanvasSidebar`) e do Drawer (`CanvasMobileDrawer`) quando há um elemento de texto selecionado.
2. **Separação de Abas vs Propriedades**: As abas globais de "Estilo", "Mídia" e "Conteúdo" continuam disponíveis apenas quando o CanvasLab não possui seleção ativa. Ao clicar em Título, Subtítulo ou Texto Extra, o Property Inspector fornece controles unificados (Cor, Fonte, Opacidade, Fundo de Legibilidade, Z-Index) focados estritamente na seleção atual.
3. **Limpeza da aba Style**: `TypographyColorControls` foi migrado globalmente para o escopo do Inspector.

## 13.15 ADR — Motor de Rich Text Nativo Konva (2026-09-23)

Implementada a Etapa 3 da refatoração de tipografia do CanvasLab:

1. **Schema JSON de Rich Text**: A interface `CanvasRichTextChunk` foi criada no `CanvasPostModel` e implementada dentro de `CarouselSlideItem` (via `headlineRich` e `subtextRich`) e `CanvasCustomText`. Inclui overrides por trecho de cor, escala, negrito, itálico e sublinhado.
2. **Mini-Barra Contextual (`RichTextFloatingToolbar.tsx`)**: Recebe a seleção autoritativa do editor e dispara formatações granulares de Cor e Tamanho (Ex: T+, T-). No desktop é posicionada dentro do viewport; no mobile integra o chrome inferior de edição, sem substituir o texto do Konva.
3. **Konva Rendering 2D Engine (`RichTextRenderer.tsx`)**: Para suportar nós de cores diferentes sem o DOM `foreignObject` (visando manter as fontes carregáveis na exportação zip), o motor cria os nós de `<Text>` do Konva posicionados individualmente. A quebra de linha utiliza `canvas.measureText()` nativo antes do envio ao WebGL. O alinhamento resolve conflitos com tamanhos variados usando `textBaseline="top"` nativo e cálculo de offsets locais para Y e alinhamento center/right.

## 13.16 Estabilização da edição inline e do resize tipográfico (2026-09-23)

1. **Konva como representação visual única**: o texto selecionado permanece visível e editável no próprio palco. O HTML não espelha fonte, dimensões ou quebras; um `<textarea>` invisível captura apenas teclado, clipboard, seleção nativa e IME. Isso elimina tanto o ghosting quanto a troca perceptível de motor ao entrar e sair da edição.
2. **Geometria compartilhada**: `lib/richTextLayout.ts` é usado por `RichTextRenderer`, hit test, caret, seleção, cálculo de altura e word wrap. Título, corpo e textos extras deixam de combinar métricas independentes durante a interação.
3. **Feedback rico imediato e transacional**: cor, tamanho, negrito, itálico, sublinhado e limpeza atualizam o render Konva local antes da persistência. Inserções e remoções reconciliam os chunks para conservar o estilo ao redor. `Concluir` persiste texto e chunks juntos em uma única entrada do histórico; `Cancelar` descarta ambos.
4. **Resize horizontal determinístico**: headline e subtítulo expõem somente alças laterais. Cada gesto parte de um snapshot imutável capturado no `transformstart`; a geometria corrente é derivada diretamente do deslocamento do ponteiro, com precisão subpixel durante a interação e arredondamento apenas no commit. A alça direita mantém a borda esquerda fixa, a esquerda mantém a borda direita fixa, e a largura redistribui palavras entre linhas sem escala anamórfica nem redução automática da fonte. As posições relacionadas são congeladas durante o gesto e persistidas atomicamente no slide ao final.
5. **Seleção on-canvas**: clique/arraste dentro de título, corpo ou texto extra resolve índices pelo mesmo layout e desenha highlight/caret em Konva; a barra HTML permanece apenas como controle flutuante e nunca substitui a arte.
6. **Persistência**: `headlineRich`, `subtextRich`, `textRich`, `headlineWidth`, `subtextWidth` e escalas legadas são normalizados em `saveAdapter.ts` na raiz e por slide, garantindo reabertura fiel.
7. **Testes de regressão**: `richText.test.ts` cobre aplicação/reconciliação dos chunks e `richTextLayout.test.ts` cobre reflow monotônico, hit test, seleção, caret, quebras explícitas e estilos mistos.

## 13.17 Frame geométrico determinístico para resize de texto (2026-09-24)

1. **Separação entre geometria e aparência**: `CanvasPostStage.tsx` conecta o `Transformer` de headline e subtítulo a frames transparentes dedicados, em vez dos grupos que contêm glifos, seleção e efeitos de legibilidade. O bounding box deixa de variar quando o texto troca de linha ou quando um efeito extrapola a largura nominal.
2. **Sessão imutável por gesto**: `lib/textResizeGeometry.ts` registra alça ativa, ponteiro inicial, posição e largura iniciais. Cada frame é calculado a partir desse mesmo baseline, impedindo que o resultado renderizado no frame anterior realimente o próximo cálculo.
3. **Invariantes das bordas**: a alça direita altera somente a largura e mantém `x`; a alça esquerda conserva a borda direita e deriva `x` da nova largura. O limite mínimo de 40 px é aplicado sem salto de posição.
4. **Renderização fluida e commit estável**: valores fracionários são preservados durante o arraste; `x`, `y` e largura são arredondados apenas no `transformend`. A persistência continua atômica por `CanvasLabPage.handleUpdateTextTransform`, produzindo uma única mutação de documento/histórico ao concluir o gesto.
5. **Sincronização de movimento**: ao arrastar headline ou subtítulo, o frame geométrico acompanha o grupo visual e o `Transformer` é atualizado, evitando divergência entre a caixa de seleção e o texto.
6. **Cobertura de regressão**: `lib/textResizeGeometry.test.ts` valida monotonicidade, bordas fixas, largura mínima, gesto de ida e volta, precisão subpixel e independência entre frames.

## 13.18 Toggle de negrito e overrides tipográficos explícitos (2026-09-24)

1. **Toggle contextual**: o botão de negrito da `RichTextFloatingToolbar` consulta o peso efetivo do intervalo selecionado. Se todo o trecho estiver em bold, o clique desativa; em seleção normal ou mista, o clique uniformiza o intervalo em bold.
2. **Estado visual e acessibilidade**: o controle expõe `aria-pressed` e apresenta fundo de acento, deslocamento e sombra interna quando ativado, reproduzindo o comportamento pressionado/despressionado esperado em editores visuais.
3. **Contrato com três estados**: `RichTextFormatPatch` distingue herança (`null`/ausência de override), bold explícito (`true`) e peso normal explícito (`false`). Isso permite remover negrito de um trecho mesmo quando o estilo-base do elemento — como a headline — já é bold.
4. **Renderização independente da família**: `richTextLayout.ts` resolve o override por caractere antes de gerar os nós `Text` do Konva, enviando `fontStyle="bold"` ou `fontStyle="normal"` ao canvas para qualquer família tipográfica ativa.
5. **Persistência fiel**: `saveAdapter.ts` preserva tanto `bold: true` quanto `bold: false` no `CanvasPostModel`, mantendo o estado após salvar e reabrir.
6. **Cobertura de regressão**: `richText.test.ts`, `richTextLayout.test.ts` e `saveAdapter.test.ts` cobrem o toggle, seleção mista, override normal dentro de uma base bold e round-trip de persistência.

## 13.19 Fundos e efeitos para a caixa de texto selecionada (2026-09-24)

1. **Novo alvo contextual**: o seletor de “Fundo e Efeito das Letras” oferece `Caixa selecionada` quando `selectedElementId` corresponde a um `CanvasCustomText` do slide ativo. Ao trocar a seleção para outra caixa, esse alvo passa a apontar automaticamente para o novo elemento.
2. **Isolamento da mutação**: efeitos e cores escolhidos nesse alvo são enviados por `onUpdateExtraText(id, patch)` e alteram somente `effect`/`effectColor` da caixa selecionada; Título, Corpo, outras caixas e outros slides permanecem intactos.
3. **Paridade desktop/mobile**: `CanvasSidebar` e `CanvasMobileDrawer` resolvem o texto extra ativo e entregam o mesmo contexto a `TypographyColorControls`. O seletor usa grade adaptativa para acomodar quatro alvos sem comprimir o controle mobile.
4. **Paridade do inspetor contextual**: `PropertyInspector` também aceita `effect` e `effectColor` para textos extras, eliminando a antiga restrição interna a headline/subtexto.
5. **Contraste no Konva**: `CanvasPostStage` aplica às caixas extras a mesma resolução de cor usada por Título e Corpo nos efeitos `box-accent` e `box-brutal`, evitando texto ilegível sobre a nova superfície.
6. **Cobertura de regressão**: `TypographyColorControls.test.tsx` valida em DOM que o alvo contextual nasce ativo e que selecionar um fundo atualiza exclusivamente a caixa escolhida.

## 13.20 Revisão de briefing condicional por formato (2026-09-24)

1. **Revisão exclusiva para carrossel**: após interpretar e persistir o briefing, o fluxo do The Void abre `BriefReviewModal` apenas quando o formato efetivo é `carousel`. Posts estáticos seguem diretamente para `doGenerate`, sem uma etapa intermediária de revisão.
2. **Formato definido antes do modal**: o seletor entre post único e carrossel foi removido da revisão. O formato autoritativo vem da escolha feita na criação ou da decisão tomada no `FormatConfirmModal` quando o texto e a seleção explícita divergem.
3. **Roteamento unificado**: submissões normais e as duas decisões do modal de divergência passam por `prepareBriefAndContinue`, evitando diferenças de comportamento entre os caminhos e garantindo que somente carrosséis parem para revisão.
4. **Revisão focada na estrutura**: para carrosséis, o modal mantém a quantidade de slides, referências e campos avançados relevantes à composição, sem permitir uma troca tardia de formato.
5. **Transição de geração visível**: ao confirmar o briefing, `isReviewingBrief` é desativado antes de iniciar `doGenerate`. Assim, o modal sai da tela e o `ProductionOverlay` normal de preparação dos posts fica visível durante a geração.
6. **Recuperação coerente**: a opção de revisar o briefing após uma falha de geração reabre o modal somente para carrosséis; em posts estáticos, retorna à etapa de criação.
7. **Cobertura de regressão**: `lib/briefReviewPolicy.test.ts` fixa a política por formato e `components/v2/BriefReviewModal.test.tsx` confirma a ausência do seletor de formato e o acionamento da confirmação.

## 13.21 Salvamento automático opcional no CanvasLab (2026-09-24)

1. **Controle explícito**: `CanvasTopBar` oferece um checkbox de salvamento automático, inicialmente desativado. A preferência é guardada em `localStorage` (`postspark.canvasAutoSaveEnabled`) e aplicada nas próximas sessões do navegador.
2. **Edição independente da persistência**: com o checkbox desligado, mutações, Undo e Redo continuam atualizando o `CanvasPostModel` e o indicador de alterações, mas não agendam requisições de salvamento. Ao ativar o controle com alterações pendentes, o documento atual entra no fluxo de autosave.
3. **Desativação imediata e coordenação manual**: o `AutoSaveManager` cancela o debounce e descarta versões enfileiradas ao desligar. Uma requisição já enviada pode terminar, sem iniciar outra após a desativação. Durante um save manual, o autosave pausa o agendamento para não duplicar a mesma versão e retoma somente se novas edições ocorrerem nesse intervalo.
4. **Feedback conforme a origem**: `CanvasLabPage` informa se o salvamento foi manual ou automático a `StudioAppV2BPage.handleSavePost`. Somente o salvamento manual mostra toast de sucesso ou erro; o automático usa apenas o indicador discreto da barra superior.
5. **Cobertura de regressão**: `lib/autoSaveManager.test.ts` verifica o cancelamento de saves pendentes e enfileirados e a coordenação com um save manual.

## 13.22 Hierarquia responsiva dos controles do CanvasLab (2026-09-24)

1. **Barra superior enxuta**: a marca PostSpark Studio ocupa o início do cabeçalho, com tratamento tipográfico e brilho discreto. Desfazer/Refazer recebem um grupo destacado; salvamento manual, preferência de autosave, exportação e conta ficam entre as ações globais. Galeria permanece como retorno direto no mobile e como ação do menu no desktop. Recomeçar mantém o diálogo de confirmação: aparece na barra rápida acima da arte no mobile e no menu no desktop.
2. **Ferramentas da prancheta por largura**: `CanvasToolRail` apresenta formato, ímã e zoom em uma coluna compacta na borda direita do canvas a partir de `xl` (1280 px). O seletor de proporção mostra o valor atual (por exemplo, `1:1`) junto ao rótulo visível “Formato”, em vez de depender apenas de um ícone; o menu também usa esse nome. Entre `md` e `xl`, esses comandos ficam em “Mais ações”. Abaixo de `md`, `CanvasMobileQuickActions` mostra Formato, slide, Zoom, Ímã, Baixar e Recomeçar em uma faixa própria acima da prancheta enquanto o painel inferior estiver fechado; o espaço é reservado no layout e liberado ao abrir o painel. O botão Zoom abre abaixo de si um slider tátil de 60% a 180%, em passos de 5%, com percentual atual e restauração para 100%; durante o arraste a escala do palco acompanha o dedo sem a interpolação de mola. Baixar oferece a imagem 4K do slide atual e, em carrossel, o ZIP de todos os slides, usando os mesmos handlers de exportação do editor.
3. **Inserção sem duplicação na barra**: os atalhos de inserir texto e imagem saíram do topo. Texto livre permanece em Texto; a ação principal de inserir imagem sobreposta fica em Mídia, distinta de definir imagem de fundo. As listas contextuais dos elementos continuam disponíveis para gerenciamento.
4. **Dock e slides no mobile**: Texto, Estilo, Mídia e Logo ficam sempre visíveis em um dock flutuante inferior, afastado das bordas e da área segura do dispositivo. Em carrosséis, a faixa compacta de slides aparece acima dele quando o painel de edição está fechado. Ao abrir uma ferramenta, o painel de propriedades ocupa a área acima do dock, a faixa se recolhe e um indicador “Slides · atual/total” permite voltar a ela. Em posts de slide único a faixa não ocupa espaço; a barra rápida usa “+ 2º slide” para acrescentar o segundo slide ao post atual e transformá-lo em carrossel (texto detalhado “Transformar este post em carrossel” no menu). A partir de dois slides, o rótulo vira “+ Slide”; o botão de inserção da faixa fica apenas no desktop para não duplicar a ação no mobile. O menu tátil de ações de cada slide permanece disponível na faixa.
5. **Viewport**: a página usa altura dinâmica (`100dvh`), reserva espaço real para a barra rápida, o dock e a faixa mobile e calcula a escala/deslocamento da prancheta conforme a área livre quando o painel abre. A barra superior não depende da distribuição simultânea de todos os controles em uma única linha.
6. **Cobertura de regressão**: `CanvasTopBar.test.tsx` garante que Desfazer, Refazer e Salvar continuem acionáveis e que os atalhos redundantes de inserção não voltem ao cabeçalho; `CanvasMobileDrawer.test.tsx` confirma que as quatro ferramentas de edição permanecem acessíveis com o painel fechado; `CanvasMobileQuickActions.test.tsx` verifica o rótulo contextual do segundo slide, as ações diretas e o ajuste por teclado do slider de zoom.

## 13.23 Seleção de texto tátil e chrome contextual estável (2026-09-24)

1. **Seleção no Konva**: duplo clique/toque em título, corpo ou texto extra seleciona a palavra usando `lib/textSelection.ts`; triplo clique seleciona todo o conteúdo. Toque longo também abre a edição no mobile. O highlight e o caret continuam no Konva; o `textarea` invisível conserva teclado, clipboard e IME.
2. **Alças táteis**: uma seleção não vazia no mobile mostra alças de início e fim desenhadas no Konva, com área de toque ampliada conforme a escala visual da prancheta. Arrastá-las atualiza a mesma seleção do `textarea` e do render, permitindo expansão do intervalo sem duplicar a arte.
3. **Formatação sem deslocamento**: no mobile, formatação e ações Concluir/Cancelar/Selecionar tudo ocupam slots fixos acima do dock inferior; a barra não persegue a palavra nem ultrapassa a borda. A paleta contextual mobile usa duas linhas de seis células ajustadas à largura disponível, sem rolagem horizontal: cinco cores rápidas mais o seletor nativo de espectro completo na primeira; B, I e U com toggle/estado pressionado, T+, T− e Limpar na segunda. `T=` foi removido por duplicar a restauração de tamanho de Limpar. A escolha personalizada atualiza os chunks ricos do trecho selecionado sem devolver prematuramente o foco ao `textarea`; ao fechar o seletor, o foco volta ao editor. No desktop, a barra contextual fica limitada ao viewport e oferece os mesmos comandos de estilo. A seleção é o estado único compartilhado entre canvas e comandos.
4. **Recolher o painel**: deslizar para baixo no cabeçalho fecha o painel de propriedades; no conteúdo, fecha somente quando a rolagem interna está no topo. O movimento é interceptado para não acionar o pull-to-refresh durante esse gesto; a rolagem normal do conteúdo permanece disponível.

## 14. Comandos de Validação e Deploy

Toda alteração de código deve ser verificada pelo seguinte protocolo antes do deploy:

```bash
# 1. Verificação Estrita de Tipagem TypeScript (0 erros obrigatórios)
pnpm check

# 2. Execução da Bateria Completa de Testes Automatizados (831 testes em 2026-09-24)
pnpm test

# 3. Compilação de Produção (Vite para frontend + esbuild para api/index.js)
pnpm build

# 4. Verificação de Runtime e Migrações
pnpm run verify:runtime

# 5. Execução do Servidor em Produção
pnpm start
```
