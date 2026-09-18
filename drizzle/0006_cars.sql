-- The car kind joins the treatments, and the balloon is added with a
-- default so the accounts already held take none, then the default is
-- dropped again so the column is what the schema says it is: every
-- value written, none assumed.
ALTER TYPE "public"."account_kind" ADD VALUE 'car' BEFORE 'cash';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "balloon" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "balloon" DROP DEFAULT;
