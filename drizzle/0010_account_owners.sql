-- An ISA or a pension names the owner whose allowance it is paid under,
-- and nothing else names one. The column lands open, then every wrapper
-- already held is given the first owner, a placeholder named "Me" made
-- for them when there is none to give, since the check that follows
-- holds a wrapper to having one. A plan holding no wrapper is given no
-- owner it did not ask for.
ALTER TABLE "accounts" ADD COLUMN "owner" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_owners_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "owners" ("name") SELECT 'Me' WHERE NOT EXISTS (SELECT 1 FROM "owners") AND EXISTS (SELECT 1 FROM "accounts" WHERE "kind" IN ('tax-deferred', 'tax-free'));--> statement-breakpoint
UPDATE "accounts" SET "owner" = (SELECT min("id") FROM "owners") WHERE "kind" IN ('tax-deferred', 'tax-free');--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owned" CHECK (("accounts"."kind" in ('tax-deferred', 'tax-free')) = ("accounts"."owner" is not null));
