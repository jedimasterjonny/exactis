import type { JSX } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LoanDraft } from "@/components/app/organisms/loan-fields";
import type {
  HouseDraft,
  HouseValues,
  MoveValues,
  PartDraft,
} from "@/data/houses";
import type { LoanFigure } from "@/lib/figures";

import { moveChoices, openingMove } from "@/data/houses";
import { homePart, homeValues } from "@/data/houses.fixture";
import { plan, retiring } from "@/data/income.fixture";
import { markersOf } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { commit, field, select } from "@/test/dom";

import { HouseFields } from "./house-fields";

// The reference kit's mortgage as a sub-account's draft: £334,670 owed
// at 4.85%, £2,180 a month, over the 26 years its form says are left.
// The end of the term is counted from the fixture plan's September
// 2026, so the 26 years run to August 2052.
const part: PartDraft = { ...homePart, key: 0, term: 26 };

// The reference kit's house as a draft, its mortgage in that one
// sub-account.
const home: HouseDraft = { ...homeValues, parts: [part] };

const workedHint = "Worked out";

// The move the fixture makes, as the dialog holds it: at the children
// leaving home in 2040, to £650,000 held to £800,000, borrowing up to
// 90% at 4.5% over 25 years.
const moving: MoveValues = {
  at: 7,
  ceiling: 800000,
  loanToValue: 0.9,
  price: 650000,
  rate: 0.045,
  term: 25,
  year: 2040,
};

// The spies the fields report to, where the dialog listens.
interface Spies {
  readonly onAdd: ReturnType<typeof vi.fn<() => void>>;
  readonly onAmend: ReturnType<
    typeof vi.fn<(patch: Partial<Omit<HouseValues, "parts">>) => void>
  >;
  readonly onAmendPart: ReturnType<
    typeof vi.fn<(key: number, patch: Partial<LoanDraft>) => void>
  >;
  readonly onRemove: ReturnType<typeof vi.fn<(key: number) => void>>;
  readonly onWork: ReturnType<
    typeof vi.fn<(key: number, worked: LoanFigure) => void>
  >;
}

// The fields as the dialog would mount them, shown the draft and the
// figure each sub-account worked out, with a spy where the dialog
// listens.
function renderFields(
  draft: HouseDraft,
  worked: LoanFigure,
  figure: null | number,
): Spies & { readonly rerender: (figure: null | number) => void } {
  const spies: Spies = {
    onAdd: vi.fn<() => void>(),
    onAmend: vi.fn<(patch: Partial<Omit<HouseValues, "parts">>) => void>(),
    onAmendPart: vi.fn<(key: number, patch: Partial<LoanDraft>) => void>(),
    onRemove: vi.fn<(key: number) => void>(),
    onWork: vi.fn<(key: number, worked: LoanFigure) => void>(),
  };
  const fields = (shown: null | number): JSX.Element => (
    <HouseFields
      {...spies}
      draft={{
        ...draft,
        parts: draft.parts.map((each) => ({ ...each, figure: shown, worked })),
      }}
      initial={draft}
      milestones={moveChoices(markersOf(milestones, retiring), retiring, [])}
      plan={plan}
    />
  );
  const view = render(fields(figure));
  return {
    ...spies,
    rerender: (next): void => {
      view.rerender(fields(next));
    },
  };
}

