import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { signIn } from "./actions";
import { LoginForm } from "./login-form";

vi.mock("./actions", () => ({ signIn: vi.fn() }));

describe("LoginForm", () => {
  it("asks for the password and posts it to the sign-in action", async () => {
    vi.mocked(signIn).mockResolvedValue({});
    render(<LoginForm />);

    const field = screen.getByLabelText("Password");

    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAttribute("autocomplete", "current-password");
    expect(field).toBeRequired();
    expect(field).not.toHaveAttribute("aria-invalid");

    fireEvent.change(field, { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await vi.waitFor(() => {
      expect(signIn).toHaveBeenCalledOnce();
    });

    const [, formData] = vi.mocked(signIn).mock.calls[0] ?? [];

    expect(formData?.get("password")).toBe("hunter2");
  });

  it("shows why an attempt failed and marks the field", async () => {
    vi.mocked(signIn).mockResolvedValue({ error: "That is not the password." });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("That is not the password."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
