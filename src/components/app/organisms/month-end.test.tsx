import type { ComponentProps } from "react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Month } from "@/data/schedule";
import type { Answer } from "@/lib/answer";

import { closeBalances } from "@/actions/accounts";
import { Toaster } from "@/components/kit/toast";
import { accounts } from "@/data/accounts.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field, select } from "@/test/dom";

import { MonthEnd } from "./month-end";

vi.mock("@/actions/accounts", () => ({ closeBalances: vi.fn() }));

const [pension, isa, , home] = accounts;
const [salary] = incomeLines;

// The steps of the net worth the month leaves, and what they come to.
function ledger(sheet: HTMLElement): (null | string)[] {
  return within(sheet)
    .getAllByRole("listitem")
    .map((step) => step.textContent);
}

// The month end over the fixture's accounts, as of September 2026, on
// the fourth of October, the salary feeding the pension, with whatever
// a test gives in their place; opened from its button. Save reports
// through the toast manager, which needs its Toaster mounted.
function openWorksheet(
  props: Partial<ComponentProps<typeof MonthEnd>> = {},
): HTMLElement {
  render(
    <MonthEnd
      accounts={accounts}
      month={{ month: 9, year: 2026 }}
      plan={plan}
      schedule={{ expenses: [], income: [salary] }}
      today="2026-10-04"
      {...props}
    />,
    { wrapper: Toaster },
  );
  fireEvent.click(screen.getByRole("button", { name: "Update balances" }));
  return screen.getByRole("dialog");
}

