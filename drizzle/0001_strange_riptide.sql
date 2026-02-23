ALTER TABLE "postspark"."posts" ADD COLUMN "postMode" varchar(32) DEFAULT 'static' NOT NULL;--> statement-breakpoint
ALTER TABLE "postspark"."posts" ADD COLUMN "slides" jsonb;--> statement-breakpoint
ALTER TABLE "postspark"."posts" ADD COLUMN "textElements" jsonb;