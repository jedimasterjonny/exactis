import { configDefaults, defineConfig } from "vitest/config";

// Spelled .mjs, which TypeScript maps to the .mts file as it maps .js to
// .ts. The .mts spelling is an error without allowImportingTsExtensions.
import unit from "./vitest.config.mjs";

// The end-to-end suite: the production build served by next start and
// driven over HTTP, as a browser with JavaScript off would drive it. It
// reaches what the unit suite mocks - the proxy as Next runs it, a server
// action posted from a form, cookies() and redirect() - and needs a build
// to exist, which is why it is a suite of its own rather than a folder the
// unit suite collects.
//
// Every setting that makes the unit runner unforgiving carries over, from
// the shuffle to the console guard. What changes is where the tests are,
// that no document is stood up for tests that never render one, and the
// global setup that serves the build for the run.
export default defineConfig({
  ...unit,
  test: {
    ...unit.test,
    environment: "node",
    exclude: configDefaults.exclude,
    globalSetup: ["./e2e/server.ts"],
    include: ["e2e/**/*.test.ts"],
  },
});
