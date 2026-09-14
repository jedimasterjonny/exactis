import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The guard in vitest.setup.ts can only be shown to work from outside the
// test it fails: a test that logs is meant to go red, and a red test cannot
// assert on its own redness. So the fixtures below are written to a
// temporary directory and run under a child Vitest that loads the same
// setup file, and the assertions here read the child's report. The
// directory borrows this project's node_modules through a symlink, so the
// fixtures resolve vitest and the setup file resolves everything it
// imports, exactly as the real suite does.

interface AssertionResult {
  failureMessages: string[];
  fullName: string;
  status: string;
}

interface FileResult {
  assertionResults: AssertionResult[];
  message: string;
  name: string;
  status: string;
}

// Mirrors guardedMethods in vitest.setup.ts. A second copy on purpose: the
// setup file states what is guarded and this states what is checked, so a
// method dropped from either is reported by the other.
const guardedMethods = [
  "count",
  "debug",
  "dir",
  "dirxml",
  "error",
  "group",
  "groupCollapsed",
  "info",
  "log",
  "table",
  "timeEnd",
  "timeLog",
  "trace",
  "warn",
];

const outsideAnyTest =
  "during: no test - module scope, a beforeAll hook, or after a test had finished";

const repoRoot = import.meta.dirname;
const setupFile = join(repoRoot, "vitest.setup.ts");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const parseAssertion = (value: unknown): AssertionResult => {
  if (
    isRecord(value) &&
    isStringArray(value["failureMessages"]) &&
    typeof value["fullName"] === "string" &&
    typeof value["status"] === "string"
  ) {
    return {
      failureMessages: value["failureMessages"],
      fullName: value["fullName"],
      status: value["status"],
    };
  }
  throw new Error(`unexpected assertion result: ${JSON.stringify(value)}`);
};

const parseFile = (value: unknown): FileResult => {
  if (
    isRecord(value) &&
    Array.isArray(value["assertionResults"]) &&
    typeof value["message"] === "string" &&
    typeof value["name"] === "string" &&
    typeof value["status"] === "string"
  ) {
    return {
      assertionResults: value["assertionResults"].map(parseAssertion),
      message: value["message"],
      name: value["name"],
      status: value["status"],
    };
  }
  throw new Error(`unexpected file result: ${JSON.stringify(value)}`);
};

const parseReport = (text: string): FileResult[] => {
  const parsed: unknown = JSON.parse(text);
  if (isRecord(parsed) && Array.isArray(parsed["testResults"])) {
    return parsed["testResults"].map(parseFile);
  }
  throw new Error(`unexpected report: ${text}`);
};

// Each fixture is one file in the child run. Output is scheduled from every
// place the guard claims to reach: inside a test, at module scope, from a
// finished test into a later one, from an afterAll, and after the setup's
// own afterAll has run.
const fixtures = (setupImport: string): Record<string, string> => ({
  after: `
import { afterAll, describe, expect, it } from "vitest";

afterAll(() => {
  setImmediate(() => {
    console.log("after");
  });
});

describe("after", () => {
  it("passes on its own", () => {
    expect(true).toBe(true);
  });
});
`,
  guard: `
import { describe, expect, it, vi } from "vitest";

import { takeConsoleOutput } from ${JSON.stringify(setupImport)};

describe("guard", () => {
  it("leaves a silent test alone", () => {
    expect(true).toBe(true);
  });
  it.each(${JSON.stringify(guardedMethods)})("fails a test that calls console.%s", (method) => {
    console[method]("leak");
    expect(true).toBe(true);
  });
  it("hands the output to takeConsoleOutput", () => {
    console.log("taken", 1);
    console.warn("also");
    expect(takeConsoleOutput()).toStrictEqual([
      "console.log: taken 1",
      "console.warn: also",
    ]);
  });
  it("fails when console.error is reassigned", () => {
    console.error = () => undefined;
    expect(true).toBe(true);
  });
  it("fails when the spy is restored", () => {
    vi.mocked(console.error).mockRestore();
    expect(true).toBe(true);
  });
  it("fails when the implementation is replaced", () => {
    vi.mocked(console.error).mockImplementation(() => undefined);
    expect(true).toBe(true);
  });
});
`,
  late: `
import { describe, expect, it } from "vitest";

describe("late", () => {
  it("schedules output for later", () => {
    setTimeout(() => {
      console.log("late");
    }, 50);
    expect(true).toBe(true);
  });
  it("is failed by the output the first test scheduled", async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(true).toBe(true);
  });
});
`,
  scope: `
import { describe, expect, it } from "vitest";

console.log("early");

describe("scope", () => {
  it("is failed by output from module scope", () => {
    expect(true).toBe(true);
  });
});
`,
  teardown: `
import { afterAll, describe, expect, it } from "vitest";

afterAll(() => {
  console.log("teardown");
});

describe("teardown", () => {
  it("passes on its own", () => {
    expect(true).toBe(true);
  });
});
`,
});

