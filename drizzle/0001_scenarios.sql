-- Scenarios: every row names the branch it was saved to, the household
-- being the one with no name, so the rows already kept are the
-- household's and an app that names no branch reads and writes them as
-- before. A version counts up on its own branch, so the key is the two
-- together. drizzle-kit cannot name the key it replaces, so the drop is
-- written by hand, as is the trigger's new body: a version is still
-- never written over, and a version of the household is still never
-- deleted, but a scenario's are, so it can be dropped whole.
ALTER TABLE "household_versions" ADD COLUMN "scenario" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "household_versions" DROP CONSTRAINT "household_versions_pkey";--> statement-breakpoint
ALTER TABLE "household_versions" ADD CONSTRAINT "household_versions_scenario_version_pk" PRIMARY KEY("scenario","version");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "household_versions_kept"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' AND OLD."scenario" <> '' THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'A kept version of the household is never written over or deleted';
END
$$;
