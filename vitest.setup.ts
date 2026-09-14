import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";
import { cleanup } from "@testing-library/react";
import { format } from "node:util";
import { afterAll, afterEach, beforeEach, expect, vi } from "vitest";

// A suggestion printed during a green run is a suggestion nobody reads.
// Throwing makes reaching for a less accessible query a failure where it
// is written.
configure({ throwSuggestions: true });

// Every console method that emits on its own. assert is deliberately
// absent: it prints only when its condition is false, and Node routes that
// through warn, so guarding it directly would fail a test for an assertion
// that passed and printed nothing. countReset, groupEnd, time and
// timeStamp emit nothing at all.
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
] as const;

interface ConsoleRecord {
  during: string;
  message: string;
  method: GuardedMethod;
  trace: Error;
}

type GuardedMethod = (typeof guardedMethods)[number];

type Recorder = (...args: unknown[]) => void;

// Every record says when it arrived rather than who is at fault, because
// the two differ: a task that resolves late writes while some other test
// is in flight. The stack frame is what names the writer, so the report
// leads with the call site and states the timing as timing.
const outsideAnyTest =
  "no test - module scope, a beforeAll hook, or after a test had finished";

const records: ConsoleRecord[] = [];
const installed = new Map<GuardedMethod, Recorder>();

let currentTest: string | undefined;
let hasFileFinished = false;

// console's methods have mutually incompatible signatures and the guard
// treats all of them alike, so they are reached through one uniform view.
// It is the same object, not a copy, so the checks below still see
// whatever a test did to console itself.
const guardedConsole = console as unknown as Record<GuardedMethod, Recorder>;

const report = (unexpected: ConsoleRecord[], tampered: string[]): string => {
  const lines = [
    ...unexpected.map(
      (record) =>
        `  console.${record.method}: ${record.message}\n    during: ${record.during}`,
    ),
    ...tampered.map((problem) => `  ${problem}`),
  ];
  return `Console guard:\n${lines.join("\n")}`;
};

const install = (): void => {
  for (const method of guardedMethods) {
    const recorder: Recorder = (...args) => {
      // Captured at the call site, so the failure Vitest prints names the
      // line that logged. The guard suppresses the real console, so
      // Vitest's own console interception never sees these calls.
      const record: ConsoleRecord = {
        during: currentTest ?? outsideAnyTest,
        message: format(...args),
        method,
        trace: new Error("console output"),
      };
      // Past the last hook nothing will ever drain this, and throwing is
      // the only thing left that counts: Vitest reports a throw from a
      // stray callback as an unhandled error and exits non-zero.
      if (hasFileFinished) {
        throw new Error(report([record], []));
      }
      records.push(record);
    };
    // Assigned before being spied on, so the original the spy restores to
    // is the recorder rather than the real console. Vitest restores spies
    // before each test, and without this base layer output landing between
    // that restore and the beforeEach below would escape.
    guardedConsole[method] = recorder;
    vi.spyOn(guardedConsole, method).mockImplementation(recorder);
    installed.set(method, recorder);
  }
};

// A test may not quietly opt out. Reassignment and mockRestore are caught
// by the spy no longer being there; mockImplementation mutates the spy in
// place and leaves it there, so the implementation is compared as well.
const findTampering = (): string[] => {
  const removed: GuardedMethod[] = [];
  const replaced: GuardedMethod[] = [];
  for (const [method, recorder] of installed) {
    const current = guardedConsole[method];
    if (!vi.isMockFunction(current)) {
      removed.push(method);
    } else if (current.getMockImplementation() !== recorder) {
      replaced.push(method);
    }
  }
  const name = (methods: GuardedMethod[]): string =>
    methods.map((method) => `console.${method}`).join(", ");
  const advice = "call takeConsoleOutput() to assert on console output";
  return [
    ...(removed.length > 0
      ? [
          `the guard was reassigned away from or restored on ${name(removed)} - ${advice}`,
        ]
      : []),
    ...(replaced.length > 0
      ? [
          `the guard on ${name(replaced)} had its implementation replaced - ${advice}`,
        ]
      : []),
  ];
};

const check = (): void => {
  const tampered = findTampering();
  const unexpected = records.splice(0);
  // Re-armed before anything is thrown, so both the gap between tests and
  // the afterAll below stay guarded even when this hook fails.
  install();
  if (unexpected.length === 0 && tampered.length === 0) {
    return;
  }
  const [first] = unexpected;
  const failure = first?.trace ?? new Error("console guard");
  failure.message = report(unexpected, tampered);
  // The guard's own frames say nothing useful; the first frame below them
  // is the line that logged.
  const [header, ...frames] = (failure.stack ?? "").split("\n");
  failure.stack = [
    header,
    ...frames.filter((frame) => !frame.includes("vitest.setup")),
  ].join("\n");
  throw failure;
};

// Installed at module scope as well as per test, because setup files are
// evaluated before the test file is imported. Without this, output from
// module scope and from beforeAll reaches the real console: printed at
// best, and failing nothing.
install();

beforeEach(() => {
  install();
  currentTest = expect.getState().currentTestName;
});

// React reports act() violations, invalid DOM nesting and missing keys
// through console.error rather than by throwing, so left alone they scroll
// past a green run. Unmounting happens first and in this same hook, so
// anything that complains on teardown is caught by the check rather than
// racing it.
afterEach(() => {
  cleanup();
  // A test that installs fake timers and does not put them back hands the
  // next test a clock it never asked for, which under sequence.shuffle is
  // a different test on every run.
  vi.useRealTimers();
  try {
    check();
  } finally {
    currentTest = undefined;
  }
});

// The last word on the file. An async task that resolves after the test
// that started it, a floating promise and an afterAll hook all write here
// with no afterEach left to catch them.
afterAll(() => {
  try {
    check();
  } finally {
    hasFileFinished = true;
  }
});

/**
 * Reads and clears the console output produced by the running test, so
 * that asserting on it does not also fail it.
 *
 * This is the only sanctioned way to expect console output. Silencing the
 * guard instead - mockImplementation, mockRestore, or assigning over
 * console.error - is detected and fails the test. Lines come back worded
 * exactly as the guard would have reported them:
 *
 * ```ts
 * import { takeConsoleOutput } from "../../vitest.setup";
 *
 * expect(takeConsoleOutput()).toStrictEqual(["console.warn: deprecated"]);
 * ```
 *
 * Only the running test's own output is taken. Anything that arrived
 * outside a test is left where it is, so this cannot become an amnesty for
 * another test's late output.
 */
export const takeConsoleOutput = (): string[] => {
  if (currentTest === undefined) {
    throw new Error("takeConsoleOutput is only callable from inside a test");
  }
  const mine = records.filter((record) => record.during === currentTest);
  for (const record of mine) {
    records.splice(records.indexOf(record), 1);
  }
  return mine.map((record) => `console.${record.method}: ${record.message}`);
};
