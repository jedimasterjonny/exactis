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
import { house as houseAsset, houseLoan } from "@/data/houses.fixture";
import { plan } from "@/data/income.fixture";
import { saved as accepted, refused } from "@/lib/answer";
import { commit, field, openDialog } from "@/test/dom";

import { HouseDialog } from "./house-dialog";

vi.mock("@/actions/accounts", () => ({ saveHouse: vi.fn() }));

const [, , , home] = accounts;

// The fixture's home as a house, with its mortgage secured on it: worth
// £416,386 growing at 2.1%, owing £182,940 at 5.15% and paying £2,210 a
// month, which clears it in 8.5 years.
const house: Secured = { asset: houseAsset, loan: houseLoan };

const workedHint = "Worked out from the other two";

// The dialog as the ledger mounts it, on a new house or one to edit,
// with spies where the ledger listens. Save reports through the toast
// manager, which needs its Toaster mounted.
function renderDialog(
  props: Partial<ComponentProps<typeof HouseDialog>> = {},
): RenderResult {
  return render(
    <HouseDialog
      house={null}
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
    expect(field("Loan balance", dialog)).toHaveValue("£0");
    expect(field("Rate", dialog)).toHaveValue("0.00%");
    expect(field("Monthly payment", dialog)).toHaveValue("£0");
    expect(field("Monthly payment", dialog)).toHaveAccessibleDescription(
      workedHint,
    );
    expect(field("Years to pay off", dialog)).toHaveValue("25");
  });

  // £341,810 at 5.15% over 22 years is £2,166 a month, to the pound.
  it("works the payment out from the balance, rate and term, and saves a new house with its mortgage", async () => {
    const onSaved = vi.fn<() => void>();
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: " Home " } });
    commit(field("Value", dialog), "416,386");
    commit(field("Loan balance", dialog), "341,810");
    commit(field("Rate", dialog), "5.15");
    commit(field("Years to pay off", dialog), "22");

    expect(
      within(dialog).getByRole("heading", { name: "Home" }),
    ).toBeInTheDocument();
    expect(field("Monthly payment", dialog)).toHaveValue("£2,166");
    expect(field("Monthly payment", dialog)).toHaveAccessibleDescription(
      workedHint,
    );

    // The store's answer is held back, so the save can be seen in flight.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<Account>>();
    vi.mocked(saveHouse).mockReturnValue(promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(null, {
      balance: 341810,
      growth: 0,
      name: "Home",
      payment: 2166,
      rate: 0.0515,
      status: "mortgaged",
      value: 416386,
    });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(onSaved).not.toHaveBeenCalled();

    answer(accepted(home));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(
      screen.getByRole("dialog", { name: "House added" }),
    ).toHaveAccessibleDescription("Home · with its mortgage and payments");
  });

  // The loan's £2,210 a month clears its £182,940 at 5.15% in 8.5 years,
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
    expect(field("Value", dialog)).toHaveValue("£416,386");
    expect(field("Value growth", dialog)).toHaveValue("2.10%");
    expect(field("Loan balance", dialog)).toHaveValue("£182,940");
    expect(field("Rate", dialog)).toHaveValue("5.15%");
    expect(field("Monthly payment", dialog)).toHaveValue("£2,210");
    expect(field("Years to pay off", dialog)).toHaveValue("8.5");
    expect(field("Years to pay off", dialog)).toHaveAccessibleDescription(
      workedHint,
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    commit(field("Value", dialog), "420,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(home.id, {
      balance: 182940,
      growth: 0.021,
      name: "Home",
      payment: 2210,
      rate: 0.0515,
      status: "mortgaged",
      value: 420000,
    });
    expect(
      screen.getByRole("dialog", { name: "House updated" }),
    ).toHaveAccessibleDescription("Home · with its mortgage and payments");
  });

  // The 8.5 years worked out when the house opens, a shade over, are 103
  // payments and run to March 2035; August 2035 picked instead is nine
  // years, which stands as the term and shows in the years, and the
  // rate is worked out in its place.
  it("ends the mortgage in a picked month, which stands as the term", () => {
    renderDialog({ house });
    const dialog = openDialog();
    const lastPayment = within(dialog).getByRole("combobox", {
      name: "Last payment",
    });

    expect(lastPayment).toHaveDisplayValue("March");
    expect(field("Year", dialog)).toHaveValue("2035");

    fireEvent.change(lastPayment, { target: { value: "7" } });

    expect(field("Years to pay off", dialog)).toHaveValue("9");
    expect(field("Years to pay off", dialog)).toHaveAccessibleDescription(
      "Left to run",
    );
    expect(lastPayment).toHaveDisplayValue("August");
    expect(field("Year", dialog)).toHaveValue("2035");
    expect(field("Rate", dialog)).toHaveAccessibleDescription(workedHint);
    expect(field("Monthly payment", dialog)).toHaveValue("£2,210");
  });

  it("opens a house owned outright with no loan fields", () => {
    renderDialog({ house: { ...house, loan: null } });
    const dialog = openDialog();

    expect(
      within(dialog).getByRole("combobox", { name: "Status" }),
    ).toHaveValue("outright");
    expect(
      within(dialog).queryByRole("textbox", { name: "Loan balance" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  // £2,210 a month clears £341,810 over 22 years at 5.37%; £1,000 a month
  // does not clear it at any rate, since 264 payments come to less than
  // the balance.
  it("works the rate out from the balance, term and payment, and holds the save when none fits", () => {
    renderDialog();
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Home" } });
    commit(field("Loan balance", dialog), "341,810");
    commit(field("Years to pay off", dialog), "22");
    commit(field("Monthly payment", dialog), "2,210");

    expect(field("Rate", dialog)).toHaveValue("5.37%");
    expect(field("Rate", dialog)).toHaveAccessibleDescription(workedHint);
    expect(field("Monthly payment", dialog)).toHaveAccessibleDescription(
      "A month",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    commit(field("Monthly payment", dialog), "1,000");

    expect(field("Rate", dialog)).toHaveValue("");
    expect(field("Rate", dialog)).toHaveAttribute("aria-invalid", "true");
    expect(
      within(dialog).getByText("No rate clears the balance over the term"),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  // £2,210 a month clears £341,810 at 5.15% in 21.2 years; £1,000 a month
  // does not cover the interest, so it never clears, which is no bar to
  // saving: the store reads the open end off the same figures.
  it("works the term out from the balance, rate and payment, and saves a loan that never clears", async () => {
    const onSaved = vi.fn<() => void>();
    saved(home);
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Home" } });
    commit(field("Loan balance", dialog), "341,810");
    commit(field("Rate", dialog), "5.15");
    commit(field("Monthly payment", dialog), "2,210");

    expect(field("Years to pay off", dialog)).toHaveValue("21.2");
    expect(field("Years to pay off", dialog)).toHaveAccessibleDescription(
      workedHint,
    );

    commit(field("Monthly payment", dialog), "1,000");

    expect(field("Years to pay off", dialog)).toHaveValue("");
    expect(field("Years to pay off", dialog)).toHaveAccessibleDescription(
      "Never clears at this payment, so the payments run to the end of the plan",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(null, {
      balance: 341810,
      growth: 0,
      name: "Home",
      payment: 1000,
      rate: 0.0515,
      status: "mortgaged",
      value: 0,
    });
  });

  // Whichever two of the three were typed last stand, and the third is
  // worked out, so typing a figure that was worked out hands the working
  // to the one left alone longest.
  it("keeps the two figures typed last and works out the third", () => {
    renderDialog();
    const dialog = openDialog();
    const worked = (name: string): void => {
      expect(field(name, dialog)).toHaveAccessibleDescription(workedHint);
    };

    commit(field("Loan balance", dialog), "341,810");
    worked("Monthly payment");

    commit(field("Monthly payment", dialog), "2,210");
    worked("Years to pay off");

    commit(field("Rate", dialog), "5.15");
    worked("Years to pay off");

    commit(field("Years to pay off", dialog), "22");
    worked("Monthly payment");

    commit(field("Monthly payment", dialog), "2,210");
    worked("Rate");

    commit(field("Years to pay off", dialog), "20");
    worked("Rate");

    commit(field("Rate", dialog), "5.15");
    worked("Monthly payment");

    commit(field("Rate", dialog), "5");
    worked("Monthly payment");
  });

  it("saves a house owned outright as the asset alone", async () => {
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

    commit(field("Value", dialog), "250,000");
    commit(field("Value growth", dialog), "2");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith(null, {
      balance: 0,
      growth: 0.02,
      name: "Flat",
      payment: 0,
      rate: 0,
      status: "outright",
      value: 250000,
    });
    expect(
      screen.getByRole("dialog", { name: "House added" }),
    ).toHaveAccessibleDescription("Flat");
  });

  it("keeps a refused save open and says why", async () => {
    const onSaved = vi.fn<() => void>();
    vi.mocked(saveHouse).mockResolvedValue(
      refused("A pension a salary feeds stays a pension"),
    );
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Flat" } });
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
