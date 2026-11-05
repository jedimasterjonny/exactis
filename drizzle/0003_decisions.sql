-- Decisions: a scenario made the household or decided against is kept
-- rather than dropped, its decision a version of its own, the one
-- decided on copied as the next with the decision and the reason given
-- set on it. Both columns are nullable with no default, so every row
-- kept before them, and every row the app still running while this is
-- applied writes, holds neither; the check holds a decision to the two
-- there are and lets the null through. A decision is an insert, so the
-- trigger is left as it is: a version is still never written over.
ALTER TABLE "household_versions" ADD COLUMN "decision" text;--> statement-breakpoint
ALTER TABLE "household_versions" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "household_versions" ADD CONSTRAINT "household_versions_decision" CHECK ("household_versions"."decision" in ('adopted', 'rejected'));
