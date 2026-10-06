import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RowLock } from "./row-lock";

describe("RowLock", () => {
  it("draws a muted lock named by the reason the row is locked", () => {
    render(<RowLock reason="Edited with its asset on the accounts screen" />);

    expect(
      screen.getByRole("img", {
        name: "Edited with its asset on the accounts screen",
      }),
    ).toHaveClass("text-muted-foreground");
  });
});
