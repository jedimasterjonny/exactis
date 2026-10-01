import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";

// drizzle-kit runs from a package script, and bun hands a script the
// shell's environment but not the env files, so the URL is read from
// .env.local, the file Next reads it from too. Node's loader never writes
// over a variable the shell already set, so a terminal with the
// production URL exported still wins; and with no .env.local, as in CI,
// the shell is all there is.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

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
