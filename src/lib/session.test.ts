// @vitest-environment node
import { sealData } from "iron-session";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  endSession,
  hasSession,
  requireSession,
  startSession,
} from "./session";

const password = "a session password of at least thirty-two characters";

// A request's cookie jar: what the browser sent, and what the server
// writes back, kept apart so a test can see one without the other. Hoisted
// because the module mock below is, and reads it when the session module
// is first imported.
const { jar, sent } = vi.hoisted(() => ({
  jar: {
    delete: vi.fn<(name: string) => void>(),
    get: vi.fn<(name: string) => undefined | { name: string; value: string }>(),
    set: vi.fn<(name: string, value: string, options: object) => void>(),
  },
  sent: new Map<string, string>(),
}));

const cookies = vi.hoisted(() => vi.fn<() => Promise<typeof jar>>());

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

// Starts a session, and sends its seal back as the browser would.
async function signIn(): Promise<void> {
  await startSession();
  const [, seal] = jar.set.mock.lastCall ?? [];
  sent.set("exactis_session", seal ?? "");
}

describe("session", () => {
  beforeEach(() => {
    sent.clear();
    cookies.mockResolvedValue(jar);
    jar.get.mockImplementation((name) => {
      const value = sent.get(name);
      return value === undefined ? undefined : { name, value };
    });
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("redirected");
    });
    vi.stubEnv("APP_PASSWORD_HASH", "the password's hash");
    vi.stubEnv("SESSION_PASSWORD", password);
  });

  it("is absent without a cookie, and forged or foreign seals unseal to nothing", async () => {
    expect(await hasSession()).toBe(false);

    sent.set("exactis_session", "not-a-seal");

    expect(await hasSession()).toBe(false);

    sent.set(
      "exactis_session",
      await sealData(
        { signedInAt: 1 },
        { password: "some other deployment's password, also long enough" },
      ),
    );

    expect(await hasSession()).toBe(false);
  });

  it("refuses by name a secret too short to seal with, rather than reading every seal as none", async () => {
    sent.set(
      "exactis_session",
      await sealData({ signedInAt: 1 }, { password }),
    );
    vi.stubEnv("SESSION_PASSWORD", password.slice(0, 31));

    await expect(hasSession()).rejects.toThrow(
      "SESSION_PASSWORD is shorter than 32 characters",
    );
    await expect(startSession()).rejects.toThrow(
      "SESSION_PASSWORD is shorter than 32 characters",
    );
  });

  it("honours a seal only while the password it was made under holds, and none made before seals said which", async () => {
    sent.set(
      "exactis_session",
      await sealData({ signedInAt: Date.now() }, { password }),
    );

    expect(await hasSession()).toBe(false);

    await signIn();

    expect(await hasSession()).toBe(true);

    vi.stubEnv("APP_PASSWORD_HASH", "the next password's hash");

    expect(await hasSession()).toBe(false);
  });

  it("starts a session the same deployment then honours", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await startSession();

    expect(jar.set).toHaveBeenCalledExactlyOnceWith(
      "exactis_session",
      expect.stringMatching(/^Fe26\.2/),
      {
        httpOnly: true,
        maxAge: 604800,
        path: "/",
        sameSite: "lax",
        secure: true,
      },
    );

    const [, seal] = jar.set.mock.calls[0] ?? [];
    sent.set("exactis_session", seal ?? "");

    expect(await hasSession()).toBe(true);
  });

  it("sends the cookie over plain HTTP outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await startSession();

    expect(jar.set).toHaveBeenCalledWith(
      "exactis_session",
      expect.any(String),
      expect.objectContaining({ secure: false }),
    );
  });

  it("ends a session by deleting the cookie", async () => {
    await endSession();

    expect(jar.delete).toHaveBeenCalledExactlyOnceWith("exactis_session");
  });

  it("requires a session by redirecting to the login screen without one", async () => {
    await expect(requireSession()).rejects.toThrow("redirected");
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/login");

    await signIn();

    await expect(requireSession()).resolves.toBeUndefined();
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});
