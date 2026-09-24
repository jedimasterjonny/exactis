import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// A deliberately unforgiving runner. Everything here turns something that
// would otherwise pass quietly into a failure at the point it is written.
export default defineConfig({
  plugins: [react()],
  // Resolves the @/* alias from tsconfig.json. Vite does this natively
  // now, so the vite-tsconfig-paths plugin the Next guide still
  // recommends is not installed.
  resolve: { tsconfigPaths: true },
  test: {
    // .only narrows a run to one test and is trivial to leave behind.
    // AGENTS.md forbids committing it; this refuses to run rather than
    // reporting green over a fraction of the suite.
    allowOnly: false,
    // Full diffs. A truncated one elides the part that differs.
    chaiConfig: { truncateThreshold: 0 },
    clearMocks: true,
    coverage: {
      // The vendored shadcn components are excluded because they are not
      // ours to cover: they ship exports this app never calls, so per-file
      // 100% would mean writing tests for upstream's API rather than for
      // anything here. The kit wrappers in front of them stay at 100%, and
      // a wrapper test still executes the vendored code it renders - the
      // coverage is simply no longer attributed. What replaces the claim is
      // the weekly check proving these files are byte-identical to upstream.
      exclude: ["src/**/*.test.{ts,tsx}", "src/components/ui/**"],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "html"],
      // perFile, because an aggregate total lets a well covered file pay
      // for an untested one.
      thresholds: { 100: true, perFile: true },
    },
    environment: "jsdom",
    // The runner's own two exclusions, plus the worktrees an agent is
    // given inside the checkout. .gitignore keeps those out of git and
    // out of prettier and knip, each of which reads it; the
    // suite's globs read no ignore file, so a second copy of every test
    // file was collected and run, against this checkout's node_modules
    // and this checkout's alias, and reported as failures of a tree
    // nobody is committing.
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
    // A test that asserts nothing is not a test.
    expect: { requireAssertions: true },
    // No ambient describe/it/expect. Test files import what they use, like
    // every other file here.
    globals: false,
    mockReset: true,
    // An empty run is a broken config, not a pass.
    passWithNoTests: false,
    printConsoleTrace: true,
    restoreMocks: true,
    // A flaky test is a failing test; retrying only hides it.
    retry: 0,
    // Order dependence between tests is a bug. Shuffling surfaces it now
    // rather than on the day an unrelated test is added.
    sequence: { shuffle: true },
    setupFiles: ["./vitest.setup.ts"],
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
