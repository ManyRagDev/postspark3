-- Dual-write migration for postspark.posts
-- Date: 2026-03-08
-- Goal: keep legacy integer userId and introduce UUID ownership via user_uuid

BEGIN;

ALTER TABLE postspark.posts
  ADD COLUMN IF NOT EXISTS user_uuid uuid;

CREATE INDEX IF NOT EXISTS idx_posts_user_uuid
  ON postspark.posts (user_uuid);

-- Backfill from legacy postspark.users.openId pattern: supabase:<uuid>
UPDATE postspark.posts p
SET user_uuid = split_part(u."openId", ':', 2)::uuid
FROM postspark.users u
WHERE p."userId" = u.id
  AND p.user_uuid IS NULL
  AND u."openId" LIKE 'supabase:%';

COMMIT;
