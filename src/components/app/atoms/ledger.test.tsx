import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Ledger } from "./ledger";

describe("Ledger", () => {
  it("lays each step out as a line, its name over what it rests on and its figure beside them", () => {
    render(
      <Ledger
        steps={[
          {
            detail: "Gilt curve as at 1 Sep 2026",
            figure: "3.365%",
            label: "BoE implied inflation, 20-year",
          },
          {
            detail: "Standing assumption",
            figure: "−0.300pp",
            label: "Inflation risk premium",
          },
        ]}
        total="2.95%"
        totalName="Derived inflation"
      />,
    );

    expect(
      screen.getAllByRole("listitem").map((step) => step.textContent),
    ).toStrictEqual([
      "BoE implied inflation, 20-yearGilt curve as at 1 Sep 20263.365%",
      "Inflation risk premiumStanding assumption−0.300pp",
    ]);
    expect(screen.getByText("Standing assumption")).toHaveClass(
      "text-muted-foreground",
    );
  });

  it("lays a step that says nothing its figure rests on out as its name and figure alone", () => {
    render(
      <Ledger
        steps={[{ figure: "630", label: "Futures run" }]}
        total="95%"
        totalName="Chance of success"
      />,
    );

    expect(screen.getByRole("listitem")).toHaveTextContent(/^Futures run630$/);
  });

  it("closes on the figure the steps come to, under its name", () => {
    render(<Ledger steps={[]} total="2.95%" totalName="Derived inflation" />);

    expect(screen.getByText("Derived inflation")).toHaveClass("label");
    expect(screen.getByText("2.95%")).toHaveClass("figure", "text-3xl");
  });
});
