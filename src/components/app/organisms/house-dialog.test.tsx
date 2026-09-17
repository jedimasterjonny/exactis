import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";

import { saveHouse } from "@/app/(app)/accounts/actions";
import { Toaster } from "@/components/kit/toast";
import { accounts } from "@/data/accounts.fixture";

import { HouseDialog } from "./house-dialog";

vi.mock("@/app/(app)/accounts/actions", () => ({ saveHouse: vi.fn() }));

const [, , , home] = accounts;

const workedHint = "Worked out from the other two";

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function field(dialog: HTMLElement, name: string): HTMLElement {
  return within(dialog).getByRole("textbox", { name });
}

function openDialog(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Add house" }));
  return screen.getByRole("dialog");
}

// Save reports through the toast manager, which needs its Toaster
// mounted, and tells the caller, who is a spy where a test listens.
function renderDialog(onSaved: () => void = vi.fn()): void {
  render(
    <Toaster>
      <HouseDialog onSaved={onSaved} />
    </Toaster>,
  );
}

// The store's answer to a save: the house's own account as it now has
// it. A test waits for the dialog to close before reading the toast,
// since the close is a transition that lands after it.
function saved(account: Account): void {
  vi.mocked(saveHouse).mockResolvedValue(account);
}

describe("HouseDialog", () => {
  it("opens a blank mortgaged house with the payment worked out and the save held", () => {
    renderDialog();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const dialog = openDialog();

    expect(within(dialog).getByText("New house")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Untitled house" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(dialog).getByRole("combobox", { name: "Status" }),
    ).toHaveValue("mortgaged");
    expect(field(dialog, "Loan balance")).toHaveValue("£0");
    expect(field(dialog, "Rate")).toHaveValue("0.00%");
    expect(field(dialog, "Monthly payment")).toHaveValue("£0");
    expect(field(dialog, "Monthly payment")).toHaveAccessibleDescription(
      workedHint,
    );
    expect(field(dialog, "Years to pay off")).toHaveValue("25");
  });

  // £341,810 at 5.15% over 22 years is £2,166 a month, to the pound.
  it("works the payment out from the balance, rate and term, and saves the house with its mortgage", async () => {
    const onSaved = vi.fn<() => void>();
    renderDialog(onSaved);
    const dialog = openDialog();

    fireEvent.change(field(dialog, "Name"), { target: { value: " Home " } });
    commit(field(dialog, "Value"), "416,386");
    commit(field(dialog, "Loan balance"), "341,810");
    commit(field(dialog, "Rate"), "5.15");
    commit(field(dialog, "Years to pay off"), "22");

    expect(
      within(dialog).getByRole("heading", { name: "Home" }),
    ).toBeInTheDocument();
    expect(field(dialog, "Monthly payment")).toHaveValue("£2,166");
    expect(field(dialog, "Monthly payment")).toHaveAccessibleDescription(
      workedHint,
    );

    // The store's answer is held back, so the save can be seen in flight.
    let answer!: (account: Account) => void;
    vi.mocked(saveHouse).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveHouse).toHaveBeenCalledExactlyOnceWith({
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

    answer(home);

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Home" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "House added" }),
    ).toHaveAccessibleDescription("Home · mortgage and payments added");
    expect(onSaved).toHaveBeenCalledOnce();
  });

  // £2,210 a month clears £341,810 over 22 years at 5.37%; £1,000 a month
  // does not clear it at any rate, since 264 payments come to less than
  // the balance.
  it("works the rate out from the balance, term and payment, and holds the save when none fits", () => {
    renderDialog();
    const dialog = openDialog();

    fireEvent.change(field(dialog, "Name"), { target: { value: "Home" } });
    commit(field(dialog, "Loan balance"), "341,810");
    commit(field(dialog, "Years to pay off"), "22");
    commit(field(dialog, "Monthly payment"), "2,210");

    expect(field(dialog, "Rate")).toHaveValue("5.37%");
    expect(field(dialog, "Rate")).toHaveAccessibleDescription(workedHint);
    expect(field(dialog, "Monthly payment")).toHaveAccessibleDescription(
      "A month",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    commit(field(dialog, "Monthly payment"), "1,000");

    expect(field(dialog, "Rate")).toHaveValue("");
    expect(field(dialog, "Rate")).toHaveAttribute("aria-invalid", "true");
    expect(
      within(dialog).getByText("No rate clears the balance over the term"),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  // £2,210 a month clears £341,810 at 5.15% in 21.2 years; £1,000 a month
  // does not cover the interest, so it never clears, which is no bar to
  // saving: the store reads the open end off the same figures.
  it("works the term out from the balance, rate and payment, and saves a loan that never clears", async () => {
    renderDialog();
    saved(home);
    const dialog = openDialog();

    fireEvent.change(field(dialog, "Name"), { target: { value: "Home" } });
    commit(field(dialog, "Loan balance"), "341,810");
    commit(field(dialog, "Rate"), "5.15");
    commit(field(dialog, "Monthly payment"), "2,210");

    expect(field(dialog, "Years to pay off")).toHaveValue("21.2");
    expect(field(dialog, "Years to pay off")).toHaveAccessibleDescription(
      workedHint,
    );

    commit(field(dialog, "Monthly payment"), "1,000");

    expect(field(dialog, "Years to pay off")).toHaveValue("");
    expect(field(dialog, "Years to pay off")).toHaveAccessibleDescription(
      "Never clears at this payment, so the payments run to the end of the plan",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Home" }),
      ).not.toBeInTheDocument();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith({
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
      expect(field(dialog, name)).toHaveAccessibleDescription(workedHint);
    };

    commit(field(dialog, "Loan balance"), "341,810");
    worked("Monthly payment");

    commit(field(dialog, "Monthly payment"), "2,210");
    worked("Years to pay off");

    commit(field(dialog, "Rate"), "5.15");
    worked("Years to pay off");

    commit(field(dialog, "Years to pay off"), "22");
    worked("Monthly payment");

    commit(field(dialog, "Monthly payment"), "2,210");
    worked("Rate");

    commit(field(dialog, "Years to pay off"), "20");
    worked("Rate");

    commit(field(dialog, "Rate"), "5.15");
    worked("Monthly payment");

    commit(field(dialog, "Rate"), "5");
    worked("Monthly payment");
  });

  it("saves a house owned outright as the asset alone", async () => {
    const onSaved = vi.fn<() => void>();
    renderDialog(onSaved);
    saved({ ...home, id: 6, name: "Flat" });
    const dialog = openDialog();

    fireEvent.change(field(dialog, "Name"), { target: { value: "Flat" } });
    commit(field(dialog, "Loan balance"), "100,000");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Status" }), {
      target: { value: "outright" },
    });

    expect(
      within(dialog).queryByRole("textbox", { name: "Loan balance" }),
    ).not.toBeInTheDocument();

    commit(field(dialog, "Value"), "250,000");
    commit(field(dialog, "Value growth"), "2");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Flat" }),
      ).not.toBeInTheDocument();
    });
    expect(saveHouse).toHaveBeenCalledExactlyOnceWith({
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
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("drops a cancelled draft", () => {
    renderDialog();

    let dialog = openDialog();

    fireEvent.change(field(dialog, "Name"), { target: { value: "Flat" } });
    commit(field(dialog, "Years to pay off"), "10");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    dialog = openDialog();

    expect(field(dialog, "Name")).toHaveValue("");
    expect(field(dialog, "Years to pay off")).toHaveValue("25");
    expect(saveHouse).not.toHaveBeenCalled();
  });
});
