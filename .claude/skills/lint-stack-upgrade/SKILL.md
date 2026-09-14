---
name: lint-stack-upgrade
description:
  Bumping ESLint or TypeScript to a new major, or enabling a further react/ or
  import/ ESLint rule. The peer-range traps in the lint stack, the two checks to
  repeat after any ESLint major, and why TypeScript 7 cannot lint here.
---

# Lint stack version traps

Peer ranges are enforced by nothing here. Bun installs a plugin whose declared
range excludes the ESLint alongside it without a word, and CI never looks, so a
major that goes green on the first run has proved less than it appears to: only
that nothing threw on the files this repo happens to contain.

ESLint is on 10 and three plugins do not declare it. `eslint-plugin-jsx-a11y`
allows up to `^9`, `eslint-plugin-react` up to `^9.7`, `eslint-plugin-import` up
to `^9`. The last two arrive through `eslint-config-next`, which declares
`>=9.0.0` and is not itself the problem — the obvious suspect is the wrong one.

That is safe today for a narrow reason worth keeping written down.
`eslint-plugin-jsx-a11y` makes no live use of anything 10 removed, so its
ceiling is only a stale range. The other two do use them —
`context.getSourceCode()`, `context.getFilename()`, `context.parserOptions`,
`context.parserPath`, `isSpaceBetweenTokens`, `getJSDocComment`,
`getTokenOrCommentBefore` and `getTokenOrCommentAfter` — across thirty-one call
sites, none of which fall in the eighteen rules of theirs this config enables.
They sit in the stylistic rules `eslint-config-prettier` switches off and in
rules Next does not turn on.

The exposure is therefore latent rather than absent. Enabling a further `react/`
or `import/` rule is what reaches a removed API, and it fails when that rule
runs on code taking that path — not at install, not at config load, and not
necessarily on the source files here. Read the rule's source for those names
before switching one on.

Two checks are worth repeating after any ESLint major, because neither the
install nor the suite performs them. Diff `eslint --print-config` against a
source file before and after, where the count of active rules must not move: a
plugin contributing nothing looks exactly like a plugin with nothing to report.
Then provoke rules from each plugin with a throwaway file, to show they still
report rather than merely being listed.

TypeScript is held at 6 by a ceiling of the same kind. `typescript-eslint` and
`eslint-plugin-sonarjs` both cap at `<6.1.0`, and 7.0 ships no JavaScript
compiler API for either to build on, so 7 cannot lint here at all. The Renovate
PR proposing it is left open, red, and commented with the detail rather than
closed, so the question is not reopened from scratch each time.
