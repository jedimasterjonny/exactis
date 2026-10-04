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
import type { Answer } from "@/lib/answer";

import { saveAccount } from "@/actions/accounts";
import { Toaster } from "@/components/kit/toast";
import { accounts } from "@/data/accounts.fixture";
import { incomeLines } from "@/data/income.fixture";
import { owners, sam } from "@/data/owners.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field, openDialog } from "@/test/dom";

import { AccountDialog } from "./account-dialog";

vi.mock("@/actions/accounts", () => ({ saveAccount: vi.fn() }));

const [pension, isa] = accounts;

// The fixture's salary, which feeds the workplace pension.
const [salary] = incomeLines;

// The ISA paid the spare money up to a cap, for the treatment that takes
// the choice away and the one that brings it back.
const spared: Account = { ...isa, contribution: { cap: 4000, kind: "spare" } };

function choice(dialog: HTMLElement, name: string): HTMLElement {
  return within(dialog).getByRole("combobox", { name });
}

// The dialog as the ledger mounts it, on a new account or one to edit,
// with spies where the ledger listens. Save reports through the toast
// manager, which needs its Toaster mounted. The income lines are the
// ledger's, and matter only to the treatment a salary holds, so they are
// none but in the test that has one.
function renderDialog(
  props: Partial<ComponentProps<typeof AccountDialog>> = {},
): RenderResult {
  return render(
    <AccountDialog
      account={null}
      lines={[]}
      onDismiss={vi.fn<() => void>()}
      onSaved={vi.fn<(account: Account) => void>()}
      owners={owners}
      {...props}
    />,
    { wrapper: Toaster },
  );
}

