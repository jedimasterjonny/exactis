CREATE TYPE "public"."expense_growth" AS ENUM('inflation', 'inflation-plus-1', 'inflation-plus-2', 'nominal', 'triple-lock');--> statement-breakpoint
CREATE TYPE "public"."expense_kind" AS ENUM('core', 'debt', 'other', 'time-bound');--> statement-breakpoint
CREATE TABLE "expense_lines" (
	"amount" integer NOT NULL,
	"cadence" "cadence" NOT NULL,
	"first_year" integer NOT NULL,
	"growth" "expense_growth" NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expense_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "expense_kind" NOT NULL,
	"last_year" integer,
	"name" text NOT NULL
);
