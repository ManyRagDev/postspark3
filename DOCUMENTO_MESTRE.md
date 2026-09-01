# DOCUMENTO_MESTRE — PostSpark 3

## 1. Propósito do Sistema

O **PostSpark 3** é uma aplicação full stack de alta performance para geração, edição visual em tempo real, persistência e exportação de posts e carrosséis para redes sociais com apoio de Inteligência Artificial.

### Fluxo Operacional:
1. **Entrada do Usuário**: Texto, ideia ou URL extraída.
2. **Orquestração Generativa Única**: O modelo gera em 2 a 4 segundos o copywriting autoral (sem clichês de IA), a estrutura de slides e a seleção semântica das direções de arte oficiais.
3. **Guardrail Determinístico de Diversidade**: O algoritmo `ensureDistinctFamilies` valida as famílias visuais em < 0.1ms em memória, garantindo 100% de distinção visual entre as opções do HoloDeck.
4. **Proteção Automática de Contraste WCAG**: O motor `resolveLegibleTextColor` calcula dinamicamente a luminância do fundo e garante que textos sejam sempre 100% nítidos e legíveis em qualquer cor de fundo.
5. **Edição Visual Interativa (Studio & CanvasLab)**: Prancheta gráfica alimentada por Konva 2D (`react-konva`) com drag-and-drop, ímã magnético com guias inteligentes, suporte a carrosséis multi-slides, upload de logo, tipografia com Google Fonts, Viewport Adaptativo mobile com física de mola e Catálogo de Texturas HD em Modo Estúdio com Dial Orbital e lente de preview em tempo real.
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

### Rotas Oficiais Consolidadas do PostSpark

- **`/` (pública)**: Página inicial oficial para usuários não autenticados (`StudioHomePage`) com palco autônomo e degustação interativa das 6 famílias oficiais em tempo real. Se o usuário estiver logado, redireciona automaticamente para `/thevoid`.
- **`/criar` e `/p` (públicas / slug curto de tráfego)**: Página oficial de alta conversão para anúncios e tráfego pago (`PreviewHomePage`), destacando o motor de Brand DNA por URL, carrosséis narrativos estruturados e o Estúdio de Texturas Táteis com editor nativo Konva 2D. (Aliases de compatibilidade: `/preview-home`, `/crie-posts-incriveis`).
- **`/thevoid` e `/studio` (protegidas / oficial logado)**: Estúdio de criação oficial logado alimentado por `StudioAppV2BPage` (`StudioCreateViewV2B` → `StudioGalleryView` → `CanvasLabPage`) com folha de escrita nobre, logo oficial PostSpark (símbolo $152\text{px}$, texto com "Spark" em `#FF5C00`), prateleira colapsável com Lente de Zoom Óptico 2x e barra de corrida no loading.
- **`/canvas-lab` (protegida)**: Editor gráfico de prancheta direta (Konva 2D, dial tátil de texturas e exportação em 4K).
- **`client/src/pages/_legacy/`**: Diretório que arquiva páginas históricas e versões anteriores (`TheVoid2Page`, `Landing`, `Landing2`, `landing3`, `Landing4`, `StudioAppPage`, `StudioAppCleanPage`, `StudioAppV2Page`). Rotas legadas possuem redirecionamentos automáticos em `App.tsx`.

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
