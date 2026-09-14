# exactis

A Next.js skeleton: React 19, Tailwind CSS, and shadcn/ui over Base UI.

## Getting started

Bun is the only prerequisite, at the version `packageManager` in `package.json`
pins; install it from <https://bun.sh>. Then:

```bash
bun install --frozen-lockfile
bun dev
```

The app is then at <http://localhost:3000>, rendered from `src/app/page.tsx`.

## Scripts

| Script                                | Does                                                              |
| ------------------------------------- | ----------------------------------------------------------------- |
| `dev`                                 | Development server                                                |
| `build`, `start`                      | Production build, then serve it                                   |
| `lint`, `lint:fix`                    | ESLint at `--max-warnings 0`, without and with autofix            |
| `format`, `format:check`              | Prettier, rewriting and reporting                                 |
| `typecheck`                           | `next typegen`, then `tsc --noEmit`                               |
| `test`, `test:watch`, `test:coverage` | Vitest; coverage enforces the per-file 100% gate                  |
| `mcp:next`, `mcp:shadcn`              | The Next devtools and shadcn MCP servers, launched by `.mcp.json` |

[AGENTS.md](AGENTS.md) is the source of truth for how work is done here: code
style, commit rules, and what has to be green before anything lands.
