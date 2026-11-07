import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Plan } from "@/data/plan";
import type { Breaks } from "@/engine/futures";

import { working } from "@/data/owners.fixture";
import { commit, field } from "@/test/dom";

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
// the cut given, the age and the brackets its search left the futures
// in left out where it is not searched.
function searchedAt(
  age: null | number | undefined,
  cut: null | number,
): { readonly breaks: Breaks } {
  return { breaks: { ...(age !== undefined && { age, ages: [] }), cut } };
}

// An age tried at the age given, the count of futures lasting at it
// given where it is in, calling back with every age committed.
function triedAt(
  age: number,
  lasted?: number,
): {
  readonly age: number;
  readonly lasted: number | undefined;
  readonly onAge: (age: number) => void;
} {
  return { age, lasted, onAge: vi.fn<(age: number) => void>() };
}

// What a screen reader reads beneath the card's verdict, in its order:
// the age tried's hint, its readout while it is counted, and what it is
// told of it.
function triedHeard(): (null | string)[] {
  return within(card())
    .getAllByRole("paragraph")
    .slice(1)
    .map(({ textContent }) => textContent);
}

// What the card shows beneath its verdict, in its order, whether or not
// a screen reader reads it: the age tried's hint, its readout, and what
// a screen reader is told of it.
function triedSays(): (null | string)[] {
  return within(card())
    .getAllByRole("paragraph", { hidden: true, suggest: false })
    .slice(1)
    .map(({ textContent }) => textContent);
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

  it("tries a retirement age beneath the figures once the search is done, reading the plan's own as the plan stands", () => {
    render(
      <FuturesBreaks
        plan={plan}
        searched={searchedAt(61, 7)}
        tried={triedAt(58, 874)}
      />,
    );

    expect(field("Retirement age to try", card())).toHaveValue("58");
    expect(figures()).toHaveLength(2);
    expect(triedSays()).toStrictEqual([
      "Tried here only; the plan retires at 58",
      "874 of 1,000 futures last as the plan stands, retiring at 58.",
      "874 of 1,000 futures last as the plan stands, retiring at 58.",
    ]);
    expect(triedHeard()).toStrictEqual([
      "Tried here only; the plan retires at 58",
      "874 of 1,000 futures last as the plan stands, retiring at 58.",
    ]);
  });

  // While the count is in, the sentence shown is hidden from a screen
  // reader, which reads the one it is told instead, so it reads it once;
  // while it is counted, it reads the sentence shown and is told nothing.
  it("reads another age spending as planned, an ellipsis in place of its count while it is counted, telling a screen reader only once it lands, and once", () => {
    const { rerender } = render(
      <FuturesBreaks
        plan={plan}
        searched={searchedAt(61, 7)}
        tried={triedAt(64)}
      />,
    );

    expect(triedSays().slice(1)).toStrictEqual([
      "… of 1,000 futures last retiring at 64, spending as planned.",
      "",
    ]);
    expect(triedHeard().slice(1)).toStrictEqual([
      "… of 1,000 futures last retiring at 64, spending as planned.",
      "",
    ]);
    rerender(
      <FuturesBreaks
        plan={plan}
        searched={searchedAt(61, 7)}
        tried={triedAt(64, 812)}
      />,
    );
    expect(triedSays().slice(1)).toStrictEqual([
      "812 of 1,000 futures last retiring at 64, spending as planned.",
      "812 of 1,000 futures last retiring at 64, spending as planned.",
    ]);
    expect(triedHeard().slice(1)).toStrictEqual([
      "812 of 1,000 futures last retiring at 64, spending as planned.",
    ]);
  });

  it("reads the age the plan opens at as this year and its last as working to it, as the plan stands where it retires there", () => {
    const { rerender } = render(
      <FuturesBreaks
        plan={plan}
        searched={searchedAt(61, 7)}
        tried={triedAt(38, 640)}
      />,
    );

    expect(triedSays()[1]).toBe(
      "640 of 1,000 futures last retiring this year, spending as planned.",
    );
    rerender(
      <FuturesBreaks
        plan={plan}
        searched={searchedAt(61, 7)}
        tried={triedAt(90, 951)}
      />,
    );
    expect(triedSays()[1]).toBe(
      "951 of 1,000 futures last working to 90, spending as planned.",
    );
    rerender(
      <FuturesBreaks
        plan={{ ...plan, retires: 38 }}
        searched={searchedAt(38, 7)}
        tried={triedAt(38, 1000)}
      />,
    );
    expect(triedSays().slice(0, 2)).toStrictEqual([
      "Tried here only; the plan retires this year",
      "1,000 of 1,000 futures last as the plan stands, retiring this year.",
    ]);
    rerender(
      <FuturesBreaks
        plan={{ ...plan, retires: 90 }}
        searched={searchedAt(null, 7)}
        tried={triedAt(90, 0)}
      />,
    );
    expect(triedSays()[1]).toBe(
      "0 of 1,000 futures last as the plan stands, working to 90.",
    );
  });

  it("calls back with each age committed and nothing else, held within the plan's ages", () => {
    const tried = triedAt(58, 874);
    render(
      <FuturesBreaks plan={plan} searched={searchedAt(61, 7)} tried={tried} />,
    );
    const box = field("Retirement age to try", card());

    commit(box, "64");
    commit(box, "20");
    commit(box, "95");

    expect(vi.mocked(tried.onAge).mock.calls).toStrictEqual([[64], [38], [90]]);
  });

  it("tries an age where fewer than nine in ten last even working to the end", () => {
    render(
      <FuturesBreaks
        plan={plan}
        searched={searchedAt(null, 20)}
        tried={triedAt(58, 512)}
      />,
    );

    expect(triedSays()[1]).toBe(
      "512 of 1,000 futures last as the plan stands, retiring at 58.",
    );
  });

  // An age found with no brackets beside it has nothing to count an age
  // tried off, and would read an ellipsis for good.
  it("tries no age before the search is done, where only the spending is searched, nor where no brackets are handed back", () => {
    const { rerender } = render(
      <FuturesBreaks plan={plan} tried={triedAt(58)} />,
    );

    expect(within(card()).queryByRole("textbox")).not.toBeInTheDocument();
    rerender(
      <FuturesBreaks
        plan={plan}
        searched={{ breaks: undefined }}
        tried={triedAt(58)}
      />,
    );
    expect(within(card()).queryByRole("textbox")).not.toBeInTheDocument();
    rerender(
      <FuturesBreaks
        plan={plan}
        searched={{ breaks: { age: 61, cut: 7 } }}
        tried={triedAt(58)}
      />,
    );
    expect(within(card()).queryByRole("textbox")).not.toBeInTheDocument();
    rerender(
      <FuturesBreaks
        plan={{ ...plan, retires: 35 }}
        searched={searchedAt(undefined, 7)}
        tried={triedAt(35, 874)}
      />,
    );
    expect(within(card()).queryByRole("textbox")).not.toBeInTheDocument();
    rerender(
      <FuturesBreaks
        plan={{
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
        }}
        searched={searchedAt(undefined, 7)}
        tried={triedAt(58, 874)}
      />,
    );
    expect(within(card()).queryByRole("textbox")).not.toBeInTheDocument();
  });
});
