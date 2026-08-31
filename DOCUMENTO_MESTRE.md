# DOCUMENTO_MESTRE — PostSpark 3

## 1. Propósito do Sistema

O **PostSpark 3** é uma aplicação full stack de alta performance para geração, edição visual em tempo real, persistência e exportação de posts e carrosséis para redes sociais com apoio de Inteligência Artificial.

### Fluxo Operacional:
1. **Entrada do Usuário**: Texto, ideia ou URL extraída.
2. **Orquestração Generativa Única**: O modelo gera em 2 a 4 segundos o copywriting autoral (sem clichês de IA), a estrutura de slides e a seleção semântica das direções de arte oficiais.
3. **Guardrail Determinístico de Diversidade**: O algoritmo `ensureDistinctFamilies` valida as famílias visuais em < 0.1ms em memória, garantindo 100% de distinção visual entre as opções do HoloDeck.
4. **Proteção Automática de Contraste WCAG**: O motor `resolveLegibleTextColor` calcula dinamicamente a luminância do fundo e garante que textos sejam sempre 100% nítidos e legíveis em qualquer cor de fundo.
5. **Edição Visual Interativa (Studio & CanvasLab)**: Prancheta gráfica alimentada por Konva 2D (`react-konva`) com drag-and-drop, ímã magnético com guias inteligentes, suporte a carrosséis multi-slides, upload de logo, tipografia com Google Fonts e gaveta flutuante com mais de 110 texturas HD.
6. **Persistência & Exportação**: Renderização e download em alta fidelidade PNG/JPEG e persistência transacional com Supabase e controle de Sparks/Billing por Stripe.

---

## 2. Arquitetura Técnica

| Camada | Tecnologia Principal | Responsabilidade |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite, TailwindCSS, Framer Motion | Interface do usuário reativa e fluida |
| **Motor Gráfico** | Konva 2D (`react-konva`, `konva`) | Prancheta gráfica vetorial, manipulação direta de elementos, exportação em alta resolução |
| **Estado Global** | Zustand, React Query (`@tanstack/react-query`) | Gerenciamento de estado do editor e cache de chamadas |
| **Backend / API** | Node.js, Express, tRPC (`@trpc/server`) | Borda tipada, procedures de IA, persistência e billing |
| **Orquestrador de IA** | `generationOrchestrator.ts` (OpenRouter / Groq / Gemini) | Chamada generativa única em alta velocidade |
| **Persistência** | Supabase (`@supabase/supabase-js`), PostgreSQL | Autenticação, banco relacional e storage |
| **Billing & Planos**| Stripe Webhooks & SDK | Assinaturas Pro/Agency e recarga de Sparks |

### Rotas do fluxo Studio (criação → galeria → editor)

- `/studio` e `/thevoid` (protegidas): fluxo atual — `StudioAppPage` → `StudioCreateView` → `StudioGalleryView` → `CanvasLabPage`.
- `/studio-v2` (protegida, **experimental**): mesma máquina de estados com a primeira iteração da tela de criação `StudioCreateViewV2` (editorial/cinematográfica, mobile-first, espécimes das famílias oficiais na entrada, loading sem percentual fake).
- `/studio-v2b` (protegida, **experimental**): mesma máquina de estados com a tela de criação regularizada `StudioCreateViewV2B` — no-scroll absoluto, campo de escrita como "folha tonal" (contraste de superfície, sem outline de formulário; o envio é um botão inline DENTRO da folha e o micro-label sob o campo alterna entre "Criar direções de arte" e "Criar com este gosto"; o atalho Enter submete mas não é anunciado), prateleira honesta com **direção de gosto**: tocar num espécime traz a copy e declara a família visual como gosto (header lê "Deixa com o estúdio" ↔ "Gosto — {família}"). A família declarada viaja como **instrução de texto dentro do `content`** do `post.generate` (`buildTasteInstruction`), apenas para input de texto — em URL a identidade extraída do site prevalece. O motor não foi alterado. Na galeria, a variação da família declarada recebe a marcação "SEU GOSTO" (desktop e flashcards mobile); se a IA não usar a família, toast honesto. O fallback local (`buildInitialFallbackVariations`) também remapeia a primeira variação para a família declarada.
- Subcomponentes idênticos entre as duas iterações estão em `client/src/pages/StudioApp/components/v2/shared.tsx`; mudanças ali afetam as duas rotas simultaneamente.
- O mapeamento IA → `CanvasPostModel` e os fallbacks de geração estão centralizados em `client/src/pages/StudioApp/lib/studioGeneration.ts` e são compartilhados pelas três páginas.

