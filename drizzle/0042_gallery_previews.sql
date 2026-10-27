-- Optional presentation projection. The saved CanvasPostModel remains authoritative.
ALTER TABLE postspark.posts ADD COLUMN gallery_preview text CHECK(gallery_preview IS NULL OR (length(gallery_preview)<=100000 AND gallery_preview ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));
