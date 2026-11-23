-- The household's binary Portfolio Performance (.portfolio) file, kept
-- outside household_versions so household reads and scenario forks never
-- carry multi-MB binary payloads. Up to the latest 750 versions are kept
-- (a 750 MB budget assuming ~1 MB per .portfolio file): an AFTER INSERT
-- trigger prunes older versions automatically, while the BEFORE triggers
-- refuse updates, truncates, and deletes within the kept 750-version
-- window.
CREATE TABLE "portfolio_files" (
	"content" "bytea" NOT NULL,
	"file_name" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer PRIMARY KEY NOT NULL
);--> statement-breakpoint
CREATE FUNCTION "portfolio_files_kept"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' AND OLD."version" <= (SELECT max("version") FROM "portfolio_files") - 750 THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'A kept version of the portfolio file is never written over or deleted';
END
$$;--> statement-breakpoint
CREATE TRIGGER "portfolio_files_kept" BEFORE UPDATE OR DELETE ON "portfolio_files" FOR EACH ROW EXECUTE FUNCTION "portfolio_files_kept"();--> statement-breakpoint
CREATE TRIGGER "portfolio_files_whole" BEFORE TRUNCATE ON "portfolio_files" FOR EACH STATEMENT EXECUTE FUNCTION "portfolio_files_kept"();--> statement-breakpoint
CREATE FUNCTION "portfolio_files_prune"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	DELETE FROM "portfolio_files" WHERE "version" <= NEW."version" - 750;
	RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER "portfolio_files_prune" AFTER INSERT ON "portfolio_files" FOR EACH ROW WHEN (NEW."version" > 750) EXECUTE FUNCTION "portfolio_files_prune"();--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'exactis_app') THEN
		GRANT SELECT, INSERT, DELETE ON "portfolio_files" TO exactis_app;
	END IF;
END $$;
