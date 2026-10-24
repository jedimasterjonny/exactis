#!/usr/bin/env bash
# Vercel's Ignored Build Step: exit 0 and the build is skipped, exit 1 and it
# runs. Set on a project as Settings → Git → Ignored Build Step → Custom →
# `bash scripts/vercel-ignore.sh`. It builds the project's production branch
# alone, in place of the "Only build production" preset, and only for a
# change that reaches what is built. Most of what lands on main does not: a
# dev-tooling bump, a test, a document, a workflow, a hook, a migration.
# Each deployed a byte-identical build until this.
#
# The diff is read from the last deployment Vercel made of the branch, not
# from the commit before, since a pull request lands as several commits in
# one push and the one before the tip is not what is deployed. A deployment
# skipped here is not a deployment, so the diff reaches back over every skip
# to the last build. Anything this cannot decide builds: no last deployment,
# one the clone does not reach, a file it does not name, a dev dependency it
# does not know to be inert, nothing changed at all, which is a redeploy
# asked for on purpose.
#
# ponytail: a skipped dev-dependency bump also re-resolves its own transitive
# packages in bun.lock, and one of those could be shared with a runtime
# dependency; production then runs the previous build's resolution until the
# next build. Rare, bounded, and the lockfile at main is what CI proved;
# diff bun.lock by package if it ever matters.
set -eu

# Only the production branch deploys, whichever branch the project calls that.
[ "${VERCEL_ENV:-}" = "production" ] || exit 0

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$base" ] || exit 1
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  # Vercel clones ten commits deep, and a run of skips puts the last build
  # past that. The fetch's own words are left for the build log, so too deep
  # reads apart from cannot fetch.
  git fetch --quiet --deepen=100 origin "${VERCEL_GIT_COMMIT_REF:-HEAD}" || true
  git cat-file -e "$base^{commit}" 2>/dev/null || exit 1
fi

git diff --quiet --no-renames "$base" HEAD && exit 1

# A change to anything but what cannot reach the build: documents, tests,
# the suites' and gates' configuration, workflows, hooks, agent files, the
# scripts beside this one, the migrations, which only the test fixture
# reads, and the manifest and lockfile, read below. A rename is read as a
# removal and an addition, so a file moved out of the build is a change to
# it.
git diff --quiet --no-renames "$base" HEAD -- . \
  ':!*.md' ':!*.test.ts' ':!*.test.tsx' \
  ':!.github' ':!.husky' ':!.claude' ':!e2e' ':!scripts' ':!drizzle' \
  ':!eslint.config.mjs' ':!knip.json' ':!lint-staged.config.mts' \
  ':!commitlint.config.mjs' ':!vitest.setup.ts' ':!vitest.config.mts' \
  ':!vitest.e2e.config.mts' ':!drizzle.config.ts' ':!renovate.json' \
  ':!components.json' ':!.prettierrc.json' ':!.prettierignore' \
  ':!.gitattributes' ':!.gitignore' ':!.node-version' ':!.mcp.json' \
  ':!.env.example' ':!package.json' ':!bun.lock' || exit 1

# The manifest: only devDependencies may differ, and only those known to be
# inert, the linters, formatters, test runners, type packages and the rest
# of the tooling that reads the code and ships nothing. Anything else among
# them is taken to reach the build, as tailwindcss, the Tailwind PostCSS
# plugin, the React Compiler plugin and shadcn do, the last through the
# stylesheet globals.css imports from it. The lockfile moving with no
# manifest change is lock file maintenance, which refreshes what the
# runtime depends on, and builds.
if ! git diff --quiet "$base" HEAD -- package.json; then
  node - <(git show "$base:package.json") package.json <<'JS' || exit 1
const fs = require("node:fs");
const [base, head] = process.argv
  .slice(2)
  .map((path) => JSON.parse(fs.readFileSync(path, "utf8")));
const rest = (manifest) =>
  JSON.stringify({ ...manifest, devDependencies: undefined });
if (rest(base) !== rest(head)) process.exit(1);
const inert =
  /^(?:eslint(?:-|$)|@eslint-community\/|@eslint-react\/|prettier(?:-|$)|vitest$|@vitest\/|@testing-library\/|@types\/|typescript$|@typescript\/|typescript-eslint$|knip$|oxlint$|lint-staged$|@commitlint\/|jsdom$|drizzle-kit$|next-devtools-mcp$|@electric-sql\/pglite$)/;
const before = base.devDependencies ?? {};
const after = head.devDependencies ?? {};
for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (before[name] !== after[name] && !inert.test(name)) process.exit(1);
}
JS
elif ! git diff --quiet "$base" HEAD -- bun.lock; then
  exit 1
fi
exit 0
