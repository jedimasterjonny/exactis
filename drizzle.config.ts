import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs from a package script, and bun hands a script the
// shell's environment but not the env files, so the URL is read the way
// Next reads it: .env.local and its siblings, and never over a variable
// the shell already set, so a terminal with the production URL exported
// still wins.
loadEnvConfig(process.cwd());

const url = process.env["DATABASE_URL"];

// drizzle-kit's view of the store: where the schema is and where the
// migrations it generates from it go. The URL is only read for the
// commands that reach a database, so generating a migration needs none.
export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  ...(url !== undefined && { dbCredentials: { url } }),
});
