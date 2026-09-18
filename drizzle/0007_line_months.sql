-- Each schedule's lines may end in a month of their last year. The
-- column lands open, since a line entered by year runs the whole of its
-- last year and has none, as it has no last year when it runs to the end
-- of the plan.
ALTER TABLE "expense_lines" ADD COLUMN "last_month" integer;--> statement-breakpoint
ALTER TABLE "income_lines" ADD COLUMN "last_month" integer;
