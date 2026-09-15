import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Accounts from "./page";

describe("Accounts", () => {
  it("hands the fixture to the ledger", () => {
    render(<Accounts />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("3 accounts · 2 assets")).toBeInTheDocument();
  });
});
