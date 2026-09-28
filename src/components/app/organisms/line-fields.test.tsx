import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LineValues } from "@/data/schedule";

import { plan } from "@/data/income.fixture";
import { markersOf } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { lineGrowths } from "@/data/schedule";
import { optionsOf } from "@/lib/options";
import { commit } from "@/test/dom";

import { LineFields } from "./line-fields";

type Kind = "employment" | "pension";

type Line = LineValues & { readonly kind: Kind };

const kinds = optionsOf<Kind>(
  { employment: "Employment", pension: "Pension" },
  ["employment", "pension"],
);

const salary: Line = {
  amount: 1000,
  cadence: "year",
  endsAfter: 0,
  endsAt: null,
  firstYear: 2030,
  growth: "inflation",
  kind: "employment",
  lastMonth: null,
  lastYear: null,
  name: "Salary",
  startsAt: null,
};

// The milestones the fields offer: the children leaving home in 2036,
// retirement in 2080, since the fixture's plan has its owner retire at
// 90, and the downsize in 2055, in the order they come.
const markers = markersOf(milestones, plan);

// A line from the children leaving home to the year before the downsize.
const tied: Line = {
  ...salary,
  endsAt: 2,
  firstYear: 2036,
  lastYear: 2054,
  startsAt: 1,
};

// The fields as a dialog would mount them, opened on a line and shown
// the draft that mirrors them, with spies where the schedule listens.
function renderFields(
  initial: Line,
  draft: Line = initial,
): {
  readonly onAmend: ReturnType<
    typeof vi.fn<(patch: Partial<LineValues>) => void>
  >;
  readonly onKindChange: ReturnType<typeof vi.fn<(kind: Kind) => void>>;
} {
  const onAmend = vi.fn<(patch: Partial<LineValues>) => void>();
  const onKindChange = vi.fn<(kind: Kind) => void>();
  render(
    <LineFields
      amountLabel="Base salary"
      draft={draft}
      initial={initial}
      kinds={kinds}
      milestones={markers}
      namePlaceholder="Salary…"
      onAmend={onAmend}
      onKindChange={onKindChange}
      plan={plan}
      side="income"
    >
      <span data-slot="parts">The parts</span>
    </LineFields>,
  );
  return { onAmend, onKindChange };
}

