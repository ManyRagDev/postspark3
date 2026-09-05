-- 0016 — Coluna canvas_model em postspark.posts
--
-- Persiste o modelo completo do editor CanvasLab (PostSpark Studio,
-- rota /thevoid) para permitir reabertura de posts salvos com fidelidade
-- total: famílias, paleta, posições arrastadas por slide, logo, escala
-- tipográfica e alinhamentos.
--
-- A coluna é opcional (nullable jsonb) e aditiva: posts criados pelo fluxo
-- legado permanecem válidos; posts salvos pelo CanvasLab carregam o modelo.
-- Idempotente para reexecução segura.

ALTER TABLE postspark.posts ADD COLUMN IF NOT EXISTS canvas_model jsonb;

COMMENT ON COLUMN postspark.posts.canvas_model IS
  'Modelo completo do editor CanvasLab (PostSpark Studio) para reabertura com fidelidade total';
