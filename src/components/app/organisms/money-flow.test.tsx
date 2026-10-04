import type { ComponentProps, JSX } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Schedule } from "@/engine/cash-flow";

import { accounts, sipp } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { owners } from "@/data/owners.fixture";

import { MoneyFlow } from "./money-flow";

const [pension, isa, cash, home, mortgage] = accounts;
const [salary] = incomeLines;
const [household] = expenseLines;

// The salary alone, running in September 2026, the month the plan the
// income fixture carries starts in, with no expense line.
const salaried: Schedule = { expenses: [], income: [salary] };

// The ISA and the current account paid the spare money rather than a
// fixed sum, the ISA up to its allowance and the cash with no cap.
const spareIsa: Account = {
  ...isa,
  contribution: { cap: null, kind: "spare" },
};
const spareCash: Account = {
  ...cash,
  contribution: { cap: null, kind: "spare" },
};

// The flow over the fixture's savings in the order they are listed, with
// whatever a test gives in their place.
function renderFlow(
  props: Partial<ComponentProps<typeof MoneyFlow>> = {},
): void {
  const savings = props.savings ?? [pension, isa, cash];
  render(
    <MoneyFlow
      accounts={[...savings, home, mortgage]}
      label="Sect. II.ii"
      onMove={vi.fn<(account: Account, target: Account) => void>()}
      owners={owners}
      plan={plan}
      savings={savings}
      schedule={salaried}
      {...props}
    />,
  );
}

// The flow as the ledger holds it: the order kept here and moved as a
// move asks, an account moved onto the one beside it taking its place,
// so a test can see the steps drawn again in their new places.
function Reordered({
  initial,
}: {
  readonly initial: readonly Account[];
}): JSX.Element {
  const [order, setOrder] = useState(initial);
  return (
    <MoneyFlow
      accounts={order}
      label="Sect. II.ii"
      onMove={(account, target) => {
        setOrder(
          order.map((listed) => {
            if (listed === account) {
              return target;
            }
            return listed === target ? account : listed;
          }),
        );
      }}
      owners={owners}
      plan={plan}
      savings={order}
      schedule={salaried}
    />
  );
}

// What the flow's paragraphs say, in the order they are drawn: what is
// spare, each step's name and figure, the remainder, what it means and
// what was last said aloud.
function said(): (null | string)[] {
  return screen
    .getAllByRole("paragraph")
    .map((paragraph) => paragraph.textContent);
}

// The steps the flow lists, each read as the text it draws.
function steps(): (null | string)[] {
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((step) => step.textContent);
}

