-- The people the plan is for, each named, so an ISA or a pension can
-- name the owner whose allowance it is paid under. The table lands
-- empty: nothing names an owner yet.
CREATE TABLE "owners" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "owners_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL
);
