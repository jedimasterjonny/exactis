import "server-only";
import { cookies } from "next/headers";

import { cookieAttributes } from "@/lib/session";

// The scenario open is a cookie naming it, as typed, and nothing else.
// It is not sealed, since it guards nothing: it only says which branch
// of the household a request reads and writes, the session cookie is
// what lets the request in at all, and a name no scenario is kept under
// reads as the household. It lasts the browser's session, so the next
// visit opens on the household, and signing out clears it, so the next
// sign-in does too.
const scenarioCookie = "exactis_scenario";

// Clears the scenario open, so the household is read again. From a
// server action, since a cookie cannot be written while a page renders.
export async function closeScenario(): Promise<void> {
  (await cookies()).delete(scenarioCookie);
}

// The name of the scenario the request opens, or null for none. That
// the store keeps a scenario by that name is the store's to say.
export async function openedScenario(): Promise<null | string> {
  return (await cookies()).get(scenarioCookie)?.value ?? null;
}

// Opens the scenario named. From a server action, as above. It carries
// the attributes the session's cookie does, and no age, so it ends with
// the browser's session.
export async function openScenario(name: string): Promise<void> {
  (await cookies()).set(scenarioCookie, name, cookieAttributes());
}
