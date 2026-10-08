import type { ComponentProps } from "react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Answer } from "@/lib/answer";

import {
  placeAccountsInOrder,
  removeAccount,
  saveAccount,
  saveCar,
  saveHouse,
} from "@/actions/accounts";
import { Toaster } from "@/components/kit/toast";
import { accounts } from "@/data/accounts.fixture";
import { golfPcp as finance, golf } from "@/data/cars.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { house, houseLoan as loan } from "@/data/houses.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { owners } from "@/data/owners.fixture";
import { saved as accepted, refused } from "@/lib/answer";
import { commit, openEntry } from "@/test/dom";

import { AccountLedger } from "./account-ledger";

vi.mock("@/actions/accounts", () => ({
  placeAccountsInOrder: vi.fn(),
  removeAccount: vi.fn(),
  saveAccount: vi.fn(),
  saveCar: vi.fn(),
  saveHouse: vi.fn(),
}));
vi.mock("@/actions/owners", () => ({
  removeOwner: vi.fn(),
  saveOwner: vi.fn(),
}));

const [pension, isa, cash, home, mortgage] = accounts;

// Asks to delete an account from the Delete in the dialog its row
// opens, which is where the sheet deletes from.
function askToDelete(name: string): void {
  fireEvent.click(
    within(openRow(name)).getByRole("button", { name: "Delete" }),
  );
}

// The section the month's money is drawn down the savings in.
function flow(): HTMLElement {
  return screen.getByRole("region", { name: "Where the month's money goes" });
}

// Opens an entry of the sheet from its row, a button named by the
// account, and hands back the dialog it opens, named by the account the
// dialog is open on.
function openRow(name: string, opens = name): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("dialog", { name: opens });
}

// The ledger on the fixture's accounts and owners, over the plan the
// income fixture carries, which starts in September 2026, with whatever
// a test gives in their place. Save reports through the toast manager,
// which needs its Toaster mounted.
function renderLedger(
  props: Partial<ComponentProps<typeof AccountLedger>> = {},
): void {
  render(
    <AccountLedger
      accounts={accounts}
      expenses={[]}
      lines={[]}
      owners={owners}
      plan={plan}
      {...props}
    />,
    { wrapper: Toaster },
  );
}

// The rows a group of the sheet lists, by the group's name.
function rowsOf(name: string): HTMLElement[] {
  return within(screen.getByRole("group", { name })).getAllByRole("listitem");
}

// The store's answer to a save: the account as it now has it. The ledger
// shows it only once the page re-reads, which is the router's work and
// not the ledger's, so the rows here stay as rendered. A test waits for
// the dialog to close before reading the sections, since the close is a
// transition that lands after the toast, and a modal dialog hides the
// sections from the accessibility tree while it is open.
function saved(account: Account): void {
  vi.mocked(saveAccount).mockResolvedValue(accepted(account));
}

// The balance sheet's section.
function sheet(): HTMLElement {
  return screen.getByRole("region", { name: "Balance sheet" });
}

