// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as z from "zod";

// The step is run against a repository made here, a commit a case, with
// the last deployment set to the commit before, and judged by its exit
// code alone: 0 skips the build and 1 runs it. The cases share the
// repository and run in any order, so each writes over what the one
// before left rather than over a fixed starting point. Every message the
// step or git writes is read into the result rather than the terminal.
const script = join(import.meta.dirname, "vercel-ignore.sh");

// Who commits in the repository made here, named as git reads it.
const identity = Object.fromEntries<string>(
  ["AUTHOR", "COMMITTER"].flatMap((role): [string, string][] => [
    [`GIT_${role}_NAME`, "Test"],
    [`GIT_${role}_EMAIL`, "test@example.com"],
  ]),
);

// What the manifest holds, by section.
const manifest = z.object({
  dependencies: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()),
  scripts: z.record(z.string(), z.string()),
});

let repo = "";

// Writes the files given and commits them, handing back the commit before.
function commit(files: Readonly<Record<string, string>>): string {
  const before = git("rev-parse", "HEAD");
  write(files);
  return before;
}

function git(...args: readonly string[]): string {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- git is whatever the runner has, as the hooks and CI run it
  const run = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, ...identity },
  });
  if (run.status !== 0) {
    throw new Error(run.stderr);
  }
  return run.stdout.trim();
}

// The manifest as the repository holds it now, with the versions given
// moved in whichever section names them.
function moved(changes: Readonly<Record<string, string>>): string {
  const held = manifest.parse(
    JSON.parse(readFileSync(join(repo, "package.json"), "utf8")),
  );
  for (const [name, version] of Object.entries(changes)) {
    for (const section of [held.dependencies, held.devDependencies]) {
      if (name in section) {
        section[name] = version;
      }
    }
  }
  return JSON.stringify(held);
}

// The step's exit code, run as Vercel runs it for the production branch
// deployed last at the commit given, or in another environment.
function verdict(
  base: string | undefined,
  vercelEnv = "production",
): null | number {
  const vercel = Object.fromEntries<string>([
    ["VERCEL_ENV", vercelEnv],
    ...(base === undefined
      ? []
      : [["VERCEL_GIT_PREVIOUS_SHA", base] as [string, string]]),
  ]);
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- bash is whatever the runner has, as Vercel's build image has its own
  return spawnSync("bash", [script], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, ...identity, ...vercel },
  }).status;
}

// Writes the files given and commits them.
function write(files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  git("add", "--all");
  git("commit", "--quiet", "--message", "a change");
}

describe("the Ignored Build Step", () => {
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
    git("init", "--quiet", "--initial-branch=main");
    write({
      "bun.lock": "lock 1\n",
      "drizzle/0000_first.sql": "CREATE TABLE a (id int);\n",
      "package.json": JSON.stringify({
        dependencies: { next: "16.4.2", react: "19.3.1" },
        devDependencies: {
          eslint: "10.13.0",
          shadcn: "4.22.1",
          vitest: "5.0.5",
        },
        scripts: { build: "next build" },
      }),
      "README.md": "# App\n",
      "src/app/page.ts": "export const page = 1;\n",
      "src/lib/helper.test.ts": "test\n",
      "src/lib/helper.ts": "export const helper = 1;\n",
    });
  });
  afterAll(() => {
    rmSync(repo, { force: true, recursive: true });
  });

  it("skips a document, a test, a migration and an inert tooling bump", () => {
    expect(verdict(commit({ "README.md": "# App\n\nMore.\n" }))).toBe(0);
    expect(verdict(commit({ "src/lib/helper.test.ts": "test 2\n" }))).toBe(0);
    expect(
      verdict(commit({ "drizzle/0001_next.sql": "ALTER TABLE a;\n" })),
    ).toBe(0);
    expect(
      verdict(
        commit({
          "bun.lock": "lock 2\n",
          "package.json": moved({ eslint: "10.14.0" }),
        }),
      ),
    ).toBe(0);
  });

  it("builds a source change, a dependency, a dev dependency the build reads, a lockfile alone and a script change", () => {
    expect(
      verdict(commit({ "src/app/page.ts": "export const page = 2;\n" })),
    ).toBe(1);
    expect(
      verdict(
        commit({
          "bun.lock": "lock 3\n",
          "package.json": moved({ react: "19.3.2" }),
        }),
      ),
    ).toBe(1);
    expect(
      verdict(
        commit({
          "bun.lock": "lock 4\n",
          "package.json": moved({ shadcn: "4.23.0" }),
        }),
      ),
    ).toBe(1);
    expect(verdict(commit({ "bun.lock": "lock 5\n" }))).toBe(1);
    expect(
      verdict(
        commit({
          "package.json": moved({}).replace(
            '"build":"next build"',
            '"build":"next build --debug"',
          ),
        }),
      ),
    ).toBe(1);
  });

  // A file moved out of the build is a change to it, which the diff reads
  // as a removal only with renames off.
  it("builds a source file moved out of the build", () => {
    const before = git("rev-parse", "HEAD");
    mkdirSync(join(repo, "scripts"), { recursive: true });
    renameSync(
      join(repo, "src/lib/helper.ts"),
      join(repo, "scripts/helper.ts"),
    );
    git("add", "--all");
    git("commit", "--quiet", "--message", "a move");

    expect(verdict(before)).toBe(1);
  });

  it("builds whatever it cannot decide: nothing changed, no last deployment, or one it cannot reach", () => {
    expect(verdict(git("rev-parse", "HEAD"))).toBe(1);
    expect(verdict(undefined)).toBe(1);
    expect(verdict("0000000000000000000000000000000000000000")).toBe(1);
  });

  it("skips anything but the production branch", () => {
    const before = commit({ "src/app/page.ts": "export const page = 3;\n" });

    expect(verdict(before, "preview")).toBe(0);
    expect(verdict(before)).toBe(1);
  });
});