describe("AccountDialog", () => {
  it("opens a blank account with the save held until it is named", () => {
    renderDialog();
    const dialog = openDialog();

    expect(within(dialog).getByText("New account")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Untitled account" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(choice(dialog, "Type")).toHaveValue("tax-deferred");
    expect(choice(dialog, "Type")).toBeEnabled();
    expect(field("Balance", dialog)).toHaveValue("£0");
    expect(choice(dialog, "Growth")).toHaveValue("plan");
    expect(
      within(dialog).queryByRole("textbox", { name: "Rate" }),
    ).not.toBeInTheDocument();

    fireEvent.change(field("Name", dialog), { target: { value: "Premium" } });

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  // The name is saved as typed less the space around it, which is what
  // the title shows.
  it("holds a new account's save in flight and reports it added", async () => {
    const onSaved = vi.fn<(account: Account) => void>();
    const stored: Account = {
      balance: 4000,
      growth: { kind: "plan" },
      id: 6,
      kind: "tax-free",
      name: "Lifetime ISA",
    };
    renderDialog({ onSaved });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), {
      target: { value: " Lifetime ISA " },
    });
    fireEvent.change(choice(dialog, "Type"), { target: { value: "tax-free" } });
    commit(field("Balance", dialog), "4,000");

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
      cadence: "year",
      cap: 0,
      contribution: 0,
      funding: "fixed",
      growth: "plan",
      isAlwaysFunded: false,
      kind: "tax-free",
      name: "Lifetime ISA",
      owner: 1,
      rate: 0,
      shares: [],
    });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(onSaved).not.toHaveBeenCalled();

    answer(saved(stored));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledExactlyOnceWith(stored);
    });
    expect(
      screen.getByRole("dialog", { name: "Account added" }),
    ).toHaveAccessibleDescription("Lifetime ISA");
  });

  // The entry doubles as the open state, so the dialog has nothing left
  // to show once the save has dropped it; the caller unmounts it on the
  // same word.
  it("opens an account on its values, writes the edit back and closes", async () => {
    const onSaved = vi.fn<(account: Account) => void>();
    vi.mocked(saveAccount).mockResolvedValue(
      saved({ ...pension, balance: 420000 }),
    );
    renderDialog({ account: pension, onSaved });
    const dialog = openDialog();

    expect(within(dialog).getByText("Edit account")).toHaveClass("text-brand");
    expect(field("Name", dialog)).toHaveValue("Workplace pension");
    expect(choice(dialog, "Type")).toHaveValue("tax-deferred");
    expect(field("Balance", dialog)).toHaveValue("£412,880");
    expect(choice(dialog, "Contribution")).toHaveValue("fixed");
    expect(field("Amount", dialog)).toHaveValue("£27,195");
    expect(choice(dialog, "Cadence")).toHaveValue("year");

    commit(field("Balance", dialog), "420,000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveAccount).toHaveBeenCalledExactlyOnceWith(pension.id, {
      balance: 420000,
      balloon: 0,
      cadence: "year",
      cap: 0,
      contribution: 27195,
      funding: "fixed",
      growth: "plan",
      isAlwaysFunded: false,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
      rate: 0,
      shares: [],
    });
    expect(
      screen.getByRole("dialog", { name: "Account updated" }),
    ).toHaveAccessibleDescription("Workplace pension");
    expect(
      screen.queryByRole("dialog", { name: "Workplace pension" }),
    ).not.toBeInTheDocument();
  });

  // The fields a contribution choice shows mount with what the account
  // opened with, and the ones it leaves behind go back to nothing.
  it("pays the spare money to a cap, and brings the sum back with the fixed choice", () => {
    renderDialog({ account: isa });
    const dialog = openDialog();

    fireEvent.change(choice(dialog, "Contribution"), {
      target: { value: "spare" },
    });

    expect(
      within(dialog).queryByRole("textbox", { name: "Amount" }),
    ).not.toBeInTheDocument();
    expect(field("Cap, a year", dialog)).toHaveValue("£0");
    expect(field("Cap, a year", dialog)).toHaveAccessibleDescription(
      "Up to the £20,000 allowance, or nothing for all of it",
    );

    commit(field("Cap, a year", dialog), "9,000");
    fireEvent.change(choice(dialog, "Contribution"), {
      target: { value: "fixed" },
    });

    expect(field("Amount", dialog)).toHaveValue("£20,000");
    expect(choice(dialog, "Cadence")).toHaveValue("year");
  });

  // The choice leaves with the asset treatment: an ISA paid the spare
  // money made a debt is paid a fixed sum of nothing, as it opened, and
  // made cash again is paid the spare money to the cap it opened with,
  // which is what the choice mounts showing. A change that stays among
  // the wrappers and cash leaves what was typed where it is.
  it("drops the spare money with an asset treatment and brings it back with a wrapper's", () => {
    renderDialog({ account: spared });
    const dialog = openDialog();
    const treatment = choice(dialog, "Type");

    expect(field("Cap, a year", dialog)).toHaveValue("£4,000");

    fireEvent.change(treatment, { target: { value: "debt" } });

    expect(
      within(dialog).queryByRole("combobox", { name: "Contribution" }),
    ).not.toBeInTheDocument();
    expect(field("Amount", dialog)).toHaveValue("£0");

    fireEvent.change(treatment, { target: { value: "real-asset" } });
    commit(field("Amount", dialog), "100");
    fireEvent.change(treatment, { target: { value: "cash" } });

    expect(choice(dialog, "Contribution")).toHaveValue("spare");
    expect(field("Cap, a year", dialog)).toHaveValue("£4,000");

    fireEvent.change(choice(dialog, "Contribution"), {
      target: { value: "fixed" },
    });
    commit(field("Amount", dialog), "250");
    fireEvent.change(treatment, { target: { value: "tax-free" } });

    expect(field("Amount", dialog)).toHaveValue("£250");
  });

  // A pension a salary feeds stays a pension until the salary is
  // unlinked, which the store refuses to do from here and the reason
  // says, naming the salaries.
  it("holds the treatment of a pension a salary feeds", () => {
    renderDialog({ account: pension, lines: [salary] });
    const treatment = choice(openDialog(), "Type");

    expect(treatment).toBeDisabled();
    expect(treatment).toHaveAccessibleDescription(
      "Fed by Salary; set the pension to none on the salary to change it",
    );
  });

  // Nothing can feed an account the store has not given an id yet, and a
  // line feeding no pension holds null where an id would be, so a new
  // account asked under its absent id would be held by every such line.
  // The fixture has three of them.
  it("leaves a new account's treatment free beside lines that feed no pension", () => {
    renderDialog({ lines: incomeLines });
    const treatment = choice(openDialog(), "Type");

    expect(treatment).toBeEnabled();
    expect(treatment).not.toHaveAccessibleDescription();
  });

  // A fed pension's dialog carries each salary's share beneath the
  // account's own fields, mounted on the share the salary holds, with
  // what it lands a year moving as the share is typed, and the shares
  // go to the store with the account. An account nothing feeds, and a
  // new one, carry none.
  it("edits the share a salary sacrifices into the pension, and saves it with the account", async () => {
    const onSaved = vi.fn<(account: Account) => void>();
    vi.mocked(saveAccount).mockResolvedValue(saved(pension));
    renderDialog({
      account: pension,
      lines: [salary, { ...salary, id: 5, name: "Second job" }],
      onSaved,
    });
    const dialog = openDialog();

    expect(choice(dialog, "Contribution")).toHaveAccessibleDescription(
      "Paid in on top of the salary sacrifice",
    );
    expect(field("Sacrificed from Salary", dialog)).toHaveValue("10.00%");
    expect(field("Sacrificed from Salary", dialog)).toHaveAccessibleDescription(
      "Of its £120,000 base; £13,800 a year lands with the NI saved",
    );
    expect(field("Sacrificed from Second job", dialog)).toHaveValue("10.00%");

    commit(field("Sacrificed from Salary", dialog), "8");

    expect(field("Sacrificed from Salary", dialog)).toHaveAccessibleDescription(
      "Of its £120,000 base; £11,040 a year lands with the NI saved",
    );
    expect(
      field("Sacrificed from Second job", dialog),
    ).toHaveAccessibleDescription(
      "Of its £120,000 base; £13,800 a year lands with the NI saved",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveAccount).toHaveBeenCalledExactlyOnceWith(pension.id, {
      balance: 412880,
      balloon: 0,
      cadence: "year",
      cap: 0,
      contribution: 27195,
      funding: "fixed",
      growth: "plan",
      isAlwaysFunded: false,
      kind: "tax-deferred",
      name: "Workplace pension",
      owner: 1,
      rate: 0,
      shares: [{ line: 1, sacrifice: 0.08 }],
    });
  });

  // A share sent as it opened would write the opening back over an
  // edit made to the salary meanwhile, so an edit to the account alone
  // sends none, and a share typed back to what it opened with is not
  // a change.
  it("sends no share it did not change", async () => {
    const onSaved = vi.fn<(account: Account) => void>();
    vi.mocked(saveAccount).mockResolvedValue(saved(pension));
    renderDialog({ account: pension, lines: [salary], onSaved });
    const dialog = openDialog();

    commit(field("Balance", dialog), "420,000");
    commit(field("Sacrificed from Salary", dialog), "8");
    commit(field("Sacrificed from Salary", dialog), "10");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(saveAccount).toHaveBeenCalledExactlyOnceWith(
      pension.id,
      expect.objectContaining({ balance: 420000, shares: [] }),
    );
  });

  it("carries no shares for an account nothing feeds", () => {
    renderDialog({ account: isa, lines: incomeLines });

    expect(
      within(openDialog()).queryByRole("textbox", { name: /^Sacrificed from/ }),
    ).not.toBeInTheDocument();
    expect(choice(openDialog(), "Contribution")).toHaveAccessibleDescription(
      "Spare money is what a month's income leaves after the expenses and every fixed sum",
    );
  });

  it("keeps a refused save open and says why", async () => {
    const onSaved = vi.fn<(account: Account) => void>();
    vi.mocked(saveAccount).mockResolvedValue(
      refused("A pension a salary feeds stays a pension"),
    );
    renderDialog({ account: pension, onSaved });
    const dialog = openDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Account not saved" }),
      ).toHaveAccessibleDescription("A pension a salary feeds stays a pension");
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Workplace pension" }),
    ).toBeVisible();
  });

  // A deletion asked for over a save in flight would race it, so the
  // Delete holds while the save is on its way.
  it("holds a saved account's delete while its save is on its way", async () => {
    renderDialog({
      account: isa,
      onDelete: vi.fn<(account: Account) => void>(),
    });
    // The store's answer is held back, so the save can be seen in flight,
    // and given at the end, so no save is left on its way.
    const { promise, resolve: answer } =
      Promise.withResolvers<Answer<Account>>();
    vi.mocked(saveAccount).mockReturnValue(promise);
    const dialog = openDialog();

    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeDisabled();

    answer(saved(isa));

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Stocks & shares ISA" }),
      ).not.toBeInTheDocument();
    });
  });

  it("tells the caller when it is dismissed, and saves nothing", () => {
    const onDismiss = vi.fn<() => void>();
    renderDialog({ onDismiss });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Premium" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(saveAccount).not.toHaveBeenCalled();
  });

  // An ISA or a pension names its owner, a new one the first; a wrapper
  // made another keeps the owner chosen, one made cash sheds it with
  // its field, and the save sends what the draft is left with.
  it("names a wrapper's owner, keeps it between wrappers and drops it with cash", async () => {
    const onSaved = vi.fn<(account: Account) => void>();
    renderDialog({ onSaved, owners: [...owners, sam] });
    const dialog = openDialog();
    vi.mocked(saveAccount).mockResolvedValue(saved(pension));

    expect(choice(dialog, "Owner")).toHaveValue("1");

    fireEvent.change(field("Name", dialog), { target: { value: "ISA" } });
    fireEvent.change(choice(dialog, "Owner"), { target: { value: "2" } });
    fireEvent.change(choice(dialog, "Type"), { target: { value: "tax-free" } });

    expect(choice(dialog, "Owner")).toHaveValue("2");

    fireEvent.change(choice(dialog, "Type"), { target: { value: "cash" } });

    expect(
      within(dialog).queryByRole("combobox", { name: "Owner" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(vi.mocked(saveAccount).mock.calls[0]?.[1]).toMatchObject({
      kind: "cash",
      owner: null,
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
  });

  // A pension always funded made cash is not, since only a pension may
  // be, and the choice leaves with the treatment.
  it("drops the mark of a pension always funded with another treatment", async () => {
    const onSaved = vi.fn<(account: Account) => void>();
    renderDialog({ account: { ...pension, isAlwaysFunded: true }, onSaved });
    const dialog = openDialog();
    vi.mocked(saveAccount).mockResolvedValue(saved(pension));

    expect(choice(dialog, "When short")).toHaveTextContent("Always fund it");

    fireEvent.change(choice(dialog, "Type"), { target: { value: "cash" } });

    expect(
      within(dialog).queryByRole("combobox", { name: "When short" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(vi.mocked(saveAccount).mock.calls[0]?.[1]).toMatchObject({
      isAlwaysFunded: false,
      kind: "cash",
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
  });

  // Made cash and then a pension again, it is always funded as it
  // opened, which the choice mounts showing, and saves so.
  it("brings the mark back as it opened when a pension is chosen again", async () => {
    const onSaved = vi.fn<(account: Account) => void>();
    renderDialog({ account: { ...pension, isAlwaysFunded: true }, onSaved });
    const dialog = openDialog();
    vi.mocked(saveAccount).mockResolvedValue(saved(pension));

    fireEvent.change(choice(dialog, "Type"), { target: { value: "cash" } });
    fireEvent.change(choice(dialog, "Type"), {
      target: { value: "tax-deferred" },
    });

    expect(choice(dialog, "When short")).toHaveTextContent("Always fund it");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(vi.mocked(saveAccount).mock.calls[0]?.[1]).toMatchObject({
      isAlwaysFunded: true,
      kind: "tax-deferred",
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
  });

  // A cash account made a wrapper takes the first owner, which its field
  // mounts showing.
  it("gives an account made a wrapper the first owner", async () => {
    const onSaved = vi.fn<(account: Account) => void>();
    renderDialog({
      account: {
        balance: 18300,
        growth: { kind: "fixed", rate: 0 },
        id: 3,
        kind: "cash",
        name: "Current account",
      },
      onSaved,
    });
    const dialog = openDialog();
    vi.mocked(saveAccount).mockResolvedValue(saved(isa));

    fireEvent.change(choice(dialog, "Type"), { target: { value: "tax-free" } });

    expect(choice(dialog, "Owner")).toHaveValue("1");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(vi.mocked(saveAccount).mock.calls[0]?.[1]).toMatchObject({
      kind: "tax-free",
      owner: 1,
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
  });

  // With no owner to give it, a wrapper cannot be saved, and the field
  // says where one is added; an account nobody owns saves as it did.
  it("holds a wrapper's save while the plan has no owner", () => {
    renderDialog({ owners: [] });
    const dialog = openDialog();

    fireEvent.change(field("Name", dialog), { target: { value: "Premium" } });

    expect(choice(dialog, "Owner")).toBeDisabled();
    expect(choice(dialog, "Owner")).toHaveAccessibleDescription(
      "Add one in the owners section first",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(choice(dialog, "Type"), { target: { value: "cash" } });

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  // A fixed sum past its allowance on its own is held at the save, as
  // the store would refuse it; the amount's hint says the most.
  it("holds the save of a fixed sum past its allowance", () => {
    renderDialog({ account: isa });
    const dialog = openDialog();

    commit(field("Amount", dialog), "20,001");

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    commit(field("Amount", dialog), "20,000");

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });
  // The ledger hands the dialog its delete, which an account the store
  // holds is offered and reports the account by, saving nothing; a new
  // one has nothing yet to delete.
  it("offers a saved account a delete that reports it, and a new one none", () => {
    const onDelete = vi.fn<(account: Account) => void>();
    const view = renderDialog({ account: isa, onDelete });

    fireEvent.click(
      within(openDialog()).getByRole("button", { name: "Delete" }),
    );

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(isa);
    expect(saveAccount).not.toHaveBeenCalled();

    view.unmount();
    renderDialog({ onDelete });

    expect(
      within(openDialog()).queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });
});
