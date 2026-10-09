import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Target, Targets } from "@/data/targets";

import { commit, field } from "@/test/dom";

import { CogitatorBoard } from "./cogitator-board";

// An allocation of the categories given, imported on the third of
// September 2026.
function allocation(categories: readonly Target[]): Targets {
  return { categories, importedOn: "2026-09-03" };
}

// A category by its name, its share of the whole and what it holds,
// with a fund assigned.
function target(name: string, share: number, value: number): Target {
  return { classes: [], id: name, isImplemented: true, name, share, value };
}

// A holds £1,000 of its 40%, B £3,000 of 30%, C £1,000 of 20% and D
// £450 of 10%, £5,450 in all. £2,000 in makes £7,450: A is £1,980
// short, C £490, D £295 and B £765 over. One trade puts it all into
// A; two bring A and C £235 short, £1,745 and £255; three would bring
// D level too but put only £40 into it.
const reference = allocation([
  target("A", 0.4, 1000),
  target("B", 0.3, 3000),
  target("C", 0.2, 1000),
  target("D", 0.1, 450),
]);

// The amount to invest typed and committed.
function invest(amount: string): void {
  commit(field("Amount to invest"), amount);
}

describe("CogitatorBoard", () => {
  it("heads the screen as the seventh, saying when the targets were imported and what they hold", () => {
    render(<CogitatorBoard targets={reference} />);

    expect(screen.getByText("Sect. VII · Cogitator")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Next best trades",
    );
    expect(screen.getByText("Imported 3 Sep 2026")).toBeInTheDocument();
    expect(screen.getByText("£5,450 held")).toBeInTheDocument();
  });

  it("says no allocation is imported yet, pointing to where one is, and takes no amount", () => {
    render(<CogitatorBoard targets={null} />);

    expect(
      screen.getByText("Buys only, toward the target allocation"),
    ).toBeInTheDocument();
    expect(screen.getByText("No allocation imported yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Assumptions › Target allocation" }),
    ).toHaveAttribute("href", "/assumptions");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("says nothing is held yet while every category holds nothing, as an older import left them", () => {
    render(
      <CogitatorBoard
        targets={allocation([target("A", 0.6, 0), target("B", 0.4, 0)])}
      />,
    );

    expect(screen.getByText("Nothing held yet")).toBeInTheDocument();
    expect(screen.getByText("£0 held")).toBeInTheDocument();
  });

  it("says there is nothing to buy toward while no category has both a fund and a share", () => {
    render(
      <CogitatorBoard
        targets={allocation([
          target("A", 0, 1000),
          { ...target("B", 1, 0), isImplemented: false },
        ])}
      />,
    );

    expect(screen.getByText("Nothing to buy toward")).toBeInTheDocument();
  });

  it("asks for the amount before any is typed, and reads the allocation as it stands", () => {
    render(<CogitatorBoard targets={reference} />);

    expect(
      screen.getAllByText("Type the amount to invest to lay the trades out."),
    ).toHaveLength(2);
    expect(screen.getAllByText("No trade")).toHaveLength(3);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Holds £1,000 · 18.35% → 18.35% of 40.00%"),
    ).toHaveLength(1);
  });

  it("tiles the trades recommended, the largest set apart, and lays the ladder with the rung recommended flagged and those past it muted", () => {
    render(<CogitatorBoard targets={reference} />);
    invest("2000");

    const toned = (tone: string): HTMLElement =>
      screen.getByText(
        (_content, element) => element?.getAttribute("data-tone") === tone,
      );

    expect(toned("inverse")).toHaveTextContent("A£1,745");
    expect(toned("default")).toHaveTextContent("C£255");
    expect(screen.getByText("18.35% → 36.85% of 40.00%")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "2 trades. Trade 3 would put only £40 into D, under the £100 minimum.",
      ),
    ).toHaveLength(1);

    const ladder = screen.getByRole("region", { name: "How many trades" });
    const rows = within(ladder).getAllByRole("row").slice(1);

    expect(rows.map((row) => row.textContent)).toStrictEqual([
      expect.stringContaining("No trade"),
      expect.stringContaining("A £2,000"),
      expect.stringContaining("A £1,745 · C £255"),
      expect.stringContaining("A £1,725 · C £235 · D £40"),
    ]);
    expect(within(rows[2] ?? ladder).getAllByText("Recommended")).toHaveLength(
      2,
    );
    expect(rows[3]).toHaveClass("text-muted-foreground");
    expect(rows[2]).not.toHaveClass("text-muted-foreground");
    expect(within(rows[0] ?? ladder).getAllByText("—")).not.toHaveLength(0);
    expect(within(rows[1] ?? ladder).getAllByText("+8.34pp")).toHaveLength(2);
  });

  it("recommends no trade for an amount under the minimum, saying what the first would put in", () => {
    render(<CogitatorBoard targets={reference} />);
    invest("50");

    expect(
      screen.getAllByText(
        "No trade. Trade 1 would put only £50 into A, under the £100 minimum.",
      ),
    ).toHaveLength(2);
  });

  it("names the first of trades the next rung would put the same into", () => {
    render(
      <CogitatorBoard
        targets={allocation([target("A", 0.5, 1000), target("B", 0.5, 1000)])}
      />,
    );
    invest("100");

    expect(
      screen.getAllByText(
        "1 trade. Trade 2 would put only £50 into A, under the £100 minimum.",
      ),
    ).toHaveLength(1);
  });

  it("says the next trade would buy nothing where every other category holds its target", () => {
    render(
      <CogitatorBoard
        targets={allocation([target("A", 0.5, 2000), target("B", 0.5, 3000)])}
      />,
    );
    invest("1000");

    expect(
      screen.getAllByText(
        "1 trade. Trade 2 would buy nothing: every other category holds its target or more.",
      ),
    ).toHaveLength(1);
  });

  it("ledgers each category's holding, its share now and after the trades, and its target, flagging one with no fund and muting a target of nothing", () => {
    render(
      <CogitatorBoard
        targets={allocation([
          target("A", 0.5, 2000),
          target("B", 0, 1000),
          { ...target("C", 0.5, 1000), isImplemented: false },
        ])}
      />,
    );
    invest("1000");

    const ledger = screen.getByRole("region", {
      name: "Where it leaves the allocation",
    });
    const rows = within(ledger).getAllByRole("row").slice(1);

    expect(rows[0]).toHaveTextContent("A£2,00050.00%£1,00060.00%50.00%");
    expect(rows[1]).toHaveTextContent("B£1,00025.00%—20.00%0.00%");
    expect(rows[2]).toHaveTextContent("No fund assigned");
    expect(
      within(rows[1] ?? ledger).getByRole("cell", { name: "0.00%" }),
    ).toHaveClass("text-muted-foreground");
    expect(
      within(rows[2] ?? ledger).getAllByText("No fund assigned"),
    ).toHaveLength(2);
  });
});
