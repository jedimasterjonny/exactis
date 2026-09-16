-- The column is added open, filled from the id, which is the order the
-- accounts already held were added in, and closed once every row has a
-- place.
ALTER TABLE "accounts" ADD COLUMN "position" integer;--> statement-breakpoint
UPDATE "accounts" SET "position" = "id";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "position" SET NOT NULL;
