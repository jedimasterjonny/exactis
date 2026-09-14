import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
      exclude: ["src/**/*.test.{ts,tsx}"],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "html"],
      // perFile, because an aggregate total lets a well covered file pay
      // for an untested one.
      thresholds: { 100: true, perFile: true },
    },
    environment: "jsdom",
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
