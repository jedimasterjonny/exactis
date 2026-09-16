import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";

import {
  placeAccountsInOrder,
  saveAccount,
} from "@/app/(app)/accounts/actions";
import { Toaster } from "@/components/kit/toast";
import { isAsset } from "@/data/accounts";
import { accounts } from "@/data/accounts.fixture";

import { AccountLedger } from "./account-ledger";

vi.mock("@/app/(app)/accounts/actions", () => ({
  placeAccountsInOrder: vi.fn(),
  saveAccount: vi.fn(),
}));

const held = accounts.filter((account) => !isAsset(account));
const assets = accounts.filter(isAsset);
const [pension, isa, cash, home] = accounts;

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
      <AccountLedger accounts={accounts} />
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
    expect(screen.getByText("3 accounts · 2 assets")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on the accounts tab and switches to the assets tab", () => {
    renderLedger();

    const accountsTab = screen.getByRole("tab", { name: /^Accounts/ });
    const assetsTab = screen.getByRole("tab", { name: /^Assets/ });

    expect(accountsTab).toHaveAttribute("aria-selected", "true");
    expect(within(accountsTab).getByText("3")).toHaveClass("label");
    expect(within(assetsTab).getByText("2")).toHaveClass("label");

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
      "A loan is listed against the asset it secures.",
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
    expect(screen.getByText("3 accounts · 2 assets")).toBeInTheDocument();
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

  // The names down the accounts tab, as the rows now stand: each row's
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
});
