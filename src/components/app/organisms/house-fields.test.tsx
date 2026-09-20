import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { HouseDraft } from "@/data/houses";
import type { LoanFigure } from "@/lib/figures";

import { HouseFields } from "./house-fields";

// The reference kit's house as a draft: £341,810 owed at 5.15%, £2,210 a
// month, over the 22 years its form says are left.
const home: HouseDraft = {
  balance: 341810,
  growth: 0.021,
  name: "Home",
  payment: 2210,
  rate: 0.0515,
  status: "mortgaged",
  term: 22,
  value: 416386,
};

// The month the plan is read in, September 2026, which the end of the
// term is counted from: the home's 22 years run to August 2048.
const plan = { from: 2026, month: 8 };

const workedHint = "Worked out from the other two";

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function field(name: string): HTMLElement {
  return screen.getByRole("textbox", { name });
}

function month(name: string): HTMLElement {
  return screen.getByRole("combobox", { name });
}

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
  readonly rerender: (figure: null | number) => void;
} {
  const onAmend = vi.fn<(patch: Partial<HouseDraft>) => void>();
  const view = render(
    <HouseFields
      draft={draft}
      figure={figure}
      initial={draft}
      onAmend={onAmend}
      plan={plan}
      worked={worked}
    />,
  );
  return {
    onAmend,
    rerender: (next): void => {
      view.rerender(
        <HouseFields
          draft={draft}
          figure={next}
          initial={draft}
          onAmend={onAmend}
          plan={plan}
          worked={worked}
        />,
      );
    },
  };
}

describe("HouseFields", () => {
  it("mounts every field on the draft, shows the worked-out payment by value and reports each change", () => {
    const { onAmend } = renderFields(home, "payment", 2166);

    expect(field("Name")).toHaveValue("Home");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
      "mortgaged",
    );
    expect(field("Value")).toHaveValue("£416,386");
    expect(field("Value growth")).toHaveValue("2.10%");
    expect(field("Loan balance")).toHaveValue("£341,810");
    expect(field("Rate")).toHaveValue("5.15%");
    expect(field("Rate")).toHaveAccessibleDescription(
      "A year, compounding monthly",
    );
    expect(field("Monthly payment")).toHaveValue("£2,166");
    expect(field("Monthly payment")).toHaveAccessibleDescription(workedHint);
    expect(field("Years to pay off")).toHaveValue("22");
    expect(field("Years to pay off")).toHaveAccessibleDescription(
      "Left to run",
    );
    expect(month("Last payment")).toHaveDisplayValue("August");
    expect(month("Last payment")).toHaveAccessibleDescription(
      "One with the years left",
    );
    expect(field("Year")).toHaveValue("2048");

    fireEvent.change(field("Name"), { target: { value: "Flat" } });
    commit(field("Value"), "420,000");
    commit(field("Value growth"), "3");
    commit(field("Loan balance"), "300,000");
    commit(field("Rate"), "4.5");
    commit(field("Monthly payment"), "2,000");
    commit(field("Years to pay off"), "20");
    fireEvent.change(month("Last payment"), { target: { value: "1" } });
    commit(field("Year"), "2047");
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "outright" },
    });

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { name: "Flat" },
      { value: 420000 },
      { growth: 0.03 },
      { balance: 300000 },
      { rate: 0.045 },
      { payment: 2000 },
      { term: 20 },
      { term: 21.5 },
      { term: 21 },
      { status: "outright" },
    ]);
  });

  it("holds what is owed and paid at nothing or above", () => {
    const { onAmend } = renderFields(home, "rate", 0.0537);

    commit(field("Loan balance"), "-300,000");
    commit(field("Monthly payment"), "-2,000");

    expect(onAmend.mock.calls.map(([patch]) => patch)).toStrictEqual([
      { balance: 0 },
      { payment: 0 },
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
  // November 2047; a loan that never clears has no month to end in. A
  // month or a year picked with no end to take the other from takes it
  // from the plan: December is four payments from September, and a year
  // on is thirteen.
  it("shows a worked-out term, and says when the payment never clears the loan", () => {
    const { onAmend, rerender } = renderFields(home, "term", 21.21);

    expect(field("Years to pay off")).toHaveValue("21.2");
    expect(field("Years to pay off")).toHaveAccessibleDescription(workedHint);
    expect(month("Last payment")).toHaveDisplayValue("November");
    expect(month("Last payment")).toHaveAccessibleDescription(
      "Worked out with the years left",
    );
    expect(field("Year")).toHaveValue("2047");

    rerender(null);

    expect(field("Years to pay off")).toHaveValue("");
    expect(field("Years to pay off")).toHaveAccessibleDescription(
      "Never clears at this payment, so the payments run to the end of the plan",
    );
    expect(month("Last payment")).toHaveDisplayValue("—");
    expect(month("Last payment")).toHaveAccessibleDescription(
      "Never, at this payment",
    );
    expect(field("Year")).toHaveValue("");

    fireEvent.change(month("Last payment"), { target: { value: "11" } });
    commit(field("Year"), "2027");

    const [december, yearOn] = onAmend.mock.calls.map(([patch]) => patch);

    expect(onAmend).toHaveBeenCalledTimes(2);
    expect(december?.term).toBeCloseTo(4 / 12, 10);
    expect(yearOn?.term).toBeCloseTo(13 / 12, 10);
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
      screen.queryByRole("textbox", { name: "Years to pay off" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Last payment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Year" }),
    ).not.toBeInTheDocument();
  });
});
