-- A TRUNCATE empties the table without deleting a row, so the row
-- trigger never fires on it and every version went at once. This one
-- fires once a statement and refuses it in the same words, through the
-- same function, whose scenario exception is for a DELETE alone, so a
-- scenario is still dropped by deleting its rows.
CREATE TRIGGER "household_versions_whole" BEFORE TRUNCATE ON "household_versions" FOR EACH STATEMENT EXECUTE FUNCTION "household_versions_kept"();
