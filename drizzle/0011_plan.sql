-- The plan's settings, one row of them: the age the plan runs to. The
-- row is written here rather than on first use, so a read always finds
-- it, at 89, the age the dashboard has claimed the plan runs to.
CREATE TABLE "plan" (
	"ends" integer NOT NULL,
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	CONSTRAINT "plan_single" CHECK ("plan"."id" = 1)
);--> statement-breakpoint
INSERT INTO "plan" ("ends") VALUES (89);
