---
name: shadcn-add
description:
  Adding or updating a shadcn component under src/components/ui. The vendoring
  policy, what belongs in the kit wrapper instead of the generated file, how
  upstream updates are taken, and the traps in the CLI.
---

# Adding a shadcn component

The generated file is vendored, not authored. `shadcn add` writes into
`src/components/ui` and what it writes is left exactly as it lands: not
formatted, not annotated, not pruned. Prettier, ESLint and knip are switched off
over that directory, so there is nothing to satisfy and nothing to fix.

If a generated file looks wrong, that is not a licence to edit it. Everything
this app wants to be different goes in the wrapper.

This is the reverse of the policy that held until the vendoring change, so treat
any older instinct to tidy these files as out of date.

## The pass

1. `bunx shadcn add <name>`. Then read `git status` rather than the CLI's
   summary, because it reaches past the component you asked for - see below.
2. Restore `package.json` and `bun.lock`. The CLI rewrites pinned ranges that
   Renovate owns; adding `chart` pushed `recharts` from `3.10.1` down to
   `3.8.0`. Check the dependency _names_ before restoring: a genuinely new
   package has to be declared by hand, pinned, in its own right - never reached
   through whatever pulled it in.
3. Write the wrapper in `src/components/kit`. One line is the normal case:

   ```tsx
   export { Card, CardContent, CardHeader } from "@/components/ui/card";
   ```

   Re-export only the names the app actually uses. That narrowing is the point
   of the layer, and knip enforces it - a wrapper export nothing imports is
   reported like any other.

4. Import it from `app/` as `@/components/kit/<name>`. Nothing outside `kit/`
   may import `@/components/ui/*`; `no-restricted-imports` will say so.
5. Test the wrapper only if it has logic. A re-export compiles to no statements,
   so there is nothing to execute and coverage does not ask for a test. A
   wrapper that branches gets one.

A wrapper is promoted to a real component when it has something to add. `badge`
is the example: this app needs `positive` and `caution` tones that base-nova
does not ship. It passes `variant={null}`, which makes the vendored cva emit its
base classes and no variant classes, adds the tone classes through `className`,
and sets `data-variant` by hand - a prop wins over the state Base UI derives.
Layering a tone over one of upstream's variants and letting tailwind-merge
settle it works only while that variant sets no property the tone leaves alone,
and nothing would report the day it stopped.

## Updates

An update is `shadcn add <name> --overwrite` and nothing else. There is no pass
afterwards. The diff to review is git's, and it is upstream's diff: read it for
a renamed or dropped export, which shows up as a type error in the wrapper
rather than in a screen.

`shadcn diff` is written off - it compares against a registry payload that is
not what lands on disk.

The weekly `Vendor` workflow does this across every vendored name and opens a
pull request when the registry has moved. Most updates should arrive that way
rather than by hand.

## Traps

- `--overwrite` reaches past the component named, via `registryDependencies`.
  Adding `sidebar` also writes `button`, `input`, `separator`, `skeleton`,
  `sheet`, `tooltip` and `use-mobile`. Do it on a clean tree and read
  `git status`.
- `shadcn view <name>` returns the raw registry payload, not what the CLI
  writes. It still carries `@/registry/base-nova/...` imports and, in `sidebar`,
  an `IconPlaceholder` from the shadcn website. The CLI rewrites those against
  `components.json` on the way to disk.
- `aliases.ui`, `aliases.components` and `aliases.hooks` all point at
  `@/components/ui`, so everything the CLI writes lands under the one exempt
  path. If a registry item ever ships a `registry:lib` file it would land in
  `src/lib` instead, outside it - the weekly workflow fails on exactly that.
- `Skipped N files: (files might be identical, use --overwrite to overwrite)` is
  the healthy message when the files already match the registry. It does not
  mean the flag was ignored.
- If you script this, mind the shell. `zsh` does not word-split an unquoted
  variable, so a `$names` list arrives as one long item name and the CLI fails
  on a URL built from it. GitHub Actions runs `bash`, which splits.
