-- A salary may sacrifice a share of its base into a pension. The link
-- lands open, since only an employment line names one, and the share is
-- added with a default so the lines already held give up nothing, then
-- the default is dropped again so the column is what the schema says it
-- is: every value written, none assumed.
ALTER TABLE "income_lines" ADD COLUMN "feeds" integer;--> statement-breakpoint
ALTER TABLE "income_lines" ADD COLUMN "sacrifice" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "income_lines" ALTER COLUMN "sacrifice" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "income_lines" ADD CONSTRAINT "income_lines_feeds_accounts_id_fk" FOREIGN KEY ("feeds") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