describe("LineFields", () => {
  it("mounts every field on the line it opened with and reports each change", () => {
    const { onAmend, onKindChange } = renderFields(salary);

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Salary");
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "placeholder",
      "Salary…",
    );
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue(
      "employment",
    );
    expect(screen.getByRole("textbox", { name: "Base salary" })).toHaveValue(
      "£1,000",
    );
    expect(screen.getByRole("combobox", { name: "Cadence" })).toHaveValue(
      "year",
    );
    expect(
      screen.getAllByRole("option", { name: /Inflation|Nominal/ }),
    ).toHaveLength(lineGrowths.length);
    expect(screen.getByRole("textbox", { name: "First year" })).toHaveValue(
      "2030",
    );
    expect(
      screen.getByRole("textbox", { name: "First year" }),
    ).toHaveAccessibleDescription("Age 40");
    expect(screen.getByRole("combobox", { name: "Ends" })).toHaveValue("open");
    expect(
      screen.queryByRole("textbox", { name: "Last year" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Runs to 2079, the last year of the plan."),
    ).toBeInTheDocument();
    expect(screen.getByText("The parts")).toBeInTheDocument();
    expect(screen.getByText("Plan · 2026–2079")).toHaveClass("label");

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Bonus" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), {
      target: { value: "pension" },
    });
    commit(screen.getByRole("textbox", { name: "Base salary" }), "2,000");
    commit(screen.getByRole("textbox", { name: "Base salary" }), "");
    fireEvent.change(screen.getByRole("combobox", { name: "Cadence" }), {
      target: { value: "month" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Grows with" }), {
      target: { value: "inflation-plus-2" },
    });
    commit(screen.getByRole("textbox", { name: "First year" }), "2031");
    fireEvent.change(screen.getByRole("combobox", { name: "Ends" }), {
      target: { value: "fixed" },
    });

    expect(onKindChange).toHaveBeenCalledExactlyOnceWith("pension");
    expect(onAmend.mock.calls).toStrictEqual([
      [{ name: "Bonus" }],
      [{ amount: 2000 }],
      [{ cadence: "month" }],
      [{ growth: "inflation-plus-2" }],
      [{ firstYear: 2031 }],
      // A line that opened with no last year ends in its first year until
      // told otherwise.
      [{ endsAfter: 0, endsAt: null, lastYear: 2030 }],
    ]);
  });

  it("shows the last year's field for a line ending in a year, with its age, and reports the year and the end", () => {
    const { onAmend } = renderFields({ ...salary, lastYear: 2040 });

    expect(screen.getByRole("combobox", { name: "Ends" })).toHaveValue("fixed");
    expect(screen.getByRole("textbox", { name: "Last year" })).toHaveValue(
      "2040",
    );
    expect(
      screen.getByRole("textbox", { name: "Last year" }),
    ).toHaveAccessibleDescription("Age 50");
    expect(screen.queryByText(/Runs to 2079/)).not.toBeInTheDocument();

    commit(screen.getByRole("textbox", { name: "Last year" }), "2045");
    fireEvent.change(screen.getByRole("combobox", { name: "Ends" }), {
      target: { value: "open" },
    });

    expect(onAmend.mock.calls).toStrictEqual([
      [{ lastYear: 2045 }],
      [{ endsAfter: 0, endsAt: null, lastYear: null }],
    ]);
  });

  it("reads the ages and the bar from the draft rather than the line it opened with", () => {
    renderFields(salary, { ...salary, firstYear: 2040, lastYear: 2050 });

    expect(
      screen.getByRole("textbox", { name: "First year" }),
    ).toHaveAccessibleDescription("Age 50");
    expect(
      screen.getByRole("textbox", { name: "Last year" }),
    ).toHaveAccessibleDescription("Age 60");
  });

  it("offers the milestones for either end, the last with the plan as well, and ties an end to the one chosen", () => {
    const { onAmend } = renderFields(salary);

    expect(
      within(screen.getByRole("combobox", { name: "Starts" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual([
      "In a fixed year",
      "At Kids leave home · 2036",
      "At Downsize · 2055",
      "At Retirement · 2080",
    ]);
    expect(
      within(screen.getByRole("combobox", { name: "Ends" }))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual([
      "In a fixed year",
      "At Kids leave home · 2036",
      "At Downsize · 2055",
      "At Retirement · 2080",
      "With the plan",
    ]);
    expect(screen.getByRole("combobox", { name: "Starts" })).toHaveValue(
      "fixed",
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Starts" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Ends" }), {
      target: { value: "retirement" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Starts" }), {
      target: { value: "fixed" },
    });

    // A line tied to end at a milestone runs to the year before it, the
    // whole of that year.
    expect(onAmend.mock.calls).toStrictEqual([
      [{ firstYear: 2036, startsAt: 1 }],
      [{ endsAt: "retirement", lastMonth: null, lastYear: 2079 }],
      [{ startsAt: null }],
    ]);
  });

  it("says the year a tied end falls in where its field would be, and asks the years after its milestone the last ends", () => {
    const { onAmend } = renderFields(tied);

    expect(screen.getByRole("combobox", { name: "Starts" })).toHaveValue("1");
    expect(screen.getByRole("combobox", { name: "Ends" })).toHaveValue("2");
    expect(
      screen.queryByRole("textbox", { name: "First year" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Last year" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Starts in 2036, the year of Kids leave home."),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Years after" })).toHaveValue(
      "0",
    );
    expect(
      screen.getByRole("textbox", { name: "Years after" }),
    ).toHaveAccessibleDescription("Runs to 2054, the year before Downsize.");

    // Three years after the downsize in 2055 is the end of 2057.
    commit(screen.getByRole("textbox", { name: "Years after" }), "3");
    fireEvent.change(screen.getByRole("combobox", { name: "Ends" }), {
      target: { value: "fixed" },
    });

    expect(onAmend.mock.calls).toStrictEqual([
      [{ endsAfter: 3, lastYear: 2057 }],
      [{ endsAfter: 0, endsAt: null, lastYear: 2054 }],
    ]);
  });

  // The draft is three years after the downsize, and keeps them when
  // retirement, in 2080, is chosen instead; the field takes no count
  // below nothing.
  it("says where the years after a milestone run to, and keeps them for another", () => {
    const { onAmend } = renderFields(tied, {
      ...tied,
      endsAfter: 3,
      lastYear: 2057,
    });

    expect(
      screen.getByRole("textbox", { name: "Years after" }),
    ).toHaveAccessibleDescription(
      "Runs to 2057, ending 3 years after Downsize.",
    );

    commit(screen.getByRole("textbox", { name: "Years after" }), "-2");
    fireEvent.change(screen.getByRole("combobox", { name: "Ends" }), {
      target: { value: "retirement" },
    });

    expect(onAmend.mock.calls).toStrictEqual([
      [{ endsAfter: 0, lastYear: 2054 }],
      [{ endsAt: "retirement", lastMonth: null, lastYear: 2082 }],
    ]);
  });

  // The draft moves with the choices, so a field mounted on moving an
  // end off a milestone opens on the year the milestone gave it.
  it("opens a field freed from a milestone on the year the milestone gave it", () => {
    renderFields(tied, { ...tied, endsAt: null, startsAt: null });

    expect(screen.getByRole("textbox", { name: "First year" })).toHaveValue(
      "2036",
    );
    expect(screen.getByRole("textbox", { name: "Last year" })).toHaveValue(
      "2054",
    );
  });
});