describe("MonthEnd", () => {
  // A month on from September, the pension is expected at £418,561
  // with £3,983 paid in, the salary's sacrifice with the NI saved, its
  // own sum and the relief on it; the ISA at £288,984; the current
  // account where it was; the home grown a month at 2.1%; and the
  // mortgage £181,515 owed once £2,210 is paid off it, which the number
  // field writes with the hyphen Intl gives it rather than the minus the
  // ledger writes.
  it("opens on the month it is, each balance at what the plan expected of it, in its group", () => {
    const sheet = openWorksheet();

    expect(within(sheet).getByText("Month end")).toHaveClass("text-brand");
    expect(
      within(sheet).getByRole("heading", { name: "Balances for October 2026" }),
    ).toBeInTheDocument();
    expect(select("Month")).toHaveValue("9");
    expect(field("Year")).toHaveValue("2026");
    for (const name of ["Savings", "Property & vehicles", "Loans & debts"]) {
      expect(within(sheet).getByRole("group", { name })).toBeInTheDocument();
    }
    for (const [name, figure] of [
      ["Workplace pension", "£418,561"],
      ["Stocks & shares ISA", "£288,984"],
      ["Current account", "£18,300"],
      ["Home", "£417,108"],
      ["Mortgage", "-£181,515"],
    ] as const) {
      expect(field(name)).toHaveValue(figure);
    }
    expect(field("Workplace pension")).toHaveAccessibleDescription(
      "Was £412,880 · £3,983 paid in · not dated",
    );
    expect(field("Current account")).toHaveAccessibleDescription(
      "Was £18,300 · nothing paid in · not dated",
    );
    expect(field("Mortgage")).toHaveAccessibleDescription(
      "Was −£182,940 · £2,210 paid off · not dated",
    );
    expect(within(sheet).getByText("0 of 5 checked")).toBeInTheDocument();
    expect(ledger(sheet)).toStrictEqual([
      "As the balances stoodThe starting net worth as of September 2026£950,771",
      "Paid inWhat the plan paid into the balances checked, or off them£0",
      "MovedMarkets, interest, and whatever the plan did not expect£0",
    ]);
  });

  it("says the day a balance was last set until it is checked", () => {
    openWorksheet({ accounts: [{ ...home, setOn: "2026-03-14" }] });

    expect(field("Home")).toHaveAccessibleDescription(
      "Was £416,386 · nothing paid in · set 14 Mar 2026 · 204 days old",
    );
  });

  // Checking the pension and the mortgage as they read: the pension
  // moved £1,698 besides what was paid in, and the mortgage was charged
  // £785 of interest, so the month leaves £957,877.
  it("checks a balance as it reads, and says what moved it", async () => {
    const sheet = openWorksheet();
    vi.mocked(closeBalances).mockResolvedValue(saved({ month: 9, year: 2026 }));

    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Workplace pension" }),
    );
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Mortgage" }),
    );

    expect(
      within(sheet).getByRole("button", { name: "Check Workplace pension" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(field("Workplace pension")).toHaveAccessibleDescription(
      "Was £412,880 · £3,983 paid in · £1,698 moved",
    );
    expect(field("Mortgage")).toHaveAccessibleDescription(
      "Was −£182,940 · £2,210 paid off · −£785 moved",
    );
    expect(within(sheet).getByText("2 of 5 checked")).toBeInTheDocument();
    expect(ledger(sheet).slice(1)).toStrictEqual([
      "Paid inWhat the plan paid into the balances checked, or off them£6,193",
      "MovedMarkets, interest, and whatever the plan did not expect£913",
    ]);
    expect(
      within(sheet).getByText("Starting net worth for October 2026"),
    ).toHaveClass("label");
    expect(within(sheet).getByText("£957,877")).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(closeBalances).toHaveBeenCalledExactlyOnceWith({
      asOf: { month: 9, year: 2026 },
      balances: [
        { balance: 418561, id: pension.id },
        { balance: -181515, id: 5 },
      ],
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /^Balances for/ }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Balances updated" }),
    ).toHaveAccessibleDescription("2 balances set as of October 2026");
  });

  // The ISA's statement says £290,000, which checks it; the mortgage's
  // says £181,000 owed, typed without its sign; and a press unchecks
  // the pension again, so it is not sent.
  it("checks a balance typed, takes a debt typed as what is owed, and sends only what is checked", () => {
    const sheet = openWorksheet();
    vi.mocked(closeBalances).mockResolvedValue(saved({ month: 9, year: 2026 }));

    commit(field("Stocks & shares ISA"), "290,000");
    commit(field("Mortgage"), "181,000");
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Workplace pension" }),
    );
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Workplace pension" }),
    );

    expect(field("Stocks & shares ISA")).toHaveAccessibleDescription(
      "Was £286,145 · £1,667 paid in · £2,188 moved",
    );
    expect(field("Mortgage")).toHaveValue("-£181,000");
    expect(within(sheet).getByText("2 of 5 checked")).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(closeBalances).toHaveBeenCalledExactlyOnceWith({
      asOf: { month: 9, year: 2026 },
      balances: [
        { balance: 290000, id: isa.id },
        { balance: -181000, id: 5 },
      ],
    });
  });

  // Closing onto September, the month the balances are already as of,
  // runs no months: each balance opens at what it holds, nothing paid.
  it("runs no months onto the month the balances are as of, or one before it", () => {
    const sheet = openWorksheet();

    fireEvent.change(select("Month"), { target: { value: "8" } });

    expect(
      within(sheet).getByRole("heading", {
        name: "Balances for September 2026",
      }),
    ).toBeInTheDocument();
    expect(field("Workplace pension")).toHaveValue("£412,880");
    expect(field("Workplace pension")).toHaveAccessibleDescription(
      "Was £412,880 · nothing paid in · not dated",
    );

    commit(field("Year"), "2025");

    expect(field("Workplace pension")).toHaveValue("£412,880");
  });

  // A year typed past the one it is is held at it, so the worksheet runs
  // the plan no further than the month the store would take; and a
  // loan typed as owing nothing reads as nothing, not as minus nothing.
  it("holds the year to the months the store takes, and a debt cleared at nothing", () => {
    openWorksheet();

    commit(field("Year"), "20266");

    expect(field("Year")).toHaveValue("2026");

    commit(field("Year"), "1850");

    expect(field("Year")).toHaveValue("1990");

    commit(field("Mortgage"), "0");

    expect(field("Mortgage")).toHaveValue("£0");
  });

  it("keeps the worksheet open and says why when the store refuses", async () => {
    const sheet = openWorksheet();
    const { promise, resolve: answer } = Promise.withResolvers<Answer<Month>>();
    vi.mocked(closeBalances).mockReturnValue(promise);

    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(within(sheet).getByRole("button", { name: "Save" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    answer(refused("The balances are as of a month that has begun"));

    expect(
      await screen.findByRole("dialog", { name: "Balances not saved" }),
    ).toHaveAccessibleDescription(
      "The balances are as of a month that has begun",
    );
    expect(
      screen.getByRole("dialog", { name: "Balances for October 2026" }),
    ).toBeInTheDocument();
  });

  it("closes on cancel, saving nothing", () => {
    const sheet = openWorksheet();

    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(closeBalances).not.toHaveBeenCalled();
  });
});
