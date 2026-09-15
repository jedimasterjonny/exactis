import "server-only";
import { sealData, unsealData } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { readEnv } from "@/lib/env";

// The session is a sealed cookie and nothing else: one user, so being
// signed in is having a seal this deployment made that has not expired,
// and there is no session to look up. What the seal holds is when it was
// made, which is all a single user's session has to say.
interface Session {
  readonly signedInAt: number;
}

// Named for the proxy as well, which reads the request's cookies itself.
export const sessionCookie = "exactis_session";

// Thirty days, then sign in again.
const ttl = 60 * 60 * 24 * 30;

// Clears the seal. From a server action, since a cookie cannot be
// written while a page renders.
export async function endSession(): Promise<void> {
  (await cookies()).delete(sessionCookie);
}

// Whether the request carries a session, read from the request's own
// cookies.
export async function hasSession(): Promise<boolean> {
  return holdsSession((await cookies()).get(sessionCookie)?.value);
}

// Whether a cookie's value is a seal this deployment made and still
// honours. A missing, forged or expired one unseals to nothing. Takes the
// value rather than reading it, since the proxy has the request's cookies
// and not the request-scoped store a page has.
export async function holdsSession(seal: string | undefined): Promise<boolean> {
  if (seal === undefined) {
    return false;
  }
  const { signedInAt } = await unsealData<Partial<Session>>(seal, {
    password: readEnv("SESSION_PASSWORD"),
    ttl,
  });
  return typeof signedInAt === "number";
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

// Seals a new session into the cookie. From a server action, as above.
// Kept from scripts, sent only with same-site navigations, and over HTTPS
// wherever the app is not on localhost.
export async function startSession(): Promise<void> {
  const session: Session = { signedInAt: Date.now() };
  const seal = await sealData(session, {
    password: readEnv("SESSION_PASSWORD"),
    ttl,
  });
  (await cookies()).set(sessionCookie, seal, {
    httpOnly: true,
    maxAge: ttl,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
