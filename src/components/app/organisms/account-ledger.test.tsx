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
} from "@/app/(app)/accounts/actions";
import { Toaster } from "@/components/kit/toast";
import { isAsset } from "@/data/accounts";
import { accounts } from "@/data/accounts.fixture";
import { incomeLines } from "@/data/income.fixture";

import { AccountLedger } from "./account-ledger";

vi.mock("@/app/(app)/accounts/actions", () => ({
  placeAccountsInOrder: vi.fn(),
  removeAccount: vi.fn(),
  saveAccount: vi.fn(),
  saveCar: vi.fn(),
  saveHouse: vi.fn(),
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
      <AccountLedger accounts={accounts} at={at} lines={[]} />
    </Toaster>,
  );
}

function rowsOf(panel: HTMLElement): HTMLElement[] {
  const [, ...rows] = within(panel).getAllByRole("row");
  return rows;
}

// The store's answer to a save: the account as it now has it. The ledger
// shows it only once the page re-reads, which is the router's work and
// not the ledger's, so the rows here stay as rendered. A test waits for
// the dialog to close before reading the tabs, since the close is a
// transition that lands after the toast, and a modal dialog hides the
// tabs from the accessibility tree while it is open.
function saved(account: Account): void {
  vi.mocked(saveAccount).mockResolvedValue(account);
}

describe("AccountLedger", () => {
  it("opens with the header, its counts and its action", () => {
    renderLedger();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("Sect. II · Accounts & assets")).toHaveClass(
      "label",
    );
    expect(screen.getByText("4 accounts · 1 asset")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on the accounts tab and switches to the assets tab", () => {
    renderLedger();

    const accountsTab = screen.getByRole("tab", { name: /^Accounts/ });
    const assetsTab = screen.getByRole("tab", { name: /^Assets/ });

    expect(accountsTab).toHaveAttribute("aria-selected", "true");
    expect(within(accountsTab).getByText("4")).toHaveClass("label");
    expect(within(assetsTab).getByText("1")).toHaveClass("label");

    let panel = screen.getByRole("tabpanel");

    expect(rowsOf(panel)).toHaveLength(held.length);
    expect(
      within(panel)
        .getAllByRole("paragraph")
        .map((note) => note.textContent),
    ).toStrictEqual([
      "Spare money is handed down the accounts in this order. Drag a row by its grip, or move it with the arrow keys.",
      "Allocation is set once at plan level and applied pro rata to every account.",
    ]);
    expect(
      within(panel).getAllByRole("button", { name: /^Move / }),
    ).toHaveLength(held.length);

    fireEvent.click(assetsTab);

    panel = screen.getByRole("tabpanel");

    expect(assetsTab).toHaveAttribute("aria-selected", "true");
    expect(rowsOf(panel)).toHaveLength(assets.length);
    expect(within(panel).getByRole("paragraph")).toHaveTextContent(
      "A loan against an asset is listed with the accounts, since it is paid as they are.",
    );
    expect(
      within(panel).queryByRole("button", { name: /^Move / }),
    ).not.toBeInTheDocument();

    fireEvent.click(accountsTab);

    expect(accountsTab).toHaveAttribute("aria-selected", "true");
  });

  it("adds a named account to the accounts tab and reports it", async () => {
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
    expect(screen.getByRole("tab", { name: /^Accounts/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("saves a real asset and brings the assets tab forward", async () => {
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
    });
    expect(screen.getByRole("tab", { name: /^Assets/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(rowsOf(screen.getByRole("tabpanel"))).toHaveLength(assets.length);
  });

  // The house dialog is the header's own; what it saves is its business,
  // and the ledger's is to bring the assets forward once it has.
  it("adds a house from the header and brings the assets tab forward", async () => {
    renderLedger();
    vi.mocked(saveHouse).mockResolvedValue({ ...home, id: 6, name: "Flat" });

    fireEvent.click(screen.getByRole("button", { name: "Add house" }));

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
    expect(screen.getByRole("tab", { name: /^Assets/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // The car dialog is the header's own too, and the ledger's part is the
  // same: to bring the assets forward once it has saved.
  it("adds a car from the header and brings the assets tab forward", async () => {
    renderLedger();
    vi.mocked(saveCar).mockResolvedValue(golf);

    fireEvent.click(screen.getByRole("button", { name: "Add car" }));

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
    expect(screen.getByRole("tab", { name: /^Assets/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
    expect(screen.getByText("4 accounts · 1 asset")).toBeInTheDocument();
  });

  it("opens a real asset as it is, keeps its rate across the growth choice and writes the edit back", async () => {
    renderLedger();
    saved({ ...home, balance: 420000 });
    fireEvent.click(screen.getByRole("tab", { name: /^Assets/ }));

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
    });
    expect(screen.getByRole("tab", { name: /^Assets/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
    });
    expect(screen.getByRole("tab", { name: /^Accounts/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
    ).toHaveAccessibleDescription("Leave at nothing for the £20,000 allowance");

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
    });
  });

  // The names down the accounts tab, the mortgage last among them since a
  // loan is listed with the accounts, as the rows now stand: each row's
  // grip is named for its account.
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

  // A house and the loan against it are one house to the dialog, which
  // opens on it from the pencil on either side; a loan whose house is
  // not listed is edited as the account it is.
  it("opens a house and the loan against it in the house dialog from either pencil", () => {
    render(
      <Toaster>
        <AccountLedger accounts={[pension, house, loan]} at={at} lines={[]} />
      </Toaster>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Mortgage" }));

    let dialog = screen.getByRole("dialog", { name: "Home" });

    expect(within(dialog).getByText("Edit house")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Home" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("textbox", { name: "Loan balance" }),
    ).toHaveValue("£182,940");
    expect(
      within(dialog).getByRole("textbox", { name: "Monthly payment" }),
    ).toHaveValue("£2,210");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("tab", { name: /^Assets/ }));

    dialog = openEditor("Home");

    expect(within(dialog).getByText("Edit house")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("textbox", { name: "Loan balance" }),
    ).toHaveValue("£182,940");
  });

  // A car and the finance on it are one car to its dialog, which opens
  // on it from the pencil on either side.
  it("opens a car and the finance on it in the car dialog from either pencil", () => {
    render(
      <Toaster>
        <AccountLedger accounts={[pension, golf, finance]} at={at} lines={[]} />
      </Toaster>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Golf PCP" }));

    let dialog = screen.getByRole("dialog", { name: "Golf" });

    expect(within(dialog).getByText("Edit car")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
    ).toHaveValue("pcp");
    expect(
      within(dialog).getByRole("textbox", { name: "Balloon" }),
    ).toHaveValue("£6,000");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("tab", { name: /^Assets/ }));

    dialog = openEditor("Golf");

    expect(within(dialog).getByText("Edit car")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("textbox", { name: "Balance owed" }),
    ).toHaveValue("£14,000");
  });

  it("opens a house with no loan against it as owned outright", () => {
    render(
      <Toaster>
        <AccountLedger accounts={[house]} at={at} lines={[]} />
      </Toaster>,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^Assets/ }));

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

  it("says a loan takes its payments and a house its mortgage and the payments", () => {
    render(
      <Toaster>
        <AccountLedger accounts={[pension, house, loan]} at={at} lines={[]} />
      </Toaster>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Mortgage" }));

    expect(
      screen.getByRole("alertdialog", { name: "Delete Mortgage?" }),
    ).toHaveAccessibleDescription("Its payments go with it.");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("tab", { name: /^Assets/ }));
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
        <AccountLedger accounts={[golf, finance]} at={at} lines={[]} />
      </Toaster>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /^Assets/ }));
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
        <AccountLedger accounts={accounts} at={at} lines={[salary]} />
      </Toaster>,
    );

    expect(
      screen.getByText("+ £13,800 / yr sacrificed from Salary"),
    ).toHaveClass("text-muted-foreground");
  });

  // The salary ends with 2048, so in 2049 it lands nothing on the row,
  // though the link stands: the dialog still holds the treatment, since
  // the store holds the link whether or not it runs.
  it("counts a salary on the row only while it runs, and holds the link either way", () => {
    const [salary] = incomeLines;
    render(
      <Toaster>
        <AccountLedger
          accounts={accounts}
          at={{ month: 0, year: 2049 }}
          lines={[salary]}
        />
      </Toaster>,
    );

    expect(screen.queryByText(/sacrificed from/)).not.toBeInTheDocument();

    const dialog = openEditor("Workplace pension");

    expect(
      within(dialog).getByRole("combobox", { name: "Treatment" }),
    ).toBeDisabled();
  });

  it("holds the treatment of a pension a salary feeds", () => {
    const [salary] = incomeLines;
    render(
      <Toaster>
        <AccountLedger accounts={[pension, isa]} at={at} lines={[salary]} />
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
        <AccountLedger accounts={[house]} at={at} lines={[]} />
      </Toaster>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /^Assets/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Home" }));

    expect(
      screen.getByRole("alertdialog", { name: "Delete Home?" }),
    ).toHaveAccessibleDescription("It cannot be brought back.");
  });
});
