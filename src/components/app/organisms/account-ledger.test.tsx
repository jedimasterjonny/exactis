import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Month } from "@/data/schedule";

import {
  placeAccountsInOrder,
  removeAccount,
  saveAccount,
  saveCar,
  saveHouse,
} from "@/actions/accounts";
import { Toaster } from "@/components/kit/toast";
import { isAsset } from "@/data/accounts";
import { accounts } from "@/data/accounts.fixture";
import { incomeLines } from "@/data/income.fixture";

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

// The month the fixture's plan is read in, September 2026, in which the
// salary runs.
const at: Month = { month: 8, year: 2026 };

const held = accounts.filter((account) => !isAsset(account));
const assets = accounts.filter(isAsset);
const [pension, isa, cash, home, mortgage] = accounts;

// The fixture's home as a house, with its mortgage secured on it.
const house: Account = { ...home, kind: "house" };

const loan: Account = { ...mortgage, secures: home.id };

// A Golf as a car, with the finance secured on it.
const golf: Account = {
  balance: 18000,
  growth: { kind: "fixed", rate: -0.15 },
  id: 6,
  kind: "car",
  name: "Golf",
};

const finance: Account = {
  balance: -14000,
  balloon: 6000,
  contribution: { amount: 290, cadence: "month", kind: "fixed" },
  growth: { kind: "fixed", rate: 0.079 },
  id: 7,
  kind: "debt",
  name: "Golf PCP",
  secures: golf.id,
};

