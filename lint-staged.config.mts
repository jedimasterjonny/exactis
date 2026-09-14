import { defineConfig } from "lint-staged/config";

// Every check the repo enforces, run against the staged snapshot before a
// commit is written. The tasks only report - nothing is rewritten and
// silently re-staged - so a commit contains exactly the content that was
// reviewed, and `git blame` keeps pointing at the change that was actually
// made. Fixes are a deliberate `bun run format` / `bun run lint:fix` away.
//
// Nothing git tracks is written either - next typegen touches only the
// gitignored .next/types and next-env.d.ts - so restoring the stash that
// --hide-unstaged takes (see .husky/pre-commit) is always a clean no-op.
export default defineConfig({
  // Prettier owns formatting for everything it can parse; --ignore-unknown
  // passes over the rest (images, the lockfile) instead of failing on
  // them. .prettierignore still applies.
  "*": "prettier --check --ignore-unknown",
  // A staged file that ESLint ignores emits a warning, which
  // --max-warnings 0 would promote to a failure; --no-warn-ignored keeps
  // that from blocking an otherwise clean commit.
  "*.{js,mjs,mts,ts,tsx}": "eslint --max-warnings 0 --no-warn-ignored",
  // The compiler is the one check that cannot be scoped to the files that
  // changed: an edit here can break types over there. Returning the command
  // from a function discards the matched file list, so it runs once over the
  // whole project as tsconfig.json defines it. It defers to the typecheck
  // script rather than calling tsc directly, because a bare tsc fails wherever
  // Next has not yet generated .next/types; the script pairs it with typegen.
  "*.{mts,ts,tsx}": (): string => "bun run typecheck",
});
