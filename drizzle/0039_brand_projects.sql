-- Drizzle migration: 0039_brand_projects.sql
-- Múltiplos projetos de marca por usuário com calibragem e dossiê textual

CREATE TABLE IF NOT EXISTS postspark.brand_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_uuid UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    niche VARCHAR(120) NOT NULL,
    source_type VARCHAR(32) NOT NULL DEFAULT 'form',
    structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    compiled_document TEXT NOT NULL DEFAULT '',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para busca rápida por usuário e ordenação
CREATE INDEX IF NOT EXISTS idx_brand_projects_user_uuid ON postspark.brand_projects (user_uuid);
CREATE INDEX IF NOT EXISTS idx_brand_projects_user_default ON postspark.brand_projects (user_uuid, is_default);

-- Permissões para runtime da aplicação e service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON postspark.brand_projects TO authenticated, service_role;
