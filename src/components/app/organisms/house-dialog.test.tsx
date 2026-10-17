import type { RenderResult } from "@testing-library/react";
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
import type { Secured } from "@/data/secured";
import type { Answer } from "@/lib/answer";

import { saveHouse } from "@/actions/accounts";
import { Toaster } from "@/components/kit/toast";
import { accounts } from "@/data/accounts.fixture";
import { moveChoices } from "@/data/houses";
import { house as houseAsset, houseLoan, move } from "@/data/houses.fixture";
import { plan, retiring } from "@/data/income.fixture";
import { markersOf } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { saved as accepted, refused } from "@/lib/answer";
import { commit, field, openDialog } from "@/test/dom";

import { HouseDialog } from "./house-dialog";

vi.mock("@/actions/accounts", () => ({ saveHouse: vi.fn() }));

const [, , , home] = accounts;

// The fixture's home as a house, with its mortgage secured on it: worth
// £397,512 growing at 2.1%, owing £176,520 at 4.85% and paying £2,180 a
// month, which clears it in 8.2 years.
const house: Secured = { asset: houseAsset, loans: [houseLoan] };

// A second sub-account against it: £60,000 owed at 3.9%, paying £400 a
// month, which clears it in 17.2 years.
const further: Account = {
  ...houseLoan,
  balance: -60000,
  contribution: { amount: 400, cadence: "month", kind: "fixed" },
  growth: { kind: "fixed", rate: 0.039 },
  id: 6,
  name: "Home mortgage 2",
};

const workedHint = "Worked out";

