CREATE SCHEMA "postspark";
--> statement-breakpoint
CREATE TABLE "postspark"."posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"inputType" varchar(16) NOT NULL,
	"inputContent" text NOT NULL,
	"platform" varchar(32) NOT NULL,
	"headline" text,
	"body" text,
	"hashtags" jsonb,
	"callToAction" text,
	"tone" varchar(64),
	"imagePrompt" text,
	"imageUrl" text,
	"backgroundColor" varchar(32),
	"textColor" varchar(32),
	"accentColor" varchar(32),
	"layout" varchar(32),
	"exported" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postspark"."users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" varchar(32) DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
