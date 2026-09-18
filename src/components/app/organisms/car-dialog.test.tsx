import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Car } from "@/data/cars";

import { saveCar } from "@/app/(app)/accounts/actions";
import { Toaster } from "@/components/kit/toast";

import { CarDialog } from "./car-dialog";

vi.mock("@/app/(app)/accounts/actions", () => ({ saveCar: vi.fn() }));

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

const car: Car = { asset: golf, loan: finance };

const workedHint = "Worked out from the other two";

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function field(dialog: HTMLElement, name: string): HTMLElement {
  return within(dialog).getByRole("textbox", { name });
}

function open(): HTMLElement {
  return screen.getByRole("dialog");
}

// The dialog as the ledger mounts it, on a new car or one to edit, with
// spies where the ledger listens. Save reports through the toast
// manager, which needs its Toaster mounted.
function renderDialog(
  opening: Car | null = null,
  onSaved: () => void = vi.fn<() => void>(),
  onDismiss: () => void = vi.fn<() => void>(),
): void {
  render(
    <Toaster>
      <CarDialog car={opening} onDismiss={onDismiss} onSaved={onSaved} />
    </Toaster>,
  );
}

// The store's answer to a save: the car's own account as it now has
// it. A test waits for the caller to be told before reading the toast,
// since the telling is a transition that lands after it.
function saved(account: Account): void {
  vi.mocked(saveCar).mockResolvedValue(account);
}

