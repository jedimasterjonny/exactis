import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Share } from "@/data/accounts";
import type { Month } from "@/data/schedule";

import { incomeLines } from "@/data/income.fixture";
import { commit, field } from "@/test/dom";

import { SacrificeFields } from "./sacrifice-fields";

// The fixture's salary and a concurrent monthly salary, both running
// from 2026 and feeding the workplace pension: the salary 12% of its
// £120,000 a year, the second a twentieth of £14,500 a month.
const [salary, stepUp] = incomeLines;

const feeders = [
  salary,
  {
    ...stepUp,
    amount: 14500,
    cadence: "month",
    feeds: 1,
    firstYear: 2026,
    sacrifice: 0.05,
  },
] as const;

const shares: readonly Share[] = [
  { line: salary.id, sacrifice: 0.12 },
  { line: stepUp.id, sacrifice: 0.05 },
];

const opening: Month = { month: 8, year: 2026 };

// The fields as the dialog would mount them, opened on the shares and
// shown the draft that mirrors them, with a spy where the dialog
// listens.
function renderFields(
  initial: readonly Share[] = shares,
  draft: readonly Share[] = initial,
  opens: Month = opening,
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(shares: readonly Share[]) => void>
  >;
} {
  const onAmend = vi.fn<(shares: readonly Share[]) => void>();
  render(
    <SacrificeFields
      draft={draft}
      feeders={feeders}
      initial={initial}
      onAmend={onAmend}
      opens={opens}
    />,
  );
  return { onAmend };
}

