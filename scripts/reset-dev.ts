import { neon } from "@neondatabase/serverless";
import { argv, env, stdout } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import * as z from "zod";

import { readEnv } from "@/lib/env";

// Brings a development branch of the store back in line with its parent,
// and puts the app role back afterwards. Neon's reset copies the parent's
// data and its catalogue over the branch, so a role the branch alone holds
// is lost and the owner's password goes back to the parent's; the reset is
// followed by a reset of the owner's password through the API, used once to
// make the app role again with the password the branch's URL already
// carries, so nothing that holds that URL has to change.
//
//   bun run db:reset-dev                    says what it would do, and stops
//   bun run db:reset-dev -- --reset         does it
//   bun run db:reset-dev -- --reset --show-owner-url
//                                           prints the owner's new URL once,
//                                           for a db:migrate against the branch
//
// NEON_API_KEY is read from the environment and never taken as an argument:
//
//   ( read -rs NEON_API_KEY && export NEON_API_KEY && bun run db:reset-dev -- --reset )
//
// DATABASE_URL is the branch's URL as the app role, as .env.local holds it
// and bun reads it: its host names the branch to reset, and its password is
// what the role is put back with. A URL as any other role is refused, so a
// shell with the owner's URL exported for a migration cannot run this by
// mistake, and a branch with no parent, the household's own, cannot be
// reset. NEON_PROJECT names the project where the key's account lists more
// than one, or none, as an organisation's are not listed without it.

const api = "https://console.neon.tech/api/v2";
const appRole = "exactis_app";
const ownerRole = "neondb_owner";
// How many times an operation is asked after, two seconds apart, before
// the wait is given up: ten minutes.
const patience = 300;

const projects = z.object({
  projects: z.array(z.object({ id: z.string(), name: z.string() })),
});
const endpoints = z.object({
  endpoints: z.array(
    z.object({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Neon's own name for it
      branch_id: z.string(),
      host: z.string(),
    }),
  ),
});
const branches = z.object({
  branches: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Neon's own name for it
      parent_id: z.string().nullish(),
    }),
  ),
});
const roles = z.object({ roles: z.array(z.object({ name: z.string() })) });
const operations = z.object({
  operations: z.array(z.object({ id: z.string() })).default([]),
});
const operation = z.object({ operation: z.object({ status: z.string() }) });
const reset = z.object({ role: z.object({ password: z.string() }) });

// A call to the API, answered as JSON, or failed with the status and what
// the API said.
async function call(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(`${api}${path}`, {
    ...(body !== undefined && { body: JSON.stringify(body) }),
    headers: {
      accept: "application/json",
      authorization: `Bearer ${readEnv("NEON_API_KEY")}`,
      "content-type": "application/json",
    },
    method,
  });
  if (!response.ok) {
    throw new Error(
      `${method} ${path} answered ${String(response.status)}: ${await response.text()}`,
    );
  }
  return response.json();
}

// Waits for an operation the API started to end, failing on anything but
// finishing or being skipped, which is how Neon ends one it had no need
// of, as suspending a compute already suspended, and on one still going
// after the patience above.
async function finished(
  project: string,
  id: string,
  left: number = patience,
): Promise<void> {
  const { status } = operation.parse(
    await call("GET", `/projects/${project}/operations/${id}`),
  ).operation;
  if (status === "finished" || status === "skipped") {
    return;
  }
  if (["cancelled", "error", "failed"].includes(status)) {
    throw new Error(`Operation ${id} ${status}`);
  }
  if (left === 0) {
    throw new Error(`Operation ${id} still ${status} after ten minutes`);
  }
  stdout.write(".");
  await sleep(2000);
  return finished(project, id, left - 1);
}

// The one project the key lists, or the one NEON_PROJECT names.
async function projectId(): Promise<string> {
  const named = env["NEON_PROJECT"];
  if (named !== undefined && named !== "") {
    return named;
  }
  const listed = projects.parse(await call("GET", "/projects")).projects;
  const [only] = listed;
  if (only === undefined || listed.length > 1) {
    const names = listed.map(({ id, name }) => `${id} (${name})`).join(", ");
    const hint =
      names === ""
        ? ", since an organisation's projects are not listed"
        : ` to one of ${names}`;
    throw new Error(
      `${String(listed.length)} projects listed; set NEON_PROJECT${hint}`,
    );
  }
  return only.id;
}