describe("CarDialog", () => {
  it("opens a blank car on a PCP with the payment worked out and the save held", () => {
    renderDialog();
    const dialog = open();

    expect(within(dialog).getByText("New car")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Untitled car" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
    ).toHaveValue("pcp");
    expect(field(dialog, "Balance owed")).toHaveValue("£0");
    expect(field(dialog, "Rate")).toHaveValue("0.00%");
    expect(field(dialog, "Monthly payment")).toHaveValue("£0");
    expect(field(dialog, "Monthly payment")).toHaveAccessibleDescription(
      workedHint,
    );
    expect(field(dialog, "Years left")).toHaveValue("4");
    expect(field(dialog, "Balloon")).toHaveValue("£0");
  });

  // £14,000 at 7.9% over three years towards a £6,000 balloon is £290 a
  // month, to the pound, and carried on clears the whole in 4.9 years.
  it("works the payment out from the balance, balloon, rate and term, and saves a new car with its PCP", async () => {
    const onSaved = vi.fn<() => void>();
    renderDialog(null, onSaved);
    const dialog = open();

    fireEvent.change(field(dialog, "Name"), { target: { value: " Golf " } });
    commit(field(dialog, "Value"), "18,000");
    commit(field(dialog, "Depreciation"), "15");
    commit(field(dialog, "Balance owed"), "14,000");
    commit(field(dialog, "Balloon"), "6,000");
    commit(field(dialog, "Rate"), "7.9");
    commit(field(dialog, "Years left"), "3");

    expect(
      within(dialog).getByRole("heading", { name: "Golf" }),
    ).toBeInTheDocument();
    expect(field(dialog, "Monthly payment")).toHaveValue("£290");
    expect(field(dialog, "Monthly payment")).toHaveAccessibleDescription(
      workedHint,
    );
    expect(field(dialog, "Balloon")).toHaveAccessibleDescription(
      "Refinanced on the same terms when the agreement ends, so the payments run 4.9 years in all",
    );

    // The store's answer is held back, so the save can be seen in flight.
    let answer!: (account: Account) => void;
    vi.mocked(saveCar).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
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

    answer(golf);

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
    const dialog = open();

    expect(within(dialog).getByText("Edit car")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Golf" }),
    ).toBeInTheDocument();
    expect(field(dialog, "Name")).toHaveValue("Golf");
    expect(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
    ).toHaveValue("pcp");
    expect(field(dialog, "Value")).toHaveValue("£18,000");
    expect(field(dialog, "Depreciation")).toHaveValue("15.00%");
    expect(field(dialog, "Balance owed")).toHaveValue("£14,000");
    expect(field(dialog, "Rate")).toHaveValue("7.90%");
    expect(field(dialog, "Monthly payment")).toHaveValue("£290");
    expect(field(dialog, "Years left")).toHaveValue("3");
    expect(field(dialog, "Years left")).toHaveAccessibleDescription(workedHint);
    expect(field(dialog, "Balloon")).toHaveValue("£6,000");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    commit(field(dialog, "Value"), "16,000");
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
    const dialog = open();

    expect(
      within(dialog).getByRole("combobox", { name: "Agreement" }),
    ).toHaveValue("loan");
    expect(
      within(dialog).queryByRole("textbox", { name: "Balloon" }),
    ).not.toBeInTheDocument();
    expect(field(dialog, "Years left")).toHaveValue("3");

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
    const dialog = open();

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
    const dialog = open();

    fireEvent.change(field(dialog, "Name"), { target: { value: "Golf" } });
    commit(field(dialog, "Balance owed"), "14,000");
    commit(field(dialog, "Balloon"), "6,000");
    commit(field(dialog, "Years left"), "3");
    commit(field(dialog, "Monthly payment"), "290");

    expect(field(dialog, "Rate")).toHaveValue("7.92%");
    expect(field(dialog, "Rate")).toHaveAccessibleDescription(workedHint);
    expect(field(dialog, "Monthly payment")).toHaveAccessibleDescription(
      "A month",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();

    commit(field(dialog, "Monthly payment"), "200");

    expect(field(dialog, "Rate")).toHaveValue("");
    expect(field(dialog, "Rate")).toHaveAttribute("aria-invalid", "true");
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
    const dialog = open();

    fireEvent.change(field(dialog, "Name"), { target: { value: "Golf" } });
    commit(field(dialog, "Balance owed"), "14,000");
    commit(field(dialog, "Balloon"), "6,000");
    commit(field(dialog, "Rate"), "7.9");
    commit(field(dialog, "Monthly payment"), "290");

    expect(field(dialog, "Years left")).toHaveValue("3");
    expect(field(dialog, "Years left")).toHaveAccessibleDescription(workedHint);

    commit(field(dialog, "Monthly payment"), "90");

    expect(field(dialog, "Years left")).toHaveValue("");
    expect(field(dialog, "Years left")).toHaveAccessibleDescription(
      "Never reaches the balloon at this payment, so the payments run to the end of the plan",
    );
    expect(field(dialog, "Balloon")).toHaveAccessibleDescription(
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
    const dialog = open();
    const worked = (name: string): void => {
      expect(field(dialog, name)).toHaveAccessibleDescription(workedHint);
    };

    commit(field(dialog, "Balance owed"), "14,000");
    commit(field(dialog, "Balloon"), "6,000");
    worked("Monthly payment");

    commit(field(dialog, "Monthly payment"), "290");
    worked("Years left");

    commit(field(dialog, "Rate"), "7.9");
    worked("Years left");

    commit(field(dialog, "Years left"), "3");
    worked("Monthly payment");

    commit(field(dialog, "Monthly payment"), "290");
    worked("Rate");

    commit(field(dialog, "Years left"), "4");
    worked("Rate");

    commit(field(dialog, "Rate"), "7.9");
    worked("Monthly payment");

    commit(field(dialog, "Rate"), "7");
    worked("Monthly payment");
  });

  // The balloon typed on a PCP goes with the agreement: a car made a
  // loan saves none, whatever the hidden field holds.
  it("saves a car owned outright as the asset alone, and a loan with no balloon", async () => {
    const onSaved = vi.fn<() => void>();
    saved({ ...golf, id: 8, name: "Polo" });
    renderDialog(null, onSaved);
    const dialog = open();
    const agreement = within(dialog).getByRole("combobox", {
      name: "Agreement",
    });

    fireEvent.change(field(dialog, "Name"), { target: { value: "Polo" } });
    commit(field(dialog, "Balance owed"), "10,000");
    commit(field(dialog, "Balloon"), "4,000");
    commit(field(dialog, "Rate"), "6.9");
    fireEvent.change(agreement, { target: { value: "loan" } });

    expect(
      within(dialog).queryByRole("textbox", { name: "Balloon" }),
    ).not.toBeInTheDocument();
    expect(field(dialog, "Monthly payment")).toHaveValue("£239");

    fireEvent.change(agreement, { target: { value: "outright" } });

    expect(
      within(dialog).queryByRole("textbox", { name: "Balance owed" }),
    ).not.toBeInTheDocument();

    commit(field(dialog, "Value"), "12,000");
    commit(field(dialog, "Depreciation"), "20");
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
    vi.mocked(saveCar).mockRejectedValue(
      new Error("A pension a salary feeds stays a pension"),
    );
    renderDialog(null, onSaved);
    const dialog = open();

    fireEvent.change(field(dialog, "Name"), { target: { value: "Polo" } });
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
    const dialog = open();

    fireEvent.change(field(dialog, "Name"), { target: { value: "Polo" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(saveCar).not.toHaveBeenCalled();
  });
});
