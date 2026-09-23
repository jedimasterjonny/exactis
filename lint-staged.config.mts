import { defineConfig } from "lint-staged/config";

// The fast checks, run against the staged snapshot before a commit is written.
// The suite under coverage is not here: it is .husky/pre-push, because it cost
// 83s of an 88s pre-commit and one decision per commit means paying that over
// and over for a series that is pushed once. knip stays despite being a
// whole-project check like the suite, because it takes a second. The tasks only report - nothing is rewritten and
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
  // knip: a dependency nothing imports, an export nothing reads, a file
  // nothing references. Like typecheck it is a property of the whole graph
  // rather than of any staged file, so the function form discards the
  // matched list and it runs once over the project.
  //
  // A second everything-glob rather than a list of extensions, because every
  // hole in such a list is a real one - knip resolves dependencies out of
  // package.json, .prettierrc.json, commitlint.config.mjs and
  // vitest.config.mts, and binaries out of .github/workflows/ci.yml and the
  // two extensionless hooks in .husky. It cannot share the `*` key above: a
  // sequential list stops at its first failure, so an unformatted file would
  // suppress the very result --continue-on-error exists to still report.
  "**/*": (): string => "bun run knip",
  // Cycles, over the whole import graph rather than the staged files: a cycle
  // is a property of the graph, and the file that closes one need not be the
  // file that is wrong. The glob mirrors codeFiles in eslint.config.mjs,
  // because these are the extensions that can be in an import graph at all,
  // and the key has to differ from every other here anyway.
  "**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": (): string => "bun run cycles",
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
