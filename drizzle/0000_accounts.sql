CREATE TYPE "public"."account_kind" AS ENUM('cash', 'debt', 'real-asset', 'tax-deferred', 'tax-free');--> statement-breakpoint
CREATE TYPE "public"."cadence" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."growth_kind" AS ENUM('fixed', 'plan');--> statement-breakpoint
CREATE TABLE "accounts" (
	"balance" integer NOT NULL,
	"cadence" "cadence" NOT NULL,
	"contribution" integer NOT NULL,
	"growth" "growth_kind" NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "account_kind" NOT NULL,
	"name" text NOT NULL,
	"rate" double precision NOT NULL
);
