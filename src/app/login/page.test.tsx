import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Login from "./page";

vi.mock("@/actions/auth", () => ({
  signIn: vi.fn(),
  signInAsDeveloper: vi.fn(),
}));

describe("Login", () => {
  it("opens with the sign-in card and the form, and no other door", () => {
    vi.stubEnv("APP_DEV_SIGN_IN", "");
    render(<Login />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sign in",
    );
    expect(screen.getByText("Exactis")).toHaveClass("label");
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign in without a password" }),
    ).not.toBeInTheDocument();
  });

  it("offers the development sign-in when the door is open", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_DEV_SIGN_IN", "1");
    render(<Login />);

    expect(
      screen.getByRole("button", { name: "Sign in without a password" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Open because APP_DEV_SIGN_IN is set. Never in production.",
    );
  });
});
