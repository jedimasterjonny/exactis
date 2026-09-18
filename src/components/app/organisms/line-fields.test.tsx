import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LineValues } from "@/data/schedule";

import { plan } from "@/data/income.fixture";
import { lineGrowths } from "@/data/schedule";
import { optionsOf } from "@/lib/options";

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
  firstYear: 2030,
  growth: "inflation",
  kind: "employment",
  lastMonth: null,
  lastYear: null,
  name: "Salary",
};

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

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
      screen.getAllByRole("option", { name: /Inflation|Triple|Nominal/ }),
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
      target: { value: "triple-lock" },
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
      [{ growth: "triple-lock" }],
      [{ firstYear: 2031 }],
      // A line that opened with no last year ends in its first year until
      // told otherwise.
      [{ lastYear: 2030 }],
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
      [{ lastYear: null }],
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
});
