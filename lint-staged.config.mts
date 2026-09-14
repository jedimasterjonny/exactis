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
  // The whole suite under coverage, not `vitest related` on the staged
  // files: the per-file 100% gate is a property of the project, and a
  // commit that adds an untested source file passes a related-only run.
  //
  // Keyed on every TypeScript file rather than on src, because the suite's
  // own machinery lives at the root - vitest.setup.ts, the test that holds
  // it, vitest.config.mts - and a change there is precisely when the suite
  // has to run. A src glob let those through with no test run at all. It
  // cannot share the typecheck key below, so it takes the `**/` spelling
  // of the same pattern, matching the same files, as `*` and `**/*` do.
  "**/*.{mts,ts,tsx}": (): string => "bun run test:coverage",
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