describe("AccountLedger", () => {
  // Everything owned and owed is one balance sheet, a region named by
  // its title and opened with its own buttons, the rate the savings grow
  // at in its caption. The fixture's mortgage is secured on nothing, so
  // it is listed with the other debts rather than with the savings, and
  // the month's money is drawn down the savings in the order they are
  // paid in a section of its own beneath, then the owners.
  it("lays everything owned and owed out as one balance sheet, with the money's flow and the owners beneath", () => {
    renderLedger();

    expect(within(sheet()).getByText("Sect. III.i")).toHaveClass("label");
    expect(
      within(sheet()).getByText(
        "Savings grow at the plan rate, 5.00%, unless they say otherwise, under one allocation applied pro rata to every account.",
      ),
    ).toBeInTheDocument();
    expect(
      within(sheet())
        .getAllByRole("button", { name: /^Add / })
        .map((button) => button.textContent),
    ).toStrictEqual(["Add account", "Add house", "Add car", "Add debt"]);
    expect(rowsOf("Pensions · tax-deferred")).toHaveLength(1);
    expect(rowsOf("ISAs · tax-free")).toHaveLength(1);
    expect(rowsOf("Cash")).toHaveLength(1);
    expect(rowsOf("Property & vehicles")).toHaveLength(1);
    expect(rowsOf("Other debts")).toHaveLength(1);
    expect(
      within(screen.getByRole("group", { name: "Other debts" })).getByRole(
        "button",
        { name: "Mortgage" },
      ),
    ).toBeInTheDocument();
    expect(within(sheet()).getByText("£950,771")).toHaveClass("figure");
    expect(
      screen.queryByRole("button", { name: /^Move / }),
    ).not.toBeInTheDocument();
    expect(names()).toStrictEqual([
      "Workplace pension",
      "Stocks & shares ISA",
      "Current account",
    ]);
    expect(within(flow()).getByText("Sect. III.ii")).toHaveClass("label");
    expect(
      within(screen.getByRole("region", { name: "Owners" })).getByText(
        "Sect. III.iii",
      ),
    ).toHaveClass("label");
  });

  // No savings is no money to draw down them, so the owners take the
  // flow's place rather than leaving a numeral out; one saving is drawn,
  // with no order to set.
  it("puts the owners where the flow would be when there are no savings", () => {
    renderLedger({ accounts: [home] });

    expect(
      screen.queryByRole("region", { name: "Where the month's money goes" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Owners" })).getByText(
        "Sect. III.ii",
      ),
    ).toHaveClass("label");
  });

  it("draws the flow for one saving, with no order to set", () => {
    renderLedger({ accounts: [isa] });

    expect(names()).toStrictEqual(["Stocks & shares ISA"]);
    expect(
      within(flow()).queryByRole("button", { name: "Reorder" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Owners" })).getByText(
        "Sect. III.iii",
      ),
    ).toHaveClass("label");
  });

  // The sheet says when the mortgage's payments clear it from the line
  // paying it, which it is handed the expense lines for.
  it("hands the sheet the expense lines, to say when a loan clears", () => {
    renderLedger({
      accounts: [house, loan],
      expenses: [
        { ...expenseLines[0], lastMonth: 6, lastYear: 2047, pays: loan.id },
      ],
    });

    expect(rowsOf("Property & vehicles")[0]).toHaveTextContent(
      "at 5.15% · £2,210 / mo · to Jul 2047",
    );
  });

  // Add debt opens the account dialog on a new debt, which belongs to
  // nobody, as Add account opens it on a new pension belonging to the
  // first owner.
  it("opens a new debt from the other debts, and a new pension from Add account", () => {
    renderLedger();

    let dialog = openEntry("Add debt");

    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveValue(
      "debt",
    );
    expect(
      within(dialog).queryByRole("combobox", { name: "Owner" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    dialog = openEntry("Add account");

    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveValue(
      "tax-deferred",
    );
    expect(within(dialog).getByRole("combobox", { name: "Owner" })).toHaveValue(
      "1",
    );
  });

  it("adds a named account and reports it", async () => {
    renderLedger();

    const dialog = openEntry("Add account");

    expect(within(dialog).getByText("New account")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Untitled account" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(dialog).queryByRole("textbox", { name: "Rate" }),
    ).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: " Lifetime ISA " },
    });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Type" }), {
      target: { value: "tax-free" },
    });
    commit(within(dialog).getByRole("textbox", { name: "Balance" }), "4,000");
    expect(
      within(dialog).getByRole("combobox", { name: "Contribution" }),
    ).toHaveValue("fixed");
    commit(within(dialog).getByRole("textbox", { name: "Amount" }), "333");
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Cadence" }),
      { target: { value: "month" } },
    );
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Growth" }), {
      target: { value: "fixed" },
    });
    commit(within(dialog).getByRole("textbox", { name: "Rate" }), "3");

    expect(
      within(dialog).getByRole("heading", { name: "Lifetime ISA" }),
    ).toBeInTheDocument();

    // The store's answer is held back, so the save can be seen in flight.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<Account>>();
    vi.mocked(saveAccount).mockReturnValue(promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveAccount).toHaveBeenCalledExactlyOnceWith(null, {
      balance: 4000,
      balloon: 0,
      cadence: "month",
      cap: 0,
      contribution: 333,
      funding: "fixed",
      growth: "fixed",
      isAlwaysFunded: false,
      kind: "tax-free",
      name: "Lifetime ISA",
      owner: 1,
      rate: 0.03,
      shares: [],
    });
    expect(
      within(dialog).getByRole("button", { name: "Save" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("dialog", { name: "Lifetime ISA" })).toBeVisible();

    answer(
      accepted({
        balance: 4000,
        contribution: { amount: 333, cadence: "month", kind: "fixed" },
        growth: { kind: "fixed", rate: 0.03 },
        id: 6,
        kind: "tax-free",
        name: "Lifetime ISA",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Lifetime ISA" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Account added" }),
    ).toHaveAccessibleDescription("Lifetime ISA");
  });

  it("saves a real asset through the account dialog and reports it", async () => {
    renderLedger();
    saved({
      balance: 12500,
      growth: { kind: "plan" },
      id: 6,
      kind: "real-asset",
      name: "Car",
    });

    const dialog = openEntry("Add account");

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Car" },
    });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Type" }), {
      target: { value: "real-asset" },
    });

    expect(
      within(dialog).queryByRole("combobox", { name: "Contribution" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£0",
    );

    commit(within(dialog).getByRole("textbox", { name: "Balance" }), "12,500");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Car" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Account added" }),
    ).toHaveAccessibleDescription("Car");
    expect(saveAccount).toHaveBeenCalledExactlyOnceWith(null, {
      balance: 12500,
      balloon: 0,
      cadence: "year",
      cap: 0,
      contribution: 0,
      funding: "fixed",
      growth: "plan",
      isAlwaysFunded: false,
      kind: "real-asset",
      name: "Car",
      owner: null,
      rate: 0,
      shares: [],
    });
    expect(rowsOf("Property & vehicles")).toHaveLength(1);
  });

  // The house dialog opens from the sheet; what it saves is
  // its business, and the ledger's is to close it once it has.
  it("adds a house from the sheet and closes on the save", async () => {
    renderLedger();
    vi.mocked(saveHouse).mockResolvedValue(
      accepted({ ...home, id: 6, name: "Flat" }),
    );

    fireEvent.click(within(sheet()).getByRole("button", { name: "Add house" }));

    const dialog = screen.getByRole("dialog", { name: "Untitled house" });

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Flat" },
    });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Status" }), {
      target: { value: "outright" },
    });
    commit(within(dialog).getByRole("textbox", { name: "Value" }), "250,000");
    commit(
      within(dialog).getByRole("textbox", { name: "Bought for" }),
      "230,000",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Flat" }),
      ).not.toBeInTheDocument();
    });
    expect(saveHouse).toHaveBeenCalledOnce();
  });

  // The car dialog opens from the sheet too, and the ledger's
  // part is the same: to close it once it has saved.
  it("adds a car from the sheet and closes on the save", async () => {
    renderLedger();
    vi.mocked(saveCar).mockResolvedValue(accepted(golf));

    fireEvent.click(within(sheet()).getByRole("button", { name: "Add car" }));

    const dialog = screen.getByRole("dialog", { name: "Untitled car" });

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Golf" },
    });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
      { target: { value: "outright" } },
    );
    commit(within(dialog).getByRole("textbox", { name: "Value" }), "18,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Golf" }),
      ).not.toBeInTheDocument();
    });
    expect(saveCar).toHaveBeenCalledOnce();
  });

  it("drops a cancelled draft and leaves a cleared figure as it was", () => {
    renderLedger();

    let dialog = openEntry("Add account");

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Premium bonds" },
    });
    commit(within(dialog).getByRole("textbox", { name: "Balance" }), "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    dialog = openEntry("Add account");

    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Balance" }),
    ).toHaveValue("£0");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(rowsOf("Cash")).toHaveLength(1);
  });

  it("opens a real asset as it is, keeps its rate across the growth choice and writes the edit back", async () => {
    renderLedger();
    saved({ ...home, balance: 420000 });

    const dialog = openRow("Home");

    expect(within(dialog).getByText("Edit account")).toHaveClass("text-brand");
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Home",
    );
    expect(within(dialog).getByRole("combobox", { name: "Type" })).toHaveValue(
      "real-asset",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Balance" }),
    ).toHaveValue("£416,386");
    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£0",
    );
    expect(
      within(dialog).queryByRole("combobox", { name: "Contribution" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", { name: "Growth" }),
    ).toHaveValue("fixed");
    expect(within(dialog).getByRole("textbox", { name: "Rate" })).toHaveValue(
      "2.10%",
    );

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Growth" }), {
      target: { value: "plan" },
    });

    expect(
      within(dialog).queryByRole("textbox", { name: "Rate" }),
    ).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Growth" }), {
      target: { value: "fixed" },
    });

    expect(within(dialog).getByRole("textbox", { name: "Rate" })).toHaveValue(
      "2.10%",
    );

    commit(within(dialog).getByRole("textbox", { name: "Balance" }), "420,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Home" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Account updated" }),
    ).toHaveAccessibleDescription("Home");
    expect(saveAccount).toHaveBeenCalledExactlyOnceWith(4, {
      balance: 420000,
      balloon: 0,
      cadence: "year",
      cap: 0,
      contribution: 0,
      funding: "fixed",
      growth: "fixed",
      isAlwaysFunded: false,
      kind: "real-asset",
      name: "Home",
      owner: null,
      rate: 0.021,
      shares: [],
    });
  });

  it("opens a wrapper with its contribution and no rate, and writes a new contribution back", async () => {
    renderLedger();
    saved({
      ...pension,
      contribution: { amount: 30000, cadence: "year", kind: "fixed" },
    });

    const dialog = openRow("Workplace pension");

    expect(
      within(dialog).getByRole("combobox", { name: "Contribution" }),
    ).toHaveValue("fixed");
    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£27,195",
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Cadence" }),
    ).toHaveValue("year");
    expect(
      within(dialog).getByRole("combobox", { name: "Growth" }),
    ).toHaveValue("plan");
    expect(
      within(dialog).queryByRole("textbox", { name: "Rate" }),
    ).not.toBeInTheDocument();

    commit(within(dialog).getByRole("textbox", { name: "Amount" }), "30,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Workplace pension" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Account updated" }),
    ).toHaveAccessibleDescription("Workplace pension");
    expect(saveAccount).toHaveBeenCalledExactlyOnceWith(1, {
      balance: 412880,
      balloon: 0,
      cadence: "year",
      cap: 0,
      contribution: 30000,
      funding: "fixed",
      growth: "plan",
      isAlwaysFunded: false,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
      rate: 0,
      shares: [],
    });
  });

  it("pays a wrapper the spare money up to a cap, and drops the sum with the choice", async () => {
    renderLedger();
    saved({ ...isa, contribution: { cap: 4000, kind: "spare" } });

    const dialog = openRow("Stocks & shares ISA");

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Contribution" }),
      { target: { value: "spare" } },
    );

    expect(
      within(dialog).queryByRole("textbox", { name: "Amount" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("combobox", { name: "Cadence" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("textbox", { name: "Cap, a year" }),
    ).toHaveValue("£0");
    expect(
      within(dialog).getByRole("textbox", { name: "Cap, a year" }),
    ).toHaveAccessibleDescription(
      "Up to the £20,000 allowance, or nothing for all of it",
    );

    commit(
      within(dialog).getByRole("textbox", { name: "Cap, a year" }),
      "4,000",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Stocks & shares ISA" }),
      ).not.toBeInTheDocument();
    });
    expect(saveAccount).toHaveBeenCalledExactlyOnceWith(2, {
      balance: 286145,
      balloon: 0,
      cadence: "year",
      cap: 4000,
      contribution: 0,
      funding: "spare",
      growth: "plan",
      isAlwaysFunded: false,
      kind: "tax-free",
      name: "Stocks & shares ISA",
      owner: 1,
      rate: 0,
      shares: [],
    });
  });

  it("opens a spare-money account as it is and brings its sum back with the fixed choice", () => {
    renderLedger({
      accounts: [
        { ...cash, contribution: { cap: null, kind: "spare" } },
        {
          ...isa,
          contribution: { amount: 500, cadence: "month", kind: "fixed" },
        },
      ],
    });

    let dialog = openRow("Current account");

    expect(
      within(dialog).getByRole("combobox", { name: "Contribution" }),
    ).toHaveValue("spare");
    expect(
      within(dialog).getByRole("textbox", { name: "Cap, a year" }),
    ).toHaveAccessibleDescription("Leave at nothing for no cap");

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Contribution" }),
      { target: { value: "fixed" } },
    );

    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£0",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    dialog = openRow("Stocks & shares ISA");

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Contribution" }),
      { target: { value: "spare" } },
    );
    commit(
      within(dialog).getByRole("textbox", { name: "Cap, a year" }),
      "9,000",
    );
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Contribution" }),
      { target: { value: "fixed" } },
    );

    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£500",
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Cadence" }),
    ).toHaveValue("month");
  });

  // The choice leaves with the asset treatment: an ISA paid the spare
  // money made a debt is paid a fixed sum of nothing, as it opened, and
  // made cash again is paid the spare money to the cap it opened with,
  // which is what the choice mounts showing. A change that stays among
  // the wrappers and cash leaves what was typed where it is.
  it("drops the spare money with an asset treatment and brings it back with a wrapper's", () => {
    renderLedger({
      accounts: [{ ...isa, contribution: { cap: 4000, kind: "spare" } }],
    });
    saved(isa);

    const dialog = openRow("Stocks & shares ISA");
    const treatment = within(dialog).getByRole("combobox", { name: "Type" });

    expect(
      within(dialog).getByRole("textbox", { name: "Cap, a year" }),
    ).toHaveValue("£4,000");

    fireEvent.change(treatment, { target: { value: "debt" } });

    expect(
      within(dialog).queryByRole("combobox", { name: "Contribution" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£0",
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Cadence" }),
    ).toHaveValue("year");

    fireEvent.change(treatment, { target: { value: "real-asset" } });
    commit(within(dialog).getByRole("textbox", { name: "Amount" }), "100");
    fireEvent.change(treatment, { target: { value: "cash" } });

    expect(
      within(dialog).getByRole("combobox", { name: "Contribution" }),
    ).toHaveValue("spare");
    expect(
      within(dialog).getByRole("textbox", { name: "Cap, a year" }),
    ).toHaveValue("£4,000");

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Contribution" }),
      { target: { value: "fixed" } },
    );
    commit(within(dialog).getByRole("textbox", { name: "Amount" }), "250");
    fireEvent.change(treatment, { target: { value: "tax-free" } });

    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue(
      "£250",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveAccount).toHaveBeenCalledExactlyOnceWith(2, {
      balance: 286145,
      balloon: 0,
      cadence: "year",
      cap: 0,
      contribution: 250,
      funding: "fixed",
      growth: "plan",
      isAlwaysFunded: false,
      kind: "tax-free",
      name: "Stocks & shares ISA",
      owner: 1,
      rate: 0,
      shares: [],
    });
  });

  // The names down the money's flow, the savings alone since a debt is
  // paid before any of them, as the steps now stand.
  function names(): string[] {
    return within(flow())
      .getAllByRole("listitem")
      .map((step) => /^\d+(\D+?)£/.exec(step.textContent)?.[1] ?? "");
  }

  // Moving the ISA up puts it before the pension; the whole order goes
  // to the store, the home and the mortgage where they were, though the
  // flow lists neither, and the steps show it before the store answers.
  it("moves a saving up from its arrow, shows the order at once and sends it whole to the store", async () => {
    renderLedger();
    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<undefined>>();
    vi.mocked(placeAccountsInOrder).mockReturnValue(promise);

    expect(names()).toStrictEqual([
      "Workplace pension",
      "Stocks & shares ISA",
      "Current account",
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Move Stocks & shares ISA up" }),
    );

    await waitFor(() => {
      expect(names()).toStrictEqual([
        "Stocks & shares ISA",
        "Workplace pension",
        "Current account",
      ]);
    });
    expect(placeAccountsInOrder).toHaveBeenCalledExactlyOnceWith([
      2, 1, 3, 4, 5,
    ]);

    answer(accepted(undefined));

    await waitFor(() => {
      expect(names()).toStrictEqual([
        "Workplace pension",
        "Stocks & shares ISA",
        "Current account",
      ]);
    });
  });

  // Moving the ISA down puts it after the current account, since it was
  // above; the assets keep their places in the whole.
  it("moves a saving down after the one beneath it", async () => {
    renderLedger();
    vi.mocked(placeAccountsInOrder).mockResolvedValue(accepted(undefined));
    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Move Stocks & shares ISA down" }),
    );

    await waitFor(() => {
      expect(placeAccountsInOrder).toHaveBeenCalledExactlyOnceWith([
        1, 3, 2, 4, 5,
      ]);
    });
  });

  // Another save has added an account since the card was drawn, so the
  // store refuses an order that leaves it out; the card's own order
  // stands, and the toast says why. An order the store fails to take
  // outright is reported the same way, rather than thrown to the route.
  it.each([
    [
      "refuses",
      (): void => {
        vi.mocked(placeAccountsInOrder).mockResolvedValue(
          refused("Not every account was placed"),
        );
      },
    ],
    [
      "fails",
      (): void => {
        vi.mocked(placeAccountsInOrder).mockRejectedValue(
          new Error("Not every account was placed"),
        );
      },
    ],
  ] as const)(
    "says why when the store %s an order, and keeps the page's",
    async (_how, answer) => {
      renderLedger();
      answer();
      fireEvent.click(screen.getByRole("button", { name: "Reorder" }));

      fireEvent.click(
        screen.getByRole("button", { name: "Move Workplace pension down" }),
      );

      expect(
        await screen.findByRole("dialog", { name: "Order not saved" }),
      ).toHaveAccessibleDescription("Not every account was placed");
      // The toast lands inside the transition, and the page's order comes
      // back once it ends.
      await waitFor(() => {
        expect(names()).toStrictEqual([
          "Workplace pension",
          "Stocks & shares ISA",
          "Current account",
        ]);
      });
    },
  );

  // A house and the loan against it are one entry, drawn level with
  // each other and both opening the house dialog; the loan leaves the
  // savings for it, and is no more in the order than any other debt.
  it("puts a house and the loan against it in one entry, which opens both in the house dialog", () => {
    renderLedger({ accounts: [pension, house, loan] });

    expect(rowsOf("Pensions · tax-deferred")).toHaveLength(1);
    expect(rowsOf("Property & vehicles")).toHaveLength(1);
    expect(rowsOf("Property & vehicles")[0]).toHaveTextContent(
      "Mortgage−£182,940at 5.15%",
    );
    expect(
      screen.getByRole("group", { name: "Other debts" }),
    ).toHaveTextContent("None");
    expect(names()).toStrictEqual(["Workplace pension"]);

    fireEvent.click(
      within(openRow("Mortgage", "Home")).getByRole("button", {
        name: "Cancel",
      }),
    );

    const dialog = openRow("Home");

    expect(within(dialog).getByText("Edit house")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("textbox", { name: "Loan balance" }),
    ).toHaveValue("£182,940");
    expect(
      within(dialog).getByRole("textbox", { name: "Monthly payment" }),
    ).toHaveValue("£2,210");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // A car and the finance on it are one entry too, which opens both in
  // the car dialog.
  it("puts a car and the finance on it in one entry, which opens both in the car dialog", () => {
    renderLedger({ accounts: [pension, golf, finance] });

    fireEvent.click(
      within(openRow("Golf PCP", "Golf")).getByRole("button", {
        name: "Cancel",
      }),
    );

    const dialog = openRow("Golf");

    expect(within(dialog).getByText("Edit car")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
    ).toHaveValue("pcp");
    expect(
      within(dialog).getByRole("textbox", { name: "Balloon" }),
    ).toHaveValue("£6,000");
    expect(
      within(dialog).getByRole("textbox", { name: "Balance owed" }),
    ).toHaveValue("£14,000");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a house with no loan against it as owned outright", () => {
    renderLedger({ accounts: [house] });

    const dialog = openRow("Home");

    expect(within(dialog).getByText("Edit house")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("combobox", { name: "Status" }),
    ).toHaveValue("outright");
  });

  // A loan secured on an asset with no dialog of its own is edited as
  // the account it is too, since no dialog would write it back.
  it("edits a loan whose asset is not listed, or has no dialog, as the account it is", () => {
    renderLedger({
      accounts: [
        home,
        { ...mortgage, secures: 99 },
        { ...finance, secures: home.id },
      ],
    });

    let dialog = openRow("Mortgage");

    expect(within(dialog).getByText("Edit account")).toHaveClass("text-brand");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    dialog = openRow("Golf PCP");

    expect(within(dialog).getByText("Edit account")).toHaveClass("text-brand");
  });

  // A row's dialog asks first, holds the confirm while the store
  // answers, and closes on the answer; the row goes when the page
  // re-reads.
  it("asks before deleting an account, and deletes it on confirm", async () => {
    renderLedger();
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<undefined>>();
    vi.mocked(removeAccount).mockReturnValue(promise);

    askToDelete("Current account");

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete Current account?",
    });

    expect(dialog).toHaveAccessibleDescription(
      "Its £18,300 leaves the balance sheet, and it cannot be brought back.",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(removeAccount).toHaveBeenCalledExactlyOnceWith(cash.id);
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toHaveAttribute("aria-busy", "true");

    answer(accepted(undefined));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Account deleted" }),
    ).toHaveAccessibleDescription("Current account");
  });

  it("keeps the question open when the store refuses, and says why", async () => {
    renderLedger();
    vi.mocked(removeAccount).mockResolvedValue(refused("Still secured"));

    askToDelete("Current account");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Account not deleted" }),
      ).toHaveAccessibleDescription("Still secured");
    });
    expect(
      screen.getByRole("alertdialog", { name: "Delete Current account?" }),
    ).toBeVisible();
    // The toast lands before the transition ends, so the confirm frees
    // a beat after it.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    });
  });

  it("drops the question on cancel and deletes nothing", () => {
    renderLedger();

    askToDelete("Stocks & shares ISA");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeAccount).not.toHaveBeenCalled();
  });

  // A row folded to fit a phone has no bin, so the dialog it opens is
  // where it is deleted from: the Delete there closes the dialog and
  // asks as the bin would, and a cancel lands back on the screen.
  it("asks from an account's dialog before deleting it, the dialog closing first", async () => {
    renderLedger();
    vi.mocked(removeAccount).mockResolvedValue(accepted(undefined));

    const editor = openRow("Stocks & shares ISA");
    fireEvent.click(within(editor).getByRole("button", { name: "Delete" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const question = screen.getByRole("alertdialog", {
      name: "Delete Stocks & shares ISA?",
    });
    fireEvent.click(within(question).getByRole("button", { name: "Delete" }));

    expect(removeAccount).toHaveBeenCalledExactlyOnceWith(isa.id);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("asks from a house's dialog about the house, with its mortgage, and drops the question on cancel", () => {
    renderLedger({ accounts: [pension, house, loan] });

    fireEvent.click(
      within(openRow("Home")).getByRole("button", { name: "Delete" }),
    );

    const question = screen.getByRole("alertdialog", { name: "Delete Home?" });

    expect(question).toHaveAccessibleDescription(
      "Its mortgage, Mortgage, and the payments go with it.",
    );

    fireEvent.click(within(question).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(removeAccount).not.toHaveBeenCalled();
  });

  it("asks from a car's dialog about the car, with its finance", () => {
    renderLedger({ accounts: [golf, finance] });

    fireEvent.click(
      within(openRow("Golf")).getByRole("button", { name: "Delete" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Golf?" }),
    ).toHaveAccessibleDescription(
      "Its finance, Golf PCP, and the payments go with it.",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // The flow is handed the lines, so a fed pension's step says what
  // lands in it.
  it("draws what the salary sacrifices into the pension in the flow", () => {
    const [salary] = incomeLines;
    renderLedger({ lines: [salary] });

    expect(within(flow()).getAllByRole("listitem")[0]).toHaveTextContent(
      "£1,150 salary sacrifice from Salary",
    );
  });

  // The salary ends with 2048, so a plan starting in 2049 lands nothing
  // of it in the flow, though the link stands: the dialog still holds
  // the treatment and the share, since the store holds the link whether
  // or not it runs.
  it("counts a salary on the row only while it runs, and holds the link either way", () => {
    const [salary] = incomeLines;
    renderLedger({ lines: [salary], plan: { ...plan, from: 2049, month: 0 } });

    expect(
      within(flow()).queryByText(/salary sacrifice/),
    ).not.toBeInTheDocument();

    const dialog = openRow("Workplace pension");

    expect(
      within(dialog).getByRole("combobox", { name: "Type" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("textbox", { name: "Sacrificed from Salary" }),
    ).toHaveValue("10.00%");
  });

  it("holds the treatment of a pension a salary feeds", () => {
    const [salary] = incomeLines;
    renderLedger({ accounts: [pension, isa], lines: [salary] });

    let treatment = within(openRow("Workplace pension")).getByRole("combobox", {
      name: "Type",
    });

    expect(treatment).toBeDisabled();
    expect(treatment).toHaveAccessibleDescription(
      "Fed by Salary; set the pension to none on the salary to change it",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    treatment = within(openRow("Stocks & shares ISA")).getByRole("combobox", {
      name: "Type",
    });

    expect(treatment).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(
      within(screen.getByRole("dialog")).getByRole("combobox", {
        name: "Type",
      }),
    ).toBeEnabled();
  });

  // The pension takes the sacrifice of every salary feeding it, named
  // as a list, in the singular for one; an account nothing feeds says
  // nothing of it.
  it("says which salaries stop sacrificing into a pension", () => {
    const [salary, stepUp] = incomeLines;
    renderLedger({
      accounts: [pension, isa],
      lines: [salary, { ...stepUp, feeds: pension.id, sacrifice: 0.05 }],
    });

    askToDelete("Workplace pension");

    expect(
      screen.getByRole("alertdialog", { name: "Delete Workplace pension?" }),
    ).toHaveAccessibleDescription(
      "Salary and Salary step-up stop sacrificing into it, and pay those shares as salary instead.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    askToDelete("Stocks & shares ISA");

    expect(
      screen.getByRole("alertdialog", { name: "Delete Stocks & shares ISA?" }),
    ).toHaveAccessibleDescription(
      "Its £286,145 leaves the balance sheet, and it cannot be brought back.",
    );
  });

  it("says a house with no loan goes alone", () => {
    renderLedger({ accounts: [house] });

    askToDelete("Home");

    expect(
      screen.getByRole("alertdialog", { name: "Delete Home?" }),
    ).toHaveAccessibleDescription(
      "Its £416,386 leaves the balance sheet, and it cannot be brought back.",
    );
  });
});
