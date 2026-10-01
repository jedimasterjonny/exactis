import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Target } from "@/data/targets";

import { targets } from "@/data/targets.fixture";

import { TargetTable } from "./target-table";

// A category at the top of the taxonomy, beneath no class, that asks
// for nothing and has nothing assigned to it.
const cash: Target = {
  classes: [],
  id: "cash",
  isImplemented: false,
  name: "Cash",
  share: 0,
};

// The cells of the row of the category named, as read across.
function rowOf(name: string): readonly HTMLElement[] {
  const row = screen
    .getAllByRole("row")
    .find((each) => within(each).queryAllByText(name).length > 0);
  if (row === undefined) {
    throw new Error(`No row for ${name}`);
  }
  return within(row).getAllByRole("cell");
}

describe("TargetTable", () => {
  it("heads the columns", () => {
    render(<TargetTable categories={targets.categories} />);

    expect(
      screen.getAllByRole("columnheader").map((head) => head.textContent),
    ).toStrictEqual(["Category", "PP class", "Target"]);
  });

  // The folded cell leads each row, then the three columns.
  it("lays each category out in the order given, with the classes above it and its target", () => {
    render(<TargetTable categories={targets.categories} />);

    const rows = screen.getAllByRole("row").slice(1);

    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole("cell")
          .slice(1)
          .map((cell) => cell.textContent),
      ),
    ).toStrictEqual([
      ["FTSE Global All Cap ex-UK", "Equity · Developed", "48.00%"],
      ["Global emerging markets", "Equity", "12.00%"],
      ["UK equity", "Equity · UK", "12.00%"],
      ["Global small cap", "Equity", "8.00%"],
      ["FTSE North America", "Equity · Developed", "0.00%"],
      ["FTSE 100", "Equity · UK", "0.00%"],
      ["Global bonds, hedged", "Bonds", "14.00%"],
      ["UK index-linked gilts, 5y+Nothing implements it", "Bonds", "4.00%"],
      ["Short-dated gilts", "Bonds", "2.00%"],
    ]);
  });

  it("flags a category asking for something that nothing implements, in the caution tone", () => {
    render(<TargetTable categories={targets.categories} />);

    const [folded, name] = rowOf("UK index-linked gilts, 5y+");
    const flag = within(name ?? document.body).getByText(
      "Nothing implements it",
    );

    expect(flag).toHaveAttribute("data-variant", "caution");
    expect(flag).toHaveClass("label");
    expect(
      within(folded ?? document.body).getByText("Nothing implements it"),
    ).toHaveClass("text-caution");
    expect(screen.getAllByText("Nothing implements it")).toHaveLength(2);
  });

  it("mutes a target of nothing, and flags none that asks for nothing", () => {
    render(<TargetTable categories={[...targets.categories, cash]} />);

    const [foldedZero, , , zero] = rowOf("FTSE 100");
    const [foldedHeld, , , held] = rowOf("UK equity");

    expect(zero).toHaveClass("text-muted-foreground");
    expect(held).not.toHaveClass("text-muted-foreground");
    expect(within(foldedZero ?? document.body).getByText("0.00%")).toHaveClass(
      "text-muted-foreground",
    );
    expect(
      within(foldedHeld ?? document.body).getByText("12.00%"),
    ).not.toHaveClass("text-muted-foreground");
    expect(rowOf("Cash")[1]).toHaveTextContent(/^Cash$/);
  });

  it("dashes the classes of a category beneath none", () => {
    render(<TargetTable categories={[cash]} />);

    const [folded, , classes, target] = rowOf("Cash");

    expect(classes).toHaveTextContent(/^—$/);
    expect(target).toHaveTextContent("0.00%");
    expect(folded).toHaveTextContent("Cash0.00%—");
  });

  // The folded cell is drawn only while the table is narrow, and the
  // columns only while it is wide, so either reads the row once.
  it("folds each row into one cell with the name and target on its first line", () => {
    render(<TargetTable categories={targets.categories} />);

    const [folded, ...columns] = rowOf("FTSE Global All Cap ex-UK");

    expect(folded).toHaveClass("unfolded:hidden");
    expect(folded).toHaveTextContent(
      "FTSE Global All Cap ex-UK48.00%Equity · Developed",
    );
    expect(
      within(folded ?? document.body).queryByRole("button"),
    ).not.toBeInTheDocument();
    for (const column of columns) {
      expect(column).toHaveClass("folded:hidden");
    }
  });
});
