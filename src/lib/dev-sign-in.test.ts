import { describe, expect, it, vi } from "vitest";

import { isDevSignInOpen } from "./dev-sign-in";

describe("isDevSignInOpen", () => {
  it("is open when the variable says so outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_DEV_SIGN_IN", "1");

    expect(isDevSignInOpen()).toBe(true);
  });

  it("is closed without the variable, or with it set to anything else", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_DEV_SIGN_IN", "");

    expect(isDevSignInOpen()).toBe(false);

    vi.stubEnv("APP_DEV_SIGN_IN", "true");

    expect(isDevSignInOpen()).toBe(false);
  });

  it("is closed in a production build whatever the variable says", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_DEV_SIGN_IN", "1");

    expect(isDevSignInOpen()).toBe(false);
  });
});