describe("HouseFields", () => {
  it("mounts every field on the draft, shows the worked-out payment by value and reports each change", () => {
    const { onAmend, onAmendPart, onWork } = renderFields(
      home,
      "payment",
      1889,
    );

    expect(field("Name")).toHaveValue("Home");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
      "mortgaged",
    );
    expect(field("Value")).toHaveValue("£397,512");
    expect(field("Value")).toHaveAccessibleDescription("As of September 2026");
    expect(field("Value growth")).toHaveValue("2.10%");
    expect(select("Month bought")).toHaveDisplayValue("October");
    expect(field("Year bought")).toHaveValue("2021");
    expect(field("Bought for")).toHaveValue("£380,000");
    expect(field("Bought for")).not.toHaveAccessibleDescription();
    expect(field("Loan balance")).toHaveValue("£334,670");
    expect(field("Loan balance")).toHaveAccessibleDescription(
      "As of September 2026",
    );
    expect(field("Rate")).toHaveValue("4.85%");
    expect(field("Rate")).toHaveAccessibleDescription(
      "A year, compounding monthly",
    );
    expect(field("Monthly payment")).toHaveValue("£1,889");
    expect(field("Monthly payment")).toHaveAccessibleDescription(workedHint);
    expect(select("Work out")).toHaveValue("payment");
    expect(select("Last payment")).toHaveDisplayValue("August");
    expect(select("Last payment")).not.toHaveAccessibleDescription();
    expect(field("Year")).toHaveValue("2052");
    expect(field("Year")).toHaveAccessibleDescription("26 years left");
    expect(
      screen.queryByRole("group", { name: /^Sub-account/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Remove/ }),
    ).not.toBeInTheDocument();

    fireEvent.change(field("Name"), { target: { value: "Flat" } });
    commit(field("Value"), "420,000");
    commit(field("Value growth"), "3");
    fireEvent.change(select("Month bought"), { target: { value: "11" } });
    commit(field("Year bought"), "2020");
    commit(field("Bought for"), "400,000");
    commit(field("Loan balance"), "300,000");
    commit(field("Rate"), "4.5");
    fireEvent.change(select("Work out"), { target: { value: "rate" } });
    fireEvent.change(select("Last payment"), { target: { value: "1" } });
    commit(field("Year"), "2050");
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "outright" },
    });

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { name: "Flat" },
      { value: 420000 },
      { growth: 0.03 },
      { bought: { month: { month: 11, year: 2021 }, price: 380000 } },
      { bought: { month: { month: 9, year: 2020 }, price: 380000 } },
      { bought: { month: { month: 9, year: 2021 }, price: 400000 } },
      { status: "outright" },
    ]);
    expect(onAmendPart.mock.calls).toStrictEqual([
      [0, { balance: 300000 }],
      [0, { rate: 0.045 }],
      [0, { term: 25.5 }],
      [0, { term: 24 }],
    ]);
    expect(onWork).toHaveBeenCalledExactlyOnceWith(0, "rate");
  });

  // The fixture plan starts in September 2026, so a house is bought in
  // 2026 at the latest.
  it("holds what is owed, paid and bought for at nothing or above, and the year bought between 1900 and the plan's", () => {
    const { onAmend, onAmendPart } = renderFields(home, "rate", 0.0628);

    commit(field("Loan balance"), "-300,000");
    commit(field("Monthly payment"), "-2,000");
    commit(field("Bought for"), "-1");
    commit(field("Year bought"), "0");
    commit(field("Year bought"), "2030");

    expect(onAmendPart.mock.calls).toStrictEqual([
      [0, { balance: 0 }],
      [0, { payment: 0 }],
    ]);
    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { bought: { month: { month: 9, year: 2021 }, price: 0 } },
      { bought: { month: { month: 9, year: 1900 }, price: 380000 } },
      { bought: { month: { month: 9, year: 2026 }, price: 380000 } },
    ]);
  });

  it("shows a worked-out rate, and an error when none fits", () => {
    const { rerender } = renderFields(home, "rate", 0.0628);

    expect(field("Rate")).toHaveValue("6.28%");
    expect(field("Rate")).toHaveAccessibleDescription(workedHint);
    expect(field("Rate")).not.toHaveAttribute("aria-invalid");
    expect(field("Monthly payment")).toHaveValue("£2,180");
    expect(field("Monthly payment")).not.toHaveAccessibleDescription();

    rerender(null);

    expect(field("Rate")).toHaveValue("");
    expect(field("Rate")).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("No rate clears the balance over the term"),
    ).toHaveClass("text-destructive");
  });

  // 20.02 years from September 2026 is 241 payments, the last of them in
  // September 2046; a loan that never clears has no month to end in. The
  // end is worked out, so it is held.
  it("shows a worked-out end, and says when the payment never clears the loan", () => {
    const { rerender } = renderFields(home, "term", 20.02);

    expect(select("Last payment")).toHaveDisplayValue("September");
    expect(select("Last payment")).toBeDisabled();
    expect(select("Last payment")).toHaveAccessibleDescription(workedHint);
    expect(field("Year")).toHaveValue("2046");
    expect(field("Year")).toHaveAccessibleDescription("20 years left");

    rerender(null);

    expect(select("Last payment")).toHaveDisplayValue("—");
    expect(select("Last payment")).toHaveAccessibleDescription(
      "Never, at this payment",
    );
    expect(field("Year")).toHaveValue("");
    expect(field("Year")).toHaveAccessibleDescription(
      "Never clears at this payment",
    );
  });

  // Two sub-accounts repeat the loan's fields, so each is named by its
  // place and reports under its own key, the key it was given rather
  // than its place.
  it("lays out each sub-account under its name, reports each by its key, and adds and removes them", () => {
    const { onAdd, onAmendPart, onRemove, onWork } = renderFields(
      {
        ...home,
        parts: [part, { ...part, balance: 60000, key: 3, rate: 0.039 }],
      },
      "term",
      20,
    );
    const first = screen.getByRole("group", { name: "Sub-account 1" });
    const second = screen.getByRole("group", { name: "Sub-account 2" });

    expect(field("Loan balance", first)).toHaveValue("£334,670");
    expect(field("Rate", first)).toHaveValue("4.85%");
    expect(field("Loan balance", second)).toHaveValue("£60,000");
    expect(field("Rate", second)).toHaveValue("3.90%");

    commit(field("Loan balance", second), "55,000");
    fireEvent.change(
      within(second).getByRole("combobox", { name: "Work out" }),
      { target: { value: "payment" } },
    );
    fireEvent.click(
      within(second).getByRole("button", { name: "Remove sub-account 2" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add sub-account" }));

    expect(onAmendPart).toHaveBeenCalledExactlyOnceWith(3, { balance: 55000 });
    expect(onWork).toHaveBeenCalledExactlyOnceWith(3, "payment");
    expect(onRemove).toHaveBeenCalledExactlyOnceWith(3);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  // The children leave home in 2040 and the downsize is in 2059;
  // retirement in 2053 is no milestone a move is made at.
  it("offers each milestone reached at an age to move at, opening a move on the figures it held, and staying put", () => {
    const { onAmend } = renderFields(home, "payment", 1889);

    expect(select("Moves")).toHaveDisplayValue("Stays put");
    expect(select("Moves")).toHaveAccessibleDescription(
      "Sold, and the next bought, as its year opens",
    );
    expect(
      within(select("Moves"))
        .getAllByRole("option")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Stays put",
      "At Kids leave home · 2040",
      "At Downsize · 2059",
    ]);
    expect(
      screen.queryByRole("textbox", { name: "Next house costs" }),
    ).not.toBeInTheDocument();

    fireEvent.change(select("Moves"), { target: { value: "7" } });

    expect(onAmend).toHaveBeenLastCalledWith({
      move: { ...openingMove, at: 7, year: 2040 },
    });
  });

  it("mounts a move's fields on it, reports each change, and shows the mortgage's only while it borrows", () => {
    const { onAmend } = renderFields(
      { ...home, move: moving },
      "payment",
      1889,
    );

    expect(select("Moves")).toHaveDisplayValue("At Kids leave home · 2040");
    expect(field("Next house costs")).toHaveValue("£650,000");
    expect(field("Next house costs")).toHaveAccessibleDescription(
      "Today's money",
    );
    expect(field("Next ceiling")).toHaveValue("£800,000");
    expect(field("Borrows up to")).toHaveValue("90.00%");
    expect(field("Mortgage rate")).toHaveValue("4.50%");
    expect(field("Mortgage term")).toHaveValue("25");

    commit(field("Next house costs"), "700,000");
    commit(field("Next ceiling"), "0");
    commit(field("Mortgage rate"), "5");
    commit(field("Mortgage term"), "30");
    commit(field("Borrows up to"), "0");
    fireEvent.change(select("Moves"), { target: { value: "8" } });
    fireEvent.change(select("Moves"), { target: { value: "stays" } });

    expect(onAmend.mock.calls).toStrictEqual([
      [{ move: { ...moving, price: 700000 } }],
      [{ move: { ...moving, ceiling: 0 } }],
      [{ move: { ...moving, rate: 0.05 } }],
      [{ move: { ...moving, term: 30 } }],
      [{ move: { ...moving, loanToValue: 0 } }],
      [{ move: { ...moving, at: 8, year: 2059 } }],
      [{ move: null }],
    ]);
  });

  it("shows no mortgage's fields for a move borrowing nothing", () => {
    renderFields(
      { ...home, move: { ...moving, loanToValue: 0 } },
      "payment",
      1889,
    );

    expect(field("Borrows up to")).toHaveValue("0.00%");
    expect(
      screen.queryByRole("textbox", { name: "Mortgage rate" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Mortgage term" }),
    ).not.toBeInTheDocument();
  });

  it("shows no loan fields for a house owned outright", () => {
    renderFields({ ...home, status: "outright" }, "payment", 0);

    expect(field("Value")).toHaveValue("£397,512");
    expect(
      screen.queryByRole("textbox", { name: "Loan balance" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Rate" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Monthly payment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Work out" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Last payment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Year" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add sub-account" }),
    ).not.toBeInTheDocument();
  });
});
