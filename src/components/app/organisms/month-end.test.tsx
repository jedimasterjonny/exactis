import type { ComponentProps } from "react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

// The steps of the balances the month leaves, and what they come to.
function ledger(sheet: HTMLElement): (null | string)[] {
  return within(sheet)
    .getAllByRole("listitem")
    .map((step) => step.textContent);
}

// The month end over the fixture's accounts, their plan running from
// September 2026 on balances as of the end of August, on the fourth of
// October, when September is the last month that has ended, the salary
// feeding the pension, with whatever a test gives in their place; opened
// from its button. Save reports through the toast manager, which needs
// its Toaster mounted.
function openWorksheet(
  props: Partial<ComponentProps<typeof MonthEnd>> = {},
): HTMLElement {
  render(
    <MonthEnd
      accounts={accounts}
      isInScenario={false}
      month={{ month: 8, year: 2026 }}
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
  // September carried, the one month from the plan's first through the
  // month closed, the pension is expected at £397,603 with £4,350 paid
  // in, the salary's sacrifice with the NI saved, its own sum and the
  // relief on it; the ISA at £274,711; the current account where it
  // was; the home grown a month at 2.1%; and the mortgage £175,053 owed
  // once £2,180 is paid off it, which the number field writes with the
  // hyphen Intl gives it rather than the minus the ledger writes.
  it("opens on the last month that has ended, each balance at what the plan expected of it, in its group", () => {
    const sheet = openWorksheet();

    expect(within(sheet).getByText("Month end")).toHaveClass("text-brand");
    expect(
      within(sheet).getByRole("heading", {
        name: "Balances at the end of September 2026",
      }),
    ).toBeInTheDocument();
    expect(select("Month")).toHaveValue("8");
    expect(field("Year")).toHaveValue("2026");
    for (const name of ["Savings", "Property & vehicles", "Loans & debts"]) {
      expect(within(sheet).getByRole("group", { name })).toBeInTheDocument();
    }
    for (const [name, figure] of [
      ["Workplace pension", "£397,603"],
      ["Stocks & shares ISA", "£274,711"],
      ["Current account", "£16,900"],
      ["Home", "£398,201"],
      ["Mortgage", "-£175,053"],
    ] as const) {
      expect(field(name)).toHaveValue(figure);
    }
    expect(field("Workplace pension")).toHaveAccessibleDescription(
      "Was £391,640 · £4,350 paid in · not dated",
    );
    expect(field("Current account")).toHaveAccessibleDescription(
      "Was £16,900 · nothing paid in · not dated",
    );
    expect(field("Mortgage")).toHaveAccessibleDescription(
      "Was −£176,520 · £2,180 paid off · not dated",
    );
    expect(within(sheet).getByText("0 of 5 checked")).toBeInTheDocument();
    expect(ledger(sheet)).toStrictEqual([
      "As the balances stoodEnd of August 2026£901,462",
      "Paid in£0",
      "MovedMarkets, interest and the unexpected£0",
    ]);
  });

  it("says the day a balance was last set until it is checked", () => {
    openWorksheet({ accounts: [{ ...home, setOn: "2026-03-14" }] });

    expect(field("Home")).toHaveAccessibleDescription(
      "Was £397,512 · nothing paid in · set 14 Mar 2026 · 204 days old",
    );
  });

  // Checking the pension and the mortgage as they read: the pension
  // moved £1,613 besides what was paid in, and the mortgage was charged
  // £713 of interest, so the month leaves £908,892.
  it("checks a balance as it reads, and says what moved it", async () => {
    const sheet = openWorksheet();
    vi.mocked(closeBalances).mockResolvedValue(
      saved({ asOf: { month: 8, year: 2026 }, isRecorded: true }),
    );

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
      "Was £391,640 · £4,350 paid in · £1,613 moved",
    );
    expect(field("Mortgage")).toHaveAccessibleDescription(
      "Was −£176,520 · £2,180 paid off · −£713 moved",
    );
    expect(within(sheet).getByText("2 of 5 checked")).toBeInTheDocument();
    expect(ledger(sheet).slice(1)).toStrictEqual([
      "Paid in£6,530",
      "MovedMarkets, interest and the unexpected£900",
    ]);
    expect(
      within(sheet).getByText(
        "As the balances stand at the end of September 2026",
      ),
    ).toHaveClass("label");
    expect(within(sheet).getByText("£908,892")).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(closeBalances).toHaveBeenCalledExactlyOnceWith({
      asOf: { month: 8, year: 2026 },
      balances: [
        { balance: 397603, id: pension.id },
        { balance: -175053, id: 5 },
      ],
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /^Balances at the end of/ }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Balances updated" }),
    ).toHaveAccessibleDescription(
      "2 balances set as of the end of September 2026, its progress point recorded",
    );
  });

  // The ISA's statement says £275,000, which checks it; the mortgage's
  // says £175,000 owed, typed without its sign; and a press unchecks
  // the pension again, so it is not sent.
  it("checks a balance typed, takes a debt typed as what is owed, and sends only what is checked", () => {
    const sheet = openWorksheet();
    vi.mocked(closeBalances).mockResolvedValue(
      saved({ asOf: { month: 8, year: 2026 }, isRecorded: true }),
    );

    commit(field("Stocks & shares ISA"), "275,000");
    commit(field("Mortgage"), "175,000");
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Workplace pension" }),
    );
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Workplace pension" }),
    );

    expect(field("Stocks & shares ISA")).toHaveAccessibleDescription(
      "Was £271,930 · £1,667 paid in · £1,403 moved",
    );
    expect(field("Mortgage")).toHaveValue("-£175,000");
    expect(within(sheet).getByText("2 of 5 checked")).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(closeBalances).toHaveBeenCalledExactlyOnceWith({
      asOf: { month: 8, year: 2026 },
      balances: [
        { balance: 275000, id: isa.id },
        { balance: -175000, id: 5 },
      ],
    });
  });

  // Closing onto March, before the latest point kept, moves the balances
  // and records no point, so the toast says nothing of one.
  it("says nothing of a point where the month closed records none", async () => {
    const sheet = openWorksheet();
    vi.mocked(closeBalances).mockResolvedValue(
      saved({ asOf: { month: 2, year: 2026 }, isRecorded: false }),
    );

    fireEvent.change(select("Month"), { target: { value: "2" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("dialog", { name: "Balances updated" }),
    ).toHaveAccessibleDescription("0 balances set as of the end of March 2026");
  });

  // Closing onto August, the month the balances are already as of, runs
  // no months: each balance opens at what it holds, nothing paid.
  it("runs no months onto the month the balances are as of, or one before it", () => {
    const sheet = openWorksheet();

    fireEvent.change(select("Month"), { target: { value: "7" } });

    expect(
      within(sheet).getByRole("heading", {
        name: "Balances at the end of August 2026",
      }),
    ).toBeInTheDocument();
    expect(field("Workplace pension")).toHaveValue("£391,640");
    expect(field("Workplace pension")).toHaveAccessibleDescription(
      "Was £391,640 · nothing paid in · not dated",
    );

    commit(field("Year"), "2025");

    expect(field("Workplace pension")).toHaveValue("£391,640");
  });

  // A year typed past the one it is is held at it, so the worksheet runs
  // the plan no further than the month the store would take; and a
  // loan typed as owing nothing reads as nothing, not as minus nothing.
  it("holds the year to the months the store takes, and a debt cleared at nothing", () => {
    openWorksheet();

    commit(field("Year"), "20266");

    expect(field("Year")).toHaveValue("2026");

    commit(field("Year"), "1850");

    expect(field("Year")).toHaveValue("1992");

    commit(field("Mortgage"), "0");

    expect(field("Mortgage")).toHaveValue("£0");
  });

  it("keeps the worksheet open and says why when the store refuses", async () => {
    const sheet = openWorksheet();
    const { promise, resolve: answer } =
      Promise.withResolvers<Awaited<ReturnType<typeof closeBalances>>>();
    vi.mocked(closeBalances).mockReturnValue(promise);

    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(within(sheet).getByRole("button", { name: "Save" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    answer(refused("The balances are as of a month that has ended"));

    expect(
      await screen.findByRole("dialog", { name: "Balances not saved" }),
    ).toHaveAccessibleDescription(
      "The balances are as of a month that has ended",
    );
    expect(
      screen.getByRole("dialog", {
        name: "Balances at the end of September 2026",
      }),
    ).toBeInTheDocument();
  });

  it("holds the button while a scenario is open, saying why", () => {
    render(
      <MonthEnd
        accounts={accounts}
        isInScenario
        month={{ month: 8, year: 2026 }}
        plan={plan}
        schedule={{ expenses: [], income: [salary] }}
        today="2026-10-04"
      />,
    );

    const button = screen.getByRole("button", { name: "Update balances" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      "Leave the scenario to close the month",
    );
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on cancel, saving nothing", () => {
    const sheet = openWorksheet();

    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(closeBalances).not.toHaveBeenCalled();
  });
});
