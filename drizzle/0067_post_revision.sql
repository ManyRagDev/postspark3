-- Optimistic concurrency for the authoritative CanvasLab document. Apply before
-- the application rollout; old documents start at revision 1 without rewriting JSON.
ALTER TABLE postspark.posts ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION postspark.increment_post_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  NEW."updatedAt" := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION postspark.increment_post_revision() FROM PUBLIC;
DROP TRIGGER IF EXISTS posts_revision ON postspark.posts;
CREATE TRIGGER posts_revision BEFORE UPDATE ON postspark.posts
FOR EACH ROW EXECUTE FUNCTION postspark.increment_post_revision();
