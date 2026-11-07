import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bySlot, worksheet } from "@/test/dom";

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

  it("draws no line beneath a row that says nothing its figures rest on", () => {
    render(
      <Worksheet
        columns={["Stocks"]}
        label="Rates"
        rows={[{ figures: ["8.0%"], label: "Return" }]}
      />,
    );

    expect(
      screen.getByRole("rowheader", { name: "Return" }),
    ).not.toHaveAccessibleDescription();
    expect(screen.getByRole("rowheader", { name: "Return" })).toHaveClass(
      "pb-3",
    );
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(
      screen.getAllByRole("row", { hidden: true, suggest: false }),
    ).toHaveLength(2);
  });

  // The header, then the row, its bar and the line beneath it.
  it("draws a row's bar beneath its figures and above its line, across every column, hidden from the tree", () => {
    render(
      <Worksheet
        columns={["Stocks", "Bonds"]}
        label="Rates"
        rows={[
          {
            bar: <span data-slot="drawn" />,
            detail: "As blended",
            figures: ["8.0%", "4.5%"],
            label: "Return",
          },
        ]}
      />,
    );

    const table = screen.getByRole("table", { name: "Rates" });
    const lines = within(table).getAllByRole("row", {
      hidden: true,
      suggest: false,
    });
    const drawn = lines[2] ?? table;

    expect(lines.map((line) => line.textContent)).toStrictEqual([
      "StocksBonds",
      "Return8.0%4.5%",
      "",
      "As blended",
    ]);
    expect(drawn).toHaveAttribute("aria-hidden", "true");
    expect(within(drawn).getByText(bySlot("drawn"))).toBeInTheDocument();
    expect(
      within(drawn).getByRole("cell", { hidden: true, suggest: false }),
    ).toHaveAttribute("colspan", "3");
    expect(
      within(drawn).getByRole("cell", { hidden: true, suggest: false }),
    ).toHaveClass("pb-2");
    expect(screen.getByRole("rowheader", { name: "Return" })).toHaveClass(
      "pb-1",
    );
    expect(worksheet("Rates")).toStrictEqual([["Return", "8.0%", "4.5%"]]);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(
      screen.getByRole("rowheader", { name: "Return" }),
    ).toHaveAccessibleDescription("As blended");
  });

  it("draws a bar beneath a row with no line beneath it, with the row's own padding below", () => {
    render(
      <Worksheet
        columns={["Stocks"]}
        label="Rates"
        rows={[
          {
            bar: <span data-slot="drawn" />,
            figures: ["8.0%"],
            label: "Return",
          },
        ]}
      />,
    );

    const table = screen.getByRole("table", { name: "Rates" });
    const drawn =
      within(table).getAllByRole("row", { hidden: true, suggest: false })[2] ??
      table;

    expect(within(drawn).getByText(bySlot("drawn"))).toBeInTheDocument();
    expect(
      within(drawn).getByRole("cell", { hidden: true, suggest: false }),
    ).toHaveClass("pb-3");
    expect(screen.getByRole("rowheader", { name: "Return" })).toHaveClass(
      "pb-1",
    );
    expect(
      screen.getByRole("rowheader", { name: "Return" }),
    ).not.toHaveAccessibleDescription();
    expect(
      screen.getAllByRole("row", { hidden: true, suggest: false }),
    ).toHaveLength(3);
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
