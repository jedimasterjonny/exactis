-- The household, one version a save, each the whole of it as the save
-- left it. A version is never written over or deleted, which the
-- trigger holds, so the store keeps every household it has held; a
-- test's TRUNCATE is not a row's delete and passes.
CREATE TABLE "household_versions" (
	"household" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer PRIMARY KEY NOT NULL
);--> statement-breakpoint
CREATE FUNCTION "household_versions_kept"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'A kept version of the household is never written over or deleted';
END
$$;--> statement-breakpoint
CREATE TRIGGER "household_versions_kept" BEFORE UPDATE OR DELETE ON "household_versions" FOR EACH ROW EXECUTE FUNCTION "household_versions_kept"();
