import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Target, Targets } from "@/data/targets";

import { commit, field } from "@/test/dom";

import { CogitatorScreen } from "./cogitator-screen";

// An allocation of the categories given, imported on the seventh of
// September 2026.
function allocation(categories: readonly Target[]): Targets {
  return { categories, importedOn: "2026-09-07" };
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

// The tile of the tone given, inverse for the one set apart.
function toned(tone: string): HTMLElement {
  return screen.getByText(
    (_content, element) => element?.getAttribute("data-tone") === tone,
  );
}

describe("CogitatorScreen", () => {
  it("heads the screen as the seventh, saying when the targets were imported and what they hold", () => {
    render(<CogitatorScreen targets={reference} />);

    expect(screen.getByText("Sect. VII · Cogitator")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Next best trades",
    );
    expect(screen.getByText("Imported 7 Sep 2026")).toBeInTheDocument();
    expect(screen.getByText("£5,450 held")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("cautions that the trades buy toward the target allocation's split while the plan holds another in bonds", () => {
    render(
      <CogitatorScreen
        bonds={{ now: 0.4, targeted: 0.3 }}
        targets={reference}
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent(
      "The target allocation holds 30% in bonds; the plan holds 40% nowThe trades buy toward the target allocation's split. Retarget on Assumptions › Target allocation to buy toward the plan's.",
    );
  });

  it("says no allocation is imported yet, pointing to where one is, and takes no amount", () => {
    render(<CogitatorScreen targets={null} />);

    expect(screen.getByText("No allocation imported yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Assumptions › Target allocation" }),
    ).toHaveAttribute("href", "/assumptions");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("says nothing is held yet while every category holds nothing, as an older import left them", () => {
    render(
      <CogitatorScreen
        targets={allocation([target("A", 0.6, 0), target("B", 0.4, 0)])}
      />,
    );

    expect(screen.getByText("Nothing held yet")).toBeInTheDocument();
    expect(screen.getByText("£0 held")).toBeInTheDocument();
  });

  it("says there is nothing to buy toward while no category has both a fund and a share", () => {
    render(
      <CogitatorScreen
        targets={allocation([
          target("A", 0, 1000),
          { ...target("B", 1, 0), isImplemented: false },
        ])}
      />,
    );

    expect(screen.getByText("Nothing to buy toward")).toBeInTheDocument();
  });

  it("asks for the amount before any is typed, and reads the allocation as it stands", () => {
    render(<CogitatorScreen targets={reference} />);

    expect(screen.getAllByText("Type an amount to invest.")).toHaveLength(1);
    expect(screen.getAllByText("No trade")).toHaveLength(3);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Holds £1,000 · 18.35% → 18.35% of 40.00%"),
    ).toHaveLength(1);
  });

  it("tiles the trades recommended, the largest set apart, and lays the ladder with the rung recommended flagged and those past it muted", () => {
    render(<CogitatorScreen targets={reference} />);
    invest("2000");

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
    render(<CogitatorScreen targets={reference} />);
    invest("50");

    expect(
      screen.getAllByText(
        "No trade. Trade 1 would put only £50 into A, under the £100 minimum.",
      ),
    ).toHaveLength(1);
  });

  it("names the first of trades the next rung would put the same into", () => {
    render(
      <CogitatorScreen
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

  it("says the next trade would bring the allocation no nearer where every other category holds its target", () => {
    render(
      <CogitatorScreen
        targets={allocation([target("A", 0.5, 2000), target("B", 0.5, 3000)])}
      />,
    );
    invest("1000");

    expect(
      screen.getAllByText("1 trade. Trade 2 would bring it no nearer."),
    ).toHaveLength(1);
  });

  // A holds £1,000 of its 50%, B £1,500 of 25% and C £950 of 25%, with
  // nothing coming in: two trades sell the £637 B stands over into A;
  // three would bring all three to target but sell only £87 of C.
  it("sells to buy up to the sales typed with no amount, recommending as many sales as are worth placing", () => {
    render(
      <CogitatorScreen
        targets={allocation([
          target("A", 0.5, 1000),
          target("B", 0.25, 1500),
          target("C", 0.25, 950),
        ])}
      />,
    );
    commit(field("Sales at most"), "2");

    expect(toned("inverse")).toHaveTextContent("A£637");
    expect(toned("default")).toHaveTextContent("B−£637");
    expect(screen.getByText("43.48% → 25.01% of 25.00%")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "2 trades. Trade 3 would sell only £87 of C, under the £100 minimum.",
      ),
    ).toHaveLength(1);

    const ladder = screen.getByRole("region", { name: "How many trades" });
    const rows = within(ladder).getAllByRole("row").slice(1);

    expect(rows.map((row) => row.textContent)).toStrictEqual([
      expect.stringContaining("No trade"),
      expect.stringContaining("A £637 · B −£637"),
      expect.stringContaining("A £724 · B −£637 · C −£87"),
    ]);

    const ledger = screen.getByRole("region", {
      name: "Where it leaves the allocation",
    });

    expect(within(ledger).getAllByRole("row")[2]).toHaveTextContent(
      "B£1,50043.48%−£63725.01%25.00%",
    );
  });

  // A holds £1,000 of its half and B £1,500 of its half. £50 in makes
  // £2,550: one trade puts the £50 into A, under the minimum; two sell
  // the £225 B stands over into A, both over it.
  it("mutes a rung below the one recommended with a trade under the minimum", () => {
    render(
      <CogitatorScreen
        targets={allocation([target("A", 0.5, 1000), target("B", 0.5, 1500)])}
      />,
    );
    invest("50");
    commit(field("Sales at most"), "1");

    const ladder = screen.getByRole("region", { name: "How many trades" });
    const rows = within(ladder).getAllByRole("row").slice(1);

    expect(rows.map((row) => row.textContent)).toStrictEqual([
      expect.stringContaining("No trade"),
      expect.stringContaining("A £50"),
      expect.stringContaining("A £275 · B −£225"),
    ]);
    expect(rows[1]).toHaveClass("text-muted-foreground");
    expect(rows[2]).not.toHaveClass("text-muted-foreground");
  });

  it("opens the sales field on the sales held when it comes back", () => {
    const { rerender } = render(<CogitatorScreen targets={reference} />);
    commit(field("Sales at most"), "3");
    rerender(<CogitatorScreen targets={null} />);
    rerender(<CogitatorScreen targets={reference} />);

    expect(field("Sales at most")).toHaveValue("3");
  });

  it("ledgers each category's holding, its share now and after the trades, and its target, flagging one with no fund and muting a target of nothing", () => {
    render(
      <CogitatorScreen
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
