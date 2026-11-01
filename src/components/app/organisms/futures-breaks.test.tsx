import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Plan } from "@/data/plan";
import type { Breaks } from "@/engine/futures";

import { working } from "@/data/owners.fixture";

import { FuturesBreaks } from "./futures-breaks";

// Born in 1988, from January 2026 to 2078, so the plan runs from 38 to
// 90, retiring at 58.
const plan: Plan = {
  born: 1988,
  from: 2026,
  inflation: 0,
  month: 0,
  owners: [{ ...working, born: 1988 }],
  rate: 0,
  retires: 58,
  years: 52,
};

function card(): HTMLElement {
  return screen.getByRole("region", { name: "Where the plan breaks" });
}

// What each figure shows, its label then its figure and its notes.
function figures(): (null | string)[][] {
  return within(card())
    .getAllByRole("term")
    .map((term) => [
      term.textContent,
      ...within(term.parentElement ?? term)
        .getAllByRole("definition")
        .map(({ textContent }) => textContent),
    ]);
}

// A search done, nine in ten lasting retiring at the age given and on
// the cut given, the age left out where it is not searched.
function searchedAt(
  age: null | number | undefined,
  cut: null | number,
): { readonly breaks: Breaks } {
  return { breaks: { ...(age !== undefined && { age }), cut } };
}

function verdict(): null | string {
  return within(card()).getAllByRole("paragraph")[0]?.textContent ?? null;
}

describe("FuturesBreaks", () => {
  it("says the search waits on the futures before they are drawn, the figures held", () => {
    render(<FuturesBreaks plan={plan} />);

    expect(within(card()).getByText("Sect. II.i")).toHaveClass("label");
    expect(verdict()).toBe("The search starts once the futures are drawn.");
    expect(figures()).toStrictEqual([
      ["Retirement age", "…"],
      ["Spending", "…"],
    ]);
  });

  it("says the futures are being searched while the search runs, the figures held until it is done", () => {
    render(<FuturesBreaks plan={plan} searched={{ breaks: undefined }} />);

    expect(verdict()).toBe("Searching the futures…");
    expect(figures()).toStrictEqual([
      ["Retirement age", "…"],
      ["Spending", "…"],
    ]);
  });

  it("reads the age and the spending nine in ten futures last at, against the plan's", () => {
    render(<FuturesBreaks plan={plan} searched={searchedAt(61, 7)} />);

    expect(verdict()).toBe(
      "9 in 10 futures last retiring at 61, or on 93% of the spending planned.",
    );
    expect(figures()).toStrictEqual([
      [
        "Retirement age",
        "61 yrs",
        "3 years after the plan retires, spending as planned",
      ],
      [
        "Spending",
        "93%",
        "Of the spending planned, from this year on, retiring at 58",
      ],
    ]);
  });

  it("reads an age before the plan's, a year after it and the plan's own against it", () => {
    const { rerender } = render(
      <FuturesBreaks plan={plan} searched={searchedAt(56, 0)} />,
    );

    expect(figures()[0]).toStrictEqual([
      "Retirement age",
      "56 yrs",
      "2 years before the plan retires, spending as planned",
    ]);
    rerender(<FuturesBreaks plan={plan} searched={searchedAt(59, 0)} />);
    expect(figures()[0]?.[2]).toBe(
      "1 year after the plan retires, spending as planned",
    );
    rerender(<FuturesBreaks plan={plan} searched={searchedAt(58, 0)} />);
    expect(figures()[0]?.[2]).toBe("As the plan retires, spending as planned");
  });

  it("reads retiring as the plan opens as now, and half as much again as the most searched", () => {
    render(<FuturesBreaks plan={plan} searched={searchedAt(38, -50)} />);

    expect(verdict()).toBe(
      "9 in 10 futures last retiring this year, or on 150% or more of the spending planned.",
    );
    expect(figures()).toStrictEqual([
      ["Retirement age", "Now", "9 in 10 last retiring this year"],
      ["Spending", "150%+", "9 in 10 last even on half as much again"],
    ]);
  });

  it("says where fewer than nine in ten last at either end searched", () => {
    const { rerender } = render(
      <FuturesBreaks plan={plan} searched={searchedAt(null, 20)} />,
    );

    expect(verdict()).toBe(
      "9 in 10 futures last on 80% of the spending planned.",
    );
    expect(figures()[0]).toStrictEqual([
      "Retirement age",
      "—",
      "Fewer than 9 in 10 last even working to 90",
    ]);
    rerender(<FuturesBreaks plan={plan} searched={searchedAt(null, -50)} />);
    expect(verdict()).toBe(
      "9 in 10 futures last on 150% or more of the spending planned.",
    );
    rerender(<FuturesBreaks plan={plan} searched={searchedAt(64, null)} />);
    expect(verdict()).toBe("9 in 10 futures last retiring at 64.");
    expect(figures()[1]).toStrictEqual([
      "Spending",
      "Under 50%",
      "Fewer than 9 in 10 last even at half the spending",
    ]);
    rerender(<FuturesBreaks plan={plan} searched={searchedAt(null, null)} />);
    expect(verdict()).toBe(
      "Fewer than 9 in 10 futures last, even working to 90 or on half the spending planned.",
    );
  });

  it("searches the spending alone where retirement waits on conditions, and says so", () => {
    const onConditions = {
      ...plan,
      owners: [
        {
          ...working,
          born: 1988,
          retirement: [
            { measure: "worth", of: "pounds", times: 900000 } as const,
          ],
        },
      ],
    };
    const { rerender } = render(<FuturesBreaks plan={onConditions} />);

    expect(figures()).toStrictEqual([
      [
        "Spending",
        "…",
        "Retirement waits on its conditions, so only the spending is searched.",
      ],
    ]);
    rerender(
      <FuturesBreaks plan={onConditions} searched={searchedAt(undefined, 7)} />,
    );
    expect(verdict()).toBe(
      "9 in 10 futures last on 93% of the spending planned.",
    );
    expect(figures()).toStrictEqual([
      [
        "Spending",
        "93%",
        "Of the spending planned, from this year on, retiring on its conditions",
        "Retirement waits on its conditions, so only the spending is searched.",
      ],
    ]);
    rerender(
      <FuturesBreaks
        plan={onConditions}
        searched={searchedAt(undefined, null)}
      />,
    );
    expect(verdict()).toBe(
      "Fewer than 9 in 10 futures last, even on half the spending planned.",
    );
  });

  it("searches the spending alone where retirement has begun, and says so", () => {
    render(
      <FuturesBreaks
        plan={{ ...plan, retires: 35 }}
        searched={searchedAt(undefined, 7)}
      />,
    );

    expect(figures()).toStrictEqual([
      [
        "Spending",
        "93%",
        "Of the spending planned, from this year on",
        "Retirement has begun, so only the spending is searched.",
      ],
    ]);
  });
});
