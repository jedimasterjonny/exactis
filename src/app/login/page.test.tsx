import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Login from "./page";

vi.mock("@/actions/auth", () => ({ signIn: vi.fn() }));

describe("Login", () => {
  it("opens with the sign-in card and the form, and no other door", () => {
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
});
