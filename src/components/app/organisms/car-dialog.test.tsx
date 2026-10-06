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

import { saveCar } from "@/actions/accounts";
import { Toaster } from "@/components/kit/toast";
import {
  golfPcp as finance,
  golf,
  golfLoan as loan,
} from "@/data/cars.fixture";
import { plan } from "@/data/income.fixture";
import { saved as accepted, refused } from "@/lib/answer";
import { commit, field, openDialog } from "@/test/dom";

import { CarDialog } from "./car-dialog";

vi.mock("@/actions/accounts", () => ({ saveCar: vi.fn() }));

// The Golf with the finance secured on it: £14,000 owed at 7.9%,
// paying £290 a month towards a £6,000 balloon, which it reaches in
// three years.
const car: Secured = { asset: golf, loan: finance };

const workedHint = "Worked out from the other two";

// The dialog as the ledger mounts it, on a new car or one to edit, with
// spies where the ledger listens. Save reports through the toast
// manager, which needs its Toaster mounted.
function renderDialog(
  props: Partial<ComponentProps<typeof CarDialog>> = {},
): RenderResult {
  return render(
    <CarDialog
      car={null}
      onDismiss={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
      plan={plan}
      {...props}
    />,
    { wrapper: Toaster },
  );
}

// The store's answer to a save: the car's own account as it now has
// it. A test waits for the caller to be told before reading the toast,
// since the telling is a transition that lands after it.
function saved(account: Account): void {
  vi.mocked(saveCar).mockResolvedValue(accepted(account));
}

describe("CarDialog", () => {
  it("opens a blank car on a PCP with the payment worked out and the save held", () => {
    renderDialog();
    const dialog = openDialog();

    expect(within(dialog).getByText("New car")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Untitled car" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
    ).toHaveValue("pcp");
    expect(field("Balance owed", dialog)).toHaveValue("£0");
    expect(field("Rate", dialog)).toHaveValue("0.00%");
    expect(field("Monthly payment", dialog)).toHaveValue("£0");
    expect(field("Monthly payment", dialog)).toHaveAccessibleDescription(
      workedHint,
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Work out" }),
    ).toHaveValue("payment");
    expect(field("Year", dialog)).toHaveValue("2030");
    expect(field("Year", dialog)).toHaveAccessibleDescription("4 years left");
    expect(field("Balloon", dialog)).toHaveValue("£0");
  });

  // £14,000 at 7.9% over three years, the agreement ending in August
  // 2029, towards a £6,000 balloon is £290 a month, to the pound, and
  // carried on clears the whole in 4.9 years.
  it("works the payment out from the balance, balloon, rate and term, and saves a new car with its PCP", async () => {
    const onSaved = vi.fn<() => void>();
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: " Golf " } });
    commit(field("Value", dialog), "18,000");
    commit(field("Depreciation", dialog), "15");
    commit(field("Balance owed", dialog), "14,000");
    commit(field("Balloon", dialog), "6,000");
    commit(field("Rate", dialog), "7.9");
    commit(field("Year", dialog), "2029");

    expect(
      within(dialog).getByRole("heading", { name: "Golf" }),
    ).toBeInTheDocument();
    expect(field("Monthly payment", dialog)).toHaveValue("£290");
    expect(field("Monthly payment", dialog)).toHaveAccessibleDescription(
      workedHint,
    );
    expect(field("Balloon", dialog)).toHaveAccessibleDescription(
      "Refinanced on the same terms when the agreement ends, so the payments run 4.9 years in all",
    );

    // The store's answer is held back, so the save can be seen in flight.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<Account>>();
    vi.mocked(saveCar).mockReturnValue(promise);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveCar).toHaveBeenCalledExactlyOnceWith(null, {
      agreement: "pcp",
      balance: 14000,
      balloon: 6000,
      depreciation: 0.15,
      name: "Golf",
      payment: 290,
      rate: 0.079,
      value: 18000,
    });
    expect(
      within(dialog).getByRole("button", { name: "Save" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(onSaved).not.toHaveBeenCalled();

    answer(accepted(golf));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(
      screen.getByRole("dialog", { name: "Car added" }),
    ).toHaveAccessibleDescription("Golf · with its PCP and payments");
  });

  // The finance's £290 a month reaches its £6,000 balloon in three years,
  // which is what the term shows, worked out, when the car opens; a new
  // value goes back to the store under the car's id.
  it("opens a car on its records as the PCP it is, with the term worked out, and writes the edit back", async () => {
    const onSaved = vi.fn<() => void>();
    saved(golf);
    renderDialog({ car, onSaved });
    const dialog = openDialog();

    expect(within(dialog).getByText("Edit car")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Golf" }),
    ).toBeInTheDocument();
    expect(field("Name", dialog)).toHaveValue("Golf");
    expect(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
    ).toHaveValue("pcp");
    expect(field("Value", dialog)).toHaveValue("£18,000");
    expect(field("Depreciation", dialog)).toHaveValue("15.00%");
    expect(field("Balance owed", dialog)).toHaveValue("£14,000");
    expect(field("Rate", dialog)).toHaveValue("7.90%");
    expect(field("Monthly payment", dialog)).toHaveValue("£290");
    expect(
      within(dialog).getByRole("combobox", { name: "Work out" }),
    ).toHaveValue("term");
    expect(
      within(dialog).getByRole("combobox", { name: "Agreement ends" }),
    ).toHaveAccessibleDescription(workedHint);
    expect(field("Year", dialog)).toHaveAccessibleDescription("3 years left");
    expect(field("Balloon", dialog)).toHaveValue("£6,000");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    commit(field("Value", dialog), "16,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveCar).toHaveBeenCalledExactlyOnceWith(golf.id, {
      agreement: "pcp",
      balance: 14000,
      balloon: 6000,
      depreciation: 0.15,
      name: "Golf",
      payment: 290,
      rate: 0.079,
      value: 16000,
    });
    expect(
      screen.getByRole("dialog", { name: "Car updated" }),
    ).toHaveAccessibleDescription("Golf · with its PCP and payments");
  });

  // A loan with no balloon opens as a loan, with no balloon field, and
  // saves as one.
  it("opens a car on a loan as the loan it is, and saves it with its loan", async () => {
    const onSaved = vi.fn<() => void>();
    saved(golf);
    renderDialog({ car: { ...car, loan }, onSaved });
    const dialog = openDialog();

    expect(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
    ).toHaveValue("loan");
    expect(
      within(dialog).queryByRole("textbox", { name: "Balloon" }),
    ).not.toBeInTheDocument();
    expect(field("Year", dialog)).toHaveAccessibleDescription("3 years left");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveCar).toHaveBeenCalledExactlyOnceWith(golf.id, {
      agreement: "loan",
      balance: 14000,
      balloon: 0,
      depreciation: 0.15,
      name: "Golf",
      payment: 438,
      rate: 0.079,
      value: 18000,
    });
    expect(
      screen.getByRole("dialog", { name: "Car updated" }),
    ).toHaveAccessibleDescription("Golf · with its loan and payments");
  });

  it("opens a car owned outright with no finance fields", () => {
    renderDialog({ car: { ...car, loan: null } });
    const dialog = openDialog();

    expect(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
    ).toHaveValue("outright");
    expect(
      within(dialog).queryByRole("textbox", { name: "Balance owed" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  // £290 a month reaches the £6,000 balloon from £14,000 over three
  // years at 7.92%; £200 a month does not reach it at any rate, since 36
  // payments come to less than the £8,000 to pay down.
  it("works the rate out from the balance, balloon, term and payment, and holds the save when none fits", () => {
    renderDialog();
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Golf" } });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Work out" }),
      { target: { value: "rate" } },
    );
    commit(field("Balance owed", dialog), "14,000");
    commit(field("Balloon", dialog), "6,000");
    commit(field("Year", dialog), "2029");
    commit(field("Monthly payment", dialog), "290");

    expect(field("Rate", dialog)).toHaveValue("7.92%");
    expect(field("Rate", dialog)).toHaveAccessibleDescription(workedHint);
    expect(field("Monthly payment", dialog)).toHaveAccessibleDescription(
      "A month",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    commit(field("Monthly payment", dialog), "200");

    expect(field("Rate", dialog)).toHaveValue("");
    expect(field("Rate", dialog)).toHaveAttribute("aria-invalid", "true");
    expect(
      within(dialog).getByText("No rate reaches the balloon over the term"),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  // £290 a month reaches the balloon in three years; £90 a month does not
  // cover the interest, so it never gets there and never clears, which
  // is no bar to saving: the store reads the open end off the same
  // figures.
  it("works the term out from the balance, balloon, rate and payment, and saves finance that never clears", async () => {
    const onSaved = vi.fn<() => void>();
    saved(golf);
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Golf" } });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Work out" }),
      { target: { value: "term" } },
    );
    commit(field("Balance owed", dialog), "14,000");
    commit(field("Balloon", dialog), "6,000");
    commit(field("Rate", dialog), "7.9");
    commit(field("Monthly payment", dialog), "290");

    const ends = within(dialog).getByRole("combobox", {
      name: "Agreement ends",
    });

    expect(ends).toHaveDisplayValue("August");
    expect(field("Year", dialog)).toHaveValue("2029");
    expect(field("Year", dialog)).toHaveAccessibleDescription("3 years left");

    commit(field("Monthly payment", dialog), "90");

    expect(ends).toHaveDisplayValue("—");
    expect(ends).toHaveAccessibleDescription("Never, at this payment");
    expect(field("Year", dialog)).toHaveAccessibleDescription(
      "Never reaches the balloon at this payment, so the payments run to the end of the plan",
    );
    expect(field("Balloon", dialog)).toHaveAccessibleDescription(
      "Refinanced on the same terms when the agreement ends",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveCar).toHaveBeenCalledExactlyOnceWith(null, {
      agreement: "pcp",
      balance: 14000,
      balloon: 6000,
      depreciation: 0,
      name: "Golf",
      payment: 90,
      rate: 0.079,
      value: 0,
    });
  });

  // A choice alone changes no figure: the £290 a month worked out is kept
  // as typed once the rate is chosen instead, and the rate holds at the
  // 7.9% it was typed as, until a figure it is worked out from is typed:
  // £300 a month then reaches the balloon at 9.71%.
  it("changes no figure on a choice alone, until one is typed", () => {
    renderDialog();
    const dialog = openDialog();

    commit(field("Balance owed", dialog), "14,000");
    commit(field("Balloon", dialog), "6,000");
    commit(field("Rate", dialog), "7.9");
    commit(field("Year", dialog), "2029");

    expect(field("Monthly payment", dialog)).toHaveValue("£290");

    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Work out" }),
      { target: { value: "rate" } },
    );

    expect(field("Monthly payment", dialog)).toHaveValue("£290");
    expect(field("Monthly payment", dialog)).not.toHaveAttribute("readonly");
    expect(field("Rate", dialog)).toHaveValue("7.90%");
    expect(field("Rate", dialog)).toHaveAccessibleDescription(workedHint);

    fireEvent.change(field("Name", dialog), { target: { value: "Golf" } });

    expect(field("Rate", dialog)).toHaveValue("7.90%");

    commit(field("Monthly payment", dialog), "300");

    expect(field("Rate", dialog)).not.toHaveValue("7.90%");
  });

  // The balloon typed on a PCP goes with the agreement: a car made a
  // loan saves none, whatever the hidden field holds.
  it("saves a car owned outright as the asset alone, and a loan with no balloon", async () => {
    const onSaved = vi.fn<() => void>();
    saved({ ...golf, id: 8, name: "Polo" });
    renderDialog({ onSaved });
    const dialog = openDialog();
    const agreement = within(dialog).getByRole("combobox", {
      name: "Agreement",
    });

    fireEvent.change(field("Name", dialog), { target: { value: "Polo" } });
    commit(field("Balance owed", dialog), "10,000");
    commit(field("Balloon", dialog), "4,000");
    commit(field("Rate", dialog), "6.9");
    fireEvent.change(agreement, { target: { value: "loan" } });

    expect(
      within(dialog).queryByRole("textbox", { name: "Balloon" }),
    ).not.toBeInTheDocument();
    expect(field("Monthly payment", dialog)).toHaveValue("£239");

    fireEvent.change(agreement, { target: { value: "outright" } });

    expect(
      within(dialog).queryByRole("textbox", { name: "Balance owed" }),
    ).not.toBeInTheDocument();

    commit(field("Value", dialog), "12,000");
    commit(field("Depreciation", dialog), "20");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveCar).toHaveBeenCalledExactlyOnceWith(null, {
      agreement: "outright",
      balance: 0,
      balloon: 0,
      depreciation: 0.2,
      name: "Polo",
      payment: 0,
      rate: 0,
      value: 12000,
    });
    expect(
      screen.getByRole("dialog", { name: "Car added" }),
    ).toHaveAccessibleDescription("Polo");
  });

  it("keeps a refused save open and says why", async () => {
    const onSaved = vi.fn<() => void>();
    vi.mocked(saveCar).mockResolvedValue(
      refused("A pension a salary feeds stays a pension"),
    );
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Polo" } });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
      { target: { value: "outright" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Car not saved" }),
      ).toHaveAccessibleDescription("A pension a salary feeds stays a pension");
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Polo" })).toBeVisible();
  });

  it("tells the caller when it is dismissed, and saves nothing", () => {
    const onDismiss = vi.fn<() => void>();
    renderDialog({ onDismiss });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Polo" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(saveCar).not.toHaveBeenCalled();
  });
  // The ledger hands the dialog its delete, which a car the store holds
  // is offered and reports its own account by, as its row's bin does,
  // saving nothing; a new one has nothing yet to delete.
  it("offers a saved car a delete that reports its asset, and a new one none", () => {
    const onDelete = vi.fn<(asset: Account) => void>();
    const view = renderDialog({ car, onDelete });

    fireEvent.click(
      within(openDialog()).getByRole("button", { name: "Delete" }),
    );

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(car.asset);
    expect(saveCar).not.toHaveBeenCalled();

    view.unmount();
    renderDialog({ onDelete });

    expect(
      within(openDialog()).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });
});
