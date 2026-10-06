import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Outcome, Reading } from "@/engine/futures";

import { FuturesOutcomes } from "./futures-outcomes";

// Born in 1990, from January 2026 to 2079, so the plan runs to 89.
const plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  rate: 0,
  retires: 55,
  years: 53,
};

// Graded as a plan worth £1,300,000 at retirement in 2045 would be, its
// middle fifths reached at 69 and its last at 82.
const grading = {
  almost: 2072,
  comfortable: 650000,
  middle: 2059,
  surplus: 3900000,
};

function paragraphs(): (null | string)[] {
  return screen.getAllByRole("paragraph").map(({ textContent }) => textContent);
}

// A run of the size given graded as given, the futures lasting being the
// three lasting outcomes, and its middle future leaving £2,103,426.
function readOf(
  outcomes: Readonly<Record<Outcome, number>>,
  run: number,
): Reading {
  const lasted = outcomes.surplus + outcomes.comfortable + outcomes.barely;
  return {
    chance: lasted / run,
    early: 0,
    firstRanOut: null,
    halfRanOut: null,
    lasted,
    margin: 0.0207,
    middle: 2103426,
    ranOut: run - lasted,
    run,
    tenthFell: null,
  };
}

function rowsOf(name: string): (null | string)[][] {
  return within(screen.getByRole("table", { name }))
    .getAllByRole("row")
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .slice(1)
        .map(({ textContent }) => textContent),
    );
}

function shown(
  outcomes: Readonly<Record<Outcome, number>>,
  lines: typeof grading = grading,
): void {
  const run = Object.values(outcomes).reduce((sum, each) => sum + each, 0);
  render(
    <FuturesOutcomes
      count={1000}
      grading={lines}
      outcomes={outcomes}
      plan={plan}
      reading={readOf(outcomes, run)}
    />,
  );
}

describe("FuturesOutcomes", () => {
  // 56 of the 127 falling short do so in the middle, the most of any,
  // but not more than half of them.
  it("says what the run comes to, how most last and when many fall short, and each outcome's share", () => {
    shown({
      almost: 51,
      barely: 125,
      comfortable: 501,
      early: 20,
      middle: 56,
      surplus: 247,
    });

    const band = screen.getByRole("region", {
      name: "What the futures come to",
    });

    expect(within(band).getAllByRole("paragraph")[0]).toHaveClass("figure");
    expect(paragraphs()).toStrictEqual([
      "87%",
      "± 2.1 points",
      "873 lasted127 fell short",
      "Many that fall short do so between 69 and 81. The middle one leaves £2,103,426.",
    ]);
    expect(within(band).getByRole("heading", { level: 2 })).toHaveTextContent(
      "873 of 1,000 futures last to 89, most of them comfortably.",
    );
    expect(rowsOf("Lasted · 873")).toStrictEqual([
      ["Large surplus over £3,900,000", "25%"],
      ["Comfortable £650,000 to £3,900,000", "50%"],
      ["Barely made it under £650,000", "13%"],
    ]);
    expect(rowsOf("Fell short · 127")).toStrictEqual([
      ["Almost made it from 82", "5%"],
      ["Fell short in the middle 69 to 81", "6%"],
      ["Fell short early before 69", "2%"],
    ]);
  });

  it("says most of the shortfalls come late where they do, and that most last with a large surplus", () => {
    shown({
      almost: 60,
      barely: 100,
      comfortable: 200,
      early: 10,
      middle: 30,
      surplus: 600,
    });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "900 of 1,000 futures last to 89, most of them with a large surplus.",
    );
    expect(paragraphs().at(-1)).toBe(
      "Most that fall short do so at 82 or later. The middle one leaves £2,103,426.",
    );
  });

  // Large surplus and comfortable hold as many, and barely made it more
  // than either, though not more than half.
  it("says many where the most is not more than half, and that none fall short where none do", () => {
    shown({
      almost: 0,
      barely: 400,
      comfortable: 300,
      early: 0,
      middle: 0,
      surplus: 300,
    });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "1,000 of 1,000 futures last to 89, many of them only barely.",
    );
    expect(paragraphs().at(-1)).toBe(
      "None fall short. The middle one leaves £2,103,426.",
    );
  });

  it("says nothing of how the futures last where none do", () => {
    shown({
      almost: 0,
      barely: 0,
      comfortable: 0,
      early: 1000,
      middle: 0,
      surplus: 0,
    });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "0 of 1,000 futures last to 89.",
    );
    expect(paragraphs().at(-1)).toBe(
      "Most that fall short do so before 69. The middle one leaves £2,103,426.",
    );
  });

  // A retirement two years long has a middle of one year, at 69.
  it("bounds a middle of retirement one year long at its age", () => {
    shown(
      {
        almost: 10,
        barely: 0,
        comfortable: 900,
        early: 10,
        middle: 80,
        surplus: 0,
      },
      { ...grading, almost: 2060, middle: 2059 },
    );

    expect(rowsOf("Fell short · 100")[1]).toStrictEqual([
      "Fell short in the middle at 69",
      "8%",
    ]);
    expect(paragraphs().at(-1)).toBe(
      "Most that fall short do so at 69. The middle one leaves £2,103,426.",
    );
  });

  it("bounds the middle of a retirement a year long with a dash", () => {
    shown(
      {
        almost: 0,
        barely: 0,
        comfortable: 900,
        early: 100,
        middle: 0,
        surplus: 0,
      },
      { ...grading, almost: 2059, middle: 2059 },
    );

    expect(rowsOf("Fell short · 100")[1]).toStrictEqual([
      "Fell short in the middle —",
      "0%",
    ]);
  });

  it("says only that it is drawing before the first futures are in", () => {
    shown({
      almost: 0,
      barely: 0,
      comfortable: 0,
      early: 0,
      middle: 0,
      surplus: 0,
    });

    expect(paragraphs()).toStrictEqual(["Drawing the first futures…"]);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
