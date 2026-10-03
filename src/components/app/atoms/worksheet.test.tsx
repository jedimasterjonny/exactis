import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { worksheet } from "@/test/dom";

import { Worksheet } from "./worksheet";

// Two columns and three rows, the last a result.
function renderSheet(): void {
  render(
    <Worksheet
      columns={["Stocks", "Bonds"]}
      label="Rates, worked out"
      rows={[
        { detail: "As blended", figures: ["8.0%", "4.5%"], label: "Return" },
        { detail: "Off both", figures: ["−0.2pp", "−0.2pp"], label: "Fees" },
        {
          detail: "What they come to",
          figures: ["7.8%", "4.3%"],
          isResult: true,
          label: "Growth",
        },
      ]}
    />,
  );
}

describe("Worksheet", () => {
  it("lays out a figure a column a row, each row read across under its name", () => {
    renderSheet();

    const table = screen.getByRole("table", { name: "Rates, worked out" });

    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((heading) => heading.textContent),
    ).toStrictEqual(["Stocks", "Bonds"]);
    expect(worksheet("Rates, worked out")).toStrictEqual([
      ["Return", "8.0%", "4.5%"],
      ["Fees", "−0.2pp", "−0.2pp"],
      ["Growth", "7.8%", "4.3%"],
    ]);
  });

  it("describes each row's name with what its figures rest on, rather than reading it as a row", () => {
    renderSheet();

    expect(
      screen.getByRole("rowheader", { name: "Fees" }),
    ).toHaveAccessibleDescription("Off both");
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("sets a result's name as a label and its figures large, and a step's small", () => {
    renderSheet();

    const result = screen.getByRole("rowheader", { name: "Growth" });

    expect(result).toHaveClass("label");
    expect(screen.getByRole("cell", { name: "7.8%" })).toHaveClass("text-lg");
    expect(screen.getByRole("rowheader", { name: "Fees" })).not.toHaveClass(
      "label",
    );
    expect(screen.getByRole("cell", { name: "8.0%" })).toHaveClass("text-sm");
  });
});