// The dialog as the ledger mounts it, on a new house or one to edit,
// with spies where the ledger listens. Save reports through the toast
// manager, which needs its Toaster mounted.
function renderDialog(
  props: Partial<ComponentProps<typeof HouseDialog>> = {},
): RenderResult {
  return render(
    <HouseDialog
      house={null}
      milestones={moveChoices(markersOf(milestones, retiring), retiring, [])}
      onDismiss={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
      plan={plan}
      {...props}
    />,
    { wrapper: Toaster },
  );
}

// The store's answer to a save: the house's own account as it now has
// it. A test waits for the caller to be told before reading the toast,
// since the telling is a transition that lands after it.
function saved(account: Account): void {
  vi.mocked(saveHouse).mockResolvedValue(accepted(account));
}

describe("HouseDialog", () => {
  it("opens a blank mortgaged house with the payment worked out and the save held", () => {
    renderDialog();
    const dialog = openDialog();

    expect(within(dialog).getByText("New house")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Untitled house" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(dialog).getByRole("combobox", { name: "Status" }),
    ).toHaveValue("mortgaged");
    expect(
      within(dialog).getByRole("combobox", { name: "Month bought" }),
    ).toHaveDisplayValue("September");
    expect(field("Year bought", dialog)).toHaveValue("2026");
    expect(field("Bought for", dialog)).toHaveValue("£0");
    expect(field("Loan balance", dialog)).toHaveValue("£0");
    expect(field("Rate", dialog)).toHaveValue("0.00%");
    expect(field("Monthly payment", dialog)).toHaveValue("£0");
    expect(field("Monthly payment", dialog)).toHaveAccessibleDescription(
      workedHint,
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Work out" }),
    ).toHaveValue("payment");
    expect(field("Year", dialog)).toHaveValue("2051");
    expect(field("Year", dialog)).toHaveAccessibleDescription("25 years left");
  });

  // £334,670 at 4.85% over 26 years, the last payment in August 2052, is
  // £1,889 a month, to the pound.
  it("works the payment out from the balance, rate and term, and saves a new house with its mortgage", async () => {
    const onSaved = vi.fn<() => void>();
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: " Home " } });
    commit(field("Value", dialog), "397,512");
    commit(field("Bought for", dialog), "380,000");
    commit(field("Loan balance", dialog), "334,670");
    commit(field("Rate", dialog), "4.85");
    commit(field("Year", dialog), "2052");

    expect(
      within(dialog).getByRole("heading", { name: "Home" }),
    ).toBeInTheDocument();
    expect(field("Monthly payment", dialog)).toHaveValue("£1,889");
    expect(field("Monthly payment", dialog)).toHaveAccessibleDescription(
      workedHint,
    );

    // The store's answer is held back, so the save can be seen in flight.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<Account>>();
    vi.mocked(saveHouse).mockReturnValue(promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(null, {
      bought: { month: { month: 8, year: 2026 }, price: 380000 },
      ceiling: 0,
      growth: 0,
      move: null,
      name: "Home",
      parts: [{ balance: 334670, payment: 1889, rate: 0.0485 }],
      status: "mortgaged",
      value: 397512,
    });
    expect(
      within(dialog).getByRole("button", { name: "Save" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(onSaved).not.toHaveBeenCalled();

    answer(accepted(home));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(
      screen.getByRole("dialog", { name: "House added" }),
    ).toHaveAccessibleDescription("Home · with its mortgage and payments");
  });

  // The loan's £2,180 a month clears its £176,520 at 4.85% in 8.2 years,
  // which is what the term shows, worked out, when the house opens; a
  // new value goes back to the store under the house's id.
  it("opens a house on its records with the term worked out and writes the edit back", async () => {
    const onSaved = vi.fn<() => void>();
    saved(house.asset);
    renderDialog({ house, onSaved });
    const dialog = openDialog();

    expect(within(dialog).getByText("Edit house")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Home" }),
    ).toBeInTheDocument();
    expect(field("Name", dialog)).toHaveValue("Home");
    expect(
      within(dialog).getByRole("combobox", { name: "Status" }),
    ).toHaveValue("mortgaged");
    expect(field("Value", dialog)).toHaveValue("£397,512");
    expect(field("Value growth", dialog)).toHaveValue("2.10%");
    expect(field("Ceiling", dialog)).toHaveValue("£0");
    expect(field("Ceiling", dialog)).toHaveAccessibleDescription(
      "Today's money, £0 for none",
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Month bought" }),
    ).toHaveDisplayValue("October");
    expect(field("Year bought", dialog)).toHaveValue("2021");
    expect(field("Bought for", dialog)).toHaveValue("£380,000");
    expect(field("Loan balance", dialog)).toHaveValue("£176,520");
    expect(field("Rate", dialog)).toHaveValue("4.85%");
    expect(field("Monthly payment", dialog)).toHaveValue("£2,180");
    expect(
      within(dialog).getByRole("combobox", { name: "Work out" }),
    ).toHaveValue("term");
    expect(
      within(dialog).getByRole("combobox", { name: "Last payment" }),
    ).toHaveAccessibleDescription(workedHint);
    expect(field("Year", dialog)).toHaveAccessibleDescription("8.2 years left");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    commit(field("Value", dialog), "420,000");
    commit(field("Ceiling", dialog), "600,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(home.id, {
      bought: { month: { month: 9, year: 2021 }, price: 380000 },
      ceiling: 600000,
      growth: 0.021,
      move: null,
      name: "Home",
      parts: [{ balance: 176520, payment: 2180, rate: 0.0485 }],
      status: "mortgaged",
      value: 420000,
    });
    expect(
      screen.getByRole("dialog", { name: "House updated" }),
    ).toHaveAccessibleDescription("Home · with its mortgage and payments");
  });

  // The 8.2 years worked out when the house opens, a shade over, are 99
  // payments and run to November 2034. With the rate chosen to be worked
  // out instead, the end can be picked: August 2034 is eight years, which
  // stands as the term, and the rate follows.
  it("ends the mortgage in a picked month once the end is not worked out", () => {
    renderDialog({ house });
    const dialog = openDialog();
    const lastPayment = within(dialog).getByRole("combobox", {
      name: "Last payment",
    });

    expect(lastPayment).toHaveDisplayValue("November");
    expect(lastPayment).toBeDisabled();
    expect(field("Year", dialog)).toHaveValue("2034");

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Work out" }),
      { target: { value: "rate" } },
    );
    fireEvent.change(lastPayment, { target: { value: "7" } });

    expect(field("Year", dialog)).toHaveAccessibleDescription("8 years left");
    expect(lastPayment).toHaveDisplayValue("August");
    expect(field("Year", dialog)).toHaveValue("2034");
    expect(field("Rate", dialog)).toHaveAccessibleDescription(workedHint);
    expect(field("Monthly payment", dialog)).toHaveValue("£2,180");
  });

  // The loan's £2,180 a month at 4.85% clears it in 8.19 years, a part of
  // a month the payments round up to a whole one: worked out afresh over
  // the whole months, the rate would come to 5.00% with nothing typed, so
  // a choice alone holds it, and the save writes the loan as it was.
  it("changes no figure on a choice alone, and saves the loan as it was", async () => {
    const onSaved = vi.fn<() => void>();
    saved(house.asset);
    renderDialog({ house, onSaved });
    const dialog = openDialog();

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Work out" }),
      { target: { value: "rate" } },
    );

    expect(field("Rate", dialog)).toHaveValue("4.85%");
    expect(field("Monthly payment", dialog)).toHaveValue("£2,180");

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Work out" }),
      { target: { value: "payment" } },
    );

    expect(field("Monthly payment", dialog)).toHaveValue("£2,180");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(home.id, {
      bought: { month: { month: 9, year: 2021 }, price: 380000 },
      ceiling: 0,
      growth: 0.021,
      move: null,
      name: "Home",
      parts: [{ balance: 176520, payment: 2180, rate: 0.0485 }],
      status: "mortgaged",
      value: 397512,
    });
  });

  it("opens a house owned outright with no loan fields", () => {
    renderDialog({ house: { ...house, loans: [] } });
    const dialog = openDialog();

    expect(
      within(dialog).getByRole("combobox", { name: "Status" }),
    ).toHaveValue("outright");
    expect(
      within(dialog).queryByRole("textbox", { name: "Loan balance" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  // £2,180 a month clears £334,670 over 26 years at 6.28%; £1,000 a month
  // does not clear it at any rate, since 312 payments come to less than
  // the balance.
  it("works the rate out from the balance, term and payment, and holds the save when none fits", () => {
    renderDialog();
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Home" } });
    commit(field("Bought for", dialog), "380,000");
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Work out" }),
      { target: { value: "rate" } },
    );
    commit(field("Loan balance", dialog), "334,670");
    commit(field("Year", dialog), "2052");
    commit(field("Monthly payment", dialog), "2,180");

    expect(field("Rate", dialog)).toHaveValue("6.28%");
    expect(field("Rate", dialog)).toHaveAccessibleDescription(workedHint);
    expect(field("Monthly payment", dialog)).not.toHaveAccessibleDescription();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    commit(field("Monthly payment", dialog), "1,000");

    expect(field("Rate", dialog)).toHaveValue("");
    expect(field("Rate", dialog)).toHaveAttribute("aria-invalid", "true");
    expect(
      within(dialog).getByText("No rate clears the balance over the term"),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  // £2,180 a month clears £334,670 at 4.85% in 20.0 years; £1,000 a month
  // does not cover the interest, so it never clears, which is no bar to
  // saving: the store reads the open end off the same figures.
  it("works the term out from the balance, rate and payment, and saves a loan that never clears", async () => {
    const onSaved = vi.fn<() => void>();
    saved(home);
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Home" } });
    commit(field("Bought for", dialog), "380,000");
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Work out" }),
      { target: { value: "term" } },
    );
    commit(field("Loan balance", dialog), "334,670");
    commit(field("Rate", dialog), "4.85");
    commit(field("Monthly payment", dialog), "2,180");

    const lastPayment = within(dialog).getByRole("combobox", {
      name: "Last payment",
    });

    expect(lastPayment).toHaveDisplayValue("September");
    expect(field("Year", dialog)).toHaveValue("2046");
    expect(field("Year", dialog)).toHaveAccessibleDescription("20 years left");

    commit(field("Monthly payment", dialog), "1,000");

    expect(lastPayment).toHaveDisplayValue("—");
    expect(lastPayment).toHaveAccessibleDescription("Never, at this payment");
    expect(field("Year", dialog)).toHaveAccessibleDescription(
      "Never clears at this payment",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(null, {
      bought: { month: { month: 8, year: 2026 }, price: 380000 },
      ceiling: 0,
      growth: 0,
      move: null,
      name: "Home",
      parts: [{ balance: 334670, payment: 1000, rate: 0.0485 }],
      status: "mortgaged",
      value: 0,
    });
  });

  // The figure chosen is the one worked out, read-only, whichever of the
  // others is typed after it, and the end is held while it is the one.
  it("works out the figure chosen, and takes the other two as typed", () => {
    renderDialog();
    const dialog = openDialog();
    const workOut = within(dialog).getByRole("combobox", { name: "Work out" });
    const lastPayment = within(dialog).getByRole("combobox", {
      name: "Last payment",
    });

    commit(field("Loan balance", dialog), "334,670");
    commit(field("Rate", dialog), "4.85");

    expect(field("Monthly payment", dialog)).toHaveAttribute("readonly");
    expect(lastPayment).toBeEnabled();

    fireEvent.change(workOut, { target: { value: "rate" } });

    expect(field("Rate", dialog)).toHaveAttribute("readonly");
    expect(field("Rate", dialog)).toHaveAccessibleDescription(workedHint);
    expect(field("Monthly payment", dialog)).not.toHaveAttribute("readonly");

    fireEvent.change(workOut, { target: { value: "term" } });

    expect(lastPayment).toBeDisabled();
    expect(field("Rate", dialog)).not.toHaveAttribute("readonly");
  });

  // A house owned outright opens with a sub-account standing by, so
  // choosing to mortgage it shows the loan's fields at once, working the
  // payment out as a new house does.
  it("shows a house owned outright the loan's fields as soon as it is mortgaged", () => {
    renderDialog({ house: { ...house, loans: [] } });
    const dialog = openDialog();

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Status" }), {
      target: { value: "mortgaged" },
    });

    expect(field("Loan balance", dialog)).toHaveValue("£0");
    expect(
      within(dialog).getByRole("combobox", { name: "Work out" }),
    ).toHaveValue("payment");
    expect(field("Year", dialog)).toHaveAccessibleDescription("25 years left");
    expect(
      within(dialog).queryByRole("group", { name: /^Sub-account/ }),
    ).not.toBeInTheDocument();
  });

  // Each sub-account opens on its own records with its own term worked
  // out, and an edit to one writes back in its place alone.
  it("opens a mortgage in sub-accounts each with its term worked out, and writes an edit to one back in its place", async () => {
    const onSaved = vi.fn<() => void>();
    saved(houseAsset);
    renderDialog({ house: { ...house, loans: [houseLoan, further] }, onSaved });
    const dialog = openDialog();
    const first = within(dialog).getByRole("group", { name: "Sub-account 1" });
    const second = within(dialog).getByRole("group", { name: "Sub-account 2" });

    expect(field("Loan balance", first)).toHaveValue("£176,520");
    expect(field("Year", first)).toHaveAccessibleDescription("8.2 years left");
    expect(field("Loan balance", second)).toHaveValue("£60,000");
    expect(field("Year", second)).toHaveAccessibleDescription(
      "17.2 years left",
    );

    commit(field("Monthly payment", second), "500");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(home.id, {
      bought: { month: { month: 9, year: 2021 }, price: 380000 },
      ceiling: 0,
      growth: 0.021,
      move: null,
      name: "Home",
      parts: [
        { balance: 176520, payment: 2180, rate: 0.0485 },
        { balance: 60000, payment: 500, rate: 0.039 },
      ],
      status: "mortgaged",
      value: 397512,
    });
  });

  // A sub-account added owes nothing yet, so the save holds until it owes
  // something, its payment worked out over the twenty-five years a new
  // one opens on: £60,000 at 3.9% is £313 a month. One taken away goes
  // from the save, and the one left keeps what was typed into it.
  it("adds a sub-account working out its payment, holding the save until it owes something, and takes one away", async () => {
    const onSaved = vi.fn<() => void>();
    saved(houseAsset);
    renderDialog({ house, onSaved });
    const dialog = openDialog();
    const add = within(dialog).getByRole("button", { name: "Add sub-account" });

    fireEvent.click(add);
    const added = within(dialog).getByRole("group", { name: "Sub-account 2" });

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(added).getByRole("combobox", { name: "Work out" }),
    ).toHaveValue("payment");

    commit(field("Loan balance", added), "60,000");
    commit(field("Rate", added), "3.9");

    expect(field("Monthly payment", added)).toHaveValue("£313");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.click(add);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove sub-account 3" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove sub-account 1" }),
    );

    expect(
      within(dialog).queryByRole("group", { name: /^Sub-account/ }),
    ).not.toBeInTheDocument();
    expect(field("Loan balance", dialog)).toHaveValue("£60,000");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(
      home.id,
      expect.objectContaining({
        parts: [{ balance: 60000, payment: 313, rate: 0.039 }],
      }),
    );
  });

  // A house is bought for something, so the save holds until the price
  // is typed, with the month and the year as picked.
  it("saves a house owned outright as the asset alone, once it has been bought for something", async () => {
    const onSaved = vi.fn<() => void>();
    saved({ ...home, id: 6, name: "Flat" });
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Flat" } });
    commit(field("Loan balance", dialog), "100,000");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Status" }), {
      target: { value: "outright" },
    });

    expect(
      within(dialog).queryByRole("textbox", { name: "Loan balance" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    commit(field("Value", dialog), "250,000");
    commit(field("Value growth", dialog), "2");
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Month bought" }),
      { target: { value: "9" } },
    );
    commit(field("Year bought", dialog), "2021");
    commit(field("Bought for", dialog), "230,000");

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(null, {
      bought: { month: { month: 9, year: 2021 }, price: 230000 },
      ceiling: 0,
      growth: 0.02,
      move: null,
      name: "Flat",
      parts: [],
      status: "outright",
      value: 250000,
    });
    expect(
      screen.getByRole("dialog", { name: "House added" }),
    ).toHaveAccessibleDescription("Flat");
  });

  // The fixture's home moving up as the children leave home in 2040,
  // borrowing up to 90%, which it can only while it is mortgaged now.
  it("opens a house's move as kept, holds the save while it borrows on a house owned outright, and saves it with the edit", async () => {
    const onSaved = vi.fn<() => void>();
    saved(house.asset);
    renderDialog({
      house: { ...house, asset: { ...house.asset, move } },
      onSaved,
    });
    const dialog = openDialog();

    expect(
      within(dialog).getByRole("combobox", { name: "Moves" }),
    ).toHaveDisplayValue("At Kids leave home · 2040");
    expect(field("Next house costs", dialog)).toHaveValue("£650,000");
    expect(field("Next ceiling", dialog)).toHaveValue("£800,000");
    expect(field("Borrows up to", dialog)).toHaveValue("90.00%");
    expect(field("Mortgage rate", dialog)).toHaveValue("4.50%");
    expect(field("Mortgage term", dialog)).toHaveValue("25");

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Status" }), {
      target: { value: "outright" },
    });

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(field("Borrows up to", dialog)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      within(dialog).getByText(
        "A house owned outright borrows nothing as it moves",
      ),
    ).toHaveClass("text-destructive");

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Status" }), {
      target: { value: "mortgaged" },
    });

    expect(
      within(dialog).queryByText(
        "A house owned outright borrows nothing as it moves",
      ),
    ).not.toBeInTheDocument();

    // The mortgage's fields go while the move borrows nothing, and come
    // back on the rate typed before they went.
    commit(field("Mortgage rate", dialog), "5");
    commit(field("Borrows up to", dialog), "0");

    expect(
      within(dialog).queryByRole("textbox", { name: "Mortgage rate" }),
    ).not.toBeInTheDocument();

    commit(field("Borrows up to", dialog), "90");

    expect(field("Mortgage rate", dialog)).toHaveValue("5.00%");

    commit(field("Next house costs", dialog), "700,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(home.id, {
      bought: { month: { month: 9, year: 2021 }, price: 380000 },
      ceiling: 0,
      growth: 0.021,
      move: {
        at: 7,
        ceiling: 800000,
        loanToValue: 0.9,
        price: 700000,
        rate: 0.05,
        term: 25,
        year: 2040,
      },
      name: "Home",
      parts: [{ balance: 176520, payment: 2180, rate: 0.0485 }],
      status: "mortgaged",
      value: 397512,
    });
  });

  it("keeps a refused save open and says why", async () => {
    const onSaved = vi.fn<() => void>();
    vi.mocked(saveHouse).mockResolvedValue(
      refused("A pension a salary feeds stays a pension"),
    );
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Flat" } });
    commit(field("Bought for", dialog), "230,000");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Status" }), {
      target: { value: "outright" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "House not saved" }),
      ).toHaveAccessibleDescription("A pension a salary feeds stays a pension");
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Flat" })).toBeVisible();
    // The toast lands before the transition ends, so the save frees a
    // beat after it.
    await waitFor(() => {
      expect(
        within(screen.getByRole("dialog", { name: "Flat" })).getByRole(
          "button",
          { name: "Save" },
        ),
      ).toBeEnabled();
    });
  });

  it("tells the caller when it is dismissed, and saves nothing", () => {
    const onDismiss = vi.fn<() => void>();
    renderDialog({ onDismiss });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Flat" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(saveHouse).not.toHaveBeenCalled();
  });
  // The ledger hands the dialog its delete, which a house the store holds
  // is offered and reports its own account by, as its row's bin does,
  // saving nothing; a new one has nothing yet to delete.
  it("offers a saved house a delete that reports its asset, and a new one none", () => {
    const onDelete = vi.fn<(asset: Account) => void>();
    const view = renderDialog({ house, onDelete });

    fireEvent.click(
      within(openDialog()).getByRole("button", { name: "Delete" }),
    );

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(house.asset);
    expect(saveHouse).not.toHaveBeenCalled();

    view.unmount();
    renderDialog({ onDelete });

    expect(
      within(openDialog()).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });
});