// Waits for every operation an answer carries.
async function settled(project: string, answer: unknown): Promise<void> {
  await Promise.all(
    operations.parse(answer).operations.map(async ({ id }) => {
      await finished(project, id);
    }),
  );
  stdout.write("\n");
}

const url = new URL(readEnv("DATABASE_URL"));
if (url.username !== appRole) {
  throw new Error(`DATABASE_URL is not ${appRole}'s; refusing to guess`);
}
const appPassword = decodeURIComponent(url.password);
if (!/^[\w.~-]+$/.test(appPassword)) {
  throw new Error("The app password has characters this will not put in SQL");
}

// The branch is the one the URL's host answers for, and its parent is
// what it is reset to; the owner is looked for before anything is done,
// since the reset is not undone by finding it missing after.
const project = await projectId();
const host = url.hostname.replace("-pooler", "");
const endpoint = endpoints
  .parse(await call("GET", `/projects/${project}/endpoints`))
  .endpoints.find((listed) => listed.host === host);
if (endpoint === undefined) {
  throw new Error(`Nothing in project ${project} answers at ${url.hostname}`);
}
const listed = branches.parse(
  await call("GET", `/projects/${project}/branches`),
).branches;
const branch = listed.find(({ id }) => id === endpoint.branch_id);
const parent = listed.find(({ id }) => id === branch?.parent_id);
if (branch === undefined || parent === undefined) {
  throw new Error(`The branch at ${url.hostname} has no parent to reset to`);
}
const held = roles.parse(
  await call("GET", `/projects/${project}/branches/${branch.id}/roles`),
).roles;
if (!held.some(({ name }) => name === ownerRole)) {
  throw new Error(`Branch ${branch.name} holds no role ${ownerRole}`);
}

stdout.write(
  `Project ${project}: reset branch ${branch.name} (${branch.id}) to its parent ${parent.name} (${parent.id}), discarding everything saved on ${branch.name} since; reset ${ownerRole}'s password on it; put ${appRole} back with the password DATABASE_URL carries.\n`,
);
if (!argv.includes("--reset")) {
  stdout.write("Nothing done: pass --reset to go on.\n");
} else {
  stdout.write(`Resetting ${branch.name} from ${parent.name}`);
  await settled(
    project,
    await call("POST", `/projects/${project}/branches/${branch.id}/restore`, {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Neon's own name for it
      source_branch_id: parent.id,
    }),
  );

  stdout.write(`Resetting ${ownerRole}'s password on ${branch.name}`);
  const answer = await call(
    "POST",
    `/projects/${project}/branches/${branch.id}/roles/${ownerRole}/reset_password`,
  );
  await settled(project, answer);
  const ownerUrl = new URL(url);
  ownerUrl.username = ownerRole;
  ownerUrl.password = reset.parse(answer).role.password;
  stdout.write(
    `${ownerRole}'s new password is in the Neon console under Connect.\n`,
  );

  // The role is made where the parent does not hold it, as while
  // production, which is to run from the parent, is not yet set up: then
  // the reset carries the parent's role and its grants, and only the
  // password is set. ponytail: the grants here name the one table; a
  // table a migration adds needs its grant added here too until the parent
  // holds the role.
  stdout.write(`Putting ${appRole} back…\n`);
  try {
    const asOwner = neon(ownerUrl.href);
    await asOwner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${appRole}') THEN CREATE ROLE ${appRole} WITH LOGIN; END IF; END $$;`,
    );
    await asOwner.query(
      `ALTER ROLE ${appRole} WITH LOGIN PASSWORD '${appPassword}'`,
    );
    await asOwner.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await asOwner.query(
      `GRANT SELECT, INSERT, DELETE ON household_versions TO ${appRole}`,
    );
    stdout.write(`Checking as ${appRole}…\n`);
    const [row] = await neon(
      url.href,
    )`SELECT current_user, count(*) AS versions FROM household_versions`;
    stdout.write(`${JSON.stringify(row)}\n`);
  } catch (error: unknown) {
    stdout.write(
      `${appRole} was not put back; ${ownerRole}'s URL, to finish by hand: ${ownerUrl.href}\n`,
    );
    throw error;
  }

  if (argv.includes("--show-owner-url")) {
    stdout.write(`${ownerRole}'s URL, shown once: ${ownerUrl.href}\n`);
  }
}