const childConfig = `
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: ".vite",
  // The setup file lives outside this directory, and Vite serves nothing
  // outside the root unless told to.
  server: { fs: { allow: [${JSON.stringify(repoRoot)}] } },
  test: {
    environment: "jsdom",
    include: ["*.test.ts"],
    outputFile: "report.json",
    reporters: ["json", "default"],
    sequence: { shuffle: false },
    setupFiles: [${JSON.stringify(setupFile)}],
  },
});
`;

let directory = "";
let exitCode: null | number = null;
let output = "";
let files: FileResult[] = [];

const result = (fullName: string): AssertionResult => {
  const found = files
    .flatMap((candidate) => candidate.assertionResults)
    .find((assertion) => assertion.fullName === fullName);
  if (found === undefined) {
    throw new Error(`no result for "${fullName}"`);
  }
  return found;
};

const file = (name: string): FileResult => {
  const found = files.find((candidate) => candidate.name.endsWith(name));
  if (found === undefined) {
    throw new Error(`no file result for "${name}"`);
  }
  return found;
};

describe("console guard", () => {
  beforeAll(() => {
    // realpath, because macOS hands out a symlinked temp directory and Vite
    // resolves a relative import from the real one.
    directory = realpathSync(mkdtempSync(join(tmpdir(), "console-guard-")));
    symlinkSync(
      join(repoRoot, "node_modules"),
      join(directory, "node_modules"),
    );
    writeFileSync(join(directory, "vitest.config.mts"), childConfig);
    for (const [name, content] of Object.entries(
      fixtures(relative(directory, setupFile)),
    )) {
      writeFileSync(join(directory, `${name}.test.ts`), content);
    }
    const child = spawnSync(
      process.execPath,
      [join(repoRoot, "node_modules", "vitest", "vitest.mjs"), "run"],
      { cwd: directory, encoding: "utf8", timeout: 60_000 },
    );
    exitCode = child.status;
    output = `${child.stdout}\n${child.stderr}`;
    files = parseReport(readFileSync(join(directory, "report.json"), "utf8"));
  }, 60_000);

  afterAll(() => {
    rmSync(directory, { force: true, recursive: true });
  });

  it("runs every fixture and exits red", () => {
    expect(exitCode).toBe(1);
    const names = files.map(
      (candidate) => candidate.name.split("/").at(-1) ?? "",
    );
    names.sort((a, b) => a.localeCompare(b));
    expect(names).toStrictEqual([
      "after.test.ts",
      "guard.test.ts",
      "late.test.ts",
      "scope.test.ts",
      "teardown.test.ts",
    ]);
  });

  it("leaves a silent test alone", () => {
    expect(result("guard leaves a silent test alone").status).toBe("passed");
  });

  it.each(guardedMethods)("fails a test that calls console.%s", (method) => {
    const failed = result(`guard fails a test that calls console.${method}`);
    expect(failed.status).toBe("failed");
    expect(failed.failureMessages.join("\n")).toContain(
      `Console guard:\n  console.${method}: leak\n    during: guard > fails a test that calls console.${method}`,
    );
  });

  it("hands a test its own output through takeConsoleOutput", () => {
    expect(result("guard hands the output to takeConsoleOutput").status).toBe(
      "passed",
    );
  });

  it.each([
    [
      "reassigned",
      "guard fails when console.error is reassigned",
      "the guard was reassigned away from or restored on console.error",
    ],
    [
      "restored",
      "guard fails when the spy is restored",
      "the guard was reassigned away from or restored on console.error",
    ],
    [
      "replaced",
      "guard fails when the implementation is replaced",
      "the guard on console.error had its implementation replaced",
    ],
  ])("reports a %s console.error as tampering", (_kind, name, message) => {
    const failed = result(name);
    expect(failed.status).toBe("failed");
    expect(failed.failureMessages.join("\n")).toContain(message);
  });

  it("attributes module-scope output to no test", () => {
    const failed = result("scope is failed by output from module scope");
    expect(failed.status).toBe("failed");
    expect(failed.failureMessages.join("\n")).toContain(
      `console.log: early\n    ${outsideAnyTest}`,
    );
  });

  it("attributes late output to the test in flight", () => {
    expect(result("late schedules output for later").status).toBe("passed");
    const failed = result(
      "late is failed by the output the first test scheduled",
    );
    expect(failed.status).toBe("failed");
    expect(failed.failureMessages.join("\n")).toContain(
      "console.log: late\n    during: late > is failed by the output the first test scheduled",
    );
  });

  it("fails a file whose afterAll logs", () => {
    const teardown = file("teardown.test.ts");
    expect(teardown.status).toBe("failed");
    expect(teardown.message).toContain(
      `console.log: teardown\n    ${outsideAnyTest}`,
    );
  });

  it("surfaces output after the file has finished as an uncaught exception", () => {
    expect(result("after passes on its own").status).toBe("passed");
    expect(output).toContain("Uncaught Exception");
    expect(output).toContain(`console.log: after\n    ${outsideAnyTest}`);
  });
});
