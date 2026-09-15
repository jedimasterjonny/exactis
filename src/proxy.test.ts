// @vitest-environment node
import { sealData } from "iron-session";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { config, proxy } from "./proxy";

const password = "a session password of at least thirty-two characters";

vi.mock("server-only", () => ({}));

function landing(response: Response): null | string {
  return response.headers.get("location");
}

async function request(
  path: string,
  { isSignedIn = false, method = "GET" } = {},
): Promise<NextRequest> {
  const headers = new Headers();
  if (isSignedIn) {
    const seal = await sealData({ signedInAt: Date.now() }, { password });
    headers.set("cookie", `exactis_session=${seal}`);
  }
  return new NextRequest(new URL(path, "https://exactis.test"), {
    headers,
    method,
  });
}

describe("proxy", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_PASSWORD", password);
  });

  it("sends a visit without a session to the login screen", async () => {
    const response = await proxy(await request("/accounts"));

    expect(response.status).toBe(307);
    expect(landing(response)).toBe("https://exactis.test/login");
  });

  it("lets a visit with a session through", async () => {
    const response = await proxy(
      await request("/accounts", { isSignedIn: true }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(landing(response)).toBeNull();
  });

  it("opens the login screen without a session and sends a signed-in visit on", async () => {
    expect(landing(await proxy(await request("/login")))).toBeNull();
    expect(
      landing(await proxy(await request("/login", { isSignedIn: true }))),
    ).toBe("https://exactis.test/");
  });

  it("lets the login form post through whether or not a session is held", async () => {
    expect(
      landing(await proxy(await request("/login", { method: "POST" }))),
    ).toBeNull();
    expect(
      landing(
        await proxy(
          await request("/login", { isSignedIn: true, method: "POST" }),
        ),
      ),
    ).toBeNull();
  });

  it("runs on everything but built assets", () => {
    const [matcher] = config.matcher;
    const pattern = new RegExp(`^${matcher ?? ""}$`);

    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/accounts")).toBe(true);
    expect(pattern.test("/login")).toBe(true);
    expect(pattern.test("/_next/static/chunks/main.js")).toBe(false);
    expect(pattern.test("/_next/image?url=x")).toBe(false);
    expect(pattern.test("/favicon.ico")).toBe(false);
  });
});
