#!/usr/bin/env bash
# The import cycle gate, and a canary proving it is still a gate.
#
# This replaced eslint-plugin-import's import/no-cycle, which TIMING=25 put at
# 103s of a 136s rule budget - 76% of every rule in the config put together,
# and forty times the next one - because it walks the import graph once per
# file. oxlint does the whole graph in 0.4s.
#
# What the swap gives up is a failure mode worth naming: a cycle checker whose
# resolver cannot see the graph reports a clean tree rather than an error, and
# green then means nothing. Every candidate weighed for this job could do it -
# madge is unmaintained since 2024 and was dropped for that; `bunx depcruise`
# is a dependency-confusion placeholder that prints a notice and exits 0;
# dependency-cruiser under bunx cruised "0 modules, 0 dependencies" and exited
# 0 because the isolated linker hid TypeScript from it; eslint-plugin-import-x
# sat at severity 2 with its resolver mis-wired and passed a planted cycle
# twice. So the gate proves itself on a deliberate cycle before its verdict on
# this tree is worth reading, the same way ci.yml asks Prettier for an option
# that cannot exist before trusting what it says about .prettierrc.json.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
oxlint="$root/node_modules/.bin/oxlint"
# -A all so this is the cycle gate and nothing else: oxlint's own correctness
# rules would otherwise fail this check for things ESLint already owns, and
# report them under a command that says it is about cycles.
args=(-A all -D import/no-cycle --import-plugin)

canary="$(mktemp -d)"
trap 'rm -rf "$canary"' EXIT
# Outside the repository on purpose. A fixture pair carrying a real cycle
# inside src/ would be found by this very check, and would also have to answer
# to tsc, ESLint and the per-file coverage gate.
cat > "$canary/a.ts" <<'TS'
import { b } from "./b";
export function a(): number { return b() + 1; }
TS
cat > "$canary/b.ts" <<'TS'
import { a } from "./a";
export function b(): number { return a() - 1; }
TS
if "$oxlint" "${args[@]}" "$canary" > /dev/null 2>&1; then
  echo "cycles: oxlint passed a deliberate two-file cycle, so this check is dead and needs rewriting." >&2
  exit 1
fi

"$oxlint" "${args[@]}" "$root"
