import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

import "server-only";
import { sealData, unsealData } from "iron-session";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";

import { readEnv } from "@/lib/env";

// The session is a sealed cookie and nothing else: one user, so being
// signed in is having a seal this deployment made that has not expired,
// under the password it still holds, and there is no session to look up.
// What the seal holds is when it was made and a digest of the password's
// hash at the time, which is all a single user's session has to say.
interface Session {
  readonly credential: string;
  readonly signedInAt: number;
}

// Seven days, then sign in again.
const ttl = 60 * 60 * 24 * 7;

// The attributes every cookie the app writes carries, the session's and
// the scenario's alike: kept from scripts, for every path, sent only
// with same-site navigations, and over HTTPS wherever the app is not on
// localhost. Read when the cookie is written, since where the app runs
// is the environment's to say.
export function cookieAttributes(): Pick<
  ResponseCookie,
  "httpOnly" | "path" | "sameSite" | "secure"
> {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}

// A cookie's name as the browser holds it. Where the cookie is Secure
// the name carries the __Host- prefix, under which a browser takes the
// cookie only from this host, over HTTPS and for every path, so no other
// host under the same domain can set one that shadows it. Over plain
// HTTP, the development server on the LAN, a browser would refuse a
// prefixed cookie, so the name is bare.
export function cookieName(name: string): string {
  return cookieAttributes().secure === true ? `__Host-${name}` : name;
}

// Clears the seal. From a server action, since a cookie cannot be
// written while a page renders. The deletion carries the attributes the
// cookie was set with, since a browser ignores one for a __Host- cookie
// that is not Secure for every path.
export async function endSession(): Promise<void> {
  (await cookies()).delete({ ...cookieAttributes(), name: sessionCookie() });
}

// Whether the request carries a session, read from the request's own
// cookies. Unsealing reads the clock to check the seal's expiry, and a
// prerender may not: cookies() no longer stops one that Partial
// Prefetching runs per session, so io() does, and everything after the
// check waits for the request as before. In a request or an action it
// resolves at once.
export async function hasSession(): Promise<boolean> {
  await io();
  return holdsSession((await cookies()).get(sessionCookie())?.value);
}

// Whether a cookie's value is a seal this deployment made and still
// honours. A missing, forged or expired one unseals to nothing, and one
// made under another password, or before seals carried it, is refused,
// so changing the password ends every session. Takes the value rather
// than reading it, since the proxy has the request's cookies and not the
// request-scoped store a page has.
export async function holdsSession(seal: string | undefined): Promise<boolean> {
  if (seal === undefined) {
    return false;
  }
  const { credential, signedInAt } = await unsealData<Partial<Session>>(seal, {
    password: sealedWith(),
    ttl,
  });
  return typeof signedInAt === "number" && credential === fingerprint();
}

// For a page or an action that only a signed-in user may reach: it goes on
// or it goes to the login screen. A page reads the cookie, so it sits
// behind a Suspense boundary, and an action verifies for itself rather
// than trusting that the page it was called from did.
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) {
    redirect("/login");
  }
}

// The session cookie's name, for the proxy as well, which reads the
// request's cookies itself.
export function sessionCookie(): string {
  return cookieName("exactis_session");
}

// Seals a new session into the cookie, for as long as a session lasts.
// From a server action, as above.
export async function startSession(): Promise<void> {
  const session: Session = {
    credential: fingerprint(),
    signedInAt: Date.now(),
  };
  const seal = await sealData(session, { password: sealedWith(), ttl });
  (await cookies()).set(sessionCookie(), seal, {
    ...cookieAttributes(),
    maxAge: ttl,
  });
}

// A digest of the password hash the deployment holds, which a seal
// carries from the sign-in and has to match to be honoured. A digest
// rather than the hash or a piece of it, so a seal opened with the
// session's secret gives nothing away to guess the password against.
function fingerprint(): string {
  return createHash("sha256")
    .update(readEnv("APP_PASSWORD_HASH"))
    .digest("base64url");
}

// The secret every seal is made and opened with. iron refuses one under
// 32 characters, but when opening a seal it reads the refusal as no
// session, so a short secret would look like everyone signed out until
// the sign-in failed in words that name no variable. It is held to the
// length here, by name, before iron sees it.
function sealedWith(): string {
  const password = readEnv("SESSION_PASSWORD");
  if (password.length < 32) {
    throw new Error("SESSION_PASSWORD is shorter than 32 characters");
  }
  return password;
}
