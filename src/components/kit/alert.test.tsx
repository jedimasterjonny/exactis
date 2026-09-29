import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Alert, AlertDescription, AlertTitle } from "./alert";

describe("Alert", () => {
  it("paints the caution tone this app adds, over its title and description", () => {
    render(
      <Alert variant="caution">
        <AlertTitle>Rates typed by hand</AlertTitle>
        <AlertDescription>
          Nothing warns you when they go stale.
        </AlertDescription>
      </Alert>,
    );

    const alert = screen.getByRole("alert");

    expect(alert).toHaveClass("bg-caution/10", "text-caution");
    // variant={null} means upstream contributes no variant classes, so the
    // default's card background cannot be left underneath the tone's.
    expect(alert).not.toHaveClass("bg-card");
    expect(screen.getByText("Rates typed by hand")).toHaveAttribute(
      "data-slot",
      "alert-title",
    );
    expect(
      screen.getByText("Nothing warns you when they go stale."),
    ).toHaveAttribute("data-slot", "alert-description");
  });

  it("passes an upstream variant through untouched", () => {
    render(<Alert variant="destructive">Refused</Alert>);

    expect(screen.getByRole("alert")).toHaveClass("text-destructive");
  });

  it("renders the upstream default when no variant is given", () => {
    render(<Alert className="mt-1">Plain</Alert>);

    expect(screen.getByRole("alert")).toHaveClass("bg-card", "mt-1");
  });
});
