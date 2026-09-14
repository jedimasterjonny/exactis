---
name: shadcn-add
description:
  Adding or updating a shadcn component under src/components/ui. The vendoring
  policy, the pass every generated file goes through before it is green, how
  upstream updates are taken, and how a component's dependencies land.
---

# Adding a shadcn component

`shadcn add` writes into `src/components/ui`, and what it writes is owned
source: every gate that applies under `src` applies there, and the file is
edited to satisfy them rather than the gates being loosened around it. The
alternative — a directory the checks skip, on the grounds that the code is
vendored — was rejected. shadcn's own position is that the code is yours to
edit, and a directory the gates skip is where the next unsafe assertion lands.

The one rule relaxed under `src/components/ui` is
`@typescript-eslint/naming-convention`, because the prop names are the upstream
API rather than ours; `eslint.config.mjs` says why, and nothing else joins it.

## The pass

What it costs was measured on `button` against a clean tree. As shipped the file
fails Prettier, perfectionist and `explicit-function-return-type`, and its
imports do not resolve.

1. `bunx shadcn add <name>`.
2. Declare what it imports. The registry entries declare only `cn`, so the CLI
   installs nothing else. `@base-ui/react` and `class-variance-authority` are
   the two the base-nova style leans on across the set; anything further a
   component imports — an icon set, a date library — is declared in
   `package.json` in its own right, never reached through whatever already pulls
   it in.
3. `bun run format` and `bun run lint:fix` clear everything except the return
   type, which is written by hand.
4. Drop what knip reports. `button` exports `buttonVariants` and nothing imports
   it; an unused export is dropped like any other and restored when a component
   that composes on it arrives.
5. Write the test. A single render took `button` to 100%, default variants
   included.

## Updates

`shadcn diff` is written off. Reformatting touches most lines, so the diff
against the registry is the whole file and says nothing. An upstream update is
`shadcn add <name> --overwrite`, which discards the local copy, followed by the
same pass; the diff to review is git's.

## Landing it

A dependency lands in the same commit as the first file that imports it: knip
rejects one nothing imports, so an install on its own is never green.
