import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AccountKind, AccountValues, Funding } from "@/data/accounts";

import { owners, sam } from "@/data/owners.fixture";
import { commit } from "@/test/dom";

import type { PortfolioOptions } from "./account-fields";

import { AccountFields } from "./account-fields";

const isa: AccountValues = {
  balance: 12000,
  balloon: 0,
  cadence: "month",
  cap: 0,
  contribution: 500,
  funding: "fixed",
  growth: "plan",
  isDroppable: false,
  kind: "tax-free",
  name: "ISA",
  owner: 1,
  portfolio: null,
  rate: 0,
};

// The fields as the dialog would mount them, opened on an account and
// shown the draft that mirrors them, with spies where the ledger listens.
function renderFields(
  initial: AccountValues,
  draft: AccountValues = initial,
  {
    isFed = false,
    kindLock,
    portfolio,
  }: { isFed?: boolean; kindLock?: string; portfolio?: PortfolioOptions } = {},
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
      owners={[...owners, sam]}
      portfolio={portfolio}
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
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue(
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
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
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

  // An ISA or a pension is asked whose it is, beside its name and
  // treatment, and the choice reports as the owner's id; cash is asked
  // nothing.
  it("asks a wrapper's owner and reports the choice, and asks cash nothing", () => {
    const { onAmend } = renderFields(isa);

    expect(screen.getByRole("combobox", { name: "Owner" })).toHaveValue("1");
    expect(
      screen.getByRole("combobox", { name: "Owner" }),
    ).not.toHaveAccessibleDescription();

    fireEvent.change(screen.getByRole("combobox", { name: "Owner" }), {
      target: { value: "2" },
    });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({ owner: 2 });
  });

  // A pension is asked what it is paid in a month that cannot pay it,
  // beside its balance and its contribution, kept paid unless told
  // otherwise, and the choice reports as whether it is droppable; an
  // ISA is asked nothing of it.
  it("asks a pension what it is paid in a month short of it, and an ISA nothing", () => {
    const { onAmend } = renderFields({ ...isa, kind: "tax-deferred" });
    const shortfall = screen.getByRole("combobox", { name: "When short" });

    expect(shortfall).toHaveTextContent("Draw on the savings");
    expect(shortfall).toHaveAccessibleDescription("From cash, GIAs and ISAs");

    fireEvent.change(shortfall, { target: { value: "dropped" } });

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({ isDroppable: true });

    fireEvent.change(shortfall, { target: { value: "kept" } });

    expect(onAmend).toHaveBeenLastCalledWith({ isDroppable: false });
  });

  // Only a pension kept paid is told where its money comes from, so one
  // whose payments are dropped is told nothing.
  it("says nothing beneath the answer to a month short of it but drawing on the savings", () => {
    const pension: AccountValues = { ...isa, kind: "tax-deferred" };
    renderFields(pension, { ...pension, isDroppable: true });

    expect(
      screen.getByRole("combobox", { name: "When short" }),
    ).not.toHaveAccessibleDescription();
  });

  // A debt's balance is entered negative, which its field says; any
  // other's has nothing to be told about its sign.
  it("says a debt's balance is negative", () => {
    renderFields({ ...isa, kind: "debt", owner: null });

    expect(
      screen.getByRole("textbox", { name: "Balance" }),
    ).toHaveAccessibleDescription("A debt's is negative");
  });

  // A debt is on a lender's rate, as a loan is, so it is offered no
  // growth choice and asks for the rate alone.
  it("offers a debt no growth choice", () => {
    renderFields({ ...isa, growth: "fixed", kind: "debt", owner: null });

    expect(
      screen.queryByRole("combobox", { name: "Growth" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Rate" })).toHaveValue("0.00%");
  });

  it("says nothing of a pension's balance's sign", () => {
    renderFields({ ...isa, kind: "tax-deferred" });

    expect(
      screen.getByRole("textbox", { name: "Balance" }),
    ).not.toHaveAccessibleDescription();
  });

  it("asks an ISA nothing of a month short of it", () => {
    renderFields(isa);

    expect(
      screen.queryByRole("combobox", { name: "When short" }),
    ).not.toBeInTheDocument();
  });

  it("asks nothing of an account nobody owns", () => {
    renderFields({ ...isa, kind: "cash", owner: null });

    expect(
      screen.queryByRole("combobox", { name: "Owner" }),
    ).not.toBeInTheDocument();
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
    ).toHaveAccessibleDescription("Nothing for the full £20,000 allowance");

    commit(screen.getByRole("textbox", { name: "Cap, a year" }), "4,000");

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({ cap: 4000 });
  });

  it("asks for no cap at all for cash, and for a rate at a fixed growth", () => {
    const { onAmend } = renderFields({
      ...isa,
      funding: "spare",
      growth: "fixed",
      isDroppable: false,
      kind: "cash",
      rate: 0.02,
    });

    expect(
      screen.getByRole("textbox", { name: "Cap, a year" }),
    ).not.toHaveAccessibleDescription();
    expect(screen.getByRole("textbox", { name: "Rate" })).toHaveValue("2.00%");

    commit(screen.getByRole("textbox", { name: "Rate" }), "3");

    expect(onAmend).toHaveBeenCalledExactlyOnceWith({ rate: 0.03 });
  });

  // A GIA is offered after the wrappers and before cash, and is asked
  // what cash is asked: no owner, and a cap with no allowance beneath it.
  it("offers a GIA between the ISA and cash, and asks it no owner and no allowance", () => {
    renderFields({ ...isa, funding: "spare", kind: "taxable", owner: null });

    expect(
      within(screen.getByRole("combobox", { name: "Type" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual([
      "Pension (tax-deferred)",
      "ISA (tax-free)",
      "GIA (taxable)",
      "Cash",
      "Real asset",
      "Debt",
    ]);
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue(
      "taxable",
    );
    expect(
      screen.queryByRole("combobox", { name: "Owner" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Cap, a year" }),
    ).not.toHaveAccessibleDescription();
  });

  it("locks the treatment when given a reason, and says it", () => {
    const pension: AccountValues = { ...isa, kind: "tax-deferred" };
    renderFields(pension, pension, { kindLock: "Fed by Salary" });

    const treatment = screen.getByRole("combobox", { name: "Type" });

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
      "On top of the salary sacrifice",
    );
    expect(
      within(choice)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["A fixed sum", "Spare money"]);
    expect(
      screen.getByRole("textbox", { name: "Amount" }),
    ).toHaveAccessibleDescription(
      "At most £48,000 a year, before relief, less the sacrifice",
    );
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
    ).not.toHaveAccessibleDescription();
    expect(
      screen.getByRole("textbox", { name: "Amount" }),
    ).toHaveAccessibleDescription("At most £20,000 a year");
  });

  // The most a fixed sum can be is the allowance for an ISA and four
  // fifths of it for a pension, the rest being the relief; cash has no
  // allowance and is asked only whether it is paid anything.
  it("says the most a wrapper's fixed sum can be a year, and nothing of cash's", () => {
    renderFields({ ...isa, kind: "tax-deferred" });

    expect(
      screen.getByRole("textbox", { name: "Amount" }),
    ).toHaveAccessibleDescription("At most £48,000 a year, before relief");
  });

  it("asks cash's fixed sum nothing but whether there is one", () => {
    renderFields({ ...isa, kind: "cash", owner: null });

    expect(
      screen.getByRole("textbox", { name: "Amount" }),
    ).not.toHaveAccessibleDescription();
  });

  it("offers an asset no contribution choice", () => {
    renderFields({ ...isa, kind: "real-asset" });

    expect(
      screen.queryByRole("combobox", { name: "Contribution" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("£500");
  });

  // Portfolio account selector renders for savings whenever live accounts
  // exist or the account already carries a stale link, hides when
  // unlinked with no live accounts or on non-savings, reports null/name
  // changes, stays mounted under fixed growth, and previews bespoke and
  // fallback rates via its hint.
  it("offers the Portfolio account selector for savings and previews live bespoke and fallback hints", () => {
    const portfolio: PortfolioOptions = {
      accounts: [
        "All Stocks",
        "All Bonds",
        "Balanced ISA",
        "Half Point",
        "Losing ISA",
        "Flat ISA",
        "Empty ISA",
      ],
      hasGlide: false,
      planRate: 0.05,
      rates: {
        "All Bonds": { kind: "bespoke", rate: 0.04, stocks: 0 },
        "All Stocks": { kind: "bespoke", rate: 0.08, stocks: 1 },
        "Balanced ISA": { kind: "bespoke", rate: 0.065, stocks: 0.7 },
        "Empty ISA": { kind: "fallback", reason: "Custom rates are live" },
        "Flat ISA": { kind: "bespoke", rate: 0, stocks: 1 },
        "Half Point": { kind: "bespoke", rate: 0.06, stocks: 0.505 },
        "Losing ISA": { kind: "bespoke", rate: -0.02, stocks: 0.5 },
        "Old ISA": { kind: "fallback", reason: "Not found in Portfolio" },
      },
    };

    const onAmend = vi.fn<(patch: Partial<AccountValues>) => void>();
    const { unmount: unmountInitial } = render(
      <AccountFields
        draft={isa}
        initial={isa}
        onAmend={onAmend}
        onFundingChange={vi.fn<(funding: Funding) => void>()}
        onKindChange={vi.fn<(kind: AccountKind) => void>()}
        owners={owners}
        portfolio={portfolio}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Portfolio account" });
    expect(select).toHaveValue("");
    expect(select).toHaveAccessibleDescription("Uses the plan rate, 5.00%");

    fireEvent.change(select, { target: { value: "Balanced ISA" } });
    fireEvent.change(select, { target: { value: "" } });
    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { portfolio: "Balanced ISA" },
      { portfolio: null },
    ]);
    unmountInitial();

    const cases: readonly [AccountValues, PortfolioOptions, string][] = [
      [
        { ...isa, growth: "fixed", portfolio: null },
        portfolio,
        "Only applies on the plan rate",
      ],
      [
        { ...isa, growth: "fixed", portfolio: "Balanced ISA" },
        portfolio,
        "Fixed rate overrides Portfolio growth",
      ],
      [
        { ...isa, portfolio: "All Stocks" },
        portfolio,
        "Grows 8.00% a year · 100% stocks",
      ],
      [
        { ...isa, portfolio: "All Bonds" },
        portfolio,
        "Grows 4.00% a year · 100% bonds",
      ],
      [
        { ...isa, portfolio: "Balanced ISA" },
        portfolio,
        "Grows 6.50% a year · 70% stocks, 30% bonds",
      ],
      [
        { ...isa, portfolio: "Half Point" },
        portfolio,
        "Grows 6.00% a year · 51% stocks, 49% bonds",
      ],
      [
        { ...isa, portfolio: "Losing ISA" },
        portfolio,
        "Loses 2.00% a year · 50% stocks, 50% bonds",
      ],
      [
        { ...isa, portfolio: "Flat ISA" },
        portfolio,
        "Holds its value · 100% stocks",
      ],
      [
        { ...isa, portfolio: "Flat ISA" },
        { ...portfolio, hasGlide: true },
        "Holds its value now · following the glide path",
      ],
      [
        { ...isa, portfolio: "Empty ISA" },
        portfolio,
        "Uses the plan rate, 5.00%. Custom rates are live.",
      ],
      [
        { ...isa, portfolio: "toString" },
        portfolio,
        "Uses the plan rate, 5.00%",
      ],
      [
        { ...isa, portfolio: "Balanced ISA" },
        { ...portfolio, hasGlide: true },
        "Grows 6.50% a year now · following the glide path",
      ],
      [
        { ...isa, portfolio: "Losing ISA" },
        { ...portfolio, hasGlide: true },
        "Loses 2.00% a year now · following the glide path",
      ],
      [
        { ...isa, portfolio: null },
        { ...portfolio, hasGlide: true },
        "Uses the plan rate, 5.00% now",
      ],
    ];

    for (const [draft, options, expectedHint] of cases) {
      const { unmount } = render(
        <AccountFields
          draft={draft}
          initial={draft}
          onAmend={vi.fn<(patch: Partial<AccountValues>) => void>()}
          onFundingChange={vi.fn<(funding: Funding) => void>()}
          onKindChange={vi.fn<(kind: AccountKind) => void>()}
          owners={owners}
          portfolio={options}
        />,
      );
      expect(
        screen.getByRole("combobox", { name: "Portfolio account" }),
      ).toHaveAccessibleDescription(expectedHint);
      unmount();
    }

    // Stale link stays selectable even when portfolio.accounts is empty.
    const { unmount: unmountStale } = render(
      <AccountFields
        draft={{ ...isa, portfolio: "Old ISA" }}
        initial={{ ...isa, portfolio: "Old ISA" }}
        onAmend={vi.fn<(patch: Partial<AccountValues>) => void>()}
        onFundingChange={vi.fn<(funding: Funding) => void>()}
        onKindChange={vi.fn<(kind: AccountKind) => void>()}
        owners={owners}
        portfolio={{ ...portfolio, accounts: [] }}
      />,
    );
    const staleSelect = screen.getByRole("combobox", {
      name: "Portfolio account",
    });
    expect(staleSelect).toHaveValue("Old ISA");
    expect(
      within(staleSelect)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual(["Not linked", "Old ISA (not in Portfolio)"]);
    expect(staleSelect).toHaveAccessibleDescription(
      "Uses the plan rate, 5.00%. Not found in Portfolio.",
    );
    unmountStale();

    // Hides when no live accounts exist on an unlinked saving, and hides
    // on non-savings even when live accounts exist.
    const hiddenCases: readonly [AccountValues, PortfolioOptions][] = [
      [isa, { ...portfolio, accounts: [] }],
      [{ ...isa, kind: "debt", owner: null }, portfolio],
      [{ ...isa, kind: "real-asset", owner: null }, portfolio],
    ];
    for (const [draft, options] of hiddenCases) {
      const { unmount } = render(
        <AccountFields
          draft={draft}
          initial={draft}
          onAmend={vi.fn<(patch: Partial<AccountValues>) => void>()}
          onFundingChange={vi.fn<(funding: Funding) => void>()}
          onKindChange={vi.fn<(kind: AccountKind) => void>()}
          owners={owners}
          portfolio={options}
        />,
      );
      expect(
        screen.queryByRole("combobox", { name: "Portfolio account" }),
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});
