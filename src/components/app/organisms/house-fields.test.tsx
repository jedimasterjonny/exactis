import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { HouseDraft } from "@/data/houses";
import type { LoanFigure } from "@/lib/figures";

import { homeValues } from "@/data/houses.fixture";
import { plan } from "@/data/income.fixture";
import { commit, field, select } from "@/test/dom";

import { HouseFields } from "./house-fields";

// The reference kit's house as a draft: £341,810 owed at 5.15%, £2,210 a
// month, over the 22 years its form says are left. The end of the term
// is counted from the fixture plan's September 2026, so the 22 years
// run to August 2048.
const home: HouseDraft = { ...homeValues, term: 22 };

const workedHint = "Worked out from the other two";

// The fields as the dialog would mount them, shown the draft and the
// figure it worked out, with a spy where the dialog listens.
function renderFields(
  draft: HouseDraft,
  worked: LoanFigure,
  figure: null | number,
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(patch: Partial<HouseDraft>) => void>
  >;
  readonly onWork: ReturnType<typeof vi.fn<(worked: LoanFigure) => void>>;
  readonly rerender: (figure: null | number) => void;
} {
  const onAmend = vi.fn<(patch: Partial<HouseDraft>) => void>();
  const onWork = vi.fn<(worked: LoanFigure) => void>();
  const view = render(
    <HouseFields
      draft={draft}
      figure={figure}
      initial={draft}
      onAmend={onAmend}
      onWork={onWork}
      plan={plan}
      worked={worked}
    />,
  );
  return {
    onAmend,
    onWork,
    rerender: (next): void => {
      view.rerender(
        <HouseFields
          draft={draft}
          figure={next}
          initial={draft}
          onAmend={onAmend}
          onWork={onWork}
          plan={plan}
          worked={worked}
        />,
      );
    },
  };
}

describe("HouseFields", () => {
  it("mounts every field on the draft, shows the worked-out payment by value and reports each change", () => {
    const { onAmend, onWork } = renderFields(home, "payment", 2166);

    expect(field("Name")).toHaveValue("Home");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
      "mortgaged",
    );
    expect(field("Value")).toHaveValue("£416,386");
    expect(field("Value")).toHaveAccessibleDescription(
      "What it would sell for in September 2026",
    );
    expect(field("Value growth")).toHaveValue("2.10%");
    expect(select("Month bought")).toHaveDisplayValue("June");
    expect(field("Year bought")).toHaveValue("2022");
    expect(field("Bought for")).toHaveValue("£380,000");
    expect(field("Bought for")).toHaveAccessibleDescription("What it cost");
    expect(field("Loan balance")).toHaveValue("£341,810");
    expect(field("Loan balance")).toHaveAccessibleDescription(
      "What is owed in September 2026",
    );
    expect(field("Rate")).toHaveValue("5.15%");
    expect(field("Rate")).toHaveAccessibleDescription(
      "A year, compounding monthly",
    );
    expect(field("Monthly payment")).toHaveValue("£2,166");
    expect(field("Monthly payment")).toHaveAccessibleDescription(workedHint);
    expect(select("Work out")).toHaveValue("payment");
    expect(select("Last payment")).toHaveDisplayValue("August");
    expect(select("Last payment")).toHaveAccessibleDescription(
      "When the last payment falls",
    );
    expect(field("Year")).toHaveValue("2048");
    expect(field("Year")).toHaveAccessibleDescription("22 years left");

    fireEvent.change(field("Name"), { target: { value: "Flat" } });
    commit(field("Value"), "420,000");
    commit(field("Value growth"), "3");
    fireEvent.change(select("Month bought"), { target: { value: "7" } });
    commit(field("Year bought"), "2021");
    commit(field("Bought for"), "400,000");
    commit(field("Loan balance"), "300,000");
    commit(field("Rate"), "4.5");
    fireEvent.change(select("Work out"), { target: { value: "rate" } });
    fireEvent.change(select("Last payment"), { target: { value: "1" } });
    commit(field("Year"), "2047");
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "outright" },
    });

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { name: "Flat" },
      { value: 420000 },
      { growth: 0.03 },
      { bought: { month: { month: 7, year: 2022 }, price: 380000 } },
      { bought: { month: { month: 5, year: 2021 }, price: 380000 } },
      { bought: { month: { month: 5, year: 2022 }, price: 400000 } },
      { balance: 300000 },
      { rate: 0.045 },
      { term: 21.5 },
      { term: 21 },
      { status: "outright" },
    ]);
    expect(onWork).toHaveBeenCalledExactlyOnceWith("rate");
  });

  // The fixture plan starts in September 2026, so a house is bought in
  // 2026 at the latest.
  it("holds what is owed, paid and bought for at nothing or above, and the year bought between the first and the plan's", () => {
    const { onAmend } = renderFields(home, "rate", 0.0537);

    commit(field("Loan balance"), "-300,000");
    commit(field("Monthly payment"), "-2,000");
    commit(field("Bought for"), "-1");
    commit(field("Year bought"), "0");
    commit(field("Year bought"), "2030");

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { balance: 0 },
      { payment: 0 },
      { bought: { month: { month: 5, year: 2022 }, price: 0 } },
      { bought: { month: { month: 5, year: 1 }, price: 380000 } },
      { bought: { month: { month: 5, year: 2026 }, price: 380000 } },
    ]);
  });

  it("shows a worked-out rate, and an error when none fits", () => {
    const { rerender } = renderFields(home, "rate", 0.0537);

    expect(field("Rate")).toHaveValue("5.37%");
    expect(field("Rate")).toHaveAccessibleDescription(workedHint);
    expect(field("Rate")).not.toHaveAttribute("aria-invalid");
    expect(field("Monthly payment")).toHaveValue("£2,210");
    expect(field("Monthly payment")).toHaveAccessibleDescription("A month");

    rerender(null);

    expect(field("Rate")).toHaveValue("");
    expect(field("Rate")).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("No rate clears the balance over the term"),
    ).toHaveClass("text-destructive");
  });

  // 21.21 years from September 2026 is 255 payments, the last of them in
  // November 2047; a loan that never clears has no month to end in. The
  // end is worked out, so it is held.
  it("shows a worked-out end, and says when the payment never clears the loan", () => {
    const { rerender } = renderFields(home, "term", 21.21);

    expect(select("Last payment")).toHaveDisplayValue("November");
    expect(select("Last payment")).toBeDisabled();
    expect(select("Last payment")).toHaveAccessibleDescription(workedHint);
    expect(field("Year")).toHaveValue("2047");
    expect(field("Year")).toHaveAccessibleDescription("21.2 years left");

    rerender(null);

    expect(select("Last payment")).toHaveDisplayValue("—");
    expect(select("Last payment")).toHaveAccessibleDescription(
      "Never, at this payment",
    );
    expect(field("Year")).toHaveValue("");
    expect(field("Year")).toHaveAccessibleDescription(
      "Never clears at this payment, so the payments run to the end of the plan",
    );
  });

  it("shows no loan fields for a house owned outright", () => {
    renderFields({ ...home, status: "outright" }, "payment", 0);

    expect(field("Value")).toHaveValue("£416,386");
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
  });
});