describe("SacrificeFields", () => {
  // £14,400 a year with the NI saved is £16,560; £725 a month with it
  // is £833.75, twelve times over.
  it("mounts a share per salary feeding the pension, saying what each lands a year", () => {
    renderFields();

    expect(field("Sacrificed from Salary")).toHaveValue("12.00%");
    expect(field("Sacrificed from Salary")).toHaveAccessibleDescription(
      "Of its £120,000 base, landing as £16,560 a year",
    );
    expect(field("Sacrificed from Salary step-up")).toHaveValue("5.00%");
    expect(field("Sacrificed from Salary step-up")).toHaveAccessibleDescription(
      "Of its £14,500 base, landing as £10,005 a year",
    );
  });

  // The shares report whole, with the one typed written over, since a
  // share is one of a list rather than a field of the draft; a share
  // past the whole of the base commits as the whole.
  it("reports the shares whole with the typed one written over, held to the base", () => {
    const { onAmend } = renderFields();

    commit(field("Sacrificed from Salary"), "8");
    commit(field("Sacrificed from Salary step-up"), "150");

    expect(onAmend.mock.calls.map(([held]) => held)).toStrictEqual([
      [
        { line: salary.id, sacrifice: 0.08 },
        { line: stepUp.id, sacrifice: 0.05 },
      ],
      [
        { line: salary.id, sacrifice: 0.12 },
        { line: stepUp.id, sacrifice: 1 },
      ],
    ]);
  });

  // What lands is read off the draft, so it moves as the share is
  // typed, while the field itself keeps what it mounted on.
  it("says what the draft's share lands beneath the field it mounted on", () => {
    renderFields(shares, [
      { line: salary.id, sacrifice: 0.05 },
      { line: stepUp.id, sacrifice: 0.05 },
    ]);

    expect(field("Sacrificed from Salary")).toHaveValue("12.00%");
    expect(field("Sacrificed from Salary")).toHaveAccessibleDescription(
      "Of its £120,000 base, landing as £6,900 a year",
    );
  });

  // A salary matched to six per cent of its base lands the employer's
  // £7,200 a year beside the £16,560, and the hint counts it in.
  it("counts the employer's match in what a matched salary lands", () => {
    render(
      <SacrificeFields
        draft={shares}
        feeders={[{ ...salary, match: 0.06 }]}
        initial={shares}
        onAmend={vi.fn<(shares: readonly Share[]) => void>()}
        opens={opening}
      />,
    );

    expect(field("Sacrificed from Salary")).toHaveAccessibleDescription(
      "Of its £120,000 base, landing as £23,760 a year",
    );
  });

  // From April 2029, concurrent feeders share a single £2,000 NI cap in
  // list order: £14,400 from the first salary takes the full £2,000
  // (+£300 = £14,700) leaving the concurrent second £0 of employer NI
  // (£8,700); when the first takes only £1,200 (1%), the remaining £800
  // (+£120) lifts the second to £8,820.
  it("caps employer NI and shares one £2,000 cap across concurrent feeders from April 2029", () => {
    const view = render(
      <SacrificeFields
        draft={shares}
        feeders={feeders}
        initial={shares}
        onAmend={vi.fn<(shares: readonly Share[]) => void>()}
        opens={{ month: 3, year: 2029 }}
      />,
    );

    expect(field("Sacrificed from Salary")).toHaveAccessibleDescription(
      "Of its £120,000 base, landing as £14,700 a year",
    );
    expect(field("Sacrificed from Salary step-up")).toHaveAccessibleDescription(
      "Of its £14,500 base, landing as £8,700 a year",
    );

    view.rerender(
      <SacrificeFields
        draft={[
          { line: salary.id, sacrifice: 0.01 },
          { line: stepUp.id, sacrifice: 0.05 },
        ]}
        feeders={feeders}
        initial={shares}
        onAmend={vi.fn<(shares: readonly Share[]) => void>()}
        opens={{ month: 3, year: 2029 }}
      />,
    );

    expect(field("Sacrificed from Salary")).toHaveAccessibleDescription(
      "Of its £120,000 base, landing as £1,380 a year",
    );
    expect(field("Sacrificed from Salary step-up")).toHaveAccessibleDescription(
      "Of its £14,500 base, landing as £8,820 a year",
    );
  });

  // A feeder starting in a later year (2035) is read at its own start
  // rather than the pre-2029 plan opening: when the earlier salary has
  // ended by 2034 the step-up keeps the full £2,000 cap (£9,000 a year),
  // whereas when the earlier salary still overlaps in 2035 its £14,400
  // sacrifice exhausts the cap and the step-up lands as £8,700 a year.
  it("caps a future post-2029 feeder at its own start year and counts only overlapping earlier feeders", () => {
    const futureStepUp = {
      ...stepUp,
      amount: 14500,
      cadence: "month" as const,
      feeds: 1,
      firstYear: 2035,
      sacrifice: 0.05,
    };
    const view = render(
      <SacrificeFields
        draft={shares}
        feeders={[{ ...salary, lastYear: 2034 }, futureStepUp]}
        initial={shares}
        onAmend={vi.fn<(shares: readonly Share[]) => void>()}
        opens={opening}
      />,
    );

    expect(field("Sacrificed from Salary")).toHaveAccessibleDescription(
      "Of its £120,000 base, landing as £16,560 a year",
    );
    expect(field("Sacrificed from Salary step-up")).toHaveAccessibleDescription(
      "Of its £14,500 base, landing as £9,000 a year",
    );

    view.rerender(
      <SacrificeFields
        draft={shares}
        feeders={[salary, futureStepUp]}
        initial={shares}
        onAmend={vi.fn<(shares: readonly Share[]) => void>()}
        opens={opening}
      />,
    );

    expect(field("Sacrificed from Salary step-up")).toHaveAccessibleDescription(
      "Of its £14,500 base, landing as £8,700 a year",
    );
  });

  // An owner's £2,000 NI cap is shared across all of their pensions in
  // schedule order: an earlier salary of another owner or an unfed line
  // consumes none of it, whereas an earlier salary of the same owner
  // feeding another pension does (whether it takes part of the cap or
  // all of it).
  it("counts earlier feeders of the same owner on other pensions against the £2,000 cap", () => {
    const otherOwner = {
      ...salary,
      feeds: 99,
      id: 20,
      name: "Partner salary",
      owner: 2,
      sacrifice: 0.2,
    };
    const unfed = {
      ...salary,
      feeds: null,
      id: 21,
      name: "Unfed job",
      sacrifice: 0,
    };
    const otherPension = {
      ...salary,
      amount: 60000,
      feeds: 9,
      id: 22,
      name: "Other pension job",
      sacrifice: 0.02, // £1,200/yr leaves £800 (+£120 NI)
    };
    const target = {
      ...salary,
      amount: 50000,
      feeds: 7,
      id: 23,
      name: "Second job",
      sacrifice: 0.1, // £5,000/yr
    };
    const targetShares: readonly Share[] = [
      { line: target.id, sacrifice: 0.1 },
    ];
    const view = render(
      <SacrificeFields
        draft={targetShares}
        feeders={[target]}
        initial={targetShares}
        lines={[otherOwner, unfed, otherPension, target]}
        onAmend={vi.fn<(shares: readonly Share[]) => void>()}
        opens={{ month: 3, year: 2029 }}
      />,
    );

    expect(field("Sacrificed from Second job")).toHaveAccessibleDescription(
      "Of its £50,000 base, landing as £5,120 a year",
    );

    // Once the earlier pension takes £6,000/yr (>= £2,000), nothing is
    // left of the cap for this pension.
    view.rerender(
      <SacrificeFields
        draft={targetShares}
        feeders={[target]}
        initial={targetShares}
        lines={[otherOwner, unfed, { ...otherPension, sacrifice: 0.1 }, target]}
        onAmend={vi.fn<(shares: readonly Share[]) => void>()}
        opens={{ month: 3, year: 2029 }}
      />,
    );

    expect(field("Sacrificed from Second job")).toHaveAccessibleDescription(
      "Of its £50,000 base, landing as £5,000 a year",
    );
  });

  // The dialog hands the fields a share per feeder, but the list is a
  // list: a feeder it leaves out mounts on nothing and lands nothing.
  it("takes a feeder the shares leave out as sacrificing nothing", () => {
    renderFields([{ line: salary.id, sacrifice: 0.12 }]);

    expect(field("Sacrificed from Salary step-up")).toHaveValue("0.00%");
    expect(field("Sacrificed from Salary step-up")).toHaveAccessibleDescription(
      "Of its £14,500 base, landing as £0 a year",
    );
  });
});
