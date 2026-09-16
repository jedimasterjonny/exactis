CREATE TYPE "public"."funding" AS ENUM('fixed', 'spare');--> statement-breakpoint
-- Each column is added with a default so the accounts already held take
-- it, and the default is dropped again so the column is what the schema
-- says it is: every value written, none assumed.
ALTER TABLE "accounts" ADD COLUMN "cap" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "cap" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "funding" "funding" DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "funding" DROP DEFAULT;
