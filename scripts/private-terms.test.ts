// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each case gets a repository of its own, with a bare one beside it as its
// origin, and runs a copy of the script from inside it. The script reads the
// list from the checkout it sits in, so a copy here reads the list written
// here and can never reach this checkout's, which holds the real terms. The
// terms below are invented, as every term in this repository has to be.
const script = join(import.meta.dirname, "private-terms.sh");
const zero = "0".repeat(40);

// Who commits in the repository made here, named as git reads it.
const identity = Object.fromEntries<string>(
  ["AUTHOR", "COMMITTER"].flatMap((role): [string, string][] => [
    [`GIT_${role}_NAME`, "Test"],
    [`GIT_${role}_EMAIL`, "test@example.com"],
  ]),
);

let base = "";
let repo = "";

// Writes the files given and commits them, handing back the new commit.
function commit(
  files: Readonly<Record<string, string>>,
  message = "a change",
): string {
  stage(files);
  git("commit", "--quiet", "--message", message);
  return git("rev-parse", "HEAD");
}

// The environment git and the script run in here: the runner's own less
// every GIT_ variable, then who commits. A git hook exports GIT_DIR and its
// siblings, naming the repository the hook runs for, and under one git would
// otherwise write into that repository rather than the one made here. A
// variable set to undefined is left out of the child's environment.
function environment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...Object.fromEntries(
      Object.keys(process.env)
        .filter((key) => key.startsWith("GIT_"))
        .map((key): [string, undefined] => [key, undefined]),
    ),
    ...identity,
  };
}

// A PreToolUse event for a Bash command, written out as the JSON Claude Code
// sends, since its snake_case keys are not ours to name.
function event(command: string): string {
  return `{"cwd": ${JSON.stringify(repo)}, "hook_event_name": "PreToolUse", "tool_input": {"command": ${JSON.stringify(command)}}, "tool_name": "Bash"}`;
}

function git(...args: readonly string[]): string {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- git is whatever the runner has, as the hooks and CI run it
  const run = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: environment(),
  });
  if (run.status !== 0) {
    throw new Error(run.stderr);
  }
  return run.stdout.trim();
}

// The script's exit code and what it wrote to stderr.
function guard(
  args: readonly string[],
  input = "",
): { status: null | number; stderr: string } {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- bash is whatever the runner has, as the hooks run it
  const run = spawnSync("bash", ["scripts/private-terms.sh", ...args], {
    cwd: repo,
    encoding: "utf8",
    env: environment(),
    input,
  });
  return { status: run.status, stderr: run.stderr };
}

// A commit's name as the script prints it.
function short(sha: string): string {
  return git("rev-parse", "--short", sha);
}

// Writes the files given and stages them.
function stage(files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    writeFileSync(join(repo, path), text);
  }
  git("add", "--all");
}

// The list the script reads, written as the household would keep it.
function terms(text: string): void {
  writeFileSync(join(repo, ".private-terms"), text);
}

