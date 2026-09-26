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
import { saved as accepted, refused } from "@/lib/answer";
import { commit, field, openDialog } from "@/test/dom";
import { heldBack } from "@/test/held-back";

import { CarDialog } from "./car-dialog";

vi.mock("@/actions/accounts", () => ({ saveCar: vi.fn() }));

// A Golf worth £18,000 losing 15% a year, with the finance secured on
// it: £14,000 owed at 7.9%, paying £290 a month towards a £6,000
// balloon, which it reaches in three years.
const golf: Account = {
  balance: 18000,
  growth: { kind: "fixed", rate: -0.15 },
  id: 6,
  kind: "car",
  name: "Golf",
};

const loan: Account = {
  balance: -14000,
  contribution: { amount: 438, cadence: "month", kind: "fixed" },
  growth: { kind: "fixed", rate: 0.079 },
  id: 7,
  kind: "debt",
  name: "Golf loan",
  secures: golf.id,
};

const finance: Account = {
  ...loan,
  balloon: 6000,
  contribution: { amount: 290, cadence: "month", kind: "fixed" },
  name: "Golf PCP",
};

const car: Secured = { asset: golf, loan: finance };

// The month the plan is read in, September 2026, which the end of the
// term is counted from.
const plan = { from: 2026, month: 8 };

const workedHint = "Worked out from the other two";

// The dialog as the ledger mounts it, on a new car or one to edit, with
// spies where the ledger listens. Save reports through the toast
// manager, which needs its Toaster mounted.
function renderDialog(
  opening: null | Secured = null,
  onSaved: () => void = vi.fn<() => void>(),
  onDismiss: () => void = vi.fn<() => void>(),
): void {
  render(
    <Toaster>
      <CarDialog
        car={opening}
        onDismiss={onDismiss}
        onSaved={onSaved}
        plan={plan}
      />
    </Toaster>,
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
    expect(field("Years left", dialog)).toHaveValue("4");
    expect(field("Balloon", dialog)).toHaveValue("£0");
  });

  // £14,000 at 7.9% over three years towards a £6,000 balloon is £290 a
  // month, to the pound, and carried on clears the whole in 4.9 years.
  it("works the payment out from the balance, balloon, rate and term, and saves a new car with its PCP", async () => {
    const onSaved = vi.fn<() => void>();
    renderDialog(null, onSaved);
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: " Golf " } });
    commit(field("Value", dialog), "18,000");
    commit(field("Depreciation", dialog), "15");
    commit(field("Balance owed", dialog), "14,000");
    commit(field("Balloon", dialog), "6,000");
    commit(field("Rate", dialog), "7.9");
    commit(field("Years left", dialog), "3");

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
    const { answer, promise } = heldBack<Answer<Account>>();
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
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
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
    renderDialog(car, onSaved);
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
    expect(field("Years left", dialog)).toHaveValue("3");
    expect(field("Years left", dialog)).toHaveAccessibleDescription(workedHint);
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
    renderDialog({ ...car, loan }, onSaved);
    const dialog = openDialog();

    expect(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
    ).toHaveValue("loan");
    expect(
      within(dialog).queryByRole("textbox", { name: "Balloon" }),
    ).not.toBeInTheDocument();
    expect(field("Years left", dialog)).toHaveValue("3");

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
    renderDialog({ ...car, loan: null });
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
    commit(field("Balance owed", dialog), "14,000");
    commit(field("Balloon", dialog), "6,000");
    commit(field("Years left", dialog), "3");
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
    renderDialog(null, onSaved);
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Golf" } });
    commit(field("Balance owed", dialog), "14,000");
    commit(field("Balloon", dialog), "6,000");
    commit(field("Rate", dialog), "7.9");
    commit(field("Monthly payment", dialog), "290");

    expect(field("Years left", dialog)).toHaveValue("3");
    expect(field("Years left", dialog)).toHaveAccessibleDescription(workedHint);

    commit(field("Monthly payment", dialog), "90");

    expect(field("Years left", dialog)).toHaveValue("");
    expect(field("Years left", dialog)).toHaveAccessibleDescription(
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

  // Whichever two of the three were typed last stand, and the third is
  // worked out, so typing a figure that was worked out hands the working
  // to the one left alone longest. The balloon is none of the three, so
  // typing it hands nothing over.
  it("keeps the two figures typed last and works out the third", () => {
    renderDialog();
    const dialog = openDialog();
    const worked = (name: string): void => {
      expect(field(name, dialog)).toHaveAccessibleDescription(workedHint);
    };

    commit(field("Balance owed", dialog), "14,000");
    commit(field("Balloon", dialog), "6,000");
    worked("Monthly payment");

    commit(field("Monthly payment", dialog), "290");
    worked("Years left");

    commit(field("Rate", dialog), "7.9");
    worked("Years left");

    commit(field("Years left", dialog), "3");
    worked("Monthly payment");

    commit(field("Monthly payment", dialog), "290");
    worked("Rate");

    commit(field("Years left", dialog), "4");
    worked("Rate");

    commit(field("Rate", dialog), "7.9");
    worked("Monthly payment");

    commit(field("Rate", dialog), "7");
    worked("Monthly payment");
  });

  // The balloon typed on a PCP goes with the agreement: a car made a
  // loan saves none, whatever the hidden field holds.
  it("saves a car owned outright as the asset alone, and a loan with no balloon", async () => {
    const onSaved = vi.fn<() => void>();
    saved({ ...golf, id: 8, name: "Polo" });
    renderDialog(null, onSaved);
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
    renderDialog(null, onSaved);
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
    renderDialog(null, vi.fn<() => void>(), onDismiss);
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
    const view = render(
      <Toaster>
        <CarDialog
          car={car}
          onDelete={onDelete}
          onDismiss={vi.fn<() => void>()}
          onSaved={vi.fn<() => void>()}
          plan={plan}
        />
      </Toaster>,
    );

    fireEvent.click(
      within(openDialog()).getByRole("button", { name: "Delete" }),
    );

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(car.asset);
    expect(saveCar).not.toHaveBeenCalled();

    view.unmount();
    render(
      <Toaster>
        <CarDialog
          car={null}
          onDelete={onDelete}
          onDismiss={vi.fn<() => void>()}
          onSaved={vi.fn<() => void>()}
          plan={plan}
        />
      </Toaster>,
    );

    expect(
      within(openDialog()).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });
});
