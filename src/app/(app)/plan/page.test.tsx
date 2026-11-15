import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Household } from "@/data/household";
import type { Plan as Planned } from "@/data/plan";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
import { house, houseLoan, move } from "@/data/houses.fixture";
import { incomeLines, plan, statePension } from "@/data/income.fixture";
import { milestones } from "@/data/milestones.fixture";
import { owners, working } from "@/data/owners.fixture";
import { getHousehold } from "@/store/household";

import Plan, { metadata } from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));
vi.mock("@/actions/milestones", () => ({
  removeMilestone: vi.fn(),
  saveMilestone: vi.fn(),
}));
vi.mock("@/actions/schedule", () => ({
  removeExpenseLine: vi.fn(),
  removeIncomeLine: vi.fn(),
  saveExpenseLine: vi.fn(),
  saveIncomeLine: vi.fn(),
}));

const [salary] = incomeLines;

// The household before anything is saved, as the store reads it, for
// each test to lay what the page reads over.
const { household } = soundKept(blank);

describe("Plan", () => {
  it("titles the page by its label in the navigation", () => {
    expect(metadata).toStrictEqual({ title: "Income & expenses" });
  });

  // The fixture's first year: the salary's £12,000 a month, less the
  // £1,200 sacrificed into the pension and the tax on the rest, against
  // the household's £3,350, and the pension's and the ISA's fixed sums
  // taking all that leaves before the mortgage's is reached, so the last
  // of the ledger's figures, what is left, is nothing. The pension is
  // marked droppable, so it is paid what the month has rather than kept
  // paid out of the savings.
  it("hands the store's milestones, lines and plan to their cards under one header, and this year's cash flow beneath", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      accounts: [{ ...accounts[0], isDroppable: true }, ...accounts.slice(1)],
      milestones: [...milestones],
      owners: [...owners],
      plan,
      schedule: {
        expenses: [...expenseLines],
        income: [...incomeLines, statePension],
      },
    });

    render(await Plan());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Income & expenses",
    );
    expect(screen.getByText("Sect. IV · Income & expenses")).toHaveClass(
      "label",
    );
    expect(screen.getByText("Figures in today's money")).toBeInTheDocument();
    // The screen opens on its sentence, above the cards' titles: the
    // month now puts £1,200 by as the salary's sacrifice and £1,176.20
    // as the pension's fixed sum; from 2053, the consulting's £2,000
    // leaves the month £6,145.98 short, which the savings carry to the
    // end of the plan.
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toStrictEqual([
      "A month puts by £2,376 now and draws £6,146 from\u00a02053, and the savings last to\u00a091 if the plan's own rates hold.",
      "Milestones",
      "What comes in",
      "What goes out",
      "Year by year",
    ]);
    expect(screen.getByText("Age 68–91")).toBeInTheDocument();
    expect(screen.getByText("Age 84–91")).toBeInTheDocument();
    // Written in the salary's columns and again on its folded lines, only
    // one of which is on screen at any width.
    expect(
      screen.getAllByText(/12\.00% of the base into Workplace pension$/),
    ).toHaveLength(2);
    // The schedules keep their rules in their captions, with no note
    // between the cards.
    expect(screen.queryByRole("paragraph")).not.toBeInTheDocument();
    // The year book opens on the plan's first year, its month laid out
    // beneath the strip.
    expect(
      screen.getByText("September 2026, age 34, in today's money"),
    ).toBeInTheDocument();
    expect(screen.getByText("Left over")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Year by year" }))
        .getAllByText("£0")
        .at(-1),
    ).toHaveClass("figure", "font-medium");
  });

  // The salary alone, with nothing going out and no account to pay,
  // leaves all of its £12,000 a month that the tax does not take,
  // £7,342.20, which the year book lays out; but with no account
  // holding anything there are no savings for a sentence to speak of,
  // so the screen opens on its cards, as the dashboard draws none.
  it("says no sentence where no account holds anything", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      accounts: [],
      milestones: [],
      plan,
      schedule: { expenses: [], income: [salary] },
    });

    render(await Plan());

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toStrictEqual([
      "Milestones",
      "What comes in",
      "What goes out",
      "Year by year",
    ]);
    expect(screen.getByText("Figures in today's money")).toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
    expect(screen.getByText("£7,342")).toHaveClass("figure", "font-medium");
  });

  // The same salary beside the current account, which takes none of
  // what it leaves, so the month puts nothing by; and beside the ISA
  // too, whose £20,000 a year puts £1,666.67 by a month. Neither month
  // ever draws on the savings, which last.
  it("says what a month puts by where it never draws on the savings", async () => {
    const [, isa, current] = accounts;
    const sentenceWith = async (
      held: Household["accounts"],
    ): Promise<null | string> => {
      vi.mocked(getHousehold).mockResolvedValue({
        ...household,
        accounts: held,
        milestones: [],
        plan,
        schedule: { expenses: [], income: [salary] },
      });
      const { unmount } = render(await Plan());
      const [sentence] = screen.getAllByRole("heading", { level: 2 });
      unmount();
      return sentence?.textContent ?? null;
    };

    expect(await sentenceWith([current])).toBe(
      "A month puts nothing by now, and the savings last to\u00a091 if the plan's own rates hold.",
    );
    expect(await sentenceWith([isa, current])).toBe(
      "A month puts by £1,667 now, and the savings last to\u00a091 if the plan's own rates hold.",
    );
  });

  // The household's £3,350 a month with nothing coming in and the
  // current account's £16,900 to draw on: the month is short now, and
  // the account outlasts the four months left of 2026 but not 2027.
  it("says when the month draws on the savings now and when they run out", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      accounts: [accounts[2]],
      milestones: [],
      plan,
      schedule: { expenses: [expenseLines[0]], income: [] },
    });

    render(await Plan());

    expect(screen.getAllByRole("heading", { level: 2 })[0]?.textContent).toBe(
      "A month draws £3,350 from the savings now, and they run out at\u00a035 at the plan's own rates.",
    );
  });

  // The same £3,350 a month with a pension the only account to draw on:
  // at 34 it is a pension before the pension age, so the month is
  // carried by drawing it early at the 55% charge, and the plan falls
  // short there rather than lasting on paper. The fixture's £391,640
  // runs out after it, at 39 in 2031, which is said alone, as the
  // dashboard says it; £10,000,000 never does, so the early draw is
  // said. The pension is marked droppable, so its own fixed sum is not
  // kept paid on top of the spending.
  it("says when the savings run out, and when they are carried only by drawing a pension early where they never do", async () => {
    const [pension] = accounts;
    const headlineWith = async (balance: number): Promise<null | string> => {
      vi.mocked(getHousehold).mockResolvedValue({
        ...household,
        accounts: [{ ...pension, balance, isDroppable: true }],
        milestones: [],
        owners: [...owners],
        plan,
        schedule: { expenses: [expenseLines[0]], income: [] },
      });
      const { unmount } = render(await Plan());
      const [sentence] = screen.getAllByRole("heading", { level: 2 });
      unmount();
      return sentence?.textContent ?? null;
    };

    expect(await headlineWith(391640)).toBe(
      "A month draws £3,350 from the savings now, and they run out at\u00a039 at the plan's own rates.",
    );
    expect(await headlineWith(10000000)).toBe(
      "A month draws £3,350 from the savings now, and they fall short at\u00a034 at the plan's own rates.",
    );
  });

  // The household of the first test with its owner retiring once it is
  // worth £90,000,000, which it never is: the plan is laid out working
  // to its end, so the savings lasting would read as the plan doing so,
  // and the sentence says the retirement is never reached instead, as
  // the dashboard does, at its own rates. With the spending alone and
  // the pension to draw on, it says where the savings run out after it.
  it("says a retirement on conditions is never reached rather than that the savings last", async () => {
    const never = {
      ...plan,
      owners: [
        {
          ...working,
          retirement: [{ measure: "worth", of: "pounds", times: 90000000 }],
        },
      ],
    } satisfies Planned;
    const headlineWith = async (
      held: Pick<Household, "accounts" | "schedule">,
    ): Promise<null | string> => {
      vi.mocked(getHousehold).mockResolvedValue({
        ...household,
        ...held,
        milestones: [],
        owners: [...owners],
        plan: never,
      });
      const { unmount } = render(await Plan());
      const [sentence] = screen.getAllByRole("heading", { level: 2 });
      unmount();
      return sentence?.textContent ?? null;
    };

    expect(
      await headlineWith({
        accounts: [{ ...accounts[0], isDroppable: true }, ...accounts.slice(1)],
        schedule: {
          expenses: [...expenseLines],
          income: [...incomeLines, statePension],
        },
      }),
    ).toBe(
      "A month puts by £2,376 now and draws £6,146 from\u00a02053, and the plan never reaches its retirement's conditions at its own rates.",
    );
    expect(
      await headlineWith({
        accounts: [{ ...accounts[0], isDroppable: true }],
        schedule: { expenses: [expenseLines[0]], income: [] },
      }),
    ).toBe(
      "A month draws £3,350 from the savings now, the plan never reaches its retirement's conditions at its own rates, and the savings run out at\u00a039.",
    );
  });
  // The fixture's home moving up as the children leave home, in 2040:
  // the milestone's row says what the move comes to as the plan at its
  // own rates makes it. With no inflation, today's money is the year's.
  // The £397,512 home, grown 2.1% a year for the thirteen and a third
  // years to January 2040 and its mortgage cleared by then, sells for
  // £524,437; the £650,000 next, grown the same, would cost £857,544,
  // so it is held to its £800,000 ceiling, whose stamp duty is £2,500
  // and 5% of £550,000, £30,000; and the deposit is the equity less
  // that.
  it("says what a move comes to beside the milestone it is made at", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      accounts: [...accounts.slice(0, 3), { ...house, move }, houseLoan],
      milestones: [...milestones],
      owners: [...owners],
      plan,
      schedule: { expenses: [...expenseLines], income: [...incomeLines] },
    });
    render(await Plan());

    expect(
      screen.getAllByText(
        "Moves Home: £524,437 equity, £494,437 deposit, £30,000 stamp duty",
      ),
    ).toHaveLength(2);
  });
});
