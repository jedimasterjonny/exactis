import { config } from "zod";

// Builds every zod parser in the browser without eval. The policy in
// next.config.ts gives script-src no 'unsafe-eval', and zod, left to compile
// a fast path for each object schema, first probes for eval with
// Function(""), which the browser reports as a violation even though zod
// catches the refusal and parses without it. zod reads the setting as each
// schema is built, and Next runs this file before any of the app's code.
config({ jitless: true });
