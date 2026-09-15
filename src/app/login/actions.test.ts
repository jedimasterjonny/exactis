import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/lib/password";
import { startSession } from "@/lib/session";

import { signIn } from "./actions";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/session", () => ({ startSession: vi.fn() }));

function form(password?: string): FormData {
  const data = new FormData();
  if (password !== undefined) {
    data.set("password", password);
  }
  return data;
}

describe("signIn", () => {
  beforeEach(() => {
    vi.stubEnv("APP_PASSWORD_HASH", hashPassword("correct horse"));
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("redirected");
    });
  });

  it("turns a wrong or missing password away without a session", async () => {
    expect(await signIn({}, form("wrong horse"))).toStrictEqual({
      error: "That is not the password.",
    });
    expect(await signIn({}, form())).toStrictEqual({
      error: "That is not the password.",
    });
    expect(startSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("starts the session on the right password and goes to the dashboard", async () => {
    await expect(signIn({}, form("correct horse"))).rejects.toThrow(
      "redirected",
    );
    expect(startSession).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/");
  });
});
