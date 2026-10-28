# Deploying

## Vercel

Two Hobby projects, `exactis` from `main` and `exactis-dev` from `dev`, set up
alike:

- Vercel Authentication on all deployments, in front of the app's own password.
- Functions in `fra1`, beside the store in `eu-central-1`.
- Install Command `bun install --frozen-lockfile`, so a lockfile Vercel's bun
  would re-resolve fails the build rather than deploying a tree CI never saw.
- Ignored Build Step `bash scripts/vercel-ignore.sh`, under Settings → Build and
  Deployment. Its header says what it skips.
- Every variable in `.env.example`, set by hand for Production only, as a
  Secret. A deployment keeps the values it was built with, so a change takes a
  redeploy.

## Neon

A standalone Neon project, not the Vercel Marketplace's: branch `main` holds the
household, and `dev` a copy of it.

### Migrations

Apply them from a terminal, as the branch's owner, before the deploy that needs
them. The owner's URL, given at the prompt, wins over the one in `.env.local`:

```bash
( read -rs DATABASE_URL && export DATABASE_URL && bun run db:migrate )
```

`AGENTS.md` says how a migration is written so that the code already deployed
survives it.

### The app role

The owner can alter the table, turn its triggers off or drop it, so the app
connects as `exactis_app` with only the grants below, and the trigger still
confines its deletes to scenarios. Make it in SQL as the branch's owner, since a
role made in Neon's Console, CLI or API joins `neon_superuser`, as its
[roles guide](https://neon.com/docs/manage/roles) says. Use a password from
`openssl rand -hex 24`:

```sql
CREATE ROLE exactis_app WITH LOGIN PASSWORD '<password>';
GRANT USAGE ON SCHEMA public TO exactis_app;
GRANT SELECT, INSERT, DELETE ON household_versions TO exactis_app;
```

The app's `DATABASE_URL` is the branch owner's pooled URL with `exactis_app` and
its password in place of the owner's, pasted bare into Vercel and the check
below: no quotes, and no `DATABASE_URL=`. Check it answers as `exactis_app`
before anything runs on it:

```bash
( read -rs URL && URL="$URL" bun -e 'import { neon } from "@neondatabase/serverless"; console.log(await neon(process.env.URL)`SELECT current_user, count(*) AS versions FROM household_versions`)' )
```

### Resetting `dev`

A Neon branch copies roles and passwords, so a branch made from `main` carries
`exactis_app` with `main`'s password: change it before anything uses the branch.
`bun run db:reset-dev` says what it would do, and with `-- --reset` resets the
branch `.env.local`'s URL points at, normally `dev`, to its parent. It then sets
`exactis_app`'s password back to that URL's, so the app's URL keeps working, and
the owner's password changes. It refuses `main`, which has no parent. The
script's header covers its flags and `NEON_API_KEY`.
