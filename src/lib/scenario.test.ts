// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { closeScenario, openedScenario, openScenario } from "./scenario";

// A request's cookie jar: what the browser sent, and what the server
// writes back, kept apart so a test can see one without the other.
// Hoisted because the module mock below is.
const { jar, sent } = vi.hoisted(() => ({
  jar: {
    delete: vi.fn<(cookie: { name: string }) => void>(),
    get: vi.fn<(name: string) => undefined | { name: string; value: string }>(),
    set: vi.fn<(name: string, value: string, options: object) => void>(),
  },
  sent: new Map<string, string>(),
}));

const cookies = vi.hoisted(() => vi.fn<() => Promise<typeof jar>>());

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies }));

describe("the scenario open", () => {
  beforeEach(() => {
    sent.clear();
    cookies.mockResolvedValue(jar);
    jar.get.mockImplementation((name) => {
      const value = sent.get(name);
      return value === undefined ? undefined : { name, value };
    });
  });

  it("is none without a cookie, and the name the cookie holds with one", async () => {
    expect(await openedScenario()).toBeNull();

    sent.set("exactis_scenario", "Retire early");

    expect(await openedScenario()).toBe("Retire early");
  });

  it("reads the cookie under the __Host- name in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    sent.set("exactis_scenario", "Retire early");

    expect(await openedScenario()).toBeNull();

    sent.set("__Host-exactis_scenario", "Move house");

    expect(await openedScenario()).toBe("Move house");
  });

  it("opens a scenario for the browser's session, kept from scripts and sent over HTTPS under the __Host- name in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await openScenario("Retire early");

    expect(jar.set).toHaveBeenCalledExactlyOnceWith(
      "__Host-exactis_scenario",
      "Retire early",
      { httpOnly: true, path: "/", sameSite: "lax", secure: true },
    );
  });

  it("sends the cookie over plain HTTP outside production, under its bare name", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await openScenario("Retire early");

    expect(jar.set).toHaveBeenCalledWith(
      "exactis_scenario",
      "Retire early",
      expect.objectContaining({ secure: false }),
    );
  });

  it("closes the scenario by deleting the cookie with the attributes it was set with", async () => {
    await closeScenario();
    vi.stubEnv("NODE_ENV", "production");
    await closeScenario();

    expect(jar.delete.mock.calls).toStrictEqual([
      [
        {
          httpOnly: true,
          name: "exactis_scenario",
          path: "/",
          sameSite: "lax",
          secure: false,
        },
      ],
      [
        {
          httpOnly: true,
          name: "__Host-exactis_scenario",
          path: "/",
          sameSite: "lax",
          secure: true,
        },
      ],
    ]);
  });
});
