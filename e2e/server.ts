import type { ChildProcess } from "node:child_process";
import type { TestProject } from "vitest/node";

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { hashPassword } from "@/lib/password";

declare module "vitest" {
  export interface ProvidedContext {
    // Where the server answers: scheme, host and port, no path.
    origin: string;
    // The password the server's hash was made from.
    password: string;
  }
}

// How long `next start` has to answer before the run gives up on it. It
// is ready in well under a second, so this only bounds a server that never
// will be.
const startupLimit = 30_000;

// Serves the production build for the run and stops it afterwards. The
// build is the one `bun run build` left in .next, which this does not make:
// CI builds once and runs this against what it built, and locally a stale
// build is served as readily as `bun run start` would serve it.
//
// Each variable the app reads is set here rather than inherited, because
// next start loads .env.local and a variable already in the environment
// wins over it. So a developer's own session secret and password hash do
// not decide what the run can sign in with, and DATABASE_URL names a host
// that cannot resolve rather than the store .env.local points at: a page
// that queries fails loudly instead of reaching real data.
//
// Anything the server writes to stderr fails the run, as console output
// fails a unit test. Next logs an error it has caught and a request it
// refused there, and a page can still answer 200 after either.
export default async function serve(
  project: TestProject,
): Promise<() => Promise<void>> {
  const password = randomBytes(16).toString("hex");
  const port = await freePort();
  const origin = `http://127.0.0.1:${String(port)}`;
  // The bin link rather than a path inside the package, since the link is
  // written from next's own `bin` field, and under the Node running this
  // rather than whichever the link's shebang would find.
  const server = spawn(
    process.execPath,
    [
      "node_modules/.bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env: serverEnv(password), stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  server.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });

  try {
    await waitUntilServing(server, origin, () => stderr);
  } catch (error) {
    await stop(server);
    throw error;
  }
  project.provide("origin", origin);
  project.provide("password", password);

  return async () => {
    await stop(server);
    if (stderr !== "") {
      throw new Error(`next start wrote to stderr during the run:\n${stderr}`);
    }
  };
}

// A port nothing is listening on, found by asking the system for one and
// letting it go again.
async function freePort(): Promise<number> {
  const probe = createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  await once(probe, "close");
  if (address === null || typeof address === "string") {
    throw new Error("The system did not hand back a TCP port");
  }
  return address.port;
}

// The environment the server runs in: this one, with every variable the app
// reads set for the run, and NODE_ENV as next start would set it had the
// runner not already set it to test.
function serverEnv(password: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env["APP_PASSWORD_HASH"] = hashPassword(password);
  env["DATABASE_URL"] = "postgresql://store.invalid/none";
  env.NODE_ENV = "production";
  env["SESSION_PASSWORD"] = randomBytes(32).toString("hex");
  return env;
}

async function stop(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) {
    return;
  }
  const exited = once(server, "exit");
  server.kill("SIGTERM");
  await exited;
}

// Polls until the server answers anything at all, and fails by name if it
// exits first, which is what a missing build looks like.
async function waitUntilServing(
  server: ChildProcess,
  origin: string,
  stderr: () => string,
): Promise<void> {
  const deadline = Date.now() + startupLimit;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `next start exited with ${String(server.exitCode)}. Run bun run build first if there is no build.\n${stderr()}`,
      );
    }
    try {
      await fetch(`${origin}/login`);
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(
    `next start did not answer within ${String(startupLimit)}ms\n${stderr()}`,
  );
}
