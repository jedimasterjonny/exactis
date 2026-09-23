import { describe, expect, inject, it } from "vitest";

const origin = inject("origin");

describe("the production server", () => {
  it("serves the login screen under the security headers", async () => {
    const response = await fetch(`${origin}/login`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    await expect(response.text()).resolves.toContain('name="password"');
  });

  it("sends a visit without a session to the login screen", async () => {
    const response = await fetch(`${origin}/accounts`, { redirect: "manual" });

    expect(response.status).toBe(307);
    expect(landing(response)).toBe("/login");
  });

  it("answers a wrong password on the login screen with the reason", async () => {
    const response = await signIn("not the password");

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toStrictEqual([]);
    await expect(response.text()).resolves.toContain(
      "That is not the password.",
    );
  });

  it("signs in with the password and sends the session to the dashboard", async () => {
    const response = await signIn(inject("password"));
    const [cookie] = response.headers.getSetCookie();

    expect(response.status).toBe(303);
    expect(landing(response)).toBe("/");
    expect(cookie).toMatch(/^exactis_session=[^;]+; /);
    expect(cookie).toMatch(/; HttpOnly(;|$)/);
    expect(cookie).toMatch(/; Secure(;|$)/);
    expect(cookie).toMatch(/; SameSite=lax(;|$)/);

    const revisit = await fetch(`${origin}/login`, {
      headers: { cookie: cookie?.split(";")[0] ?? "" },
      redirect: "manual",
    });

    expect(revisit.status).toBe(307);
    expect(landing(revisit)).toBe("/");
  });
});

// The hidden inputs of the form that holds the password field, as name and
// value. React writes these into a form whose action is a server action,
// and they are what let it post before any JavaScript has run. They are
// React's to name and to change, so they are read rather than written
// down. An input with no value attribute submits an empty string, as a
// browser's would.
function hiddenFields(html: string): [string, string][] {
  const form =
    html.split("</form>").find((part) => part.includes('name="password"')) ??
    "";
  return [...form.slice(form.lastIndexOf("<form")).matchAll(/<input\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes('type="hidden"'))
    .map((tag) => [
      unescape(/\bname="([^"]*)"/.exec(tag)?.[1] ?? ""),
      unescape(/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? ""),
    ]);
}

// The path a redirect points at. The server writes an absolute URL, and
// which host it names is not what is under test.
function landing(response: Response): null | string {
  const location = response.headers.get("location");
  return location === null ? null : new URL(location, origin).pathname;
}

// The sign-in form submitted as a browser with JavaScript off submits it:
// every field the page rendered into the form, the password typed into
// the one visible field, and the Origin a form post always carries, which
// Next checks a server action against. The form's action is empty, so it
// posts back to the page it is on.
async function signIn(password: string): Promise<Response> {
  const page = await fetch(`${origin}/login`);
  const body = new FormData();
  for (const [name, value] of hiddenFields(await page.text())) {
    body.append(name, value);
  }
  body.append("password", password);
  return fetch(`${origin}/login`, {
    body,
    headers: { origin },
    method: "POST",
    redirect: "manual",
  });
}

// Undoes the escaping React applies to an attribute value. &amp; goes last,
// so an escaped entity comes back as the entity rather than as the
// character it names.
function unescape(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
