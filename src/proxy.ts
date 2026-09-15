import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { holdsSession, sessionCookie } from "@/lib/session";

// Every request that is not for a built asset comes through here first,
// and the seal in its cookie decides where it goes: the login screen is
// the one route open without a session, and someone who arrives there
// with one is sent on to the dashboard. This is the optimistic check the
// Next guide describes, the cookie alone and never the store, so it is
// cheap enough to run on every prefetch. The screens and actions still
// check the session for themselves, since a server action posts to the
// route it was called from and a matcher change would silently uncover
// it.
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const isSignedIn = await holdsSession(
    request.cookies.get(sessionCookie)?.value,
  );
  const isLogin = request.nextUrl.pathname === "/login";
  if (!isLogin && !isSignedIn) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  // Only a visit is turned back from the login screen; the form's post
  // to it is the sign-in itself.
  if (isLogin && isSignedIn && request.method === "GET") {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }
  return NextResponse.next();
}

// Everything but Next's own static output and the icon. A constant, since
// the matcher is read at build time.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
