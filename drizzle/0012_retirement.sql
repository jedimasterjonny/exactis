-- The age the plan's owner retires at, from which they earn nothing by
-- working. The plan's row is given 59, the age the dashboard has shown,
-- through a default the column then drops, so a later write states it.
ALTER TABLE "plan" ADD COLUMN "retires" integer DEFAULT 59 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan" ALTER COLUMN "retires" DROP DEFAULT;