describe("MoneyFlow", () => {
  // The salary leaves £802 once tax, NI and the fixed sums are paid, and
  // nothing takes the spare money, so all of it is left over. The
  // pension lands its fixed sum, the salary's sacrifice with the NI
  // saved and the basic rate claimed back on its own sum, £3,983 a
  // month, which is £47,794 a year of its owner's allowance; the ISA's
  // fixed sum fills its owner's.
  it("says what is spare, and what lands in each saving in the order it is paid, from where", () => {
    renderFlow();

    const flow = screen.getByRole("region", {
      name: "Where the month's money goes",
    });

    expect(within(flow).getByText("Sect. II.ii")).toHaveClass("label");
    expect(
      within(flow).getByText(
        "Debts are always paid first. Savings are then paid in this order, and drawn on in it one kind at a time.",
      ),
    ).toBeInTheDocument();
    expect(within(flow).getAllByRole("paragraph")[0]).toHaveTextContent(
      "£802 a month is spare in September 2026, once tax, the expenses, the loans' payments and any fixed sums are met, and the savings take it in this order.",
    );
    expect(steps()).toStrictEqual([
      "1Workplace pension£3,983 / moMe · £1,150 salary sacrifice from Salary + £2,266 fixed sum + £567 tax relief£47,794 of the £60,000 allowance a year",
      "2Stocks & shares ISA£1,667 / moMe · fixed sum£20,000 of the £20,000 allowance a year",
      "3Current account£0 / mo",
    ]);
    expect(within(flow).getByText("Left over")).toHaveClass("label");
    expect(within(flow).getByText("£802 / mo")).toHaveClass("figure");
    expect(said()).toContain(
      "What no saving takes is left in the month, which the plan takes as spent.",
    );
  });

  // The ISA takes what its allowance leaves room for and the cash the
  // rest, so nothing is left over; a pension always funded says so.
  it("hands the spare money down the savings that take it, each up to its cap", () => {
    renderFlow({
      savings: [{ ...pension, isAlwaysFunded: true }, spareIsa, spareCash],
    });

    expect(steps()).toStrictEqual([
      "1Workplace pension£3,983 / moMe · £1,150 salary sacrifice from Salary + £2,266 fixed sum + £567 tax relief · always funded£47,794 of the £60,000 allowance a year",
      "2Stocks & shares ISA£1,667 / moMe · spare money£20,000 of the £20,000 allowance a year",
      "3Current account£802 / mospare money · no cap",
    ]);
    expect(screen.getByText("£0 / mo")).toHaveClass("figure");
  });

  // A pension capped below what the salary already feeds it takes none
  // of the spare money; a second ISA finds its owner's allowance used by
  // the first ISA's fixed sum; and premium bonds with no cap take all
  // there is, so none reaches the current account after them.
  it("says why a saving paid the spare money takes none of it", () => {
    renderFlow({
      savings: [
        { ...pension, contribution: { cap: 12000, kind: "spare" } },
        isa,
        { ...spareIsa, id: 9, name: "Cash ISA" },
        { ...spareCash, id: 10, name: "Premium bonds" },
        spareCash,
      ],
    });

    const [fed, , full, bonds, short] = steps();

    expect(fed).toContain(
      "Me · salary sacrifice from Salary · the salaries meet its cap",
    );
    expect(full).toContain(
      "Me · the allowance is used before the spare money reaches it",
    );
    expect(full).toContain(
      "£20,000 of the £20,000 allowance a year, shared with Stocks & shares ISA",
    );
    expect(bonds).toContain("spare money · no cap");
    expect(short).toContain("£0 / mothe spare money runs out before it");
  });

  // A cap below the allowance is said, since the bar says only the
  // allowance; the ISA takes a twelfth of it.
  it("says the most a saving takes where it is below its allowance", () => {
    renderFlow({
      savings: [
        pension,
        { ...isa, contribution: { cap: 6000, kind: "spare" } },
      ],
    });

    expect(steps()[1]).toBe(
      "2Stocks & shares ISA£500 / moMe · spare money · up to £6,000 a year£6,000 of the £20,000 allowance a year",
    );
  });

  // Two pensions of the one owner share their allowance, and each says
  // with which.
  it("draws an owner's allowance across every account of the kind they hold", () => {
    renderFlow({ savings: [pension, { ...sipp, owner: 1 }] });

    const [first, second] = steps();

    expect(first).toContain(
      "£47,794 of the £60,000 allowance a year, shared with SIPP",
    );
    expect(second).toContain(
      "£47,794 of the £60,000 allowance a year, shared with Workplace pension",
    );
  });

  // Spending past what the month earns leaves nothing spare, and the
  // month short by what the savings are drawn on for.
  it("says when nothing is spare, and what the month is short by", () => {
    renderFlow({
      schedule: {
        expenses: [{ ...household, amount: 20000 }],
        income: [salary],
      },
    });

    expect(screen.getAllByRole("paragraph")[0]).toHaveTextContent(
      "Nothing is spare in September 2026 once tax, the expenses, the loans' payments and any fixed sums are met.",
    );
    expect(screen.getByText("Short")).toHaveClass("label");
    expect(said()).toContain(
      "What the month is short by is drawn from the savings, cash first.",
    );
  });

  it("draws nothing for no savings, and no reorder for one", () => {
    const { container } = render(
      <MoneyFlow
        accounts={[home]}
        label="Sect. II.ii"
        onMove={vi.fn<(account: Account, target: Account) => void>()}
        owners={owners}
        plan={plan}
        savings={[]}
        schedule={salaried}
      />,
    );

    expect(container).toBeEmptyDOMElement();

    renderFlow({ savings: [isa] });

    expect(
      screen.queryByRole("button", { name: "Reorder" }),
    ).not.toBeInTheDocument();
  });

  // A delete made while reordering can leave one saving, which has no
  // order to set and so no Done to press: the arrows go with it rather
  // than standing held with no way to put them away.
  it("drops the arrows when the savings come down to one while reordering", () => {
    const view = render(
      <MoneyFlow
        accounts={[pension, isa]}
        label="Sect. II.ii"
        onMove={vi.fn<(account: Account, target: Account) => void>()}
        owners={owners}
        plan={plan}
        savings={[pension, isa]}
        schedule={salaried}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));

    expect(screen.getAllByRole("button", { name: /^Move / })).toHaveLength(4);

    view.rerender(
      <MoneyFlow
        accounts={[pension]}
        label="Sect. II.ii"
        onMove={vi.fn<(account: Account, target: Account) => void>()}
        owners={owners}
        plan={plan}
        savings={[pension]}
        schedule={salaried}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /^Move / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();
  });

  // Reorder shows the arrows, each end's outer arrow held, and a move
  // goes to the caller as the account and the one it moves onto.
  it("moves a saving onto the one beside it from its arrows", () => {
    const onMove = vi.fn<(account: Account, target: Account) => void>();
    renderFlow({ onMove });

    expect(
      screen.queryByRole("button", { name: /^Move / }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));

    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Move Workplace pension up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Current account down" }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Move Stocks & shares ISA up" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Move Stocks & shares ISA down" }),
    );

    expect(onMove.mock.calls).toStrictEqual([
      [isa, pension],
      [isa, cash],
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(
      screen.queryByRole("button", { name: /^Move / }),
    ).not.toBeInTheDocument();
  });

  // The step is drawn again in its new place, and the arrow pressed keeps
  // the focus there, or the other once the step reaches an end; the move
  // is said aloud with the place it lands in.
  it("keeps the focus on the arrow pressed as the step lands, and says where", () => {
    render(<Reordered initial={[pension, isa, cash]} />);
    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Move Workplace pension down" }),
    );

    expect(steps()[1]).toMatch(/^2Workplace pension/);
    expect(
      screen.getByRole("button", { name: "Move Workplace pension down" }),
    ).toHaveFocus();
    expect(said().at(-1)).toBe("Workplace pension moved to 2 of 3");
    expect(screen.getAllByRole("paragraph").at(-1)).toHaveAttribute(
      "aria-live",
      "polite",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Move Workplace pension down" }),
    );

    expect(steps()[2]).toMatch(/^3Workplace pension/);
    expect(
      screen.getByRole("button", { name: "Move Workplace pension up" }),
    ).toHaveFocus();

    fireEvent.click(
      screen.getByRole("button", { name: "Move Current account up" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Move Current account up" }),
    );

    expect(steps()[0]).toMatch(/^1Current account/);
    expect(
      screen.getByRole("button", { name: "Move Current account down" }),
    ).toHaveFocus();
  });
});