describe("the private terms guard", () => {
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "private-terms-"));
    repo = join(base, "work");
    mkdirSync(join(repo, "scripts"), { recursive: true });
    copyFileSync(script, join(repo, "scripts/private-terms.sh"));
    git("init", "--quiet", "--initial-branch=main");
    writeFileSync(join(repo, ".gitignore"), ".private-terms\n");
    commit({ "README.md": "# App\n" });
    git("init", "--quiet", "--bare", join(base, "origin.git"));
    git("remote", "add", "origin", join(base, "origin.git"));
    git("push", "--quiet", "origin", "main");
    terms("# A comment, and Narnia in it, is not a term.\n\n  Zebedee  \n");
  });
  afterEach(() => {
    rmSync(base, { force: true, recursive: true });
  });

  it("finds a term whole-word and case-blind, and skips blank lines and comments", () => {
    expect(guard(["text"], "plain\nthen ZEBEDEE, shouting\n")).toStrictEqual({
      status: 2,
      stderr: "private-terms: a term from .private-terms is in stdin line 2\n",
    });
    expect(guard(["text"], "plain\n").status).toBe(0);
    expect(guard(["text"], "Zebedees and zebedee_x\n").status).toBe(0);
    expect(guard(["text"], "Narnia\n").status).toBe(0);
  });

  it("checks nothing, and says so once, with no list or an empty one", () => {
    rmSync(join(repo, ".private-terms"));

    expect(guard(["text"], "Zebedee\n")).toStrictEqual({
      status: 0,
      stderr: `private-terms: no terms in ${repo}/.private-terms, nothing checked.\n`,
    });

    terms("# Nothing but comments.\n\n");

    expect(guard(["text"], "Zebedee\n").status).toBe(0);
  });

  it("refuses a commit message carrying a term, above git's scissors line", () => {
    const message = join(base, "COMMIT_EDITMSG");
    writeFileSync(message, "chore(app): tidy\n\nFor zebedee.\n");

    expect(guard(["message", message])).toStrictEqual({
      status: 1,
      stderr:
        "private-terms: a term from .private-terms is in commit message line 3\n",
    });

    writeFileSync(
      message,
      `chore(app): tidy\n\nPlain.\n# ${"-".repeat(24)} >8 ${"-".repeat(24)}\n-Zebedee\n`,
    );

    expect(guard(["message", message]).status).toBe(0);
  });

  it("refuses the lines a staged change adds, and not the ones it removes", () => {
    stage({ "notes.txt": "plain\n+++ Zebedee\n" });

    expect(guard(["staged"])).toStrictEqual({
      status: 1,
      stderr: "private-terms: a term from .private-terms is in notes.txt:2\n",
    });

    git("commit", "--quiet", "--message", "a change");
    stage({ "notes.txt": "plain\n" });

    expect(guard(["staged"]).status).toBe(0);
  });

  it("refuses a new branch by its name, a message or an added line, and skips what the remote has", () => {
    const pushed = commit({ "notes.txt": "Zebedee\n" });
    git("push", "--quiet", "origin", "main");
    git("switch", "--quiet", "--create", "zebedee-notes");
    const clean = commit({ "more.txt": "plain\n" });
    const line = (sha: string, ref: string): string =>
      `refs/heads/${ref} ${sha} refs/heads/${ref} ${zero}\n`;

    expect(guard(["push"], line(clean, "zebedee-notes"))).toStrictEqual({
      status: 1,
      stderr: "private-terms: a term from .private-terms is in branch name\n",
    });
    expect(guard(["push"], line(clean, "notes")).status).toBe(0);

    const worded = commit({ "more.txt": "plainer\n" }, "chore(app): zebedee");
    const added = commit({ "more.txt": "Zebedee\n" });

    expect(guard(["push"], line(added, "notes"))).toStrictEqual({
      status: 1,
      stderr: [
        `private-terms: a term from .private-terms is in commit ${short(worded)} message line 1`,
        `private-terms: a term from .private-terms is in commit ${short(added)} more.txt:1`,
        "",
      ].join("\n"),
    });
    expect(
      guard(["push"], `(delete) ${zero} refs/heads/zebedee ${pushed}\n`).status,
    ).toBe(0);
  });

  it("refuses an update by the commits past the remote's tip alone", () => {
    const pushed = commit({ "notes.txt": "Zebedee\n" });
    git("push", "--quiet", "origin", "main");
    const clean = commit({ "notes.txt": "plain\n" });

    expect(
      guard(["push"], `refs/heads/main ${clean} refs/heads/main ${pushed}\n`)
        .status,
    ).toBe(0);

    const added = commit({ "notes.txt": "plain\nNarnia, then zebedee\n" });

    expect(
      guard(["push"], `refs/heads/main ${added} refs/heads/main ${pushed}\n`),
    ).toStrictEqual({
      status: 1,
      stderr: `private-terms: a term from .private-terms is in commit ${short(added)} notes.txt:2\n`,
    });
  });

  it("blocks a publishing command of Claude's by its text or a file it names, and lets anything else by", () => {
    writeFileSync(join(repo, "body.md"), "Plain.\nAbout Zebedee.\n");
    writeFileSync(join(repo, "clean.md"), "Plain.\n");

    expect(
      guard(["claude-hook"], event('git commit -m "chore(app): zebedee"')),
    ).toStrictEqual({
      status: 2,
      stderr:
        "private-terms: a term from .private-terms is in the command line 1\n",
    });
    expect(
      guard(
        ["claude-hook"],
        event("gh pr create --title x --body-file body.md"),
      ),
    ).toStrictEqual({
      status: 2,
      stderr: "private-terms: a term from .private-terms is in body.md:2\n",
    });
    expect(
      guard(["claude-hook"], event("gh api repos/a/b -F 'body=@body.md'"))
        .status,
    ).toBe(2);
    expect(
      guard(["claude-hook"], event("gh pr create --body-file=clean.md")).status,
    ).toBe(0);
    expect(guard(["claude-hook"], event("grep Zebedee body.md")).status).toBe(
      0,
    );
  });

  // The suite runs under the pre-push hook, and a hook in a worktree exports
  // GIT_DIR naming it. Git and the script run here must still reach the
  // repository made here and leave the path the variable names alone.
  it("keeps to the repository made here whatever repository GIT_DIR names", () => {
    const elsewhere = join(base, "elsewhere.git");
    vi.stubEnv("GIT_DIR", elsewhere);
    git("init", "--quiet");
    stage({ "notes.txt": "Zebedee\n" });

    expect(guard(["staged"]).status).toBe(1);
    expect(existsSync(elsewhere)).toBe(false);
  });
});
