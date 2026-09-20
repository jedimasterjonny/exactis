import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AccountKind, AccountValues, Funding } from "@/data/accounts";

import { AccountFields } from "./account-fields";

const isa: AccountValues = {
  balance: 12000,
  balloon: 0,
  cadence: "month",
  cap: 0,
  contribution: 500,
  funding: "fixed",
  growth: "plan",
  kind: "tax-free",
  name: "ISA",
  rate: 0,
};

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

// The fields as the dialog would mount them, opened on an account and
// shown the draft that mirrors them, with spies where the ledger listens.
function renderFields(
  initial: AccountValues,
  draft: AccountValues = initial,
  { isFed = false, kindLock }: { isFed?: boolean; kindLock?: string } = {},
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(patch: Partial<AccountValues>) => void>
  >;
  readonly onFundingChange: ReturnType<
    typeof vi.fn<(funding: Funding) => void>
  >;
  readonly onKindChange: ReturnType<typeof vi.fn<(kind: AccountKind) => void>>;
} {
  const onAmend = vi.fn<(patch: Partial<AccountValues>) => void>();
  const onFundingChange = vi.fn<(funding: Funding) => void>();
  const onKindChange = vi.fn<(kind: AccountKind) => void>();
  render(
    <AccountFields
      draft={draft}
      initial={initial}
      isFed={isFed}
      kindLock={kindLock}
      onAmend={onAmend}
      onFundingChange={onFundingChange}
      onKindChange={onKindChange}
    >
      <p>What the salaries sacrifice</p>
    </AccountFields>,
  );
  return { onAmend, onFundingChange, onKindChange };
}

describe("AccountFields", () => {
  it("mounts every field on the account it opened with and reports each change", () => {
    const { onAmend, onFundingChange, onKindChange } = renderFields(isa);

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("ISA");
    expect(screen.getByRole("combobox", { name: "Treatment" })).toHaveValue(
      "tax-free",
    );
    expect(screen.getByRole("textbox", { name: "Balance" })).toHaveValue(
      "£12,000",
    );
    expect(screen.getByRole("combobox", { name: "Contribution" })).toHaveValue(
      "fixed",
    );
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("£500");
    expect(screen.getByRole("combobox", { name: "Cadence" })).toHaveValue(
      "month",
    );
    expect(screen.getByRole("combobox", { name: "Growth" })).toHaveValue(
      "plan",
    );
    expect(
      screen.queryByRole("textbox", { name: "Rate" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Lifetime ISA" },
    });
    commit(screen.getByRole("textbox", { name: "Balance" }), "13,000");
    commit(screen.getByRole("textbox", { name: "Amount" }), "600");
    fireEvent.change(screen.getByRole("combobox", { name: "Cadence" }), {
      target: { value: "year" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Growth" }), {
      target: { value: "fixed" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Treatment" }), {
      target: { value: "cash" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Contribution" }), {
      target: { value: "spare" },
    });

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { name: "Lifetime ISA" },
      { balance: 13000 },
      { contribution: 600 },
      { cadence: "year" },
      { growth: "fixed", rate: 0 },
    ]);
    expect(onKindChange).toHaveBeenCalledExactlyOnceWith("cash");
    expect(onFundingChange).toHaveBeenCalledExactlyOnceWith("spare");
  });

  it("asks for a cap with the kind's allowance when the draft is paid the spare money", () => {
    const { onAmend } = renderFields(
      { ...isa, funding: "spare" },
      { ...isa, funding: "spare" },
    );

    expect(
      screen.queryByRole("textbox", { name: "Amount" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Cap, a year" }),
    ).toHaveAccessibleDescription("Leave at nothing for the £20,000 allowance");

    commit(screen.getByRole("textbox", { name: "Cap, a year" }), "4,000");

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({ cap: 4000 });
  });

  it("asks for no cap at all for cash, and for a rate at a fixed growth", () => {
    const { onAmend } = renderFields({
      ...isa,
      funding: "spare",
      growth: "fixed",
      kind: "cash",
      rate: 0.02,
    });

    expect(
      screen.getByRole("textbox", { name: "Cap, a year" }),
    ).toHaveAccessibleDescription("Leave at nothing for no cap");
    expect(screen.getByRole("textbox", { name: "Rate" })).toHaveValue("2.00%");

    commit(screen.getByRole("textbox", { name: "Rate" }), "3");

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({ rate: 0.03 });
  });

  it("locks the treatment when given a reason, and says it", () => {
    const pension: AccountValues = { ...isa, kind: "tax-deferred" };
    renderFields(pension, pension, { kindLock: "Fed by Salary" });

    const treatment = screen.getByRole("combobox", { name: "Treatment" });

    expect(treatment).toBeDisabled();
    expect(treatment).toHaveValue("tax-deferred");
    expect(treatment).toHaveAccessibleDescription("Fed by Salary");
  });

  // A fed pension's own contribution is paid on top of the sacrifice,
  // and a fixed sum of nothing is the usual case rather than an
  // unfilled field, so the choice and the sum say so; an account
  // nothing feeds says what it did.
  it("says a fed pension's own contribution is on top of the sacrifice", () => {
    const workplace = { ...isa, kind: "tax-deferred" } as const;
    renderFields(workplace, workplace, {
      isFed: true,
      kindLock: "Fed by Salary",
    });
    const choice = screen.getByRole("combobox", { name: "Contribution" });

    expect(choice).toHaveAccessibleDescription(
      "Paid in on top of the salary sacrifice",
    );
    expect(
      within(choice)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["A fixed sum, or nothing", "Spare money"]);
    expect(
      screen.getByRole("textbox", { name: "Amount" }),
    ).toHaveAccessibleDescription("Leave at nothing for none on top");
  });

  it("puts what the dialog adds beside the growth, after every other field", () => {
    renderFields(isa);

    // The matches come in document order, which is the order read.
    expect(
      screen
        .getAllByText(/^(Balance|Growth|What the salaries sacrifice)$/)
        .map((element) => element.textContent),
    ).toStrictEqual(["Balance", "Growth", "What the salaries sacrifice"]);
    expect(
      screen.getByRole("combobox", { name: "Contribution" }),
    ).toHaveAccessibleDescription(
      "Spare money is what a month's income leaves after the expenses and every fixed sum",
    );
    expect(
      screen.getByRole("textbox", { name: "Amount" }),
    ).toHaveAccessibleDescription("Leave at nothing for none");
  });

  it("offers an asset no contribution choice", () => {
    renderFields({ ...isa, kind: "real-asset" });

    expect(
      screen.queryByRole("combobox", { name: "Contribution" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("£500");
  });
});
