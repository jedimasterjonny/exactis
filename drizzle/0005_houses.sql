-- The house kind joins the treatments, and the two links land open,
-- since only the house dialog writes them: a loan names the asset it is
-- secured on and a line the loan it pays.
ALTER TYPE "public"."account_kind" ADD VALUE 'house' BEFORE 'real-asset';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "secures" integer;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD COLUMN "pays" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_secures_accounts_id_fk" FOREIGN KEY ("secures") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_pays_accounts_id_fk" FOREIGN KEY ("pays") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;