const bySlot =
  (slot: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.getAttribute("data-slot") === slot;

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function openEditor(name: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
  return screen.getByRole("dialog", { name });
}

function openEntry(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Add account" }));
  return screen.getByRole("dialog");
}

// Save reports through the toast manager, which needs its Toaster mounted.
function renderLedger(): void {
  render(
    <Toaster>
      <AccountLedger accounts={accounts} at={at} lines={[]} owners={[]} />
    </Toaster>,
  );
}

// The rows a section lists: its body's, less the header above them and
// the totals beneath them when it has any.
function rowsOf(panel: HTMLElement): HTMLElement[] {
  const [, body] = within(panel).getAllByRole("rowgroup");
  return body === undefined ? [] : within(body).getAllByRole("row");
}

// The store's answer to a save: the account as it now has it. The ledger
// shows it only once the page re-reads, which is the router's work and
// not the ledger's, so the rows here stay as rendered. A test waits for
// the dialog to close before reading the sections, since the close is a
// transition that lands after the toast, and a modal dialog hides the
// sections from the accessibility tree while it is open.
function saved(account: Account): void {
  vi.mocked(saveAccount).mockResolvedValue(account);
}

describe("AccountLedger", () => {
  it("opens with the header and the month it starts from, and no actions of its own", () => {
    renderLedger();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("Sect. II · Accounts & assets")).toHaveClass(
      "label",
    );
    expect(
      screen.getByText("Starting balances for the plan · September 2026"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).queryByRole("button"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Every section is read at once, each a region named by its title and
  // opened with its own buttons, and each followed by its notes. The
  // fixture's mortgage is secured on nothing, so it is listed with the
  // other debts rather than with the savings, and the order the accounts
  // are paid in is a section of its own beneath them all.
  it("lays the savings, the assets and the other debts out as sections, each with its notes, and the order beneath", () => {
    renderLedger();

    const savingsSection = screen.getByRole("region", {
      name: "Savings and investments",
    });
    const assetsSection = screen.getByRole("region", {
      name: "Property and vehicles",
    });
    const debtsSection = screen.getByRole("region", { name: "Other debts" });

    expect(within(savingsSection).getByText("Sect. II.i")).toHaveClass("label");
    expect(within(assetsSection).getByText("Sect. II.ii")).toHaveClass("label");
    expect(within(debtsSection).getByText("Sect. II.iii")).toHaveClass("label");
    expect(rowsOf(savingsSection)).toHaveLength(held.length - 1);
    expect(rowsOf(assetsSection)).toHaveLength(assets.length);
    expect(rowsOf(debtsSection)).toHaveLength(1);
    expect(
      within(debtsSection).getByRole("row", { name: /Mortgage/ }),
    ).toBeInTheDocument();
    expect(
      within(debtsSection).queryByRole("button", { name: /^Add / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Move / }),
    ).not.toBeInTheDocument();
    expect(
      within(savingsSection).getByRole("button", { name: "Add account" }),
    ).toBeInTheDocument();
    expect(
      within(assetsSection).getByRole("button", { name: "Add house" }),
    ).toBeInTheDocument();
    expect(
      within(assetsSection).getByRole("button", { name: "Add car" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("paragraph").map((note) => note.textContent),
    ).toStrictEqual([
      "Allocation is set once at plan level and applied pro rata to every account.",
    ]);
    expect(
      within(screen.getByRole("region", { name: "Order of payment" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toStrictEqual([
      "1Workplace pension",
      "2Stocks & shares ISA",
      "3Current account",
      "4Mortgage",
    ]);
    expect(
      within(
        screen.getByRole("region", { name: "Order of payment" }),
      ).getByText("Sect. II.iv"),
    ).toHaveClass("label");
    expect(
      within(screen.getByRole("region", { name: "Owners" })).getByText(
        "Sect. II.v",
      ),
    ).toHaveClass("label");
  });

  // An order of fewer than two accounts is no order and draws nothing,
  // so the owners take its place rather than leaving a numeral out.
  it("puts the owners where the order would be when there is no order", () => {
    render(
      <Toaster>
        <AccountLedger
          accounts={[isa]}
          at={at}
          lines={[]}
          owners={[{ id: 1, name: "Me" }]}
        />
      </Toaster>,
    );

    const owners = screen.getByRole("region", { name: "Owners" });

    expect(
      screen.queryByRole("region", { name: "Order of payment" }),
    ).not.toBeInTheDocument();
    expect(within(owners).getByText("Sect. II.iii")).toHaveClass("label");
    expect(within(owners).getByRole("row", { name: /Me/ })).toBeInTheDocument();
  });

  // The fixture's balances come to £950,771, its mortgage taking away,
  // £717,325 of it in its three savings; its home, owned outright, is
  // all equity; and it pays in £6,143 a month between the pension's
  // £27,195 and the ISA's £20,000 a year and the mortgage's £2,210 a
  // month. The tiles are the first four cards on the screen, the net
  // worth the one that matters most.
  it("opens on the starting net worth, the savings, the equity and what is paid in a month", () => {
    renderLedger();

    const [worth, savings, equity, paidIn] = screen.getAllByText(
      bySlot("card"),
    );

    expect(worth).toHaveAttribute("data-tone", "inverse");
    expect(worth).toHaveTextContent(
      "Starting net worth£950,771The balances the plan starts from",
    );
    expect(savings).toHaveTextContent("Savings£717,3253 accounts");
    expect(equity).toHaveTextContent("Equity£416,386£416,386 owned · £0 owed");
    expect(paidIn).toHaveTextContent(
      "Paid in£6,143/ moSacrifice and fixed payments",
    );
  });

  // A salary running in the plan's month pays in what it sacrifices, and
  // a loan on a house owes against it, so the equity is what is left.
  it("counts the sacrifice in what is paid in, and the loan against the equity", () => {
    const [salary] = incomeLines;
    render(
      <Toaster>
        <AccountLedger
          accounts={[pension, house, loan]}
          at={at}
          lines={[salary]}
          owners={[]}
        />
      </Toaster>,
    );

    const [worth, , equity, paidIn] = screen.getAllByText(bySlot("card"));

    expect(worth).toHaveTextContent("£646,326");
    expect(equity).toHaveTextContent(
      "Equity£233,446£416,386 owned · £182,940 owed",
    );
    expect(paidIn).toHaveTextContent("£5,626");
  });

  it("adds a named account and reports it", async () => {
    renderLedger();

    const dialog = openEntry();

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
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Treatment" }),
      { target: { value: "tax-free" } },
    );
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
    let answer!: (account: Account) => void;
    vi.mocked(saveAccount).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveAccount).toHaveBeenCalledExactlyOnceWith(null, {
      balance: 4000,
      balloon: 0,
      cadence: "month",
      cap: 0,
      contribution: 333,
      funding: "fixed",
      growth: "fixed",
      kind: "tax-free",
      name: "Lifetime ISA",
      rate: 0.03,
      shares: [],
    });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("dialog", { name: "Lifetime ISA" })).toBeVisible();

    answer({
      balance: 4000,
      contribution: { amount: 333, cadence: "month", kind: "fixed" },
      growth: { kind: "fixed", rate: 0.03 },
      id: 6,
      kind: "tax-free",
      name: "Lifetime ISA",
    });

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

    const dialog = openEntry();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Car" },
    });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Treatment" }),
      { target: { value: "real-asset" } },
    );

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
      kind: "real-asset",
      name: "Car",
      rate: 0,
      shares: [],
    });
    expect(
      rowsOf(screen.getByRole("region", { name: "Property and vehicles" })),
    ).toHaveLength(assets.length);
  });

  // The house dialog opens from the property section; what it saves is
  // its business, and the ledger's is to close it once it has.
  it("adds a house from the property section and closes on the save", async () => {
    renderLedger();
    vi.mocked(saveHouse).mockResolvedValue({ ...home, id: 6, name: "Flat" });

    fireEvent.click(
      within(
        screen.getByRole("region", { name: "Property and vehicles" }),
      ).getByRole("button", { name: "Add house" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Untitled house" });

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Flat" },
    });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Status" }), {
      target: { value: "outright" },
    });
    commit(within(dialog).getByRole("textbox", { name: "Value" }), "250,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Flat" }),
      ).not.toBeInTheDocument();
    });
    expect(saveHouse).toHaveBeenCalledOnce();
  });

  // The car dialog opens from the property section too, and the ledger's
  // part is the same: to close it once it has saved.
  it("adds a car from the property section and closes on the save", async () => {
    renderLedger();
    vi.mocked(saveCar).mockResolvedValue(golf);

    fireEvent.click(
      within(
        screen.getByRole("region", { name: "Property and vehicles" }),
      ).getByRole("button", { name: "Add car" }),
    );

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

    let dialog = openEntry();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Premium bonds" },
    });
    commit(within(dialog).getByRole("textbox", { name: "Balance" }), "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    dialog = openEntry();

    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Balance" }),
    ).toHaveValue("£0");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(
      rowsOf(screen.getByRole("region", { name: "Savings and investments" })),
    ).toHaveLength(held.length - 1);
  });

  it("opens a real asset as it is, keeps its rate across the growth choice and writes the edit back", async () => {
    renderLedger();
    saved({ ...home, balance: 420000 });

    const dialog = openEditor("Home");

    expect(within(dialog).getByText("Edit account")).toHaveClass("text-brand");
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Home",
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Treatment" }),
    ).toHaveValue("real-asset");
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
      kind: "real-asset",
      name: "Home",
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

    const dialog = openEditor("Workplace pension");

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
      kind: "tax-deferred",
      name: "Workplace pension",
      rate: 0,
      shares: [],
    });
  });

  it("pays a wrapper the spare money up to a cap, and drops the sum with the choice", async () => {
    renderLedger();
    saved({ ...isa, contribution: { cap: 4000, kind: "spare" } });

    const dialog = openEditor("Stocks & shares ISA");

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
      kind: "tax-free",
      name: "Stocks & shares ISA",
      rate: 0,
      shares: [],
    });
  });

  it("opens a spare-money account as it is and brings its sum back with the fixed choice", () => {
    render(
      <Toaster>
        <AccountLedger
          accounts={[
            { ...cash, contribution: { cap: null, kind: "spare" } },
            {
              ...isa,
              contribution: { amount: 500, cadence: "month", kind: "fixed" },
            },
          ]}
          at={at}
          lines={[]}
          owners={[]}
        />
      </Toaster>,
    );

    let dialog = openEditor("Current account");

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

    dialog = openEditor("Stocks & shares ISA");

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
    render(
      <Toaster>
        <AccountLedger
          accounts={[{ ...isa, contribution: { cap: 4000, kind: "spare" } }]}
          at={at}
          lines={[]}
          owners={[]}
        />
      </Toaster>,
    );
    saved(isa);

    const dialog = openEditor("Stocks & shares ISA");
    const treatment = within(dialog).getByRole("combobox", {
      name: "Treatment",
    });

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
      kind: "tax-free",
      name: "Stocks & shares ISA",
      rate: 0,
      shares: [],
    });
  });

  // The names down the reorder dialog, the mortgage last among them
  // since a loan is paid as the accounts are, as the rows now stand: each
  // row's grip is named for its account.
  function names(): string[] {
    return screen
      .getAllByRole("button", { name: /^Move / })
      .map((grip) => grip.getAttribute("aria-label")?.slice(5) ?? "");
  }

  // Moving the ISA onto the pension puts it before the pension, since it
  // was below; the whole order goes to the store, the home and the
  // mortgage where they were, and the rows show it before the store
  // answers.
  it("moves a row onto another from the keyboard, shows the order at once and sends it whole to the store", async () => {
    renderLedger();
    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));
    let answer!: () => void;
    vi.mocked(placeAccountsInOrder).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    expect(names()).toStrictEqual([
      "Workplace pension",
      "Stocks & shares ISA",
      "Current account",
      "Mortgage",
    ]);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Move Stocks & shares ISA" }),
      { key: "ArrowUp" },
    );

    await waitFor(() => {
      expect(names()).toStrictEqual([
        "Stocks & shares ISA",
        "Workplace pension",
        "Current account",
        "Mortgage",
      ]);
    });
    expect(placeAccountsInOrder).toHaveBeenCalledExactlyOnceWith([
      2, 1, 3, 4, 5,
    ]);

    answer();

    await waitFor(() => {
      expect(names()).toStrictEqual([
        "Workplace pension",
        "Stocks & shares ISA",
        "Current account",
        "Mortgage",
      ]);
    });
  });

  // Dropping the pension on the current account puts it after, since it
  // was above; the assets keep their places in the whole.
  it("moves a row dropped on another after it when it came from above", async () => {
    renderLedger();
    vi.mocked(placeAccountsInOrder).mockResolvedValue();
    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));

    const cashRow = screen.getByRole("row", { name: /Current account/ });

    fireEvent.dragStart(
      screen.getByRole("button", { name: "Move Workplace pension" }),
      { dataTransfer: { setData: vi.fn() } },
    );
    fireEvent.dragOver(cashRow);
    fireEvent.drop(cashRow);

    await waitFor(() => {
      expect(placeAccountsInOrder).toHaveBeenCalledExactlyOnceWith([
        2, 3, 1, 4, 5,
      ]);
    });
  });

  // A house and the loan against it share a row, which opens both in the
  // house dialog; the loan leaves the accounts' section for it, and stays
  // in the order, since its payments are met in it as any other's are.
  it("puts a house and the loan against it on one row, which opens both in the house dialog", () => {
    render(
      <Toaster>
        <AccountLedger
          accounts={[pension, house, loan]}
          at={at}
          lines={[]}
          owners={[]}
        />
      </Toaster>,
    );

    const savingsSection = screen.getByRole("region", {
      name: "Savings and investments",
    });
    const assetsSection = screen.getByRole("region", {
      name: "Property and vehicles",
    });

    expect(rowsOf(savingsSection)).toHaveLength(1);
    expect(
      within(savingsSection).queryByText("Mortgage"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Other debts" }),
    ).not.toBeInTheDocument();
    expect(
      within(assetsSection).getByRole("row", { name: /Home/ }),
    ).toHaveTextContent("Mortgage at 5.15%");
    expect(
      screen.queryByRole("button", { name: "Edit Mortgage" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Order of payment" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toStrictEqual(["1Workplace pension", "2Mortgage"]);
    expect(screen.getByText("Sect. II.iii")).toHaveClass("label");

    const dialog = openEditor("Home");

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

  // A car and the finance on it share a row too, which opens both in the
  // car dialog.
  it("puts a car and the finance on it on one row, which opens both in the car dialog", () => {
    render(
      <Toaster>
        <AccountLedger
          accounts={[pension, golf, finance]}
          at={at}
          lines={[]}
          owners={[]}
        />
      </Toaster>,
    );

    expect(
      screen.queryByRole("button", { name: "Edit Golf PCP" }),
    ).not.toBeInTheDocument();

    const dialog = openEditor("Golf");

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
    render(
      <Toaster>
        <AccountLedger accounts={[house]} at={at} lines={[]} owners={[]} />
      </Toaster>,
    );

    const dialog = openEditor("Home");

    expect(within(dialog).getByText("Edit house")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("combobox", { name: "Status" }),
    ).toHaveValue("outright");
  });

  // A loan secured on an asset with no dialog of its own is edited as
  // the account it is too, since no dialog would write it back.
  it("edits a loan whose asset is not listed, or has no dialog, as the account it is", () => {
    render(
      <Toaster>
        <AccountLedger
          accounts={[
            home,
            { ...mortgage, secures: 99 },
            { ...finance, secures: home.id },
          ]}
          at={at}
          lines={[]}
          owners={[]}
        />
      </Toaster>,
    );

    let dialog = openEditor("Mortgage");

    expect(within(dialog).getByText("Edit account")).toHaveClass("text-brand");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    dialog = openEditor("Golf PCP");

    expect(within(dialog).getByText("Edit account")).toHaveClass("text-brand");
  });

  // A row's bin asks first, holds the confirm while the store answers,
  // and closes on the answer; the row goes when the page re-reads.
  it("asks before deleting an account, and deletes it on confirm", async () => {
    renderLedger();
    let answer!: () => void;
    vi.mocked(removeAccount).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Current account" }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete Current account?",
    });

    expect(dialog).toHaveAccessibleDescription("It cannot be brought back.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(removeAccount).toHaveBeenCalledExactlyOnceWith(cash.id);
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeDisabled();

    answer();

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Account deleted" }),
    ).toHaveAccessibleDescription("Current account");
  });

  it("keeps the question open when the store refuses, and says why", async () => {
    renderLedger();
    vi.mocked(removeAccount).mockRejectedValue(new Error("Still secured"));

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Current account" }),
    );
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

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Stocks & shares ISA" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeAccount).not.toHaveBeenCalled();
  });

  it("says a house takes its mortgage and the payments", () => {
    render(
      <Toaster>
        <AccountLedger
          accounts={[pension, house, loan]}
          at={at}
          lines={[]}
          owners={[]}
        />
      </Toaster>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Home" }));

    expect(
      screen.getByRole("alertdialog", { name: "Delete Home?" }),
    ).toHaveAccessibleDescription(
      "Its mortgage, Mortgage, and the payments go with it.",
    );
  });

  it("says a car takes its finance and the payments", () => {
    render(
      <Toaster>
        <AccountLedger
          accounts={[golf, finance]}
          at={at}
          lines={[]}
          owners={[]}
        />
      </Toaster>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Golf" }));

    expect(
      screen.getByRole("alertdialog", { name: "Delete Golf?" }),
    ).toHaveAccessibleDescription(
      "Its finance, Golf PCP, and the payments go with it.",
    );
  });

  // A pension a salary feeds opens with its treatment held and the
  // reason beneath it; an account nothing feeds opens free, as does a
  // new one.
  // The accounts' table is handed the lines, so a fed pension's row
  // says what lands in it; the assets' is not, since nothing feeds an
  // asset.
  it("writes what the salary sacrifices into the pension on its row", () => {
    const [salary] = incomeLines;
    render(
      <Toaster>
        <AccountLedger
          accounts={accounts}
          at={at}
          lines={[salary]}
          owners={[]}
        />
      </Toaster>,
    );

    expect(
      screen.getByText("+ £1,150 / mo sacrificed from Salary"),
    ).toHaveClass("text-muted-foreground");
  });

  // The salary ends with 2048, so in 2049 it lands nothing on the row,
  // though the link stands: the dialog still holds the treatment and
  // the share, since the store holds the link whether or not it runs.
  it("counts a salary on the row only while it runs, and holds the link either way", () => {
    const [salary] = incomeLines;
    render(
      <Toaster>
        <AccountLedger
          accounts={accounts}
          at={{ month: 0, year: 2049 }}
          lines={[salary]}
          owners={[]}
        />
      </Toaster>,
    );

    expect(screen.queryByText(/sacrificed from/)).not.toBeInTheDocument();

    const dialog = openEditor("Workplace pension");

    expect(
      within(dialog).getByRole("combobox", { name: "Treatment" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("textbox", { name: "Sacrificed from Salary" }),
    ).toHaveValue("10.00%");
  });

  it("holds the treatment of a pension a salary feeds", () => {
    const [salary] = incomeLines;
    render(
      <Toaster>
        <AccountLedger
          accounts={[pension, isa]}
          at={at}
          lines={[salary]}
          owners={[]}
        />
      </Toaster>,
    );

    let treatment = within(openEditor("Workplace pension")).getByRole(
      "combobox",
      { name: "Treatment" },
    );

    expect(treatment).toBeDisabled();
    expect(treatment).toHaveAccessibleDescription(
      "Fed by Salary; set the pension to none on the salary to change it",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    treatment = within(openEditor("Stocks & shares ISA")).getByRole(
      "combobox",
      { name: "Treatment" },
    );

    expect(treatment).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(
      within(screen.getByRole("dialog")).getByRole("combobox", {
        name: "Treatment",
      }),
    ).toBeEnabled();
  });

  // The pension takes the sacrifice of every salary feeding it, named
  // as a list, in the singular for one; an account nothing feeds says
  // nothing of it.
  it("says which salaries stop sacrificing into a pension", () => {
    const [salary, stepUp] = incomeLines;
    render(
      <Toaster>
        <AccountLedger
          accounts={[pension, isa]}
          at={at}
          lines={[salary, { ...stepUp, feeds: pension.id, sacrifice: 0.05 }]}
          owners={[]}
        />
      </Toaster>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Delete Workplace pension" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Workplace pension?" }),
    ).toHaveAccessibleDescription(
      "Salary and Salary step-up stop sacrificing into it and are earned whole, at the share lost with it.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Stocks & shares ISA" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Delete Stocks & shares ISA?" }),
    ).toHaveAccessibleDescription("It cannot be brought back.");
  });

  it("says a house with no loan goes alone", () => {
    render(
      <Toaster>
        <AccountLedger accounts={[house]} at={at} lines={[]} owners={[]} />
      </Toaster>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Home" }));

    expect(
      screen.getByRole("alertdialog", { name: "Delete Home?" }),
    ).toHaveAccessibleDescription("It cannot be brought back.");
  });
});
