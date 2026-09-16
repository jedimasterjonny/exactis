CREATE TYPE "public"."income_growth" AS ENUM('inflation', 'inflation-plus-1', 'inflation-plus-2', 'nominal', 'triple-lock');--> statement-breakpoint
CREATE TYPE "public"."income_kind" AS ENUM('employment', 'other', 'pension', 'self-employment');--> statement-breakpoint
CREATE TABLE "income_lines" (
	"amount" integer NOT NULL,
	"bonus" integer NOT NULL,
	"cadence" "cadence" NOT NULL,
	"first_year" integer NOT NULL,
	"growth" "income_growth" NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "income_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "income_kind" NOT NULL,
	"last_year" integer,
	"name" text NOT NULL,
	"rsu" integer NOT NULL
);
