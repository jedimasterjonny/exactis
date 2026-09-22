"use server";

import { redirect } from "next/navigation";

import { isDevSignInOpen } from "@/lib/dev-sign-in";
import { readEnv } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import { endSession, startSession } from "@/lib/session";

// What the login form shows between attempts: nothing, or why the last
// one failed.
export interface LoginState {
  readonly error?: string;
}

// Checks the password against the hash the deployment holds and, when it
// matches, starts the session and goes to the dashboard. A miss says only
// that it missed. A password is read from the form rather than taken as
// an argument, so it arrives as the form sent it and nowhere else.
export async function signIn(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = formData.get("password");
  if (
    typeof password !== "string" ||
    !verifyPassword(password, readEnv("APP_PASSWORD_HASH"))
  ) {
    return { error: "That is not the password." };
  }
  await startSession();
  redirect("/");
}

// Starts the session with no password asked, for development. The door
// is checked here and not only where the button is drawn, since an
// action answers a POST from anywhere; a post at a closed door is a bug
// or a forgery, and fails loudly rather than as a miss.
export async function signInAsDeveloper(): Promise<void> {
  if (!isDevSignInOpen()) {
    throw new Error("The development sign-in is closed");
  }
  await startSession();
  redirect("/");
}

// Ends the session and goes to the login screen. Posted from the sidebar,
// so it takes the form's data and reads none of it.
export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}