---

## 3. Catálogo das 14 Direções de Arte Oficiais

### 🌟 Categoria 1: Tendências & Instagram (Novos Arquétipos)
1. **🔲 Stroke Impact (`stroke-impact`)**: Títulos com contorno vazado (*stroke outline*) intercalado com preenchimento sólido em Bebas Neue.
2. **🎬 Pôster de Cinema (`cinematic-depth`)**: Tipografia monumental, linhas de enquadramento e rodapé cinematográfico.
3. **⚡ Brutal Split (`brutal-split`)**: Divisão 50/50 em duas metades com cores contrastantes (@design.deb) com corte horizontal nítido e tipografia limpa.
4. **✨ Glass Veil (`glass-veil`)**: Cartão translúcido flutuante de vidro fosco com bordas iluminadas e badge em pílula.
5. **🤖 Cyber & Glitch (`cyber-glitch`)**: Miras táticas (+), scanlines vetoriais e tags de terminal neon.

### 📰 Categoria 2: Editorial & Clássico
6. **📰 Editorial de Luxo (`editorial-poster`)**: Playfair Display, aspas decorativas translúcidas gigantes e divisórias nobres douradas.
7. **💥 Minimalismo Brutal (`chromatic-block`)**: Anton massiva (32px all-caps), fundo saturado e sticker rotacionado (-4°).
8. **🎨 Duotone Wash (`duotone-wash`)**: Gradiente linear diagonal a 135° e composição limpa.
9. **💬 Citação de Autoridade (`quote-authority`)**: Tipografia Cinzel serifada para frases de alto impacto e autoridade.
10. **🍃 Minimalismo Arejado (`minimal-air`)**: Espaço em branco generoso, equilíbrio e clareza.

### 📊 Categoria 3: Métricas & Conversão
11. **⚔️ Comparação Versus (`versus`)**: Estrutura em duas colunas para "Antes vs Depois" e "Certo vs Errado".
12. **📊 Data Punch (`data-punch`)**: Números monumentais e métricas quantitativas em destaque.
13. **⚡ Tipografia Cinética (`kinetic-type`)**: Tipografia dinâmica em Syne Bold com ritmo visual.
14. **🧱 Mosaico & Grade (`mosaic-grid`)**: Organização modular em blocos e passos estruturados.

---

## 4. Invariantes de Qualidade e Contratos Blindados

1. **Latência de Geração**: A rota `post.generate` opera em **chamada generativa única (2 a 4s)**. Loops lentos de juízes secundários permanecem desativados por padrão (`AI_LLM_JUDGE_ENABLED=false`).
2. **Garantia de Contraste WCAG**: Toda geração ou ajuste de estilo executa `resolveLegibleTextColor`, impedindo texto ilegível em qualquer cor de fundo.
3. **Bypass Seguro de Imagens**: Se o storage proxy externo não estiver configurado, o gerador de imagens por IA retorna diretamente o DataURI em alta resolução, nunca imagens mockadas.
4. **UI Polida**: Notificações via Toaster posicionadas no canto inferior direito (`bottom-right`) com animação ascendente para não sobrepor ferramentas e seletores superiores.

---

## 5. Comandos de Validação e Deploy

```bash
# Verificação de Tipagem TypeScript (0 erros obrigatórios)
pnpm check

# Execução de Testes Unitários e de Integração
pnpm test

# Compilação e Build de Produção (Vite + esbuild)
pnpm build

# Inicialização em Modo Produção
pnpm start
```
