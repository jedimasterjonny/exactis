import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bySlot } from "@/test/dom";

import { LegendTable } from "./legend-table";

describe("LegendTable", () => {
  it("names each part beside its swatch, with its note where it has one, and its figure", () => {
    render(
      <LegendTable
        caption="Lasted · 900"
        entries={[
          {
            figure: "60%",
            key: "surplus",
            name: "Large surplus",
            note: "over £3,900,000",
            tone: "bg-outcome-surplus",
          },
          {
            figure: "30%",
            key: "comfortable",
            name: "Comfortable",
            tone: "bg-outcome-comfortable",
          },
        ]}
      />,
    );

    const rows = within(
      screen.getByRole("table", { name: "Lasted · 900" }),
    ).getAllByRole("row");

    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole("cell")
          .map(({ textContent }) => textContent),
      ),
    ).toStrictEqual([
      ["", "Large surplus over £3,900,000", "60%"],
      ["", "Comfortable", "30%"],
    ]);
    expect(
      screen
        .getAllByText(bySlot("legend-swatch"), { suggest: false })
        .map((swatch) => swatch.classList.contains("bg-outcome-surplus")),
    ).toStrictEqual([true, false]);
  });
});
